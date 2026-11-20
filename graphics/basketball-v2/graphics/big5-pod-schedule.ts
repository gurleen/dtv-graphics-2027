import { Color } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { CLASSIC, DREXEL, isTonight, type Pod, type PodGame, PODS, podStandings } from './big5';
import { requireGame, teamOf } from './shared';

const WHITE = Color.parse('#ffffff');

/** The Big 5 Pod Schedule card: the six campus pod games, results and games to come, and the show's own game lit. */
export const big5PodSchedule = defineGraphic({
  id: 'basketball-v2/big5-pod-schedule',
  scene: SCENES.big5_pod_schedule,
  params: z.object({}),
})({
  name: 'Big 5 Pod Schedule',
  sport: 'basketball',
  layer: 'card',
  demo: {},
  site: 'full-frame',
  label: () => 'Big 5 pod schedule',
  bind(_params, context) {
    const view = requireGame(context);
    const { home } = view.sides;
    const game = (pod: Pod, row: PodGame) => {
      // A game the show is for that already has a score is a final row.
      const tonight = !row.score && isTonight(row, view);
      const away = teamOf(context, row.away);
      const hosts = teamOf(context, row.home);
      const recordOf = (team: PodGame['away']) => {
        const standing = podStandings(pod).find((line) => line.team === team);
        return tonight && standing ? `${standing.wins}-${standing.losses}` : '';
      };
      return {
        date: row.date,
        awayName: away.school.shortName,
        awayScore: row.score ? String(row.score.away) : '',
        awayRecord: recordOf(row.away),
        awayLogo: away.brand.logo,
        homeName: hosts.school.shortName,
        homeScore: row.score ? String(row.score.home) : '',
        homeRecord: recordOf(row.home),
        homeLogo: hosts.brand.logo,
        status: `${row.score ? 'Final' : row.time} · ${row.venue}`,
        winner: row.score ? (row.score.away > row.score.home ? 1 : 2) : 0,
        tonight: tonight ? 1 : 0,
      };
    };
    return {
      pod: PODS.map((pod) => ({ name: pod.name })),
      classicLine: `Big 5 Classic tripleheader · ${CLASSIC.date} · ${CLASSIC.venue}`,
      classicTimes: CLASSIC.games.map((tip) => tip.time).join(' · '),
      homePrimaryColor: home.brand.primaryColor,
      // Only Drexel's gold reads as a marker on glass; Saint Joseph's near-black does not.
      markerColor: home.team.id === DREXEL ? home.brand.secondaryColor : WHITE,
      game: PODS.flatMap((pod) => pod.games.map((row) => game(pod, row))),
    };
  },
});
