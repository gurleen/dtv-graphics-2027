import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { CLASSIC, PODS, podOf, podStandings } from './big5';
import { requireGame, teamOf } from './shared';

export const big5Format = defineGraphic({
  id: 'basketball-v2/big5-format',
  scene: SCENES.big5_format,
  params: z.object({}),
})({
  name: 'Big 5 Format',
  sport: 'basketball',
  layer: 'card',
  demo: {},
  site: 'full-frame',
  label: () => 'Big 5 Classic format',
  bind(_params, context) {
    const view = requireGame(context);
    const { away, home } = view.sides;
    const tonight = new Set([away.team.id, home.team.id]);
    const pod = podOf(view);
    return {
      showPods: false,
      classicDate: CLASSIC.date,
      classicVenue: CLASSIC.venue,
      game: CLASSIC.games.map(({ time, name, pairing }) => ({ time, name, pairing })),
      row: PODS.flatMap((each) =>
        podStandings(each).map((row) => {
          const { school, brand } = teamOf(context, row.team);
          return {
            rank: String(row.rank),
            team: school.shortName,
            record: `${row.wins}-${row.losses}`,
            logo: brand.logo,
            primaryColor: brand.primaryColor,
            tonight: tonight.has(row.team),
          };
        }),
      ),
      tonightGame: `${away.school.shortName} at ${home.school.shortName}${pod ? ` · ${pod.name}` : ''}`,
    };
  },
  steps: { count: 2, values: (step) => ({ showPods: step === 1 }), transition: 'Show Pods' },
});
