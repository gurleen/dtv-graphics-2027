/** What several basketball binds read the same way. Each throws a message an operator can act on. */

import { type basketball, type GameView, type Player, type PlayerId, resolveTeam, type Staff, type StaffId, type TeamId, type TeamView, type WinLoss, type World } from '@dtv/domain';
import type { ShowContext } from '@dtv/playout';

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

export const staffOf = (world: World, id: StaffId): { staff: Staff; team: TeamView } => {
  const staff = world.get('staff', id) ?? fail(`Staff ${id} is gone`);
  const team = resolveTeam(world, staff.teamId, staff.seasonId) ?? fail(`Team ${staff.teamId} is gone`);
  return { staff, team };
};

export const fullName = (person: { readonly firstName: string; readonly lastName: string }) => `${person.firstName} ${person.lastName}`.trim();

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

/** The keys of a stat catalogue, as the non-empty tuple `z.enum` takes. */
export const keysOf = <K extends string>(stats: Record<K, unknown>) => Object.keys(stats) as [K, ...K[]];

/** The player's basketball season totals, if the world has them. */
export const seasonStatsOf = (world: World, id: PlayerId) => {
  const stats = world.get('playerStats', id)?.stats;
  return stats?.sport === 'basketball' ? stats : undefined;
};

/** The player's line in tonight's game, if there is one. */
export const tonightOf = (context: ShowContext, id: PlayerId) => (context.live?.sport === 'basketball' ? context.live.players[id] : undefined);
