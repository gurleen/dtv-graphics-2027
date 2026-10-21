/** Compile-time tests, run by the typecheck in `bun run check`: a cue's params are typed by its graphic. */

import { cueOf } from './index';

export const typed = cueOf('basketball-v2/player-lower-third', { player: 'drexel-mbb@2026-27/reed-josh', line: { kind: 'none' } }, { id: 'reed' });

// @ts-expect-error the player lower third needs a player
export const missingParam = cueOf('basketball-v2/player-lower-third', {}, { id: 'reed' });

// @ts-expect-error `rebounds` is not a game stat key
export const badStatKey = cueOf('basketball-v2/player-lower-third', { player: 'x', line: { kind: 'game', stats: ['rebounds'] } }, { id: 'reed' });

// @ts-expect-error no graphic has this id
export const unknownGraphic = cueOf('basketball-v2/scorebugs', {}, { id: 'bug' });
