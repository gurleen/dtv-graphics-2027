import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Db, migrate, openDb, seed } from '@dtv/db';
import { type basketball, CueId, type EditBatch, GameApplyInput, GameId, GraphicId, PlayerId, Revision, ShowId, SourceId, TeamId } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { CommandId, OperatorId, type OutputFrame, type Registry, type ShowCommand } from '@dtv/playout';
import { type Clock, createStore, type Store } from './store';

const SEED = join(import.meta.dir, '../../../data/seed');
const GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const REED = PlayerId.parse('drexel-mbb@2026-27/reed-josh');
const alex = OperatorId.parse('alex');
const sam = OperatorId.parse('sam');
const scorebug = { kind: 'free', graphic: GraphicId.parse('basketball-v2/scorebug') } as const;

/** A clock the test moves by hand. `fireNext` jumps to the next timer and fires it. */
const fakeClock = (start: number) => {
  let now = start;
  let timers: { at: number; fire: () => void }[] = [];
  const clock: Clock & { fireNext(): boolean; pending(): number } = {
    now: () => now,
    at: (at, fire) => {
      const timer = { at, fire };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
    fireNext: () => {
      const [timer] = [...timers].sort((a, b) => a.at - b.at);
      if (!timer) return false;
      timers = timers.filter((other) => other !== timer);
      now = Math.max(now, timer.at);
      timer.fire();
      return true;
    },
    pending: () => timers.length,
  };
  return clock;
};

const flush = () => Bun.sleep(1);

let dir: string;
let db: Db;
let clock: ReturnType<typeof fakeClock>;
let stores: Store[];
const open = () => {
  const store = createStore({ db, registry: GRAPHICS, clock, backupDir: join(dir, 'backups') });
  stores.push(store);
  return store;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dtv-server-'));
  db = openDb(join(dir, 'dtv.sqlite'));
  migrate(db, { backupDir: join(dir, 'backups') });
  await seed(db, { dir: SEED, at: 0 });
  clock = fakeClock(Date.parse('2026-11-08T20:00:00-05:00'));
  stores = [];
});
afterEach(() => {
  for (const store of stores) store.close();
  db.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Collects a stream's values in the background until `stop`. */
const collect = <T>(stream: (signal: AbortSignal) => AsyncGenerator<T>) => {
  const controller = new AbortController();
  const values: T[] = [];
  const done = (async () => {
    for await (const value of stream(controller.signal)) values.push(value);
  })();
  return {
    values,
    stop: async () => {
      controller.abort();
      await done;
    },
  };
};

/** A stream's first value; leaving the loop closes the stream. */
const current = async <T>(stream: AsyncGenerator<T, void>): Promise<T> => {
  for await (const value of stream) return value;
  throw new Error('the stream ended before its first value');
};

const renamed = (store: Store, firstName: string): EditBatch => {
  const reed = store.world().get('player', REED)!;
  return { origin: 'manual', basis: store.world().revision, edits: [{ op: 'put', kind: 'player', value: { ...reed, firstName } }] };
};

const game = (source: string, ...commands: basketball.BasketballCommand[]) =>
  GameApplyInput.parse({ sport: 'basketball', gameId: GAME, source, commands });

let commands = 0;
const send = (store: Store, command: ShowCommand, id = `command-${++commands}`) => store.command('test', { id: CommandId.parse(id), command });

describe('data', () => {
  test('a manual edit commits, reloads the World and reaches the data stream with its revision', async () => {
    const store = open();
    const stream = collect((signal) => store.watchData(signal));
    await flush();
    const before = store.world().revision;
    const result = store.applyEdits('alex', renamed(store, 'Joshua'));
    expect(result).toMatchObject({ ok: true, skipped: [] });
    await flush();
    await stream.stop();
    expect(stream.values.map((snapshot) => snapshot.revision)).toEqual([before, result.ok ? result.revision : before]);
    expect(stream.values[1]?.entities.player.find((player) => player.id === REED)?.firstName).toBe('Joshua');
    expect(store.world().get('player', REED)?.firstName).toBe('Joshua');
  });

  test('an edit that puts another program’s team in a game is INCONSISTENT and writes nothing', () => {
    const store = open();
    const before = store.world().revision;
    const game = store.world().get('game', GAME)!;
    const result = store.applyEdits('alex', { origin: 'manual', basis: before, edits: [{ op: 'put', kind: 'game', value: { ...game, homeTeamId: TeamId.parse('drexel-wbb') } }] });
    expect(result).toMatchObject({ ok: false, reason: 'inconsistent', detail: expect.stringContaining('drexel-wbb plays wbb') });
    expect(store.world().revision).toBe(before);
    expect(open().world().get('game', GAME)?.homeTeamId).toBe(TeamId.parse('drexel-mbb'));
  });

  test('a rundown cue for a graphic the registry lacks is INCONSISTENT', () => {
    const store = open();
    const show = store.world().get('show', ShowId.parse('drexel-sju'))!;
    const rundown = [{ id: CueId.parse('mystery'), graphic: GraphicId.parse('basketball-v2/mystery'), params: {}, overrides: {}, note: '' }];
    const result = store.applyEdits('alex', { origin: 'manual', basis: store.world().revision, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown } }] });
    expect(result).toEqual({ ok: false, reason: 'inconsistent', detail: 'Show drexel-sju, cue mystery: No graphic basketball-v2/mystery' });
  });

  test('a rundown cue naming a property of Object.prototype is INCONSISTENT', () => {
    const store = open();
    const show = store.world().get('show', ShowId.parse('drexel-sju'))!;
    const rundown = [{ id: CueId.parse('x'), graphic: GraphicId.parse('constructor'), params: {}, overrides: {}, note: '' }];
    const result = store.applyEdits('alex', { origin: 'manual', basis: store.world().revision, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown } }] });
    expect(result).toEqual({ ok: false, reason: 'inconsistent', detail: 'Show drexel-sju, cue x: No graphic constructor' });
  });

  test('a stale basis is a CONFLICT', () => {
    const store = open();
    const stale = renamed(store, 'Joshua');
    store.applyEdits('sam', renamed(store, 'J.'));
    expect(store.applyEdits('alex', stale)).toMatchObject({ ok: false, reason: 'conflict' });
  });
});

describe('live', () => {
  test('a feed that writes the score before the operator hands it over is refused; after the handoff it lands', () => {
    const store = open();
    expect(store.applyGame('statcrew', game('statcrew', { type: 'score', side: 'home', value: 74 }))).toEqual({ ok: false, reason: 'not-authority', group: 'score' });
    expect(store.applyGame('alex', game('operator', { type: 'authority', group: 'score', source: SourceId.parse('statcrew') }))).toMatchObject({ ok: true });
    const result = store.applyGame('statcrew', game('statcrew', { type: 'score', side: 'home', value: 74 }));
    expect(result).toMatchObject({ ok: true, live: { score: { away: 68, home: 74 } } });
    expect(store.applyGame('alex', game('operator', { type: 'score', side: 'home', value: 76 }))).toEqual({ ok: false, reason: 'not-authority', group: 'score' });
  });

  test('one refused command refuses the whole call', () => {
    const store = open();
    const result = store.applyGame('statcrew', game('statcrew', { type: 'possession', side: 'away' }, { type: 'score', side: 'home', value: 80 }));
    expect(result).toMatchObject({ ok: false });
    expect(open().applyGame('alex', game('operator', { type: 'possession', side: 'home' }))).toMatchObject({ ok: true, live: { possession: 'home', score: { home: 72 } } });
  });

  test('an unknown game is NO_GAME', () => {
    const store = open();
    expect(store.applyGame('alex', { ...game('operator', { type: 'score', side: 'home', value: 1 }), gameId: GameId.parse('2026-27/2026-11-09/a.at.b') })).toEqual({ ok: false, reason: 'no-game' });
  });

  test('the game stream sends each change of its game', async () => {
    const store = open();
    const stream = collect((signal) => store.watchGame(GAME, signal));
    await flush();
    store.applyGame('alex', game('operator', { type: 'score', side: 'home', value: 74 }));
    await flush();
    await stream.stop();
    expect(stream.values.map((live) => live.sport === 'basketball' && live.score.home)).toEqual([72, 74]);
  });
});

describe('a second game', () => {
  const OTHER = GameId.parse('2026-27/2026-11-20/saint-josephs-mbb.at.drexel-mbb');
  const addOther = (store: Store) =>
    store.applyEdits('alex', { origin: 'manual', basis: store.world().revision, edits: [{ op: 'put', kind: 'game', value: { ...store.world().get('game', GAME)!, id: OTHER } }] });

  test('a new game has live state at once: its game stream sends it, and the scorebug for its show binds', async () => {
    const store = open();
    const stream = collect((signal) => store.watchGame(OTHER, signal));
    await flush();
    expect(addOther(store)).toMatchObject({ ok: true });
    await flush();
    await stream.stop();
    expect(stream.values.map((live) => live.sport === 'basketball' && live.score)).toEqual([{ away: 0, home: 0 }]);

    const show = { ...store.world().get('show', ShowId.parse('drexel-sju'))!, id: ShowId.parse('second'), gameId: OTHER };
    expect(store.applyEdits('alex', { origin: 'manual', basis: store.world().revision, edits: [{ op: 'put', kind: 'show', value: show }] })).toMatchObject({ ok: true });
    send(store, { type: 'activate', show: show.id });
    const view = await current(store.watchShow(alex, new AbortController().signal));
    expect(view.free.find((cue) => cue.graphic === scorebug.graphic)?.error).toBeNull();
  });

  test('a game stream sends nothing when a data commit and another game’s change leave its game as it was', async () => {
    const store = open();
    const stream = collect((signal) => store.watchGame(GAME, signal));
    await flush();
    expect(addOther(store)).toMatchObject({ ok: true });
    store.applyGame('alex', { ...game('operator', { type: 'score', side: 'home', value: 3 }), gameId: OTHER });
    await flush();
    await stream.stop();
    expect(stream.values).toHaveLength(1);
  });
});

describe('show commands', () => {
  test('a repeated command id answers with the first result and applies once, also after a restart', async () => {
    const store = open();
    send(store, { type: 'activate', show: ShowId.parse('drexel-sju') });
    const toggle: ShowCommand = { type: 'toggle', operator: alex, ref: scorebug };
    const first = send(store, toggle, 'toggle-1');
    expect(first).toMatchObject({ ok: true, changed: true });
    expect(send(store, toggle, 'toggle-1')).toEqual(first);
    const onAir = (await current(store.watchShow(alex, new AbortController().signal))).program.bug;
    expect(onAir).toBeDefined();

    store.close();
    const restarted = open();
    expect(send(restarted, toggle, 'toggle-1')).toEqual(first);
    expect((await current(restarted.watchShow(alex, new AbortController().signal))).program.bug?.id).toBe(onAir!.id);
  });

  test('activate backs up the database', () => {
    const store = open();
    expect(send(store, { type: 'activate', show: ShowId.parse('drexel-sju') })).toMatchObject({ ok: true, changed: true });
    expect(readdirSync(join(dir, 'backups')).filter((name) => name.endsWith('-show.sqlite'))).toHaveLength(1);
  });

  test('a command that cannot apply is REJECTED with the reducer’s reason', () => {
    const store = open();
    expect(send(store, { type: 'cue', operator: alex, ref: { kind: 'rundown', cue: CueId.parse('nope') } })).toEqual({ ok: false, reason: 'The rundown has no cue nope' });
  });

  test('the show stream lists the operators who have one open', async () => {
    const store = open();
    const one = collect((signal) => store.watchShow(alex, signal));
    const two = collect((signal) => store.watchShow(sam, signal));
    await flush();
    expect(one.values.at(-1)?.operators).toEqual([alex, sam]);
    await two.stop();
    await flush();
    await one.stop();
    expect(one.values.at(-1)?.operators).toEqual([alex]);
  });
});

test('the show stream sends a new view when a live change alters what it shows', async () => {
  const entry = GRAPHICS['basketball-v2/scorebug'];
  const registry: Registry = { ...GRAPHICS, [entry.id]: { ...entry, label: (_params, context) => `Scorebug ${context.live?.sport === 'basketball' && context.live.score.home}` } };
  const store = createStore({ db, registry, clock, backupDir: join(dir, 'backups') });
  stores.push(store);
  send(store, { type: 'activate', show: ShowId.parse('drexel-sju') });
  const stream = collect((signal) => store.watchShow(alex, signal));
  await flush();
  store.applyGame('alex', game('operator', { type: 'score', side: 'home', value: 74 }));
  await flush();
  await stream.stop();
  expect(stream.values.map((view) => view.free.find((cue) => cue.graphic === scorebug.graphic)?.label)).toEqual(['Scorebug 72', 'Scorebug 74']);
});

describe('output and the clock', () => {
  const clockText = (frame: OutputFrame | undefined) => frame?.layers.find((layer) => layer.layer === 'bug')?.values.clock;

  test('a running clock makes frames on second boundaries above a minute and tenths below; a stopped clock makes none', async () => {
    const store = open();
    send(store, { type: 'activate', show: ShowId.parse('drexel-sju') });
    send(store, { type: 'air', operator: alex, ref: scorebug });
    store.applyGame('alex', game('operator', { type: 'shotClock', remainingMs: null }));
    let dataWakes = 0;
    store.onChange(['data'], () => dataWakes++);
    const data = collect((signal) => store.watchData(signal));
    const output = collect((signal) => store.watchOutput({ kind: 'program' }, signal));
    await flush();
    expect(clockText(output.values.at(-1))).toBe('13:59');

    const start = clock.now();
    store.applyGame('alex', game('operator', { type: 'clockSet', remainingMs: 63_000, running: true }));
    await flush();
    const seen: [number, unknown][] = [];
    for (let tick = 0; tick < 8; tick++) {
      expect(clock.fireNext()).toBe(true);
      await flush();
      seen.push([clock.now() - start, clockText(output.values.at(-1))]);
    }
    expect(seen).toEqual([
      [1, '1:02'],
      [1_001, '1:01'],
      [2_001, '1:00'],
      [3_001, '0:59.9'],
      [3_101, '0:59.8'],
      [3_201, '0:59.7'],
      [3_301, '0:59.6'],
      [3_401, '0:59.5'],
    ]);
    const framesWhileRunning = output.values.length;

    store.applyGame('alex', game('operator', { type: 'clock', action: 'stop' }));
    await flush();
    expect(clock.pending()).toBe(0);
    expect(output.values.length).toBe(framesWhileRunning);

    await data.stop();
    await output.stop();
    expect(dataWakes).toBe(0);
    expect(data.values).toHaveLength(1);
  });

  test('a slow consumer gets the newest frame, not a backlog', async () => {
    const store = open();
    send(store, { type: 'activate', show: ShowId.parse('drexel-sju') });
    send(store, { type: 'air', operator: alex, ref: scorebug });
    const controller = new AbortController();
    const frames = store.watchOutput({ kind: 'program' }, controller.signal);
    await frames.next();
    for (let score = 73; score <= 90; score++) store.applyGame('alex', game('operator', { type: 'score', side: 'home', value: score }));
    const next = await frames.next();
    controller.abort();
    await frames.return(undefined);
    expect(next.value?.layers[0]?.values.homeScore).toBe(90);
  });

  test('a preview bus shows that operator’s preview', async () => {
    const store = open();
    send(store, { type: 'activate', show: ShowId.parse('drexel-sju') });
    send(store, { type: 'cue', operator: sam, ref: scorebug });
    const frame = await current(store.watchOutput({ kind: 'preview', operator: sam }, new AbortController().signal));
    expect(frame.layers.map((layer) => [layer.graphic, layer.values.homeAcronym])).toEqual([['basketball-v2/scorebug', 'DREX']]);
    expect(frame.revision).toBeGreaterThanOrEqual(Revision.parse(1));
  });
});
