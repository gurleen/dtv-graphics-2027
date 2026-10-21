import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { matchupValues, requireGame } from './shared';

export const matchupLocatorLowerThird = defineGraphic({
  id: 'basketball-v2/matchup-locator-lower-third',
  scene: SCENES.matchup_locator_lower_third,
  params: z.object({}),
})({
  name: 'Matchup Locator Lower Third',
  sport: 'basketball',
  layer: 'lower',
  demo: {},
  site: 'full-frame',
  label: () => 'Matchup locator lower third',
  bind(_params, context) {
    const game = requireGame(context);
    return {
      ...matchupValues(game),
      eventTitle: game.game.title ?? '',
      awayMascot: game.sides.away.school.mascot,
      homeMascot: game.sides.home.school.mascot,
      sponsorLogo: context.sponsor?.logoOnDark ?? null,
    };
  },
});
