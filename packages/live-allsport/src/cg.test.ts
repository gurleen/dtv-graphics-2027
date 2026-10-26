import { expect, test } from 'bun:test';
import { cgText, createCgBoard, createCgFramer, encodeCgMessage, parseCgMessage } from './cg';
import { commandsFor, NOTHING_SENT } from './commands';
import { createDecoder } from './decoder';

const bytes = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

/** Captured from a console: running at 12:34, then stopped at 12:21 with the score 1-2 in period 2. */
const RUNNING = '12:34   30    0  0 0 01341341     ';
const STOPPED = '12:21  s30    1  2 0 11341342     ';

test('a captured message checks out, and a changed byte is a bad checksum', () => {
  expect(parseCgMessage(bytes(`${RUNNING}88`))).toEqual({ kind: 'message', text: RUNNING });
  expect(parseCgMessage(bytes(`${STOPPED}DC`))).toEqual({ kind: 'message', text: STOPPED });
  expect(parseCgMessage(bytes(`${RUNNING.replace('30', '29')}88`))).toEqual({ kind: 'rejected', reason: 'checksum' });
  expect(parseCgMessage(bytes('12:34 88'))).toEqual({ kind: 'rejected', reason: 'unsupported' });
});

test('the framer finds messages across chunks and skips bytes outside them', () => {
  const framer = createCgFramer();
  const stream = Uint8Array.from([0x00, 0x7e, ...encodeCgMessage(RUNNING), ...encodeCgMessage(STOPPED)]);
  const first = framer.push(stream.subarray(0, 20));
  const rest = framer.push(stream.subarray(20));
  expect([...first, ...rest]).toEqual([
    { kind: 'message', text: RUNNING },
    { kind: 'message', text: STOPPED },
  ]);
});

test('the board reads the clock, its stop mark, the shot clock, the score and the period', () => {
  const board = createCgBoard();
  board.apply(STOPPED, 0);
  expect(board.read()).toMatchObject({
    clock: { remainingMs: 741_000, running: false, precisionMs: 1000 },
    shotClock: { remainingMs: 30_000, precisionMs: 1000 },
    shotClockRunning: false,
    period: 2,
    score: { home: 1, away: 2 },
    timeouts: { home: undefined, away: undefined },
    possession: undefined,
  });
  board.apply(RUNNING, 1000);
  expect(board.read().clock).toEqual({ remainingMs: 754_000, running: true, precisionMs: 1000 });
});

test('tenths under a minute, and a blank shot clock is blanked', () => {
  const board = createCgBoard();
  board.apply(cgText({ clock: '45.3', shotClock: '', period: '2' }), 0);
  expect(board.read()).toMatchObject({ clock: { remainingMs: 45_300, running: true, precisionMs: 100 }, shotClock: null });
});

test('the shot clock runs only while it ticks down with the game clock, through one repeated value', () => {
  const board = createCgBoard();
  const at = (shot: string, now: number, stopped = '') => {
    board.apply(cgText({ clock: '10:00', clockStopped: stopped, shotClock: shot }), now);
    return board.read().shotClockRunning;
  };
  expect(at('30', 0)).toBe(false);
  expect(at('30', 1000)).toBe(false);
  expect(at('29', 2000)).toBe(true);
  expect(at('29', 3000)).toBe(true);
  expect(at('27', 4000)).toBe(true);
  expect(at('27', 5000)).toBe(true);
  expect(at('27', 6000)).toBe(false);
  expect(at('26', 7000, 's')).toBe(false);
});

test('a static shot clock is written once, stopped, while the game clock runs', () => {
  const decoder = createDecoder('cg');
  let sent = NOTHING_SENT;
  const written = [];
  for (let second = 0; second < 5; second++) {
    decoder.push(encodeCgMessage(cgText({ clock: `10:${String(59 - second).padStart(2, '0')}`, shotClock: '30', scoreHome: '4', period: '1' })), second * 1000);
    const next = commandsFor(decoder.read(), sent, second * 1000, ['clock', 'score']);
    written.push(...next.commands.filter((command) => command.type === 'shotClock'));
    sent = next.sent;
  }
  expect(written).toEqual([{ type: 'shotClock', remainingMs: 30_000, running: false }]);
});
