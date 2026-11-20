import { defineGraphic } from '@dtv/playout';
import type { TeamView } from '@dtv/domain';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { conferenceRecord, overallRecord, requireGame } from './shared';

/** `15-5 · 7-2 A10`; empty when the team has no season row. */
const recordLine = (team: TeamView) => [overallRecord(team), conferenceRecord(team)].filter(Boolean).join(' · ');

export const comingUpNext = defineGraphic({
  id: 'basketball-v2/coming-up-next',
  scene: SCENES.coming_up_next,
  params: z.object({ title: z.string().min(1).default('Coming up next') }),
})({
  name: 'Coming Up Next',
  sport: 'basketball',
  layer: 'lower',
  clears: ['bug'],
  demo: {},
  site: 'full-frame',
  label: () => 'Coming up next',
  bind(params, context) {
    const { sides } = requireGame(context);
    return {
      title: params.title,
      awaySchool: sides.away.school.name,
      homeSchool: sides.home.school.name,
      awayMascot: sides.away.school.mascot,
      homeMascot: sides.home.school.mascot,
      awayRecord: recordLine(sides.away),
      homeRecord: recordLine(sides.home),
      awayLogo: sides.away.brand.logo,
      homeLogo: sides.home.brand.logo,
      awayPrimaryColor: sides.away.brand.primaryColor,
      homePrimaryColor: sides.home.brand.primaryColor,
      homeSecondaryColor: sides.home.brand.secondaryColor,
    };
  },
});
