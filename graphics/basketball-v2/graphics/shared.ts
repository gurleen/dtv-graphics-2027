/** What several basketball binds read the same way. Each throws a message an operator can act on. */

import { basketball, type GameView, headshotUrl, type Player, PlayerId, resolveTeam, type Staff, type StaffId, type TeamId, type TeamView, type WinLoss, type World } from '@dtv/domain';
import { FALLBACK_IMAGES, type ShowContext } from '@dtv/playout';
import { z } from 'zod';

const { pct } = basketball;

export const fail = (message: string): never => {
  throw new Error(message);
};

export const requireGame = (context: ShowContext): GameView => context.game ?? fail('The active show has no game');

export const requireBasketball = (context: ShowContext): basketball.BasketballLive =>
  context.live?.sport === 'basketball' ? context.live : fail('The game has no live basketball state');

export const playerOf = (world: World, id: PlayerId): { player: Player; team: TeamView } => {
  const player = world.get('player', id) ?? fail(`Player ${id} is gone`);
  const team = resolveTeam(world, player.teamId, player.seasonId) ?? fail(`Team ${player.teamId} is gone`);
  return { player, team };
};

/** The player's own headshot, else the one the server caches from the bucket for their school, program and jersey. */
export const headshotOf = (player: Player, team: TeamView) =>
  player.headshot ?? (team.school.espnId ? headshotUrl(team.school.espnId, team.team.program, player.jersey) : FALLBACK_IMAGES.headshot);

export const staffOf = (world: World, id: StaffId): { staff: Staff; team: TeamView } => {
  const staff = world.get('staff', id) ?? fail(`Staff ${id} is gone`);
  const team = resolveTeam(world, staff.teamId, staff.seasonId) ?? fail(`Team ${staff.teamId} is gone`);
  return { staff, team };
};

export const fullName = (person: { readonly firstName: string; readonly lastName: string }) => `${person.firstName} ${person.lastName}`.trim();

/** `J. Reed`, or the last name alone when the roster has no first name. */
export const initialedName = (player: Player) => {
  const initial = player.firstName.trim().slice(0, 1);
  return initial ? `${initial}. ${player.lastName}` : player.lastName;
};

/** The team's players with a line in tonight's game. `live.players` has no team key, so each id resolves through the world. */
export const teamLinesTonight = (world: World, live: basketball.BasketballLive, teamId: TeamId) =>
  Object.entries(live.players).flatMap(([id, line]) => {
    const player = world.get('player', PlayerId.parse(id));
    return player?.teamId === teamId ? [{ player, line }] : [];
  });

/** The team rows both halftime graphics show, in order; `value` formats a team's line. Turnovers lead when lower. */
export const TEAM_STAT_ROWS: readonly {
  readonly label: string;
  readonly leading: 'HIGHER' | 'LOWER';
  readonly value: (line: basketball.StatLine) => string;
  readonly detail?: (line: basketball.StatLine) => string;
}[] = [
  { label: 'FG', leading: 'HIGHER', value: (l) => `${l.fgm}-${l.fga}`, detail: (l) => pct(l.fgm, l.fga) },
  { label: '3PT', leading: 'HIGHER', value: (l) => `${l.tpm}-${l.tpa}`, detail: (l) => pct(l.tpm, l.tpa) },
  { label: 'FT', leading: 'HIGHER', value: (l) => `${l.ftm}-${l.fta}`, detail: (l) => pct(l.ftm, l.fta) },
  { label: 'REB', leading: 'HIGHER', value: (l) => String(l.reb) },
  { label: 'AST', leading: 'HIGHER', value: (l) => String(l.ast) },
  { label: 'TO', leading: 'LOWER', value: (l) => String(l.to) },
];

const CLASS_NAMES = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Graduate' } as const;

/** `Redshirt Junior`; empty when the roster has no class. */
export const classYearName = (player: Player) => (player.classYear ? `${player.redshirt ? 'Redshirt ' : ''}${CLASS_NAMES[player.classYear]}` : '');

/** A team as the active show's game season sees it, for a graphic that names a team by id. */
export const teamOf = (context: ShowContext, id: TeamId): TeamView => resolveTeam(context.world, id, requireGame(context).season.id) ?? fail(`Team ${id} is gone`);

export const record = ({ wins, losses }: WinLoss) => `${wins}-${losses}`;

/** `14-6`; empty when the team has no season row. */
export const overallRecord = (team: TeamView) => (team.season ? record(team.season.overall) : '');

/** `6-3 CAA`; empty when the team has no conference. */
export const conferenceRecord = (team: TeamView) => (team.season && team.conference ? `${record(team.season.conference)} ${team.conference.shortName}` : '');

/** What both matchup graphics show: the two teams' names, records, brands and the venue. */
export const matchupValues = ({ sides, venue }: GameView) => ({
  awaySchool: sides.away.school.name,
  homeSchool: sides.home.school.name,
  awayOverallRecord: overallRecord(sides.away),
  homeOverallRecord: overallRecord(sides.home),
  awayConferenceRecord: conferenceRecord(sides.away),
  homeConferenceRecord: conferenceRecord(sides.home),
  awayLogo: sides.away.brand.logo,
  homeLogo: sides.home.brand.logo,
  awayPrimaryColor: sides.away.brand.primaryColor,
  homePrimaryColor: sides.home.brand.primaryColor,
  awaySecondaryColor: sides.away.brand.secondaryColor,
  homeSecondaryColor: sides.home.brand.secondaryColor,
  venueName: venue?.name ?? '',
  venueLocation: venue ? `${venue.city}, ${venue.state}` : '',
});

/** A pick from a stat catalogue: its keys, labelled as the graphic prints them, so a form offers `FG%` and not `fgPct`. */
export const statKey = <K extends string>(stats: Record<K, { readonly label: string }>) =>
  z.enum(Object.keys(stats) as [K, ...K[]]).meta({ labels: Object.fromEntries(Object.entries<{ label: string }>(stats).map(([key, stat]) => [key, stat.label])) });

/** The player's basketball season totals, if the world has them. */
export const seasonStatsOf = (world: World, id: PlayerId) => {
  const stats = world.get('playerStats', id)?.stats;
  return stats?.sport === 'basketball' ? stats : undefined;
};

/** The player's line in tonight's game, if there is one. */
export const tonightOf = (context: ShowContext, id: PlayerId) => (context.live?.sport === 'basketball' ? context.live.players[id] : undefined);

/** The other side of the game from `team`, or undefined when `team` is not playing in it. */
export const opponentOf = ({ game, sides }: GameView, team: TeamId): TeamView | undefined =>
  game.awayTeamId === team ? sides.home : game.homeTeamId === team ? sides.away : undefined;
