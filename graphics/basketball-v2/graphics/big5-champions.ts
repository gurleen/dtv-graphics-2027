import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { CHAMPIONS } from './big5';
import { teamOf } from './shared';

export const big5Champions = defineGraphic({
  id: 'basketball-v2/big5-champions',
  scene: SCENES.big5_champions,
  params: z.object({}),
})({
  name: 'Big 5 Champions',
  sport: 'basketball',
  layer: 'lower',
  demo: {},
  site: 'with-scorebug',
  label: () => 'Big 5 Classic champions',
  bind(_params, context) {
    return {
      subtitle: 'Fourth year of the format',
      champion: CHAMPIONS.map(({ year, champion, runnerUp, score }) => {
        const team = teamOf(context, champion);
        return {
          year,
          name: team.school.shortName,
          result: `${score} over ${teamOf(context, runnerUp).school.shortName}`,
          logo: team.brand.logo,
          primaryColor: team.brand.primaryColor,
        };
      }),
    };
  },
});
