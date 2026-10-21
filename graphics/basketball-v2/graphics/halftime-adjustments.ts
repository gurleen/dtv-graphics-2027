import { sides } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { requireGame } from './shared';

export const halftimeAdjustments = defineGraphic({
  id: 'basketball-v2/halftime-adjustments',
  scene: SCENES.halftime_adjustments,
  params: z.object({ adjustments: sides(z.array(z.string().min(1)).max(2)) }),
})({
  name: 'Halftime Adjustments',
  sport: 'basketball',
  layer: 'bug',
  demo: {
    adjustments: {
      away: ['Push the pace in transition', 'Limit second-chance points'],
      home: ['Attack the paint early', 'Close out on three-point shooters'],
    },
  },
  site: 'full-frame',
  label: () => 'Halftime adjustments',
  bind(params, context) {
    const { away, home } = requireGame(context).sides;
    const [awayLine1 = '', awayLine2 = ''] = params.adjustments.away;
    const [homeLine1 = '', homeLine2 = ''] = params.adjustments.home;
    return {
      step: 0,
      awaySchool: away.school.name,
      awayMascot: away.school.mascot,
      awayLine1,
      awayLine2,
      homeSchool: home.school.name,
      homeMascot: home.school.mascot,
      homeLine1,
      homeLine2,
      awayLogo: away.brand.logo,
      homeLogo: home.brand.logo,
      awayPrimaryColor: away.brand.primaryColor,
      homePrimaryColor: home.brand.primaryColor,
      awaySecondaryColor: away.brand.secondaryColor,
      homeSecondaryColor: home.brand.secondaryColor,
      sponsorLogo: context.sponsor?.logoOnLight ?? null,
    };
  },
  steps: { count: 2, values: (step) => ({ step }), transition: 'Away To Home' },
});
