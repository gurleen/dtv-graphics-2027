import { describe, expect, test } from 'bun:test';
import { type FieldName, parseTime, readBasketball } from './basketball';
import { createFramer, createRtdBuffer } from './rtd';
import { packetsFor } from './simulator';

/** The scoreboard after a console sends these fields. */
function show(...screens: Partial<Record<FieldName, string>>[]) {
  const framer = createFramer();
  const buffer = createRtdBuffer();
  for (const screen of screens)
    for (const packet of packetsFor(screen)) for (const frame of framer.push(packet)) if (frame.kind === 'packet') buffer.apply(frame);
  return readBasketball(buffer);
}

describe('parseTime', () => {
  test('reads every clock form the console shows, with spaces around', () => {
    expect(parseTime('16:09')).toEqual({ remainingMs: 969_000, precisionMs: 1000 });
    expect(parseTime(' 6:09 ')).toEqual({ remainingMs: 369_000, precisionMs: 1000 });
    expect(parseTime(' 8.3')).toEqual({ remainingMs: 8300, precisionMs: 100 });
    expect(parseTime('42.0')).toEqual({ remainingMs: 42_000, precisionMs: 100 });
    expect(parseTime('1:02.5')).toEqual({ remainingMs: 62_500, precisionMs: 100 });
    expect(parseTime('24')).toEqual({ remainingMs: 24_000, precisionMs: 1000 });
  });

  test('anything else is not a time', () => {
    for (const text of ['', '   ', 'abc', '1:2', ':30']) expect(parseTime(text)).toBeNull();
  });
});

describe('readBasketball', () => {
  test('a console that has sent nothing shows nothing', () => {
    expect(show()).toEqual({
      clock: undefined,
      shotClock: undefined,
      period: undefined,
      score: { away: undefined, home: undefined },
      timeouts: { away: undefined, home: undefined },
      bonus: { away: undefined, home: undefined },
      possession: undefined,
    });
  });

  test('reads the clock, preferring the tenths field, and whether it runs', () => {
    expect(show({ clockMain: '16:09', clockTenths: '16:09' }).clock).toEqual({ remainingMs: 969_000, running: true, precisionMs: 1000 });
    expect(show({ clockMain: ' 8.3', clockTenths: ' 8.3', clockStopped: 's' }).clock).toEqual({ remainingMs: 8300, running: false, precisionMs: 100 });
    expect(show({ clockMain: '16:09', clockTenths: '16:09.4' }).clock).toMatchObject({ remainingMs: 969_400, precisionMs: 100 });
    expect(show({ clockMain: '16:09', clockTenths: '        ' }).clock).toMatchObject({ remainingMs: 969_000 });
    expect(show({ clockMain: ' 0.0', clockZero: 'z' }).clock).toMatchObject({ remainingMs: 0, running: false });
  });

  test('a stopped marker the console later blanks is a running clock', () => {
    const board = show({ clockMain: '10:00', clockStopped: 's' }, { clockStopped: ' ' });
    expect(board.clock).toMatchObject({ running: true });
  });

  test('reads score, timeouts and period for guest as away and home as home', () => {
    const board = show({ scoreHome: '  72', scoreAway: '  65', timeoutsHome: ' 3', timeoutsAway: ' 4', period: ' 2' });
    expect(board).toMatchObject({ score: { home: 72, away: 65 }, timeouts: { home: 3, away: 4 }, period: 2 });
  });

  test('a blank shot clock is null, which differs from one that was never sent', () => {
    expect(show({ shotClock: '      ' }).shotClock).toBeNull();
    expect(show({ shotClock: ' 24' }).shotClock).toEqual({ remainingMs: 24_000, precisionMs: 1000 });
    expect(show({ shotClock: ' 4.8' }).shotClock).toEqual({ remainingMs: 4800, precisionMs: 100 });
    expect(show({ clockMain: '1:00' }).shotClock).toBeUndefined();
  });

  test('possession and bonus follow the marks, and clear when the console blanks them', () => {
    expect(show({ possessionHomeArrow: '<' }).possession).toBe('home');
    expect(show({ possessionAwayIndicator: '>' }).possession).toBe('away');
    expect(show({ possessionHomeArrow: '<' }, { possessionHomeArrow: ' ' }).possession).toBeNull();
    expect(show({ bonusHomeDouble: '<', bonusAwayOneAndOne: ' ' }).bonus).toEqual({ home: true, away: false });
    expect(show({ bonusAwayOneAndOne: '>' }).bonus).toEqual({ home: undefined, away: true });
  });
});
