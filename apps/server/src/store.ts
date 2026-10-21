/**
 * The one writer. Every change (data, live games, the show) goes through a method here,
 * which runs the pure rules, commits to SQLite in one transaction, and then wakes the
 * streams that read what changed. Each stream recomputes its value and sends it only if
 * it differs from the last one sent, so a slow consumer gets the newest value, never a
 * backlog.
 *
 * After a data commit the World is reloaded from the file rather than patched, so a
 * cascaded delete can never leave memory behind SQLite.
 */

import {
  backup, commitEdits, commitLive, commitShowState, type Db, loadJournal, loadLive, loadShowState, loadSnapshot, type SkippedFields,
} from '@dtv/db';
import {
  checkEdits, type EditBatch, type EpochMs, type GameApplyInput, type GameId, type GameLive, indexWorld, parseRosterCsv, planRoster,
  PROGRAMS, type Revision, type RosterError, type RosterPlan, sameJson, type SeasonId, SPORT_MODULES, type TeamId, type World,
  type WorldSnapshot,
} from '@dtv/domain';
import {
  type BusRef, checkCue, CommandId, EMPTY_SHOW, type OperatorId, type OutputFrame, project, type Registry, reduceShow, type ShowCommand,
  showContext, ShowState, type ShowView, SlotId, viewShow,
} from '@dtv/playout';
import { z } from 'zod';

export interface Clock {
  now(): EpochMs;
  /** Calls `fire` once at `time`; the returned function cancels it. */
  at(time: EpochMs, fire: () => void): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  at: (time, fire) => {
    const timer = setTimeout(fire, Math.max(0, time - Date.now()));
    return () => clearTimeout(timer);
  },
};

/** What can change. Each stream wakes only on the topics its value reads. */
export type Topic = 'data' | 'live' | 'show' | 'clock' | 'presence';

export type DataResult =
  | { readonly ok: true; readonly revision: Revision; readonly skipped: readonly SkippedFields[] }
  | { readonly ok: false; readonly reason: 'conflict' | 'invalid-reference' | 'duplicate' | 'inconsistent'; readonly detail: string };

export type GameResult =
  | { readonly ok: true; readonly revision: Revision; readonly live: GameLive }
  | { readonly ok: false; readonly reason: 'not-authority'; readonly group: string }
  | { readonly ok: false; readonly reason: 'no-game' };

export type CommandResult = { readonly ok: true; readonly revision: Revision; readonly changed: boolean } | { readonly ok: false; readonly reason: string };

export type RosterResult = { readonly ok: true; readonly plan: RosterPlan } | { readonly ok: false; readonly errors: readonly RosterError[] };

export interface Store {
  world(): World;
  applyEdits(actor: string, batch: EditBatch): DataResult;
  planRoster(input: { readonly team: TeamId; readonly season: SeasonId; readonly csv: string; readonly prune: boolean }): RosterResult;
  applyGame(actor: string, input: GameApplyInput): GameResult;
  command(actor: string, input: { readonly id: CommandId; readonly command: ShowCommand }): CommandResult;
  watchData(signal: AbortSignal): AsyncGenerator<WorldSnapshot, void>;
  watchGame(game: GameId, signal: AbortSignal): AsyncGenerator<GameLive, void>;
  /** Lists `operator` as connected while the stream is open. */
  watchShow(operator: OperatorId, signal: AbortSignal): AsyncGenerator<ShowView, void>;
  watchOutput(bus: BusRef, signal: AbortSignal): AsyncGenerator<OutputFrame, void>;
  onChange(topics: readonly Topic[], listener: () => void): () => void;
  status(): { readonly revision: Revision; readonly showId: string | null; readonly operators: readonly OperatorId[]; readonly streams: number };
  close(): void;
}

/** How many show command ids the store answers from memory. */
const REMEMBERED_COMMANDS = 256;

const ShowJournalPayload = z.object({ id: CommandId });

export function createStore(options: { readonly db: Db; readonly registry: Registry; readonly clock: Clock; readonly backupDir: string }): Store {
  const { db, registry, clock } = options;

  let world = indexWorld(loadSnapshot(db));
  let lives = new Map(loadLive(db));
  let show = ShowState.parse(loadShowState(db) ?? EMPTY_SHOW);
  const showJournal = loadJournal(db, { kind: 'show', limit: REMEMBERED_COMMANDS });
  let showRevision = showJournal.at(-1)?.seq ?? world.revision;
  let liveRevision = loadJournal(db, { kind: 'live', limit: 1 }).at(-1)?.seq ?? world.revision;

  const answers = new Map<CommandId, CommandResult>();
  const remember = (id: CommandId, answer: CommandResult) => {
    answers.set(id, answer);
    if (answers.size > REMEMBERED_COMMANDS) answers.delete(answers.keys().next().value!);
  };
  for (const row of showJournal) {
    const payload = ShowJournalPayload.safeParse(row.payload);
    if (payload.success) remember(payload.data.id, { ok: true, revision: row.seq, changed: true });
  }

  const presence = new Map<OperatorId, number>();
  const listeners = new Set<{ readonly topics: ReadonlySet<Topic>; readonly wake: () => void }>();
  const notify = (...topics: Topic[]) => {
    for (const listener of listeners) if (topics.some((topic) => listener.topics.has(topic))) listener.wake();
  };
  const onChange = (topics: readonly Topic[], wake: () => void) => {
    const listener = { topics: new Set(topics), wake };
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const max = (...revisions: Revision[]) => revisions.reduce((a, b) => (b > a ? b : a));
  const context = () => showContext({ world, showId: show.showId, live: (game) => lives.get(game), now: clock.now() });

  let cancelTimer: (() => void) | null = null;
  /** One timer, at the earliest moment any live game's displayed clock changes. */
  const schedule = () => {
    cancelTimer?.();
    cancelTimer = null;
    const now = clock.now();
    const changes = [...lives.values()].flatMap((live) => SPORT_MODULES[live.sport].nextChange(live, now) ?? []);
    if (!changes.length) return;
    cancelTimer = clock.at(Math.min(...changes), () => {
      notify('clock');
      schedule();
    });
  };
  schedule();

  /**
   * The newest value of `read`, now and after every change to `topics`, until `signal`
   * aborts. `key` decides whether a value differs from the last one sent; an undefined
   * value sends nothing.
   */
  async function* stream<T>(input: {
    readonly topics: readonly Topic[];
    readonly signal: AbortSignal;
    readonly read: () => T | undefined;
    readonly key: (value: T) => unknown;
  }): AsyncGenerator<T, void> {
    let dirty = true;
    let wake: (() => void) | null = null;
    const unsubscribe = onChange(input.topics, () => {
      dirty = true;
      wake?.();
    });
    const onAbort = () => wake?.();
    input.signal.addEventListener('abort', onAbort);
    try {
      let sent: unknown = Symbol('nothing sent');
      while (!input.signal.aborted) {
        if (!dirty) await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
        dirty = false;
        if (input.signal.aborted) break;
        const value = input.read();
        if (value === undefined) continue;
        const key = input.key(value);
        if (key === sent) continue;
        sent = key;
        yield value;
      }
    } finally {
      unsubscribe();
      input.signal.removeEventListener('abort', onAbort);
    }
  }

  return {
    world: () => world,

    applyEdits(actor, batch) {
      const problems = [...checkEdits(world, batch).map((problem) => problem.message), ...rundownProblems(registry, batch)];
      if (problems.length) return { ok: false, reason: 'inconsistent', detail: problems.join('\n') };
      const result = commitEdits(db, { actor, at: clock.now(), batch });
      if (!result.ok) return result;
      if (result.revision !== world.revision) {
        world = indexWorld(loadSnapshot(db));
        lives = new Map(loadLive(db));
        // A commit can add or remove a game, and its live state with it.
        notify('data', 'live');
        schedule();
      }
      return { ok: true, revision: result.revision, skipped: result.skipped };
    },

    planRoster(input) {
      const parsed = parseRosterCsv(input.csv);
      if (!parsed.ok) return parsed;
      return { ok: true, plan: planRoster(world, { team: input.team, season: input.season, rows: parsed.rows, prune: input.prune }) };
    },

    applyGame(actor, input) {
      const game = world.get('game', input.gameId);
      if (!game || PROGRAMS[game.program].sport !== input.sport) return { ok: false, reason: 'no-game' };
      const sport = SPORT_MODULES[input.sport];
      const now = clock.now();
      const before = lives.get(game.id);
      if (!before) return { ok: false, reason: 'no-game' };
      let live = before;
      for (const command of input.commands) {
        const result = sport.apply(live, command, { source: input.source, now });
        if (!result.ok) return { ok: false, reason: 'not-authority', group: result.group };
        live = result.live;
      }
      if (sameJson(live, before)) return { ok: true, revision: liveRevision, live };
      liveRevision = commitLive(db, { actor, at: now, live, payload: input });
      lives.set(game.id, live);
      notify('live');
      schedule();
      return { ok: true, revision: liveRevision, live };
    },

    command(actor, { id, command }) {
      const remembered = answers.get(id);
      if (remembered) return remembered;
      const result = reduceShow(show, command, { registry, context: context(), newSlotId: () => SlotId.parse(crypto.randomUUID()) });
      let answer: CommandResult;
      if (!result.ok) answer = { ok: false, reason: result.error };
      else if (!result.changed) answer = { ok: true, revision: showRevision, changed: false };
      else {
        if (command.type === 'activate') backup(db, options.backupDir, 'show');
        showRevision = commitShowState(db, { actor, at: clock.now(), state: result.state, payload: { id, command } });
        show = result.state;
        answer = { ok: true, revision: showRevision, changed: true };
        notify('show');
      }
      remember(id, answer);
      return answer;
    },

    watchData: (signal) => stream({ topics: ['data'], signal, read: () => world.snapshot, key: (snapshot) => snapshot.revision }),

    // A data commit reloads every live state as a new object, so identity would resend unchanged games.
    watchGame: (game, signal) => stream({ topics: ['live'], signal, read: () => lives.get(game), key: (live) => JSON.stringify(live) }),

    async *watchShow(operator, signal) {
      presence.set(operator, (presence.get(operator) ?? 0) + 1);
      notify('presence');
      try {
        yield* stream({
          // A cue's label and error come from its bind, which may read the live game.
          topics: ['data', 'live', 'show', 'presence'],
          signal,
          read: () =>
            viewShow({ registry, state: show, operator, operators: [...presence.keys()], revision: max(world.revision, showRevision), context: context() }),
          key: (view) => JSON.stringify(view),
        });
      } finally {
        const count = (presence.get(operator) ?? 1) - 1;
        if (count) presence.set(operator, count);
        else presence.delete(operator);
        notify('presence');
      }
    },

    watchOutput: (bus, signal) =>
      stream({
        topics: ['data', 'live', 'show', 'clock'],
        signal,
        read: () =>
          project({
            registry,
            bus: bus.kind === 'program' ? show.program : (show.previews[bus.operator] ?? {}),
            ref: bus,
            revision: max(world.revision, showRevision, liveRevision),
            context: context(),
          }),
        // The revision moves on changes this bus does not show, so only the layers decide.
        key: (frame) => JSON.stringify(frame.layers),
      }),

    onChange,

    status: () => ({
      revision: max(world.revision, showRevision, liveRevision),
      showId: show.showId,
      operators: [...presence.keys()],
      streams: listeners.size,
    }),

    close() {
      cancelTimer?.();
      cancelTimer = null;
    },
  };
}

/** Rundown cues must name a graphic and fit its params, which SQLite cannot check. */
function rundownProblems(registry: Registry, batch: EditBatch): string[] {
  return batch.edits.flatMap((edit) => {
    if (edit.op !== 'put' || edit.kind !== 'show') return [];
    return edit.value.rundown.flatMap((cue) => {
      const check = checkCue(registry, cue);
      return check.ok ? [] : [`Show ${edit.value.id}, cue ${cue.id}: ${check.error}`];
    });
  });
}
