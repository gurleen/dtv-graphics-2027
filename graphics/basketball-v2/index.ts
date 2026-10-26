/**
 * The basketball-v2 graphics: a scene here (its .rml, and its generator if it has one) plus
 * one entry in graphics/. Run `bun run codegen` after editing a scene.
 */

import type { Registry } from '@dtv/playout';
import { burningQuestion } from './graphics/burning-question';
import { conferenceStandings } from './graphics/conference-standings';
import { halftimeAdjustments } from './graphics/halftime-adjustments';
import { halftimeStatistics } from './graphics/halftime-statistics';
import { matchupLocator } from './graphics/matchup-locator';
import { matchupLocatorLowerThird } from './graphics/matchup-locator-lower-third';
import { playerLowerThird } from './graphics/player-lower-third';
import { scorebug } from './graphics/scorebug';
import { playerOfTheGame } from './graphics/player-of-the-game';
import { playerToWatch } from './graphics/player-to-watch';
import { scoreToBreak } from './graphics/score-to-break';
import { scorebugSlider } from './graphics/scorebug-slider';
import { startingFive } from './graphics/starting-five';
import { staffLowerThird } from './graphics/staff-lower-third';
import { talentLowerThirdDouble } from './graphics/talent-lower-third-double';
import { talentLowerThirdSingle } from './graphics/talent-lower-third-single';
import { talentLowerThirdTriple } from './graphics/talent-lower-third-triple';
import { teamLowerThird } from './graphics/team-lower-third';

const ENTRIES = [scorebug, playerLowerThird, staffLowerThird, teamLowerThird, matchupLocator, matchupLocatorLowerThird, talentLowerThirdSingle, talentLowerThirdDouble, talentLowerThirdTriple, scoreToBreak, scorebugSlider, burningQuestion, startingFive, halftimeAdjustments, halftimeStatistics, playerToWatch, playerOfTheGame, conferenceStandings] as const;

type Entry = (typeof ENTRIES)[number];

// Object.fromEntries loses the literal ids; the mapped type restores them.
export const BASKETBALL_V2 = Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry])) as { readonly [E in Entry as E['id']]: E };

if (Object.keys(BASKETBALL_V2).length !== ENTRIES.length) throw new Error('Two basketball-v2 graphics share an id');
BASKETBALL_V2 satisfies Registry;

export { SCENES, type SceneKey } from './scenes.gen';
