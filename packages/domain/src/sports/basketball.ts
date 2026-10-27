/**
 * Everything basketball-specific: stat lines, season stats, live game state, the commands
 * that change it, and the formatting broadcast text needs. Pure; no IO.
 *
 * Commands set absolute values (`score home 74`), never deltas, so a feed that resends
 * or two operators who press +2 for the same basket converge on the same state.
 */

import { z } from 'zod';
import { GameId, PlayerId, SourceId } from '../ids';
import { type EpochMs, Side, sides } from '../primitives';
import type { ProgramOf } from '../programs';

type BasketballProgram = ProgramOf<'basketball'>;

const count = z.number().int().nonnegative();

export const StatLine = z.object({
  min: count.default(0),
  pts: count.default(0),
  fgm: count.default(0),
  fga: count.default(0),
  tpm: count.default(0),
  tpa: count.default(0),
  ftm: count.default(0),
  fta: count.default(0),
  reb: count.default(0),
  ast: count.default(0),
  stl: count.default(0),
  blk: count.default(0),
  to: count.default(0),
  pf: count.default(0),
});
export type StatLine = z.infer<typeof StatLine>;

/** The counts a command changes. Built without defaults: zod's `.partial()` would fill the rest with 0. */
export const StatLinePatch = z.partialRecord(StatLine.keyof(), count);
export type StatLinePatch = z.infer<typeof StatLinePatch>;

const EMPTY_LINE: StatLine = StatLine.parse({});

export const BasketballPlayerSeasonStats = z.object({
  sport: z.literal('basketball'),
  gp: count.default(0),
  totals: StatLine.default(EMPTY_LINE),
});
export type BasketballPlayerSeasonStats = z.infer<typeof BasketballPlayerSeasonStats>;

export const BasketballTeamSeasonStats = z.object({
  sport: z.literal('basketball'),
  gp: count.default(0),
  totals: StatLine.default(EMPTY_LINE),
  opponentPts: count.default(0),
});
export type BasketballTeamSeasonStats = z.infer<typeof BasketballTeamSeasonStats>;

/**
 * A countdown anchored on the server's clock. Nothing ticks it: the display is computed
 * from `remainingMs` and `since` at projection time, so a restart or a reconnect cannot
 * lose time, and every renderer shows the same value.
 */
export const Clock = z.discriminatedUnion('running', [
  z.object({ running: z.literal(false), remainingMs: count }),
  z.object({ running: z.literal(true), remainingMs: count, since: z.number() }),
]);
export type Clock = z.infer<typeof Clock>;

export const remainingAt = (clock: Clock, now: EpochMs): number =>
  clock.running ? Math.max(0, clock.remainingMs - (now - clock.since)) : clock.remainingMs;

/** When a running game clock reaches zero; the shot clock stops there too. */
const expiresAt = (clock: Clock): EpochMs | null => (clock.running ? clock.since + clock.remainingMs : null);

/** The shot clock as of `now`, frozen at the instant the game clock expired. */
const shotAt = (live: Pick<BasketballLive, 'clock'>, now: EpochMs): EpochMs => Math.min(now, expiresAt(live.clock) ?? now);

/** The shot clock's remaining time as displayed: it stops when the game clock does, and shows nothing outside live play. */
export const shotClockAt = (live: BasketballLive, now: EpochMs): number | null =>
  live.shotClock && live.phase !== 'halftime' && live.phase !== 'final' ? remainingAt(live.shotClock, shotAt(live, now)) : null;

const startClock = (clock: Clock, now: EpochMs): Clock =>
  clock.running ? clock : { running: true, remainingMs: clock.remainingMs, since: now };

const stopClock = (clock: Clock, now: EpochMs): Clock =>
  clock.running ? { running: false, remainingMs: remainingAt(clock, now) } : clock;

const setClock = (remainingMs: number, running: boolean, now: EpochMs): Clock =>
  running ? { running: true, remainingMs, since: now } : { running: false, remainingMs };

/** `13:59` from a minute up, `04.3` below it. */
export const formatGameClock = (remainingMs: number): string => {
  if (remainingMs >= 60_000) {
    const seconds = Math.floor(remainingMs / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  const tenths = Math.floor(remainingMs / 100);
  return `${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
};

/** Whole seconds, rounded up, so the display reads 1 until the clock expires. */
export const formatShotClock = (remainingMs: number): string => String(Math.ceil(remainingMs / 1000));

export type ClockDisplay = 'game' | 'shot';

/**
 * The first moment after `now` at which a running clock's displayed text changes, or
 * null if it never will. The server sleeps until the earliest of these across live
 * games, so a clock re-projects on its boundary instead of on a polling interval.
 */
export const nextDisplayChange = (clock: Clock, now: EpochMs, display: ClockDisplay): EpochMs | null => {
  if (!clock.running) return null;
  const remaining = remainingAt(clock, now);
  if (remaining <= 0) return null;
  if (display === 'shot') return now + ((remaining - 1) % 1000) + 1;
  const unit = remaining >= 60_000 ? 1000 : 100;
  // Under a tenth the text already reads 00.0; what changes next is the status line at zero.
  if (remaining < unit) return now + remaining;
  return now + (remaining % unit) + 1;
};

/** When the displayed shot clock next changes; null once it is hidden or frozen by the game clock's expiry. */
export const nextShotClockChange = (live: BasketballLive, now: EpochMs): EpochMs | null => {
  if (!live.shotClock || shotClockAt(live, now) === null) return null;
  const change = nextDisplayChange(live.shotClock, now, 'shot');
  const expiry = expiresAt(live.clock);
  return change !== null && (expiry === null || change <= expiry) ? change : null;
};

export const FIELD_GROUPS = ['clock', 'score', 'stats'] as const;
export const FieldGroup = z.enum(FIELD_GROUPS);
export type FieldGroup = z.infer<typeof FieldGroup>;

export const Phase = z.enum(['pregame', 'live', 'halftime', 'final']);
export type Phase = z.infer<typeof Phase>;

/** A field goal or free throw attempt from a feed's play by play, the run of play that insights read. */
export const Shot = z.object({
  period: z.number().int().min(1),
  /** The game clock at the attempt. */
  remainingMs: count,
  side: Side,
  /** 1 for a free throw, 2 or 3 for a field goal. */
  value: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  made: z.boolean(),
});
export type Shot = z.infer<typeof Shot>;

export const BasketballLive = z.object({
  sport: z.literal('basketball'),
  gameId: GameId,
  phase: Phase,
  /** 1-based. Past the program's regulation periods it is overtime. */
  period: z.number().int().min(1),
  clock: Clock,
  /** Null blanks the shot clock. */
  shotClock: Clock.nullable(),
  score: sides(count),
  timeouts: sides(count),
  bonus: sides(z.boolean()),
  possession: Side.nullable(),
  starters: sides(z.array(PlayerId).max(5)),
  team: sides(StatLine),
  players: z.record(PlayerId, StatLine),
  /** Every attempt in the game's order. Empty without a play-by-play feed; a game stored before it existed reads as empty. */
  shots: z.array(Shot).default([]),
  /**
   * Which source may write each field group. One writer per group, so a feed and an
   * operator never fight over the score; the operator takes a group back with `authority`.
   */
  authority: z.object({ clock: SourceId, score: SourceId, stats: SourceId }),
});
export type BasketballLive = z.infer<typeof BasketballLive>;

export const BasketballCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('score'), side: Side, value: count }),
  z.object({ type: z.literal('clock'), action: z.enum(['start', 'stop']) }),
  z.object({ type: z.literal('clockSet'), remainingMs: count, running: z.boolean().optional() }),
  z.object({ type: z.literal('shotClock'), remainingMs: count.nullable(), running: z.boolean().optional() }),
  z.object({ type: z.literal('period'), period: z.number().int().min(1) }),
  z.object({ type: z.literal('phase'), phase: Phase }),
  z.object({ type: z.literal('timeouts'), side: Side, remaining: count }),
  z.object({ type: z.literal('bonus'), side: Side, value: z.boolean() }),
  z.object({ type: z.literal('possession'), side: Side.nullable() }),
  z.object({ type: z.literal('starters'), side: Side, players: z.array(PlayerId).length(5) }),
  z.object({ type: z.literal('teamLine'), side: Side, line: StatLinePatch }),
  z.object({ type: z.literal('playerLine'), player: PlayerId, line: StatLinePatch }),
  z.object({ type: z.literal('shots'), shots: z.array(Shot) }),
  z.object({ type: z.literal('authority'), group: FieldGroup, source: SourceId }),
]);
export type BasketballCommand = z.infer<typeof BasketballCommand>;

/** The field group each command writes. Handing a group over is the operator's alone. */
const COMMAND_GROUP: Record<BasketballCommand['type'], FieldGroup | 'operator'> = {
  score: 'score',
  timeouts: 'score',
  bonus: 'score',
  possession: 'score',
  clock: 'clock',
  clockSet: 'clock',
  shotClock: 'clock',
  period: 'clock',
  phase: 'clock',
  starters: 'stats',
  teamLine: 'stats',
  playerLine: 'stats',
  shots: 'stats',
  authority: 'operator',
};

export type ApplyResult<L> =
  | { readonly ok: true; readonly live: L }
  | { readonly ok: false; readonly reason: 'not-authority'; readonly group: FieldGroup | 'operator' };

export const OPERATOR = SourceId.parse('operator');

export function applyBasketball(
  live: BasketballLive,
  command: BasketballCommand,
  context: { readonly source: SourceId; readonly now: EpochMs },
): ApplyResult<BasketballLive> {
  const group = COMMAND_GROUP[command.type];
  const allowed = group === 'operator' ? context.source === OPERATOR : live.authority[group] === context.source;
  if (!allowed) return { ok: false, reason: 'not-authority', group };
  return { ok: true, live: nextLive(live, command, context.now) };
}

function nextLive(live: BasketballLive, command: BasketballCommand, now: EpochMs): BasketballLive {
  switch (command.type) {
    case 'score':
      return { ...live, score: { ...live.score, [command.side]: command.value } };
    case 'clock': {
      // The shot clock never runs while the game clock is stopped, so the two move together.
      const move = command.action === 'start' ? startClock : stopClock;
      return { ...live, clock: move(live.clock, now), shotClock: live.shotClock && move(live.shotClock, shotAt(live, now)) };
    }
    case 'clockSet': {
      const clock = setClock(command.remainingMs, command.running ?? live.clock.running, now);
      if (command.running === undefined) return { ...live, clock };
      // With `running` it is also a start or a stop, so the shot clock moves as `clock` moves it.
      const move = command.running ? startClock : stopClock;
      return { ...live, clock, shotClock: live.shotClock && move(live.shotClock, command.running ? now : shotAt(live, now)) };
    }
    case 'shotClock':
      // A reset during play keeps running with the game clock unless the command says otherwise.
      return {
        ...live,
        shotClock: command.remainingMs === null ? null : setClock(command.remainingMs, command.running ?? live.clock.running, now),
      };
    case 'period':
      return { ...live, period: command.period };
    case 'phase':
      return { ...live, phase: command.phase };
    case 'timeouts':
      return { ...live, timeouts: { ...live.timeouts, [command.side]: command.remaining } };
    case 'bonus':
      return { ...live, bonus: { ...live.bonus, [command.side]: command.value } };
    case 'possession':
      return { ...live, possession: command.side };
    case 'starters':
      return { ...live, starters: { ...live.starters, [command.side]: command.players } };
    case 'teamLine':
      return { ...live, team: { ...live.team, [command.side]: { ...live.team[command.side], ...command.line } } };
    case 'playerLine':
      return { ...live, players: { ...live.players, [command.player]: { ...(live.players[command.player] ?? EMPTY_LINE), ...command.line } } };
    case 'shots':
      return { ...live, shots: command.shots };
    case 'authority':
      return { ...live, authority: { ...live.authority, [command.group]: command.source } };
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

export const BASKETBALL_FORMAT = {
  mbb: { periods: 2, periodMs: 20 * 60_000, periodName: 'Half' },
  wbb: { periods: 4, periodMs: 10 * 60_000, periodName: 'Qtr' },
} as const satisfies Record<BasketballProgram, { periods: number; periodMs: number; periodName: string }>;

export const initialBasketball = (gameId: GameId, program: BasketballProgram): BasketballLive => ({
  sport: 'basketball',
  gameId,
  phase: 'pregame',
  period: 1,
  clock: { running: false, remainingMs: BASKETBALL_FORMAT[program].periodMs },
  shotClock: null,
  score: { away: 0, home: 0 },
  timeouts: { away: 4, home: 4 },
  bonus: { away: false, home: false },
  possession: null,
  starters: { away: [], home: [] },
  team: { away: EMPTY_LINE, home: EMPTY_LINE },
  players: {},
  shots: [],
  authority: { clock: OPERATOR, score: OPERATOR, stats: OPERATOR },
});

// Natural case, like the stored data: the projector applies broadcast capitals once.

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

/** `2nd Half`, `3rd Qtr`, `OT`, `2OT`. */
export const periodLabel = (program: BasketballProgram, period: number): string => {
  const { periods, periodName } = BASKETBALL_FORMAT[program];
  if (period <= periods) return `${ordinal(period)} ${periodName}`;
  const overtime = period - periods;
  return overtime === 1 ? 'OT' : `${overtime}OT`;
};

/** The Score to Break's one-line status: `8:42 2nd Half`, `Halftime`, `End of 1st Half`, `Final`. */
export const statusLine = (program: BasketballProgram, live: BasketballLive, now: EpochMs): string => {
  if (live.phase === 'final') return 'Final';
  if (live.phase === 'halftime') return 'Halftime';
  const remaining = remainingAt(live.clock, now);
  if (remaining === 0) return `End of ${periodLabel(program, live.period)}`;
  return `${formatGameClock(remaining)} ${periodLabel(program, live.period)}`;
};

const POSITION_NAMES: Record<string, string> = { G: 'Guard', F: 'Forward', C: 'Center' };

/** `G/F` becomes `Guard/Forward`. The starting five shows the code; the player lower third the name. */
export const positionName = (code: string): string =>
  code
    .split('/')
    .map((part) => POSITION_NAMES[part.trim().toUpperCase()] ?? part)
    .join('/');

export const avg = (total: number, games: number): string => (games > 0 ? (total / games).toFixed(1) : '0.0');
export const pct = (made: number, attempted: number): string =>
  attempted > 0 ? `${((made / attempted) * 100).toFixed(1)}%` : '-';

type StatDef<T> = { readonly label: string; readonly value: (stats: T) => string };

/** The stats a cue can pick for a player's season, by key. */
export const PLAYER_SEASON_STATS = {
  ppg: { label: 'PPG', value: (s) => avg(s.totals.pts, s.gp) },
  rpg: { label: 'RPG', value: (s) => avg(s.totals.reb, s.gp) },
  apg: { label: 'APG', value: (s) => avg(s.totals.ast, s.gp) },
  spg: { label: 'SPG', value: (s) => avg(s.totals.stl, s.gp) },
  bpg: { label: 'BPG', value: (s) => avg(s.totals.blk, s.gp) },
  fgPct: { label: 'FG%', value: (s) => pct(s.totals.fgm, s.totals.fga) },
  tpPct: { label: '3PT%', value: (s) => pct(s.totals.tpm, s.totals.tpa) },
  ftPct: { label: 'FT%', value: (s) => pct(s.totals.ftm, s.totals.fta) },
} as const satisfies Record<string, StatDef<BasketballPlayerSeasonStats>>;
export type PlayerSeasonStatKey = keyof typeof PLAYER_SEASON_STATS;

/** The stats a cue can pick from tonight's line. */
export const PLAYER_GAME_STATS = {
  pts: { label: 'PTS', value: (l) => String(l.pts) },
  reb: { label: 'REB', value: (l) => String(l.reb) },
  ast: { label: 'AST', value: (l) => String(l.ast) },
  stl: { label: 'STL', value: (l) => String(l.stl) },
  blk: { label: 'BLK', value: (l) => String(l.blk) },
  fg: { label: 'FG', value: (l) => `${l.fgm}-${l.fga}` },
  threes: { label: '3PT', value: (l) => `${l.tpm}-${l.tpa}` },
  ft: { label: 'FT', value: (l) => `${l.ftm}-${l.fta}` },
} as const satisfies Record<string, StatDef<StatLine>>;
export type PlayerGameStatKey = keyof typeof PLAYER_GAME_STATS;

// Insights: what the run of play says about one team, from `shots` and the game clock.

const OVERTIME_MS = 5 * 60_000;

/** Game time played from the tip to `remainingMs` on the clock in `period`. */
export const playedMs = (program: BasketballProgram, period: number, remainingMs: number): number => {
  const { periods, periodMs } = BASKETBALL_FORMAT[program];
  const length = (at: number) => (at <= periods ? periodMs : OVERTIME_MS);
  let played = 0;
  for (let at = 1; at < period; at++) played += length(at);
  return played + Math.max(0, length(period) - remainingMs);
};

/** `5:11`, `0:45`: a span of game time, in whole seconds. */
export const formatSpan = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** A run counts from 7 points, with the opponent held to a third of them: 7-0, 11-2, 12-4. */
const RUN_MIN_POINTS = 7;
const RUN_MAX_SHARE = 1 / 3;
/** Longer than this, a lead built slowly is not a run. */
const RUN_MAX_MS = 8 * 60_000;
const SCORING_DROUGHT_MS = 2 * 60_000;
const FG_DROUGHT_MS = 3 * 60_000;
/** A field goal drought is worth its own line only when free throws have broken the scoring drought by this much. */
const FG_DROUGHT_LEAD_MS = 30_000;
/** Streaks of 5 or more in a row, else a near-perfect or near-empty window of 6 to 12 attempts. */
const STREAK_IN_A_ROW = 5;
const STREAK_WINDOWS = [12, 11, 10, 9, 8, 7, 6] as const;

export const INSIGHTS = {
  run: 'Run',
  scoringDrought: 'Scoring drought',
  fgDrought: 'Field goal drought',
  fgStreak: 'Field goal streak',
} as const;
export type InsightKind = keyof typeof INSIGHTS;

export interface Insight {
  readonly kind: InsightKind;
  /** Natural case, such as `11-2 run over 2:31`. */
  readonly text: string;
}

const OPPONENT = { away: 'home', home: 'away' } as const;

type Timed = Shot & { readonly at: number };

/**
 * The best run `side` is on: from one of its baskets in `pinned` to now, the widest margin, the shortest span on a tie.
 * The opponent's first basket after `pinned` ends it, and its span stops there.
 */
function runOf(pinned: readonly Timed[], later: readonly Timed[], side: Side, at: number): Insight | null {
  const ender = later.find((shot) => shot.made && shot.side === OPPONENT[side]);
  const made = [...pinned, ...later.slice(0, ender ? later.indexOf(ender) : later.length)].filter((shot) => shot.made);
  const end = ender?.at ?? at;
  let best: { for: number; against: number; from: number } | null = null;
  for (let start = 0; start < made.length; start++) {
    if (!pinned.includes(made[start]!) || made[start]!.side !== side || end - made[start]!.at > RUN_MAX_MS) continue;
    const window = made.slice(start);
    const points = (who: Side) => window.reduce((sum, shot) => (shot.side === who ? sum + shot.value : sum), 0);
    const run = { for: points(side), against: points(OPPONENT[side]), from: made[start]!.at };
    if (run.for < RUN_MIN_POINTS || run.against > run.for * RUN_MAX_SHARE) continue;
    if (!best || run.for - run.against >= best.for - best.against) best = run;
  }
  return best && { kind: 'run', text: `${best.for}-${best.against} run over ${formatSpan(end - best.from)}` };
}

/**
 * `0 of last 8` or `7 of last 8`, the newest attempts first; null when the recent shooting is unremarkable. Of a streak
 * in a row and a window one short of it, the window only over at least two more attempts: `1 of last 8` says more
 * than `0 of last 5`, and `0 of last 8` more than `1 of last 9`.
 */
function streakOf(fieldGoals: readonly Shot[]): string | null {
  const newest = fieldGoals.toReversed();
  const candidates: { made: number; of: number; weight: number }[] = [];
  for (const made of [false, true]) {
    const end = newest.findIndex((shot) => shot.made !== made);
    const streak = end === -1 ? newest.length : end;
    if (streak >= STREAK_IN_A_ROW) candidates.push({ made: made ? streak : 0, of: streak, weight: streak + 1 });
  }
  const size = STREAK_WINDOWS.find((size) => {
    const made = newest.slice(0, size).filter((shot) => shot.made).length;
    return newest.length >= size && (made <= 1 || made >= size - 1);
  });
  if (size) candidates.push({ made: newest.slice(0, size).filter((shot) => shot.made).length, of: size, weight: size });
  const best = candidates.reduce<(typeof candidates)[number] | null>((best, candidate) => (!best || candidate.weight > best.weight ? candidate : best), null);
  return best && `${best.made} of last ${best.of}`;
}

/**
 * What stands out about `side`'s run of play, most telling first: its run, its scoring or field goal drought, its
 * field goal streak. Empty without shots. Spans are game time, so they count up with the game clock and pause at
 * halftime.
 *
 * `asOf` is how many shots there were when a cue was cued; it defaults to all of them. Each insight is read from those
 * shots, and its span runs on to now until a later shot ends it: the team's next basket ends a scoring drought, its
 * next field goal a field goal drought, the opponent's next basket a run. A drought on air therefore stops at its
 * length instead of vanishing, and the streak stays as it was cued.
 */
export function insights(program: BasketballProgram, live: BasketballLive, side: Side, now: EpochMs, asOf = live.shots.length): readonly Insight[] {
  if (live.shots.length === 0) return [];
  const shots: Timed[] = live.shots.map((shot) => ({ ...shot, at: playedMs(program, shot.period, shot.remainingMs) }));
  // A clock the operator has not caught up yet must not put now before the last play.
  const at = Math.max(playedMs(program, live.period, remainingAt(live.clock, now)), ...shots.map((shot) => shot.at));
  const pinned = shots.slice(0, asOf);
  const later = shots.slice(asOf);
  const own = pinned.filter((shot) => shot.side === side);
  const fieldGoals = own.filter((shot) => shot.value > 1);
  /** From the last pinned shot that `scores` to the first later one, or to now. */
  const span = (scores: (shot: Timed) => boolean) =>
    (later.find((shot) => shot.side === side && scores(shot))?.at ?? at) - (own.findLast(scores)?.at ?? 0);
  const scoringDrought = span((shot) => shot.made);
  const fgDrought = span((shot) => shot.made && shot.value > 1);
  const streak = streakOf(fieldGoals);
  const found: (Insight | null)[] = [
    scoringDrought < SCORING_DROUGHT_MS ? runOf(pinned, later, side, at) : null,
    scoringDrought >= SCORING_DROUGHT_MS ? { kind: 'scoringDrought', text: `Scoring drought ${formatSpan(scoringDrought)}` } : null,
    fgDrought >= FG_DROUGHT_MS && fgDrought - scoringDrought >= FG_DROUGHT_LEAD_MS ? { kind: 'fgDrought', text: `No FGs last ${formatSpan(fgDrought)}` } : null,
    streak ? { kind: 'fgStreak', text: `FGs: ${streak}` } : null,
  ];
  return found.filter((insight) => insight !== null);
}
