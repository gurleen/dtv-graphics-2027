/**
 * The whole data set, in memory. It is small (361 schools, a few rosters), so the server
 * holds it all, the projector reads it synchronously, and every client receives it whole.
 * The indexes cover the access paths of the bind functions, so nothing scans.
 */

import {
  type Conference, type EntityKind, type EntityOf, type Game, type IdOf, type Player, type School,
  type Season, type Show, type Sponsor, type Staff, type Team, type TeamSeason, type Venue,
} from './entities';
import type { Lock } from './edits';
import type { ConferenceId, GameId, GraphicId, SeasonId, TeamId } from './ids';
import { type Color, Revision, type Sides, type Url } from './primitives';
import type { ProgramCode } from './programs';

type Entities = { readonly [K in EntityKind]: readonly EntityOf<K>[] };

/** What travels over the wire and what the site bakes into `world.json`. */
export interface WorldSnapshot {
  readonly revision: Revision;
  readonly entities: Entities;
  /** The locks on each row, by kind and id. A row without locks has no entry. */
  readonly locks: { readonly [K in EntityKind]: Readonly<Record<string, readonly Lock[]>> };
}

export interface World {
  readonly revision: Revision;
  readonly snapshot: WorldSnapshot;
  get<K extends EntityKind>(kind: K, id: IdOf<K>): EntityOf<K> | undefined;
  all<K extends EntityKind>(kind: K): readonly EntityOf<K>[];
  /** The names of the fields locked on a row. */
  locked(kind: EntityKind, id: string): readonly string[];
  locks(kind: EntityKind, id: string): readonly Lock[];
  /** Ordered by jersey number. */
  roster(team: TeamId, season: SeasonId): readonly Player[];
  staffOf(team: TeamId, season: SeasonId): readonly Staff[];
  teamSeason(team: TeamId, season: SeasonId): TeamSeason | undefined;
  /** A conference's teams in one season and program, by rank, unranked last. */
  standings(conference: ConferenceId, season: SeasonId, program: ProgramCode): readonly TeamSeason[];
  sponsorFor(graphic: GraphicId): Sponsor | undefined;
}

const none = <T>(): T[] => [];

export const emptySnapshot = (): WorldSnapshot => ({
  revision: Revision.parse(0),
  entities: {
    conference: none(), school: none(), team: none(), season: none(), teamSeason: none(), player: none(),
    playerStats: none(), staff: none(), talent: none(), sponsor: none(), sponsorship: none(), venue: none(),
    game: none(), show: none(),
  },
  locks: {
    conference: {}, school: {}, team: {}, season: {}, teamSeason: {}, player: {}, playerStats: {}, staff: {}, talent: {},
    sponsor: {}, sponsorship: {}, venue: {}, game: {}, show: {},
  },
});

const byId = <K extends EntityKind>(rows: readonly EntityOf<K>[]) => new Map<IdOf<K>, EntityOf<K>>(rows.map((row) => [row.id, row]));

const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
};

const jerseyOrder = (a: Player, b: Player) => Number(a.jersey) - Number(b.jersey) || a.jersey.localeCompare(b.jersey);

export function indexWorld(snapshot: WorldSnapshot): World {
  const { entities } = snapshot;
  const maps: { readonly [K in EntityKind]: ReadonlyMap<IdOf<K>, EntityOf<K>> } = {
    conference: byId<'conference'>(entities.conference),
    school: byId<'school'>(entities.school),
    team: byId<'team'>(entities.team),
    season: byId<'season'>(entities.season),
    teamSeason: byId<'teamSeason'>(entities.teamSeason),
    player: byId<'player'>(entities.player),
    playerStats: byId<'playerStats'>(entities.playerStats),
    staff: byId<'staff'>(entities.staff),
    talent: byId<'talent'>(entities.talent),
    sponsor: byId<'sponsor'>(entities.sponsor),
    sponsorship: byId<'sponsorship'>(entities.sponsorship),
    venue: byId<'venue'>(entities.venue),
    game: byId<'game'>(entities.game),
    show: byId<'show'>(entities.show),
  };
  const teamSeasonKey = (team: string, season: string) => `${team}@${season}`;
  const rosters = groupBy(entities.player, (player) => teamSeasonKey(player.teamId, player.seasonId));
  for (const roster of rosters.values()) roster.sort(jerseyOrder);
  const staff = groupBy(entities.staff, (member) => teamSeasonKey(member.teamId, member.seasonId));
  const teamSeasons = new Map(entities.teamSeason.map((row) => [teamSeasonKey(row.teamId, row.seasonId), row]));
  const standings = groupBy(entities.teamSeason, (row) => {
    const team = maps.team.get(row.teamId);
    return `${row.conferenceId}@${row.seasonId}@${team?.program}`;
  });
  const schoolName = (row: TeamSeason) => {
    const team = maps.team.get(row.teamId);
    return (team && maps.school.get(team.schoolId)?.name) ?? row.teamId;
  };
  for (const rows of standings.values()) {
    rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || schoolName(a).localeCompare(schoolName(b)));
  }

  return {
    revision: snapshot.revision,
    snapshot,
    get: (kind, id) => maps[kind].get(id),
    all: (kind) => entities[kind],
    locked: (kind, id) => (snapshot.locks[kind][id] ?? []).map((lock) => lock.field),
    locks: (kind, id) => snapshot.locks[kind][id] ?? [],
    roster: (team, season) => rosters.get(teamSeasonKey(team, season)) ?? [],
    staffOf: (team, season) => staff.get(teamSeasonKey(team, season)) ?? [],
    teamSeason: (team, season) => teamSeasons.get(teamSeasonKey(team, season)),
    standings: (conference, season, program) => standings.get(`${conference}@${season}@${program}`) ?? [],
    sponsorFor: (graphic) => {
      const sponsorship = maps.sponsorship.get(graphic);
      return sponsorship && maps.sponsor.get(sponsorship.sponsorId);
    },
  };
}

/** A team's abbreviation, colours and logo after its program's branding overrides its school's. */
export interface Brand {
  readonly abbreviation: string;
  readonly primaryColor: Color;
  readonly secondaryColor: Color;
  readonly logo: Url | null;
}

export interface TeamView {
  readonly team: Team;
  readonly school: School;
  readonly season: TeamSeason | undefined;
  readonly conference: Conference | undefined;
  readonly brand: Brand;
}

/** A team with everything its graphics read, for one season. Undefined if the team or its school is missing. */
export function resolveTeam(world: World, teamId: TeamId, seasonId: SeasonId): TeamView | undefined {
  const team = world.get('team', teamId);
  const school = team && world.get('school', team.schoolId);
  if (!team || !school) return undefined;
  const season = world.teamSeason(teamId, seasonId);
  const { branding } = team;
  return {
    team,
    school,
    season,
    conference: season?.conferenceId ? world.get('conference', season.conferenceId) : undefined,
    brand: {
      abbreviation: branding.abbreviation ?? school.abbreviation,
      primaryColor: branding.primaryColor ?? school.primaryColor,
      secondaryColor: branding.secondaryColor ?? school.secondaryColor,
      logo: branding.logo ?? school.logo,
    },
  };
}

/** A game with everything its graphics read, resolved once per projection. */
export interface GameView {
  readonly game: Game;
  readonly program: ProgramCode;
  readonly season: Season;
  readonly venue: Venue | undefined;
  readonly sides: Sides<TeamView>;
}

/** `Saint Joseph's at Drexel`: how a game, and so its show, is named. */
export function matchupLabel(world: World, game: Pick<Game, 'awayTeamId' | 'homeTeamId'>): string {
  const name = (teamId: TeamId) => {
    const team = world.get('team', teamId);
    return (team && world.get('school', team.schoolId)?.shortName) ?? teamId;
  };
  return `${name(game.awayTeamId)} at ${name(game.homeTeamId)}`;
}

/** A game's show. A game with no stored show has an empty crew and rundown; the first edit stores one. */
export const showOf = (world: World, gameId: GameId): Show => world.get('show', gameId) ?? { id: gameId, crew: [], rundown: [] };

/** Undefined if the game, its season, or either team is missing. */
export function resolveGame(world: World, gameId: GameId): GameView | undefined {
  const game = world.get('game', gameId);
  const season = game && world.get('season', game.seasonId);
  if (!game || !season) return undefined;
  const away = resolveTeam(world, game.awayTeamId, game.seasonId);
  const home = resolveTeam(world, game.homeTeamId, game.seasonId);
  if (!away || !home) return undefined;
  return {
    game,
    program: game.program,
    season,
    venue: game.venueId ? world.get('venue', game.venueId) : undefined,
    sides: { away, home },
  };
}
