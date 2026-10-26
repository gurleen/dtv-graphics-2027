import { describe, expect, test } from 'bun:test';
import type { Scoreboard } from './basketball';
import { type AllsportGroup, commandsFor, NOTHING_SENT, type Sent } from './commands';

const BOTH: readonly AllsportGroup[] = ['clock', 'score'];
const BLANK: Scoreboard = {
  clock: undefined,
  shotClock: undefined,
  period: undefined,
  score: { away: undefined, home: undefined },
  timeouts: { away: undefined, home: undefined },
  bonus: { away: undefined, home: undefined },
  possession: undefined,
};
const clock = (remainingMs: number, running: boolean, precisionMs = 1000) => ({ ...BLANK, clock: { remainingMs, running, precisionMs } });

/** Feeds boards to `commandsFor` one after another, carrying `sent` forward. */
function session(groups: readonly AllsportGroup[] = BOTH) {
  let sent: Sent = NOTHING_SENT;
  return (board: Scoreboard, now: number) => {
    const result = commandsFor(board, sent, now, groups);
    sent = result.sent;
    return result.commands;
  };
}

describe('the clock', () => {
  test('starting it sets the phase live and writes the clock once; the server then runs it', () => {
    const next = session();
    expect(next(clock(600_000, true), 0)).toEqual([
      { type: 'phase', phase: 'live' },
      { type: 'clockSet', remainingMs: 600_000, running: true },
    ]);
    expect(next(clock(599_000, true), 1000)).toEqual([]);
    expect(next(clock(598_000, true), 2000)).toEqual([]);
  });

  test('stopping writes the exact value, and a stopped clock rewrites on any change', () => {
    const next = session();
    next(clock(600_000, true), 0);
    expect(next(clock(584_000, false), 16_000)).toEqual([{ type: 'clockSet', remainingMs: 584_000, running: false }]);
    expect(next(clock(584_000, false), 17_000)).toEqual([]);
    expect(next(clock(580_000, false), 18_000)).toEqual([{ type: 'clockSet', remainingMs: 580_000, running: false }]);
  });

  test('a running clock that jumps past the display precision is rewritten, one within it is not', () => {
    const next = session();
    next(clock(600_000, true), 0);
    expect(next(clock(595_400, true), 5000)).toEqual([]);
    expect(next(clock(500_000, true), 6000)).toEqual([{ type: 'clockSet', remainingMs: 500_000, running: true }]);
    expect(next(clock(60_000, true, 100), 7000).length).toBe(1);
    expect(next(clock(59_000, true, 100), 8000)).toEqual([]);
    expect(next(clock(58_000, true, 100), 8200)).toEqual([{ type: 'clockSet', remainingMs: 58_000, running: true }]);
  });

  test('a restart writes the phase again, and a clock that has only been stopped does not', () => {
    const next = session();
    next(clock(600_000, false), 0);
    expect(next(clock(600_000, true), 1000).map((command) => command.type)).toEqual(['phase', 'clockSet']);
    next(clock(590_000, false), 11_000);
    expect(next(clock(590_000, true), 12_000).map((command) => command.type)).toEqual(['phase', 'clockSet']);
  });

  test('the period is written once per change', () => {
    const next = session();
    expect(next({ ...BLANK, period: 1 }, 0)).toEqual([{ type: 'period', period: 1 }]);
    expect(next({ ...BLANK, period: 1 }, 1)).toEqual([]);
    expect(next({ ...BLANK, period: 2 }, 2)).toEqual([{ type: 'period', period: 2 }]);
  });
});

describe('the shot clock', () => {
  const shot = (remainingMs: number, running: boolean, gameMs = 600_000): Scoreboard => ({ ...clock(gameMs, running), shotClock: { remainingMs, precisionMs: 1000 } });

  test('nothing is written for a shot clock the console never sent', () => {
    expect(session()(clock(600_000, false), 0).map((command) => command.type)).toEqual(['clockSet']);
  });

  test('follows the game clock, and a reset while running is a jump', () => {
    const next = session();
    expect(next(shot(24_000, false), 0)).toEqual([
      { type: 'clockSet', remainingMs: 600_000, running: false },
      { type: 'shotClock', remainingMs: 24_000, running: false },
    ]);
    expect(next(shot(24_000, true), 1000)).toEqual([
      { type: 'phase', phase: 'live' },
      { type: 'clockSet', remainingMs: 600_000, running: true },
      { type: 'shotClock', remainingMs: 24_000, running: true },
    ]);
    expect(next(shot(22_000, true, 598_000), 3000)).toEqual([]);
    expect(next(shot(24_000, true, 596_000), 5000)).toEqual([{ type: 'shotClock', remainingMs: 24_000, running: true }]);
  });

  test('a blanked shot clock is written once as null', () => {
    const next = session();
    expect(next({ ...BLANK, shotClock: null }, 0)).toEqual([{ type: 'shotClock', remainingMs: null }]);
    expect(next({ ...BLANK, shotClock: null }, 1)).toEqual([]);
  });
});

describe('score, timeouts, bonus and possession', () => {
  const board: Scoreboard = {
    ...BLANK,
    score: { away: 10, home: 12 },
    timeouts: { away: undefined, home: 3 },
    bonus: { away: false, home: true },
    possession: null,
  };

  test('are written absolutely, only what the console has shown, and only when they change', () => {
    const next = session();
    const first = next(board, 0);
    expect(first).toHaveLength(6);
    expect(first).toEqual(
      expect.arrayContaining([
        { type: 'score', side: 'away', value: 10 },
        { type: 'score', side: 'home', value: 12 },
        { type: 'timeouts', side: 'home', remaining: 3 },
        { type: 'bonus', side: 'away', value: false },
        { type: 'bonus', side: 'home', value: true },
        { type: 'possession', side: null },
      ]),
    );
    expect(next(board, 1)).toEqual([]);
    expect(next({ ...board, score: { away: 10, home: 14 } }, 2)).toEqual([{ type: 'score', side: 'home', value: 14 }]);
  });

  test('are left alone when the score group is off', () => {
    const next = session(['clock']);
    expect(next({ ...board, period: 1 }, 0)).toEqual([{ type: 'period', period: 1 }]);
  });
});
