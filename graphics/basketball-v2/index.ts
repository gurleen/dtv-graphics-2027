/**
 * The basketball-v2 graphics: a scene here (its .rml, and its generator if it has one) plus
 * one entry in graphics/. Run `bun run codegen` after editing a scene.
 */

import type { Registry } from '@dtv/playout';
import { matchupLocator } from './graphics/matchup-locator';
import { matchupLocatorLowerThird } from './graphics/matchup-locator-lower-third';
import { playerLowerThird } from './graphics/player-lower-third';
import { scorebug } from './graphics/scorebug';
import { staffLowerThird } from './graphics/staff-lower-third';
import { teamLowerThird } from './graphics/team-lower-third';

const ENTRIES = [scorebug, playerLowerThird, staffLowerThird, teamLowerThird, matchupLocator, matchupLocatorLowerThird] as const;

type Entry = (typeof ENTRIES)[number];

// Object.fromEntries loses the literal ids; the mapped type restores them.
export const BASKETBALL_V2 = Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry])) as { readonly [E in Entry as E['id']]: E };

if (Object.keys(BASKETBALL_V2).length !== ENTRIES.length) throw new Error('Two basketball-v2 graphics share an id');
BASKETBALL_V2 satisfies Registry;

export { SCENES, type SceneKey } from './scenes.gen';
