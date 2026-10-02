/**
 * The Player of the Game lower third: the Player to Watch scene with another title and
 * sponsor, generated from the same description. It shares that graphic's element,
 * including the motion headshot laid over the canvas.
 */

import type { RiveGraphicDefinition } from '../../shared/definition';
import { BasketballV2PlayerToWatchLowerThird } from '../basketball_v2_player_to_watch_lower_third/graphic';
import { DEFINITION } from './definition';

export class BasketballV2PlayerOfTheGameLowerThird extends BasketballV2PlayerToWatchLowerThird {
  protected override readonly definition: RiveGraphicDefinition = DEFINITION;
}

export default BasketballV2PlayerOfTheGameLowerThird;
