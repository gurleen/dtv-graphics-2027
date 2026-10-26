/**
 * The AllSport 5000's other serial output, the one a console wired for a CG sends at 9600 baud: the whole board once a
 * second as `SOH <text> <2 hex checksum> EOT`. Pure; no IO.
 *
 * There is no header and no index: every message is the same fixed layout, so the latest one is the board. The
 * checksum is the sum of the text's bytes, modulo 256, as two uppercase hex digits. The layout follows
 * github.com/gurleen/LiveStatsManager (`AllSportData.cs`) and a capture of a basketball console; it has no
 * timeouts, bonus or possession.
 */

import { parseTime, type Scoreboard } from './basketball';
import type { Rejected } from './rtd';

const SOH = 0x01;
const EOT = 0x04;

/** `[start, length]`, zero-based into the text. Home is `home`, Guest is `away`. */
export const CG_FIELDS = {
  clock: [0, 7],
  /** `s` while the game clock is stopped. */
  clockStopped: [7, 1],
  shotClock: [8, 2],
  scoreHome: [12, 3],
  scoreAway: [15, 3],
  period: [28, 1],
} as const satisfies Record<string, readonly [number, number]>;

export type CgFieldName = keyof typeof CG_FIELDS;

/** The text of a real message is 34 characters; anything shorter cannot hold the period. */
const MIN_TEXT = 29;
const MAX_FRAME = 256;
/** How long the shot clock may show one value and still be running: the console repeats a value now and then. */
const SHOT_CLOCK_HOLD_MS = 1_500;

export interface Message {
  readonly kind: 'message';
  readonly text: string;
}

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');
export const cgChecksum = (text: string) => hex([...text].reduce((sum, character) => (sum + character.charCodeAt(0)) & 0xff, 0));

/** Parses the bytes between SOH and EOT: the text and its checksum. */
export function parseCgMessage(frame: Uint8Array): Message | Rejected {
  const body = String.fromCharCode(...frame);
  const text = body.slice(0, -2);
  if (text.length < MIN_TEXT || !/^[0-9A-F]{2}$/.test(body.slice(-2))) return { kind: 'rejected', reason: 'unsupported' };
  if (cgChecksum(text) !== body.slice(-2)) return { kind: 'rejected', reason: 'checksum' };
  return { kind: 'message', text };
}

/** Cuts a byte stream into messages. Bytes after SOH are held until EOT, across chunks; a SOH inside one starts over. */
export function createCgFramer(): { push(chunk: Uint8Array): (Message | Rejected)[] } {
  let held: number[] | null = null;
  return {
    push(chunk) {
      const frames: (Message | Rejected)[] = [];
      for (const byte of chunk) {
        if (byte === SOH) held = [];
        else if (held === null) continue;
        else if (byte === EOT) {
          frames.push(parseCgMessage(Uint8Array.from(held)));
          held = null;
        } else if (held.push(byte) > MAX_FRAME) held = null;
      }
      return frames;
    },
  };
}

/** One framed message, its text padded to 34 characters, for tests and a pretend console. */
export function encodeCgMessage(text: string): Uint8Array {
  const padded = text.padEnd(34, ' ');
  return Uint8Array.from(`\u0001${padded}${cgChecksum(padded)}\u0004`, (character) => character.charCodeAt(0));
}

/** A message's text with `values` written into their fields, each padded on the left to the field's length. */
export function cgText(values: Partial<Record<CgFieldName, string>>, base = ' '.repeat(34)): string {
  let text = base.padEnd(34, ' ');
  for (const [name, value] of Object.entries(values)) {
    const [start, length] = CG_FIELDS[name as CgFieldName];
    text = text.slice(0, start) + value.padStart(length, ' ').slice(-length) + text.slice(start + length);
  }
  return text;
}

/**
 * The board from the latest message. The console marks a stopped game clock but not a stopped shot clock, so the
 * shot clock counts as running while the game clock runs and the shot clock has ticked down within the last 1.5 s.
 */
export function createCgBoard() {
  let text: string | undefined;
  let shotShown: number | undefined;
  let shotTickedAt = -Infinity;
  let shotRunning = false;

  const field = (name: CgFieldName) => {
    const [start, length] = CG_FIELDS[name];
    return text!.slice(start, start + length);
  };
  const integer = (name: CgFieldName) => {
    const value = field(name).trim();
    return /^\d+$/.test(value) ? Number(value) : undefined;
  };
  const gameClock = () => {
    const shown = parseTime(field('clock'));
    return shown ? { ...shown, running: field('clockStopped') !== 's' && shown.remainingMs > 0 } : undefined;
  };

  return {
    apply(message: string, now: number) {
      text = message;
      const shot = parseTime(field('shotClock'))?.remainingMs;
      if (shot !== undefined && shotShown !== undefined && shot < shotShown) shotTickedAt = now;
      shotShown = shot;
      shotRunning = (gameClock()?.running ?? false) && now - shotTickedAt <= SHOT_CLOCK_HOLD_MS;
    },
    read(): Scoreboard {
      const none = { away: undefined, home: undefined };
      if (text === undefined) return { clock: undefined, shotClock: undefined, period: undefined, score: none, timeouts: none, bonus: none, possession: undefined };
      return {
        clock: gameClock(),
        shotClock: parseTime(field('shotClock')),
        shotClockRunning: shotRunning,
        period: integer('period') || undefined,
        score: { away: integer('scoreAway'), home: integer('scoreHome') },
        timeouts: none,
        bonus: none,
        possession: undefined,
      };
    },
  };
}
