/**
 * End to end: a real server on a scratch database, the feed tool against a seeded game, and
 * `game.watch` read back as the file is replaced and the tool is stopped. A Player Lower Third
 * set to Game stats is on program throughout, and its stat line is read back from `output.watch`.
 * Exits 1 on a failure.
 *
 *   bun packages/live-statcrew/scripts/prove.ts
 */

import { connect, first } from '@dtv/api';
import { basketball, type GameId, type GameLive, indexWorld, type Player, PROGRAMS, resolveGame, SIDES, type Side, type World } from '@dtv/domain';
import { strict as assert } from 'node:assert';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { boxScore } from './box-score';

const ROOT = resolve(import.meta.dir, '../../..');
const PORT = 8996;
const URL = `ws://localhost:${PORT}/rpc`;
const dir = mkdtempSync(join(tmpdir(), 'statcrew-prove-'));
const file = join(dir, 'game.xml');
const children: Bun.Subprocess[] = [];

const log = (message: string) => console.log(`prove: ${message}`);

/** StatCrew replaces the file rather than writing in place. */
const replaceFile = (xml: string) => {
  writeFileSync(`${file}.next`, xml);
  renameSync(`${file}.next`, file);
};

async function until(game: GameId, api: ReturnType<typeof connect>['api'], what: string, ok: (live: GameLive) => boolean, withinMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), withinMs);
  let last: GameLive | undefined;
  try {
    for await (const live of await api.game.watch({ game }, { signal: controller.signal })) {
      last = live;
      if (ok(live)) return live as basketball.BasketballLive;
    }
  } catch {
    // The deadline aborted the stream.
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  throw new Error(`timed out waiting for ${what}; last state authority=${JSON.stringify(last && 'authority' in last && last.authority)}`);
}

const LOWER_THIRD = 'basketball-v2/player-lower-third';

/** What the lower third prints for `pts reb ast fg`, from the box score's own numbers for that jersey. */
const tonightLine = (player: Player, bonus: number) => {
  const jersey = Number(player.jersey);
  const pts = jersey + 2 + bonus;
  return [`${pts} PTS`, `${jersey % 7} REB`, `${jersey % 5} AST`, `${pts}-${pts + 3} FG`].join('  ·  ');
};

async function lowerThirdUntil(api: ReturnType<typeof connect>['api'], what: string, ok: (values: Readonly<Record<string, unknown>>) => boolean, withinMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), withinMs);
  let last: unknown;
  try {
    for await (const frame of await api.output.watch({ bus: { kind: 'program' } }, { signal: controller.signal })) {
      const layer = frame.layers.find((each) => each.graphic === LOWER_THIRD);
      last = layer && (layer.error ?? layer.values);
      if (layer && !layer.error && ok(layer.values)) return layer.values;
    }
  } catch {
    // The deadline aborted the stream.
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  throw new Error(`timed out waiting for ${what}; last lower third ${JSON.stringify(last)}`);
}

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

  const found = world.all('game').flatMap((game) => {
    const view = resolveGame(world, game.id);
    if (!view || PROGRAMS[view.program].sport !== 'basketball') return [];
    const rosters = { away: world.roster(game.awayTeamId, game.seasonId), home: world.roster(game.homeTeamId, game.seasonId) };
    return rosters.away.length >= 5 && rosters.home.length >= 5 ? [{ game, rosters }] : [];
  })[0];
  assert(found, 'a seeded basketball game has two rosters of five or more');
  const { game, rosters } = found;
  log(`game ${game.id}`);

  const before = await until(game.id, api, 'the initial state', () => true);
  assert.deepEqual(before.authority, { clock: 'operator', score: 'operator', stats: 'operator' }, 'authority starts with the operator');

  replaceFile(boxScore(rosters, { away: 61, home: 70 }, 0));
  const tool = Bun.spawn(['bun', 'packages/live-statcrew/src/main.ts', `--file=${file}`, `--game=${game.id}`, `--server=${URL}`], {
    cwd: ROOT,
    stdin: 'pipe',
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

  const firstPlayer = (side: Side) => rosters[side][0]!;
  const seen = await until(game.id, api, 'the first push', (live) => live.sport === 'basketball' && live.score.home === 70);
  assert.deepEqual(seen.score, { away: 61, home: 70 });
  assert.equal(seen.authority.score, 'statcrew');
  assert.equal(seen.authority.stats, 'statcrew');
  assert.equal(seen.authority.clock, 'operator', 'the clock stays with the operator');
  assert.equal(seen.team.home.pts, 50 + 2);
  for (const side of SIDES) {
    const player = firstPlayer(side);
    assert.equal(seen.players[player.id]?.pts, Number(player.jersey) + 2, `${side} player line written`);
    assert.equal(seen.starters[side].length, 5, `${side} five starters`);
  }
  assert.equal(Object.keys(seen.players).length, rosters.away.length + rosters.home.length, 'the unknown player is not written');
  log(`first push: score ${seen.score.away}-${seen.score.home}, authority ${JSON.stringify(seen.authority)}`);

  const featured = firstPlayer('home');
  const cue = { id: 'prove-tonight', graphic: LOWER_THIRD, params: { player: featured.id, line: { kind: 'game', stats: ['pts', 'reb', 'ast', 'fg'] } }, overrides: {}, note: '' };
  const { revision } = await first((signal) => api.data.watch(undefined, { signal }));
  await api.data.apply({ origin: 'manual', basis: revision, edits: [{ op: 'put', kind: 'show', value: { id: game.id, crew: [], rundown: [cue] } as never }] });
  await api.show.command({ id: 'prove-activate' as never, command: { type: 'activate', game: game.id } });
  await api.show.command({ id: 'prove-air' as never, command: { type: 'air', operator: 'prove' as never, ref: { kind: 'rundown', cue: cue.id as never } } });
  const aired = await lowerThirdUntil(api, 'the lower third on program', (values) => values.statLine === tonightLine(featured, 0));
  assert.equal(String(aired.statLabel).toLowerCase(), 'tonight');
  log(`on program: ${featured.lastName} ${aired.statLabel} ${aired.statLine}`);

  replaceFile(boxScore(rosters, { away: 61, home: 73 }, 3));
  const updated = await until(game.id, api, 'the replaced file', (live) => live.sport === 'basketball' && live.score.home === 73);
  assert.equal(updated.players[firstPlayer('home').id]?.pts, Number(firstPlayer('home').jersey) + 2 + 3);
  assert.equal(updated.team.home.pts, 50 + 2 + 3);
  log(`replaced file: score ${updated.score.away}-${updated.score.home}, ${firstPlayer('home').lastName} ${updated.players[firstPlayer('home').id]!.pts} pts`);
  const onAir = await lowerThirdUntil(api, 'the lower third to follow the file', (values) => values.statLine === tonightLine(featured, 3));
  log(`still on program: ${featured.lastName} ${onAir.statLabel} ${onAir.statLine}`);

  // How the server stops a feed: Windows has no SIGINT to send a child.
  tool.stdin.write('stop\n');
  tool.stdin.flush();
  const code = await tool.exited;
  const after = await until(game.id, api, 'authority handed back', (live) => live.sport === 'basketball' && live.authority.score === 'operator' && live.authority.stats === 'operator');
  assert.equal(code, 0, 'the tool exits 0 on stop');
  assert.equal(after.score.home, 73, 'handing back keeps the data');
  log(`after stop: authority ${JSON.stringify(after.authority)}`);

  await Bun.sleep(100);
  console.log(output.map((line) => `  tool> ${line}`).join('\n'));
  assert(output.some((line) => line.includes('not on the roster, skipped: home #98')), 'the unmatched player is logged');
  assert.equal(output.filter((line) => line.includes('#98')).length, 2, 'each unmatched player is logged once per side');
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
  for (const child of children) child.kill();
  await Promise.all(children.map((child) => child.exited));
  rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}
