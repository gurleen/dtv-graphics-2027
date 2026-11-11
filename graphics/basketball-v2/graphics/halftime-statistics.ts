import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { requireBasketball, requireGame, TEAM_STAT_ROWS } from './shared';

export const halftimeStatistics = defineGraphic({
  id: 'basketball-v2/halftime-statistics',
  scene: SCENES.halftime_statistics,
  params: z.object({ title: z.string().min(1).default('Halftime stats') }),
})({
  name: 'Halftime Statistics',
  sport: 'basketball',
  layer: 'card',
  demo: {},
  site: 'full-frame',
  label: (params) => params.title,
  bind(params, context) {
    const { away, home } = requireGame(context).sides;
    const live = requireBasketball(context);
    return {
      title: params.title,
      awaySchool: away.school.name,
      awayMascot: away.school.mascot,
      homeSchool: home.school.name,
      homeMascot: home.school.mascot,
      awayScore: String(live.score.away),
      homeScore: String(live.score.home),
      row: TEAM_STAT_ROWS.map((row) => ({
        label: row.label,
        awayValue: row.value(live.team.away),
        awayDetail: row.detail?.(live.team.away) ?? '',
        homeValue: row.value(live.team.home),
        homeDetail: row.detail?.(live.team.home) ?? '',
        leadingValue: row.leading,
      })),
      awayLogo: away.brand.logo,
      homeLogo: home.brand.logo,
      awayPrimaryColor: away.brand.primaryColor,
      homePrimaryColor: home.brand.primaryColor,
      awaySecondaryColor: away.brand.secondaryColor,
      homeSecondaryColor: home.brand.secondaryColor,
      sponsorLogo: context.sponsor?.logoOnLight ?? null,
    };
  },
});
