import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { requireGame } from './shared';

export const big5Stakes = defineGraphic({
  id: 'basketball-v2/big5-stakes',
  scene: SCENES.big5_stakes,
  params: z.object({
    title: z.string().min(1).default("Big 5 Classic · Pod 1 · What's at stake"),
    homeHeadline: z.string().default('Dragons control the pod'),
    homeDetail: z.string().default('Then a win at Penn on Tuesday puts Drexel in the title game'),
    awayHeadline: z.string().default('Hawks clinch Pod 1'),
    awayDetail: z.string().default('2-0 in the pod · championship game Dec 5 at 7:00'),
  }),
})({
  name: 'Big 5 Stakes',
  sport: 'basketball',
  layer: 'lower',
  clears: ['bug'],
  demo: {},
  site: 'full-frame',
  label: () => 'Big 5 stakes',
  bind(params, context) {
    const { sides } = requireGame(context);
    return {
      ...params,
      homeSchool: sides.home.school.name,
      awaySchool: sides.away.school.name,
      homeLogo: sides.home.brand.logo,
      awayLogo: sides.away.brand.logo,
      homePrimaryColor: sides.home.brand.primaryColor,
      awayPrimaryColor: sides.away.brand.primaryColor,
      homeSecondaryColor: sides.home.brand.secondaryColor,
    };
  },
});
