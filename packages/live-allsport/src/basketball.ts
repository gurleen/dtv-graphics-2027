/** Reads the Daktronics basketball fields out of the console's buffer into typed values. Pure. */

import type { Side, Sides } from '@dtv/domain';
import type { RtdBuffer } from './rtd';

/** `[position, length]`, 1-based, from the AllSport 5000 basketball RTD layout. Home is `home`, Guest is `away`. */
export const FIELDS = {
  clockMain: [1, 5],
  clockTenths: [6, 8],
  clockZero: [27, 1],
  clockStopped: [28, 1],
  scoreHome: [108, 4],
  scoreAway: [112, 4],
  timeoutsHome: [122, 2],
  timeoutsAway: [130, 2],
  period: [142, 2],
  shotClock: [201, 8],
  possessionHomeIndicator: [210, 1],
  possessionHomeArrow: [211, 1],
  possessionAwayIndicator: [216, 1],
  possessionAwayArrow: [217, 1],
  bonusHomeOneAndOne: [222, 1],
  bonusHomeDouble: [223, 1],
  bonusAwayOneAndOne: [229, 1],
  bonusAwayDouble: [230, 1],
  foulsHome: [236, 2],
  foulsAway: [238, 2],
  nameHome: [48, 20],
  nameAway: [68, 20],
} as const satisfies Record<string, readonly [number, number]>;

export type FieldName = keyof typeof FIELDS;

/**
 * What the console shows. A value is `undefined` until the console has written its field, because it sends only
 * changes and does not dump its state on connect: unknown, so nothing is sent for it. `null` is a field the
 * console has blanked, which for the shot clock and possession is itself a value.
 */
export interface Scoreboard {
  /** `precisionMs` is how far the display can be from the true time: a whole second without tenths, 100 ms with. */
  readonly clock: { readonly remainingMs: number; readonly running: boolean; readonly precisionMs: number } | undefined;
  readonly shotClock: { readonly remainingMs: number; readonly precisionMs: number } | null | undefined;
  /** Whether the shot clock runs, for a format that can tell; without it the shot clock follows the game clock. */
  readonly shotClockRunning?: boolean;
  readonly period: number | undefined;
  readonly score: Sides<number | undefined>;
  readonly timeouts: Sides<number | undefined>;
  readonly bonus: Sides<boolean | undefined>;
  readonly possession: Side | null | undefined;
}

export interface Time {
  readonly remainingMs: number;
  readonly precisionMs: number;
}

/** `mm:ss`, `m:ss`, `mm:ss.t`, `ss.t`, `s.t`, or bare seconds, with spaces around. Null for anything else, blank included. */
export function parseTime(text: string): Time | null {
  const match = /^(?:(\d{1,2}):(\d{2})|(\d{1,2}))(?:\.(\d))?$/.exec(text.trim());
  if (!match) return null;
  const [, minutes, seconds, bare, tenths] = match;
  const whole = minutes !== undefined ? Number(minutes) * 60 + Number(seconds) : Number(bare);
  return { remainingMs: whole * 1000 + Number(tenths ?? 0) * 100, precisionMs: tenths === undefined ? 1000 : 100 };
}

export function readBasketball(buffer: RtdBuffer): Scoreboard {
  const text = (name: FieldName) => buffer.field(FIELDS[name][0], FIELDS[name][1]);
  const integer = (name: FieldName) => {
    const value = text(name)?.trim();
    return value && /^\d+$/.test(value) ? Number(value) : undefined;
  };
  /** True when the console wrote any of them, and shows a mark in any. Undefined when it wrote none. */
  const marked = (names: readonly FieldName[], mark: string) => {
    const seen = names.map(text).filter((value) => value !== null);
    return seen.length ? seen.some((value) => value.trim() === mark) : undefined;
  };

  // The tenths field is the more exact one, so it wins when it parses.
  const shown = [text('clockTenths'), text('clockMain')].flatMap((value) => (value === null ? [] : [parseTime(value)])).find((time) => time !== null);
  // A clock with no stop marker yet reads as stopped, so an unknown never starts the server's clock.
  const marker = text('clockStopped');
  const stopped = marker === null || marker.trim() === 's';
  const zero = text('clockZero')?.trim() === 'z';
  const shot = text('shotClock');

  const homeBall = marked(['possessionHomeIndicator', 'possessionHomeArrow'], '<');
  const awayBall = marked(['possessionAwayIndicator', 'possessionAwayArrow'], '>');

  return {
    clock: shown ? { ...shown, running: !stopped && !zero && shown.remainingMs > 0 } : undefined,
    shotClock: shot === null ? undefined : parseTime(shot),
    period: integer('period') || undefined,
    score: { away: integer('scoreAway'), home: integer('scoreHome') },
    timeouts: { away: integer('timeoutsAway'), home: integer('timeoutsHome') },
    bonus: { away: marked(['bonusAwayOneAndOne', 'bonusAwayDouble'], '>'), home: marked(['bonusHomeOneAndOne', 'bonusHomeDouble'], '<') },
    possession: homeBall === undefined && awayBall === undefined ? undefined : homeBall ? 'home' : awayBall ? 'away' : null,
  };
}
