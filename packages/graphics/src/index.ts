/** Every graphic the system can play, from every sport package. Servers and pages import the list from here. */

import { BASKETBALL_V2 } from '@dtv/basketball-v2';
import { Cue } from '@dtv/domain';
import { checkCue, type Overrides, type Registry } from '@dtv/playout';
import type { z } from 'zod';

export const GRAPHICS = { ...BASKETBALL_V2 } as const satisfies Registry;

export type GraphicKey = keyof typeof GRAPHICS;
export type ParamsOf<K extends GraphicKey> = z.input<(typeof GRAPHICS)[K]['params']>;

/** A cue checked at a boundary: the graphic exists, and its params and overrides fit. Params come back with their defaults. */
export function parseCue(cue: Cue): { readonly ok: true; readonly cue: Cue } | { readonly ok: false; readonly error: string } {
  const check = checkCue(GRAPHICS, cue);
  return check.ok ? { ok: true, cue: { ...cue, params: check.params } } : check;
}

/** A typed cue for code that builds rundowns: `cueOf('basketball-v2/player-lower-third', { player }, { id: 'reed' })`. */
export const cueOf = <K extends GraphicKey>(
  graphic: K,
  params: ParamsOf<K>,
  options: { readonly id: string; readonly note?: string; readonly overrides?: Overrides },
): Cue => Cue.parse({ ...options, graphic, params });
