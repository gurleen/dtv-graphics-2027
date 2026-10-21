/**
 * The phase 2.2 gate, end to end: real server processes on a real SQLite file in a temp
 * directory, and clients over the real WebSocket through @dtv/api.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Api, type Connection, connect, first, type WatchStatus, watch } from '@dtv/api';
import { type EditBatch, type GameApplyInput, GameId, PlayerId, ShowId, SourceId, TeamId, type WorldSnapshot } from '@dtv/domain';
import { cueOf } from '@dtv/graphics';
import { CommandId, CueRef, OperatorId, type OutputFrame, type ShowCommand, type ShowView } from '@dtv/playout';

const MAIN = join(import.meta.dir, 'main.ts');
const GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const SHOW = ShowId.parse('drexel-sju');
const REED = PlayerId.parse('drexel-mbb@2026-27/reed-josh');
const HIPPS = PlayerId.parse('drexel-mbb@2026-27/hipps');
const alex = OperatorId.parse('alex');
const bob = OperatorId.parse('bob');

/** Starts main.ts and resolves once it serves; port 0 lets the system pick one. */
async function startServer(options: { readonly port: number; readonly db: string; readonly seed: boolean }) {
  const child = Bun.spawn(['bun', MAIN, ...(options.seed ? ['--seed'] : [])], {
    env: { ...process.env, PORT: String(options.port), DTV_DB: options.db },
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of child.stdout) {
    output += decoder.decode(chunk);
    const port = /on http:\/\/localhost:(\d+)/.exec(output)?.[1];
    if (port) return { child, port: Number(port) };
  }
  throw new Error(`the server exited before serving:\n${output}`);
}

const until = async (what: string, ready: () => boolean, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(20);
  }
};

/** Keeps a stream open through `watch` and records what it sees. `drops` holds how many values had arrived at each drop. */
const record = <T>(open: (signal: AbortSignal) => Promise<AsyncIterable<T>>) => {
  const controller = new AbortController();
  const values: T[] = [];
  const statuses: WatchStatus[] = [];
  const drops: number[] = [];
  const onStatus = (status: WatchStatus) => {
    statuses.push(status);
    if (status === 'reconnecting') drops.push(values.length);
  };
  void watch(open, (value) => values.push(value), { signal: controller.signal, onStatus });
  return { values, statuses, drops, stop: () => controller.abort() };
};

let commandCount = 0;
const command = (api: Api, body: ShowCommand, id = `gate-${++commandCount}`) => api.show.command({ id: CommandId.parse(id), command: body });

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (error: unknown) => error,
  );

let dir: string;
let server: Awaited<ReturnType<typeof startServer>>;
let a: Connection;
let b: Connection;
let bData: ReturnType<typeof record<WorldSnapshot>>;
let bShow: ReturnType<typeof record<ShowView>>;
let bProgram: ReturnType<typeof record<OutputFrame>>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dtv-gate-'));
  server = await startServer({ port: 0, db: join(dir, 'dtv.sqlite'), seed: true });
  const url = `ws://localhost:${server.port}/rpc`;
  a = connect({ url, client: 'client-a' });
  b = connect({ url, client: 'client-b' });
  bData = record((signal) => b.api.data.watch(undefined, { signal }));
  bShow = record((signal) => b.api.show.watch({ operator: bob }, { signal }));
  bProgram = record((signal) => b.api.output.watch({ bus: { kind: 'program' } }, { signal }));
  await until('client B’s first values', () => bData.values.length > 0 && bShow.values.length > 0 && bProgram.values.length > 0);
});

afterAll(async () => {
  for (const stream of [bData, bShow, bProgram]) stream?.stop();
  a?.close();
  b?.close();
  server?.child.kill();
  await server?.child.exited;
  rmSync(dir, { recursive: true, force: true });
});

const programLower = (view: ShowView | undefined) => view?.program.lower;
const lowerFrame = (frame: OutputFrame | undefined) => frame?.layers.find((layer) => layer.layer === 'lower');

describe('two clients over one real WebSocket each', () => {
  test('client A’s manual edit of a player’s name reaches client B’s data stream with the new revision', async () => {
    const world = await first((signal) => a.api.data.watch(undefined, { signal }));
    const reed = world.entities.player.find((player) => player.id === REED)!;
    const batch: EditBatch = { origin: 'manual', basis: world.revision, edits: [{ op: 'put', kind: 'player', value: { ...reed, firstName: 'Joshua' } }] };
    const { revision } = await a.api.data.apply(batch);
    expect(revision).toBeGreaterThan(world.revision);
    await until('B to see the edit', () => bData.values.at(-1)?.revision === revision);
    expect(bData.values.at(-1)?.entities.player.find((player) => player.id === REED)?.firstName).toBe('Joshua');
  });

  test('A cues and takes the player lower third; B sees it on program, and B’s program output carries the name in capitals', async () => {
    const world = await first((signal) => a.api.data.watch(undefined, { signal }));
    const show = world.entities.show.find((row) => row.id === SHOW)!;
    const rundown = [
      cueOf('basketball-v2/player-lower-third', { player: REED, line: { kind: 'game', stats: ['pts', 'reb'] } }, { id: 'reed' }),
      cueOf('basketball-v2/player-lower-third', { player: HIPPS }, { id: 'hipps' }),
    ];
    await a.api.data.apply({ origin: 'manual', basis: world.revision, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown } }] });
    await command(a.api, { type: 'activate', show: SHOW });
    expect(await command(a.api, { type: 'cue', operator: alex, ref: CueRef.parse({ kind: 'rundown', cue: 'reed' }) })).toMatchObject({ changed: true });
    expect(await command(a.api, { type: 'take', operator: alex })).toMatchObject({ changed: true });

    await until('B to see the take', () => programLower(bShow.values.at(-1))?.origin.kind === 'rundown');
    const slot = programLower(bShow.values.at(-1))!;
    expect(slot.origin).toEqual(CueRef.parse({ kind: 'rundown', cue: 'reed' }));
    expect(bShow.values.at(-1)?.rundown.find((cue) => cue.onProgram === slot.id)?.label).toBe('Joshua Reed #5 · game');

    await until('B’s program output to carry the lower third', () => lowerFrame(bProgram.values.at(-1))?.slot === slot.id);
    expect(lowerFrame(bProgram.values.at(-1))?.values).toMatchObject({ firstName: 'JOSHUA', lastName: 'REED', statLine: '18 PTS  ·  7 REB' });
  });

  test('a second take of another cue replaces it with a new slot id', async () => {
    const before = programLower(bShow.values.at(-1))!;
    await command(a.api, { type: 'cue', operator: alex, ref: CueRef.parse({ kind: 'rundown', cue: 'hipps' }) });
    await command(a.api, { type: 'take', operator: alex });
    await until('B to see the second take', () => programLower(bShow.values.at(-1))?.id !== before.id);
    const after = programLower(bShow.values.at(-1))!;
    expect(after.origin).toEqual(CueRef.parse({ kind: 'rundown', cue: 'hipps' }));
    await until('B’s program output to switch slots', () => lowerFrame(bProgram.values.at(-1))?.slot === after.id);
    expect(lowerFrame(bProgram.values.at(-1))?.values.lastName).toBe('HIPPS');
  });
});

test('an operator counts as connected while their show stream is open', async () => {
  const controller = new AbortController();
  void watch((signal) => a.api.show.watch({ operator: alex }, { signal }), () => {}, { signal: controller.signal });
  await until('B to see alex connect', () => bShow.values.at(-1)?.operators.includes(alex) === true);
  expect(bShow.values.at(-1)?.operators).toEqual([bob, alex]);
  controller.abort();
  await until('B to see alex leave', () => bShow.values.at(-1)?.operators.includes(alex) === false);
});

describe('rules over the wire', () => {
  test('a feed writing the score before the operator hands it the group gets NOT_AUTHORITY; after the handoff it succeeds', async () => {
    const score: GameApplyInput = { sport: 'basketball', gameId: GAME, source: SourceId.parse('statcrew'), commands: [{ type: 'score', side: 'home', value: 75 }] };
    expect(await rejection(a.api.game.apply(score))).toMatchObject({ code: 'NOT_AUTHORITY', data: { group: 'score' } });
    await a.api.game.apply({ sport: 'basketball', gameId: GAME, source: SourceId.parse('operator'), commands: [{ type: 'authority', group: 'score', source: SourceId.parse('statcrew') }] });
    const result = await a.api.game.apply(score);
    expect(result.live.sport === 'basketball' && result.live.score.home).toBe(75);
  });

  test('a player line for a player on neither team fails with NOT_IN_GAME', async () => {
    const line: GameApplyInput = { sport: 'basketball', gameId: GAME, source: SourceId.parse('operator'), commands: [{ type: 'playerLine', player: PlayerId.parse('drexel-mbb@2026-27/nobody'), line: { pts: 2 } }] };
    expect(await rejection(a.api.game.apply(line))).toMatchObject({ code: 'NOT_IN_GAME', data: { player: 'drexel-mbb@2026-27/nobody' } });
  });

  test('a data edit that puts another program’s team in a game fails with INCONSISTENT and writes nothing', async () => {
    const world = await first((signal) => a.api.data.watch(undefined, { signal }));
    const game = world.entities.game.find((row) => row.id === GAME)!;
    const batch: EditBatch = { origin: 'manual', basis: world.revision, edits: [{ op: 'put', kind: 'game', value: { ...game, awayTeamId: TeamId.parse('saint-josephs-wbb') } }] };
    expect(await rejection(a.api.data.apply(batch))).toMatchObject({ code: 'INCONSISTENT', data: { detail: expect.stringContaining('saint-josephs-wbb plays wbb') } });
    const after = await first((signal) => a.api.data.watch(undefined, { signal }));
    expect(after.revision).toBe(world.revision);
    expect(after.entities.game.find((row) => row.id === GAME)?.awayTeamId).toBe(TeamId.parse('saint-josephs-mbb'));
  });
});

test('a malformed frame on /rpc is dropped, and the server keeps answering', async () => {
  for (const frame of ['{}', '[]', 'not json']) {
    const socket = new WebSocket(`ws://localhost:${server.port}/rpc`);
    await new Promise((resolve) => (socket.onopen = resolve));
    socket.send(frame);
    await Bun.sleep(100);
    socket.close();
  }
  const world = await first((signal) => a.api.data.watch(undefined, { signal }));
  expect(world.revision).toBeGreaterThan(0);
  expect(server.child.exitCode).toBeNull();
});

describe('restart', () => {
  test('streams resume on their own after a restart and show the same program slots; a command id answered before is answered the same after', async () => {
    const toggle: ShowCommand = { type: 'toggle', operator: alex, ref: CueRef.parse({ kind: 'free', graphic: 'basketball-v2/scorebug' }) };
    const answered = await command(a.api, toggle, 'scorebug-toggle');
    expect(answered).toMatchObject({ changed: true });
    await until('B to see the scorebug', () => bShow.values.at(-1)?.program.bug !== undefined);
    const program = bShow.values.at(-1)!.program;

    server.child.kill('SIGTERM');
    await server.child.exited;
    await until('B to notice the drop', () => bShow.statuses.at(-1) === 'reconnecting' && bProgram.statuses.at(-1) === 'reconnecting');
    const [showDrop, outputDrop] = [bShow.drops.at(-1)!, bProgram.drops.at(-1)!];
    server = await startServer({ port: server.port, db: join(dir, 'dtv.sqlite'), seed: false });

    await until('B’s show stream to resume', () => bShow.values.length > showDrop, 10_000);
    expect(bShow.statuses.at(-1)).toBe('live');
    const resumed = bShow.values[showDrop]!;
    expect(resumed.program.bug?.id).toBe(program.bug!.id);
    expect(resumed.program.lower?.id).toBe(program.lower!.id);
    await until('B’s program output to resume', () => bProgram.values.length > outputDrop, 10_000);
    expect(bProgram.values[outputDrop]!.layers.map((layer) => layer.slot)).toEqual([program.bug!.id, program.lower!.id]);

    expect(await command(a.api, toggle, 'scorebug-toggle')).toEqual(answered);
    const now = await first((signal) => a.api.show.watch({ operator: alex }, { signal }));
    expect(now.program.bug?.id).toBe(program.bug!.id);
  }, 30_000);
});
