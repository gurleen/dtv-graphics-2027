import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { SERIES } from './big5';
import { teamOf } from './shared';

export const seriesHistory = defineGraphic({
  id: 'basketball-v2/series-history',
  scene: SCENES.series_history,
  params: z.object({}),
})({
  name: 'Series History',
  sport: 'basketball',
  layer: 'lower',
  demo: {},
  site: 'with-scorebug',
  label: () => 'Series history',
  bind(_params, context) {
    const cell = (id: typeof SERIES.leader, wins: number) => {
      const { brand } = teamOf(context, id);
      return { abbreviation: brand.abbreviation, wins: String(wins), primaryColor: brand.primaryColor, logo: brand.logo };
    };
    return {
      since: SERIES.since,
      team: [cell(SERIES.leader, SERIES.leaderWins), cell(SERIES.trailer, SERIES.trailerWins)],
      fact: SERIES.facts.map(({ label, value }) => ({ label, value })),
    };
  },
});
