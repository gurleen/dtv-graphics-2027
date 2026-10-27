import { describe, expect, test } from 'bun:test';
import { GameId, PlayerId, SourceId } from '../ids';
import { basketball, GameLive, SPORT_MODULES } from './index';

const {
  applyBasketball, formatGameClock, formatShotClock, initialBasketball, nextDisplayChange, OPERATOR, periodLabel,
  PLAYER_GAME_STATS, PLAYER_SEASON_STATS, positionName, statusLine, StatLine,
} = basketball;
type BasketballLive = basketball.BasketballLive;
type BasketballCommand = basketball.BasketballCommand;
type Clock = basketball.Clock;

const NOW = 1_700_000_000_000;
const GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const STATCREW = SourceId.parse('statcrew');
const REED = PlayerId.parse('drexel-mbb@2026-27/reed-josh');
const five = (team: string) => ['a', 'b', 'c', 'd', 'e'].map((name) => PlayerId.parse(`${team}@2026-27/${name}`));

const stopped = (remainingMs: number): Clock => ({ running: false, remainingMs });
const running = (remainingMs: number, since = NOW): Clock => ({ running: true, remainingMs, since });

/** A live game in the second half: clock stopped at 13:59, shot clock at 24, Reed with a line. */
const BASE: BasketballLive = {
  ...initialBasketball(GAME, 'mbb'),
  phase: 'live',
  period: 2,
  clock: stopped(839_000),
  shotClock: stopped(24_000),
  score: { away: 68, home: 72 },
  team: { away: StatLine.parse({}), home: StatLine.parse({ pts: 72, fgm: 20 }) },
  players: { [REED]: StatLine.parse({ pts: 18, reb: 7 }) },
};

const apply = (live: BasketballLive, command: BasketballCommand, source = OPERATOR, now = NOW) =>
  applyBasketball(live, command, { source, now });

const applied = (live: BasketballLive, command: BasketballCommand, now = NOW) => {
  const result = apply(live, command, OPERATOR, now);
  if (!result.ok) throw new Error(`refused: ${result.group}`);
  return result.live;
};

describe('applyBasketball: each command is an absolute write', () => {
  const cases: readonly [string, BasketballLive, BasketballCommand, Partial<BasketballLive>][] = [
    ['score sets a side', BASE, { type: 'score', side: 'home', value: 74 }, { score: { away: 68, home: 74 } }],
    ['clock start anchors both clocks at now', BASE, { type: 'clock', action: 'start' }, { clock: running(839_000), shotClock: running(24_000) }],
    [
      'clock start leaves a running clock alone',
      { ...BASE, clock: running(839_000, NOW - 2_000), shotClock: running(24_000, NOW - 2_000) },
      { type: 'clock', action: 'start' },
      {},
    ],
    [
      'clock stop freezes the time left at now',
      { ...BASE, clock: running(839_000, NOW - 1_500), shotClock: running(24_000, NOW - 1_500) },
      { type: 'clock', action: 'stop' },
      { clock: stopped(837_500), shotClock: stopped(22_500) },
    ],
    ['clock stop leaves a stopped clock alone', BASE, { type: 'clock', action: 'stop' }, {}],
    ['clock stop with no shot clock keeps it blank', { ...BASE, shotClock: null }, { type: 'clock', action: 'stop' }, {}],
    ['clockSet re-anchors a running clock at now', { ...BASE, clock: running(839_000, NOW - 5_000) }, { type: 'clockSet', remainingMs: 522_000 }, { clock: running(522_000) }],
    ['clockSet keeps a stopped clock stopped', BASE, { type: 'clockSet', remainingMs: 522_000 }, { clock: stopped(522_000) }],
    ['clockSet can start the clock, and the shot clock with it', BASE, { type: 'clockSet', remainingMs: 522_000, running: true }, { clock: running(522_000), shotClock: running(24_000) }],
    [
      'clockSet can stop the clock, and the shot clock with it',
      { ...BASE, clock: running(839_000, NOW - 1_500), shotClock: running(24_000, NOW - 1_500) },
      { type: 'clockSet', remainingMs: 500_000, running: false },
      { clock: stopped(500_000), shotClock: stopped(22_500) },
    ],
    ['shotClock follows a running game clock', { ...BASE, clock: running(839_000, NOW - 5_000) }, { type: 'shotClock', remainingMs: 30_000 }, { shotClock: running(30_000) }],
    ['shotClock follows a stopped game clock', BASE, { type: 'shotClock', remainingMs: 30_000 }, { shotClock: stopped(30_000) }],
    ['shotClock null blanks it', BASE, { type: 'shotClock', remainingMs: null }, { shotClock: null }],
    ['period', BASE, { type: 'period', period: 3 }, { period: 3 }],
    ['phase', BASE, { type: 'phase', phase: 'halftime' }, { phase: 'halftime' }],
    ['timeouts', BASE, { type: 'timeouts', side: 'away', remaining: 3 }, { timeouts: { away: 3, home: 4 } }],
    ['bonus', BASE, { type: 'bonus', side: 'home', value: true }, { bonus: { away: false, home: true } }],
    ['possession', BASE, { type: 'possession', side: 'home' }, { possession: 'home' }],
    ['possession can be cleared', { ...BASE, possession: 'away' }, { type: 'possession', side: null }, { possession: null }],
    ['starters', BASE, { type: 'starters', side: 'away', players: five('saint-josephs-mbb') }, { starters: { away: five('saint-josephs-mbb'), home: [] } }],
    [
      'teamLine writes only the counts it names',
      BASE,
      { type: 'teamLine', side: 'home', line: { fgm: 21, fga: 40 } },
      { team: { away: StatLine.parse({}), home: StatLine.parse({ pts: 72, fgm: 21, fga: 40 }) } },
    ],
    ['playerLine writes over an existing line', BASE, { type: 'playerLine', player: REED, line: { ast: 4 } }, { players: { [REED]: StatLine.parse({ pts: 18, reb: 7, ast: 4 }) } }],
    [
      'playerLine starts a new line at zero',
      BASE,
      { type: 'playerLine', player: five('drexel-mbb')[1]!, line: { pts: 2 } },
      { players: { [REED]: StatLine.parse({ pts: 18, reb: 7 }), [five('drexel-mbb')[1]!]: StatLine.parse({ pts: 2 }) } },
    ],
    ['authority hands a group to a feed', BASE, { type: 'authority', group: 'score', source: STATCREW }, { authority: { clock: OPERATOR, score: STATCREW, stats: OPERATOR } }],
  ];

  test.each(cases)('%s', (_name, before, command, changes) => {
    expect(applied(before, command)).toEqual({ ...before, ...changes });
  });

  test('applying the same command twice changes nothing more', () => {
    const commands: BasketballCommand[] = [
      { type: 'score', side: 'home', value: 74 },
      { type: 'clock', action: 'start' },
      { type: 'teamLine', side: 'home', line: { fgm: 21 } },
      { type: 'playerLine', player: REED, line: { ast: 4 } },
    ];
    for (const command of commands) {
      const once = applied(BASE, command);
      expect(applied(once, command)).toEqual(once);
    }
  });

  test('every command result is a valid live state', () => {
    for (const [, before, command] of cases) expect(GameLive.parse(applied(before, command))).toEqual(applied(before, command));
  });
});

describe('applyBasketball: authority', () => {
  const fed = applied(BASE, { type: 'authority', group: 'score', source: STATCREW });

  test('a feed may not write a group it does not hold', () => {
    expect(apply(BASE, { type: 'score', side: 'home', value: 74 }, STATCREW)).toEqual({ ok: false, reason: 'not-authority', group: 'score' });
  });

  test('a feed writes the group handed to it, and the operator then may not', () => {
    const result = apply(fed, { type: 'score', side: 'home', value: 74 }, STATCREW);
    expect(result.ok && result.live.score.home).toBe(74);
    expect(apply(fed, { type: 'bonus', side: 'home', value: true }, OPERATOR)).toEqual({ ok: false, reason: 'not-authority', group: 'score' });
  });

  test('the feed still may not write the groups it was not given', () => {
    expect(apply(fed, { type: 'clock', action: 'start' }, STATCREW)).toEqual({ ok: false, reason: 'not-authority', group: 'clock' });
  });

  test('only the operator hands a group over or takes it back', () => {
    expect(apply(fed, { type: 'authority', group: 'stats', source: STATCREW }, STATCREW)).toEqual({ ok: false, reason: 'not-authority', group: 'operator' });
    expect(applied(fed, { type: 'authority', group: 'score', source: OPERATOR }).authority.score).toBe(OPERATOR);
  });
});

describe('nextDisplayChange', () => {
  const cases: readonly [string, Clock, basketball.ClockDisplay, number | null][] = [
    ['a stopped clock never changes', stopped(839_000), 'game', null],
    ['an expired clock never changes', running(0), 'game', null],
    ['above a minute, on a whole second', running(839_000), 'game', NOW + 1],
    ['above a minute, mid-second', running(839_500), 'game', NOW + 501],
    ['above a minute, run down since an earlier anchor', running(840_000, NOW - 400), 'game', NOW + 601],
    ['at exactly a minute, the next instant switches to tenths', running(60_000), 'game', NOW + 1],
    ['just above a minute, at the switch to tenths', running(60_500), 'game', NOW + 501],
    ['below a minute, by tenths', running(59_999), 'game', NOW + 100],
    ['below a minute, mid-tenth', running(4_350), 'game', NOW + 51],
    ['under a tenth, at zero', running(99), 'game', NOW + 99],
    ['the shot clock on a whole second', running(24_000), 'shot', NOW + 1_000],
    ['the shot clock mid-second', running(23_500), 'shot', NOW + 500],
    ['the shot clock at its last millisecond', running(1), 'shot', NOW + 1],
    ['a stopped shot clock never changes', stopped(24_000), 'shot', null],
  ];

  const text = (clock: Clock, display: basketball.ClockDisplay, at: number) => {
    const remaining = basketball.remainingAt(clock, at);
    if (display === 'shot') return formatShotClock(remaining);
    return `${formatGameClock(remaining)} ${remaining === 0 ? 'end' : ''}`;
  };

  test.each(cases)('%s', (_name, clock, display, expected) => {
    expect(nextDisplayChange(clock, NOW, display)).toBe(expected);
  });

  test.each(cases.filter(([, , , expected]) => expected !== null))('%s: the text holds until then and changes at it', (_name, clock, display, expected) => {
    expect(text(clock, display, expected! - 1)).toBe(text(clock, display, NOW));
    expect(text(clock, display, expected!)).not.toBe(text(clock, display, NOW));
  });

  test('the sport module wakes for whichever clock changes first', () => {
    const live = { ...BASE, clock: running(839_500), shotClock: running(23_200) };
    expect(SPORT_MODULES.basketball.nextChange(live, NOW)).toBe(NOW + 200);
    expect(SPORT_MODULES.basketball.nextChange({ ...live, shotClock: null }, NOW)).toBe(NOW + 501);
    expect(SPORT_MODULES.basketball.nextChange(BASE, NOW)).toBeNull();
  });
});

describe('broadcast formatting', () => {
  test.each([
    [839_000, '13:59'],
    [60_000, '1:00'],
    [59_999, '59.9'],
    [4_300, '04.3'],
    [0, '00.0'],
  ])('game clock %p reads %p', (remaining, shown) => {
    expect(formatGameClock(remaining)).toBe(shown);
  });

  test.each([
    [24_000, '24'],
    [23_001, '24'],
    [23_000, '23'],
    [1, '1'],
    [0, '0'],
  ])('shot clock %p reads %p', (remaining, shown) => {
    expect(formatShotClock(remaining)).toBe(shown);
  });

  test('period labels per program', () => {
    expect([1, 2, 3, 4].map((period) => periodLabel('mbb', period))).toEqual(['1st Half', '2nd Half', 'OT', '2OT']);
    expect([1, 2, 3, 4, 5].map((period) => periodLabel('wbb', period))).toEqual(['1st Qtr', '2nd Qtr', '3rd Qtr', '4th Qtr', 'OT']);
  });

  test('the status line', () => {
    expect(statusLine('mbb', { ...BASE, clock: stopped(522_000) }, NOW)).toBe('8:42 2nd Half');
    expect(statusLine('mbb', { ...BASE, period: 1, clock: running(1_000, NOW - 1_000) }, NOW)).toBe('End of 1st Half');
    expect(statusLine('mbb', { ...BASE, phase: 'halftime' }, NOW)).toBe('Halftime');
    expect(statusLine('wbb', { ...BASE, phase: 'final' }, NOW)).toBe('Final');
  });

  test('positions and stat catalogues', () => {
    expect(positionName('G/F')).toBe('Guard/Forward');
    expect(positionName('C')).toBe('Center');
    const season = { sport: 'basketball' as const, gp: 20, totals: StatLine.parse({ pts: 368, reb: 144, ast: 62, fgm: 132, fga: 274 }) };
    expect(PLAYER_SEASON_STATS.ppg.value(season)).toBe('18.4');
    expect(PLAYER_SEASON_STATS.fgPct.value(season)).toBe('48.2%');
    expect(PLAYER_SEASON_STATS.tpPct.value(season)).toBe('-');
    expect(PLAYER_GAME_STATS.threes.value(StatLine.parse({ tpm: 3, tpa: 5 }))).toBe('3-5');
  });
});

describe('the shot clock stops when the game clock expires', () => {
  const lastSeconds: BasketballLive = { ...BASE, clock: running(5_000), shotClock: running(24_000) };

  test('it reads what it read at the buzzer, not what it would read now', () => {
    expect(basketball.shotClockAt(lastSeconds, NOW + 3_000)).toBe(21_000);
    expect(basketball.shotClockAt(lastSeconds, NOW + 8_000)).toBe(19_000);
  });

  test('it shows nothing at halftime or after the final', () => {
    expect(basketball.shotClockAt({ ...lastSeconds, phase: 'halftime' }, NOW)).toBeNull();
    expect(basketball.shotClockAt({ ...lastSeconds, phase: 'final' }, NOW)).toBeNull();
  });

  test('the server stops re-projecting it at the buzzer', () => {
    expect(basketball.nextShotClockChange(lastSeconds, NOW + 4_500)).toBe(NOW + 5_000);
    expect(basketball.nextShotClockChange(lastSeconds, NOW + 5_000)).toBeNull();
    expect(SPORT_MODULES.basketball.nextChange(lastSeconds, NOW + 6_000)).toBeNull();
  });

  test('stopping the clocks after the buzzer keeps the shot clock at its buzzer value', () => {
    expect(applied(lastSeconds, { type: 'clock', action: 'stop' }, NOW + 8_000)).toMatchObject({ clock: stopped(0), shotClock: stopped(19_000) });
  });
});
