/** Turns what the console shows into the `game.apply` commands that write it. Pure. */

import { type basketball, SIDES } from '@dtv/domain';
import type { Scoreboard } from './basketball';

/** The field groups the feed can hold: `clock` is the clocks, period and phase; `score` is score, timeouts, bonus and possession. */
export type AllsportGroup = 'clock' | 'score';

/** A clock as last written to the server. The server projects it forward, so it is the console's value plus when it was sent. */
export interface Timer {
  readonly remainingMs: number;
  readonly running: boolean;
  /** Epoch ms of the send. */
  readonly at: number;
}

export interface Sent {
  readonly clock: Timer | undefined;
  /** Null once a blank shot clock was sent. */
  readonly shotClock: Timer | null | undefined;
  /** The last command of each absolute kind, as JSON, keyed by type and side. */
  readonly values: Readonly<Record<string, string>>;
}

export const NOTHING_SENT: Sent = { clock: undefined, shotClock: undefined, values: {} };

export interface Commands {
  readonly commands: basketball.BasketballCommand[];
  /** `sent` once these commands are written; keep the old one if the write fails. */
  readonly sent: Sent;
}

/** Slack on top of the display's own precision, for the delay between the console's reading and ours. */
const TOLERANCE_MS = 50;

const projected = (timer: Timer, now: number) => (timer.running ? Math.max(0, timer.remainingMs - (now - timer.at)) : timer.remainingMs);

/**
 * Whether the server's projection of `sent` no longer matches the console. The server's clock runs by itself,
 * so a running clock needs a write only when it drifts past what the display can show; a stopped one, on any change.
 */
function needsWrite(sent: Timer | null | undefined, time: { remainingMs: number; precisionMs: number }, running: boolean, now: number): boolean {
  if (!sent || sent.running !== running) return true;
  if (!running) return sent.remainingMs !== time.remainingMs;
  return Math.abs(projected(sent, now) - time.remainingMs) > time.precisionMs + TOLERANCE_MS;
}

/**
 * Everything is absolute, so a command that repeats the last one is left out. The clocks are not rewritten every
 * tick: one write at each start, stop or jump. Starting the clock also sets the phase to `live`.
 */
export function commandsFor(board: Scoreboard, sent: Sent, now: number, groups: readonly AllsportGroup[]): Commands {
  const commands: basketball.BasketballCommand[] = [];
  const values = { ...sent.values };
  let { clock, shotClock } = sent;

  const absolute = (key: string, command: basketball.BasketballCommand) => {
    const body = JSON.stringify(command);
    if (values[key] === body) return;
    values[key] = body;
    commands.push(command);
  };

  if (groups.includes('clock')) {
    const shotRunning = board.shotClockRunning ?? board.clock?.running ?? clock?.running ?? false;
    if (board.clock && needsWrite(clock, board.clock, board.clock.running, now)) {
      if (board.clock.running && !clock?.running) commands.push({ type: 'phase', phase: 'live' });
      commands.push({ type: 'clockSet', remainingMs: board.clock.remainingMs, running: board.clock.running });
      clock = { remainingMs: board.clock.remainingMs, running: board.clock.running, at: now };
    }
    if (board.shotClock === null && shotClock !== null) {
      commands.push({ type: 'shotClock', remainingMs: null });
      shotClock = null;
    } else if (board.shotClock && needsWrite(shotClock, board.shotClock, shotRunning, now)) {
      commands.push({ type: 'shotClock', remainingMs: board.shotClock.remainingMs, running: shotRunning });
      shotClock = { remainingMs: board.shotClock.remainingMs, running: shotRunning, at: now };
    }
    if (board.period !== undefined) absolute('period', { type: 'period', period: board.period });
  }

  if (groups.includes('score')) {
    for (const side of SIDES) {
      const { score, timeouts, bonus } = { score: board.score[side], timeouts: board.timeouts[side], bonus: board.bonus[side] };
      if (score !== undefined) absolute(`score:${side}`, { type: 'score', side, value: score });
      if (timeouts !== undefined) absolute(`timeouts:${side}`, { type: 'timeouts', side, remaining: timeouts });
      if (bonus !== undefined) absolute(`bonus:${side}`, { type: 'bonus', side, value: bonus });
    }
    if (board.possession !== undefined) absolute('possession', { type: 'possession', side: board.possession });
  }

  return { commands, sent: { clock, shotClock, values } };
}
