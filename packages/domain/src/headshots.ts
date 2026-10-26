import { type ProgramCode } from './programs';
import { Url } from './primitives';

/**
 * Where a headshot lives: `<espnId>/<program>/<jersey>.png`, the same path in the R2 bucket
 * (`dtv-headshots`), in the server's disk cache and under `/headshots/` on the server.
 * The ESPN id is the school's (`2182` for Drexel), the program is `mbb` or `wbb`, and the
 * jersey is a string, so `0` and `00` are different files.
 */
export const HEADSHOT_ROUTE = '/headshots';
export const HEADSHOT_KEY = /^\d+\/[a-z]+\/\d{1,2}\.png$/;

export const headshotKey = (espnId: string, program: ProgramCode, jersey: string): string => `${espnId}/${program}/${jersey}.png`;

/** The URL a scene loads. It is the server's, not R2's, so a headshot is fetched once and then read from disk. */
export const headshotUrl = (espnId: string, program: ProgramCode, jersey: string): Url => Url.parse(`${HEADSHOT_ROUTE}/${headshotKey(espnId, program, jersey)}`);
