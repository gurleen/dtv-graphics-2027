/**
 * End to end: a real server on a scratch database, the feed tool reading a pseudo-terminal that plays an
 * AllSport console, and `game.watch` read back as the console starts the clock, scores and is unplugged.
 * Exits 1 on a failure.
 *
 *   bun packages/live-allsport/scripts/prove.ts
 */

import { connect, first } from '@dtv/api';
import { basketball, type GameId, type GameLive, indexWorld, PROGRAMS, resolveGame, type World } from '@dtv/domain';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type FakeConsole, openConsole } from './console';

const ROOT = resolve(import.meta.dir, '../../..');
const PORT = 8995;
const URL = `ws://localhost:${PORT}/rpc`;
const dir = mkdtempSync(join(tmpdir(), 'allsport-prove-'));
const children: Bun.Subprocess[] = [];
const consoles: FakeConsole[] = [];

const log = (message: string) => console.log(`prove: ${message}`);

async function until(game: GameId, api: ReturnType<typeof connect>['api'], what: string, ok: (live: basketball.BasketballLive) => boolean, withinMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), withinMs);
  let last: GameLive | undefined;
  try {
    for await (const live of await api.game.watch({ game }, { signal: controller.signal })) {
      last = live;
      if (live.sport === 'basketball' && ok(live)) return live;
    }
  } catch {
    // The deadline aborted the stream.
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  throw new Error(`timed out waiting for ${what}; last state ${JSON.stringify(last)}`);
}

/** The game clock as `game.watch` shows it, projected to the moment of the read. */
const clockNow = (live: basketball.BasketballLive) => basketball.remainingAt(live.clock, Date.now());

async function main() {
  const server = Bun.spawn(['bun', 'apps/server/src/main.ts', '--seed'], {
    cwd: ROOT,
    env: { ...process.env, DTV_DB: join(dir, 'dtv.sqlite'), PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'inherit',
  });
  children.push(server);

  const { api, close } = connect({ url: URL, client: 'prove' });
  let world!: World;
  for (let attempt = 0; ; attempt++) {
    try {
      world = indexWorld(await first((signal) => api.data.watch(undefined, { signal })));
      break;
    } catch (error) {
      if (attempt > 40) throw error;
      await Bun.sleep(250);
    }
  }

  const game = world.all('game').find((each) => resolveGame(world, each.id) && PROGRAMS[each.program].sport === 'basketball');
  assert(game, 'a seeded basketball game');
  log(`game ${game.id}`);

  const fake = await openConsole();
  consoles.push(fake);
  const tool = Bun.spawn(['bun', 'packages/live-allsport/src/main.ts', `--port=${fake.path}`, `--game=${game.id}`, `--server=${URL}`], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  children.push(tool);
  const output: string[] = [];
  for (const stream of [tool.stdout, tool.stderr]) {
    void (async () => {
      for await (const chunk of stream.pipeThrough(new TextDecoderStream())) output.push(...chunk.split('\n').filter(Boolean));
    })();
  }

  await until(game.id, api, 'the handover', (live) => live.authority.clock === 'allsport' && live.authority.score === 'allsport');
  log('clock and score handed to allsport');

  fake.send({ period: ' 2', clockMain: '14:30', clockTenths: '14:30', clockStopped: 's', scoreHome: '  41', scoreAway: '  38', timeoutsHome: ' 2', timeoutsAway: ' 3', shotClock: ' 24' });
  const stopped = await until(game.id, api, 'the first screen', (live) => live.score.home === 41 && live.shotClock !== null);
  assert.deepEqual(stopped.score, { away: 38, home: 41 });
  assert.deepEqual(stopped.timeouts, { away: 3, home: 2 });
  assert.equal(stopped.period, 2);
  assert.deepEqual(stopped.clock, { running: false, remainingMs: 870_000 });
  assert.deepEqual(stopped.shotClock, { running: false, remainingMs: 24_000 });
  log(`first screen: period ${stopped.period}, clock 14:30 stopped, shot clock 24, score ${stopped.score.away}-${stopped.score.home}`);

  fake.send({ clockStopped: ' ', possessionHomeArrow: '<', bonusAwayDouble: '>' });
  const running = await until(game.id, api, 'the clock running', (live) => live.clock.running);
  assert.equal(running.phase, 'live', 'starting the clock sets the phase live');
  assert.equal(running.possession, 'home');
  assert.equal(running.bonus.away, true);
  assert(running.shotClock?.running, 'the shot clock runs with the game clock');
  log('clock running, phase live, possession home, away in the bonus');

  await Bun.sleep(1500);
  const projected = clockNow((await until(game.id, api, 'a read', () => true)));
  assert(Math.abs(projected - (870_000 - 1500)) < 1000, `the server runs the clock by itself: ${projected}`);
  log(`1.5 s later the server's clock reads ${(projected / 1000).toFixed(1)} s without a write per tick`);

  fake.send({ clockMain: '14:12', clockTenths: '14:12', clockStopped: 's', shotClock: ' 11', scoreHome: '  43' });
  const second = await until(game.id, api, 'the stop', (live) => !live.clock.running && live.score.home === 43);
  assert.deepEqual(second.clock, { running: false, remainingMs: 852_000 });
  assert.deepEqual(second.shotClock, { running: false, remainingMs: 11_000 });
  log('stopped at 14:12 with 11 on the shot clock, home 43');

  fake.send({ shotClock: '      ' });
  const blank = await until(game.id, api, 'the blank shot clock', (live) => live.shotClock === null);
  assert.equal(blank.shotClock, null);
  log('blank shot clock written as null');

  tool.kill('SIGINT');
  const code = await tool.exited;
  const after = await until(game.id, api, 'authority handed back', (live) => live.authority.clock === 'operator' && live.authority.score === 'operator');
  assert.equal(code, 0, 'the tool exits 0 on SIGINT');
  assert.equal(after.score.home, 43, 'handing back keeps the data');
  log(`after SIGINT: authority ${JSON.stringify(after.authority)}`);

  await Bun.sleep(100);
  console.log(output.map((line) => `  tool> ${line}`).join('\n'));
  assert(output.some((line) => line.includes('clock started at 14:30')), 'the clock start is logged');
  assert(output.some((line) => line.includes('clock stopped at 14:12')), 'the clock stop is logged');
  assert(output.filter((line) => line.includes('clock started')).length === 1, 'one line per start, not per tick');
  close();
}

try {
  await main();
  log('PASS');
} catch (error) {
  console.error(error);
  log('FAIL');
  process.exitCode = 1;
} finally {
  for (const fake of consoles) fake.close();
  for (const child of children) child.kill();
  await Promise.all(children.map((child) => child.exited));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
