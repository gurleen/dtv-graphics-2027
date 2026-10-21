import { basketball } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { requireBasketball, requireGame } from './shared';

export const scoreToBreak = defineGraphic({
  id: 'basketball-v2/score-to-break',
  scene: SCENES.score_to_break,
  params: z.object({ side: z.enum(['left', 'right']).default('left') }),
})({
  name: 'Score to Break',
  sport: 'basketball',
  layer: 'bug',
  demo: { side: 'left' },
  site: 'full-frame',
  free: () => ({ side: 'left' }),
  label: (params) => `Score to break · ${params.side}`,
  bind(params, context) {
    const { sides, program } = requireGame(context);
    const live = requireBasketball(context);
    const { away, home } = sides;
    return {
      alignRight: params.side === 'right',
      awayScore: live.score.away,
      homeScore: live.score.home,
      status: basketball.statusLine(program, live, context.now),
      awayLogo: away.brand.logo,
      homeLogo: home.brand.logo,
      awayPrimaryColor: away.brand.primaryColor,
      homePrimaryColor: home.brand.primaryColor,
      awaySecondaryColor: away.brand.secondaryColor,
      homeSecondaryColor: home.brand.secondaryColor,
      sponsorLogo: context.sponsor?.logoOnDark ?? null,
    };
  },
  frozenOnAir: ['alignRight'],
  exitSignal: '_onScreen',
});
