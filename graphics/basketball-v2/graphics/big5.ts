/**
 * The 2026-27 men's Big 5 Classic and the Drexel and Saint Joseph's series, as one table the
 * Big 5 graphics read. After a pod game, give it a `score` here: the standings, the finals and
 * every card that lists the game follow. Text is in natural case; the projector uppercases it.
 */

import { type GameView, TeamId } from '@dtv/domain';

const team = (id: string) => TeamId.parse(id);

export const DREXEL = team('drexel-mbb');
export const SAINT_JOSEPHS = team('saint-josephs-mbb');
export const PENN = team('pennsylvania-mbb');
export const TEMPLE = team('temple-mbb');
export const VILLANOVA = team('villanova-mbb');
export const LA_SALLE = team('la-salle-mbb');

export type PodGame = {
  readonly date: string;
  readonly away: TeamId;
  readonly home: TeamId;
  readonly venue: string;
  /** The tip time, for a game not yet played. */
  readonly time: string;
  readonly score?: { readonly away: number; readonly home: number };
};

export type Pod = { readonly name: string; readonly teams: readonly [TeamId, TeamId, TeamId]; readonly games: readonly [PodGame, PodGame, PodGame] };

/** Each pod's teams in the order a tie lists them, and its three campus games in date order. */
export const PODS: readonly [Pod, Pod] = [
  {
    name: 'Pod 1',
    teams: [SAINT_JOSEPHS, DREXEL, PENN],
    games: [
      { date: 'Sat Nov 14', away: PENN, home: SAINT_JOSEPHS, venue: 'Hagan Arena', time: '6:30', score: { away: 77, home: 83 } },
      { date: 'Fri Nov 20', away: SAINT_JOSEPHS, home: DREXEL, venue: 'Daskalakis Athletic Center', time: '7:00' },
      { date: 'Tue Nov 24', away: DREXEL, home: PENN, venue: 'The Palestra', time: '8:00' },
    ],
  },
  {
    name: 'Pod 2',
    teams: [TEMPLE, VILLANOVA, LA_SALLE],
    games: [
      { date: 'Tue Nov 10', away: LA_SALLE, home: VILLANOVA, venue: 'Finneran Pavilion', time: '7:00', score: { away: 59, home: 80 } },
      { date: 'Sun Nov 15', away: TEMPLE, home: LA_SALLE, venue: 'Glaser Arena', time: '2:00', score: { away: 84, home: 71 } },
      { date: 'Tue Dec 1', away: VILLANOVA, home: TEMPLE, venue: 'Liacouras Center', time: '6:30' },
    ],
  },
];

/** Classic Saturday: the three games in tip order, each between the two pods' same finishers. */
export const CLASSIC = {
  date: 'Sat Dec 5',
  venue: 'Xfinity Mobile Arena',
  games: [
    { time: '2:00', name: '5th place', pairing: '3rd vs 3rd' },
    { time: '4:30', name: '3rd place', pairing: '2nd vs 2nd' },
    { time: '7:00', name: 'Championship', pairing: '1st vs 1st' },
  ],
} as const;

export type PodRow = { readonly team: TeamId; readonly rank: number; readonly wins: number; readonly losses: number };

/** A pod's table: most wins, then fewest losses, then the pod's listed order. Teams level on both share a rank. */
export const podStandings = (pod: Pod): readonly PodRow[] => {
  const tally = new Map(pod.teams.map((id) => [id, { wins: 0, losses: 0 }]));
  for (const { away, home, score } of pod.games) {
    if (!score) continue;
    const [winner, loser] = score.away > score.home ? [away, home] : [home, away];
    tally.get(winner)!.wins += 1;
    tally.get(loser)!.losses += 1;
  }
  const rows = pod.teams.map((id) => ({ team: id, ...tally.get(id)! })).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  return rows.map((row, index) => ({ ...row, rank: rows.findIndex((other) => other.wins === row.wins && other.losses === row.losses) + 1 }));
};

/** Whether `game` is the game the show is for: the same visitor at the same host. */
export const isTonight = (game: PodGame, { sides }: GameView) => game.away === sides.away.team.id && game.home === sides.home.team.id;

/** The pod the show's game belongs to, if it is a pod game. */
export const podOf = (view: GameView) => PODS.find((pod) => pod.games.some((game) => isTonight(game, view)));

/** The Classic's past title games, oldest first. */
export const CHAMPIONS: readonly { readonly year: string; readonly champion: TeamId; readonly runnerUp: TeamId; readonly score: string }[] = [
  { year: '2023', champion: SAINT_JOSEPHS, runnerUp: TEMPLE, score: '74-65' },
  { year: '2024', champion: SAINT_JOSEPHS, runnerUp: LA_SALLE, score: '82-68' },
  { year: '2025', champion: VILLANOVA, runnerUp: PENN, score: '90-63' },
];

export type Meeting = { readonly year: string; readonly date: string; readonly host: TeamId; readonly winner: TeamId; readonly score: string; readonly caption: string };

/** Drexel and Saint Joseph's, from Saint Joseph's opponent history through 8 November 2025. `facts` and `meetings` are in the order they page. */
export const SERIES: {
  readonly leader: TeamId;
  readonly trailer: TeamId;
  readonly leaderWins: number;
  readonly trailerWins: number;
  readonly since: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly meetings: readonly Meeting[];
} = {
  leader: SAINT_JOSEPHS,
  trailer: DREXEL,
  leaderWins: 48,
  trailerWins: 11,
  since: '1919',
  facts: [
    { label: 'Nov 8, 2025', value: 'SJU 76-65' },
    { label: 'Last 10 meetings', value: 'SJU 7-3' },
    { label: 'At Drexel', value: 'SJU 19-4' },
    { label: 'Jan 1, 1919', value: 'SJU 26-17' },
  ],
  meetings: [
    { year: '2025', date: 'Nov 8, 2025', host: SAINT_JOSEPHS, winner: SAINT_JOSEPHS, score: '76-65', caption: 'Hawks rally from 3 down at the half' },
    { year: '2021', date: 'Nov 17, 2021', host: SAINT_JOSEPHS, winner: DREXEL, score: '78-75', caption: 'Dragons win at Hagan Arena' },
    { year: '2020', date: 'Dec 17, 2020', host: DREXEL, winner: DREXEL, score: '81-77', caption: 'Dragons win at home' },
    { year: '2016', date: 'Dec 11, 2016', host: DREXEL, winner: SAINT_JOSEPHS, score: '72-71', caption: 'Decided by a single point' },
    { year: '2015', date: 'Nov 13, 2015', host: SAINT_JOSEPHS, winner: SAINT_JOSEPHS, score: '82-81', caption: 'One point again' },
  ],
};
