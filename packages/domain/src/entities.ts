/**
 * The data model. These zod schemas are the only definition of each entity: the
 * TypeScript types are inferred from them, the API validates against them, and the
 * SQLite tables are derived from ENTITIES at the bottom (packages/db).
 *
 * Text is stored in natural case ("Josh Reed"). Broadcast capitals are applied once, at
 * projection, because Rive has no case transform. Every top-level field is required or
 * has a default, so a put always carries every field and can clear one.
 */

import { z } from 'zod';
import {
  ConferenceId, CueId, GameId, GraphicId, PlayerId, SchoolId, SeasonId, SponsorId, StaffId,
  TalentId, TeamId, TeamSeasonId, VenueId,
} from './ids';
import { Color, Url, WinLoss } from './primitives';
import { ProgramCode } from './programs';
import { basketball } from './sports';

export const Conference = z.object({
  id: ConferenceId,
  name: z.string().min(1),
  /** `CAA`: the record suffix on the matchup locator (`6-3 CAA`). */
  shortName: z.string().min(1),
  logo: Url.nullable().default(null),
  espnId: z.string().nullable().default(null),
});

export const School = z.object({
  id: SchoolId,
  name: z.string().min(1),
  shortName: z.string().min(1),
  mascot: z.string().min(1),
  /** `DREX`: the scorebug acronym. */
  abbreviation: z.string().min(1).max(5),
  primaryColor: Color,
  secondaryColor: Color,
  logo: Url.nullable().default(null),
  website: z.string().nullable().default(null),
  espnId: z.string().nullable().default(null),
});

/** What one program shows in place of its school's values. Binds read `TeamView.brand`, never the school. */
export const Branding = z.object({
  abbreviation: z.string().min(1).max(5).optional(),
  primaryColor: Color.optional(),
  secondaryColor: Color.optional(),
  logo: Url.optional(),
});

/** One sport program of a school: Drexel men's basketball is `drexel-mbb`. */
export const Team = z.object({
  id: TeamId,
  schoolId: SchoolId,
  program: ProgramCode,
  branding: Branding.default({}),
});

export const Season = z.object({
  id: SeasonId,
  name: z.string().min(1),
});

/** A team in one season: its conference that year, its record, and its standing. */
export const TeamSeason = z.object({
  id: TeamSeasonId,
  teamId: TeamId,
  seasonId: SeasonId,
  conferenceId: ConferenceId.nullable().default(null),
  overall: WinLoss.default({ wins: 0, losses: 0 }),
  conference: WinLoss.default({ wins: 0, losses: 0 }),
  /** `W3`, `L1`. */
  streak: z.string().regex(/^[WL]\d+$/).nullable().default(null),
  /** Place in the conference standings, 1-based; ties are not marked on air. */
  rank: z.number().int().min(1).nullable().default(null),
  stats: z.discriminatedUnion('sport', [basketball.BasketballTeamSeasonStats]).nullable().default(null),
});

export const ClassYear = z.enum(['FR', 'SO', 'JR', 'SR', 'GR']);
export type ClassYear = z.infer<typeof ClassYear>;

/** A roster spot: one person on one team in one season. A returning player is a new row next season. */
export const Player = z.object({
  id: PlayerId,
  teamId: TeamId,
  seasonId: SeasonId,
  /** Empty when the source names only the family name, as the starting five does. */
  firstName: z.string(),
  lastName: z.string().min(1),
  /** A string: `0` and `00` are different jerseys. */
  jersey: z.string().regex(/^\d{1,2}$/),
  /** The program's code (`G`, `F`, `C`, `G/F`); the sport module spells it out. */
  position: z.string().default(''),
  classYear: ClassYear.nullable().default(null),
  redshirt: z.boolean().default(false),
  hometown: z.string().nullable().default(null),
  headshot: Url.nullable().default(null),
  /** MP4, WebM or GIF played over the still on the feature lower thirds. */
  motionHeadshot: Url.nullable().default(null),
  /** The importer's key for this row (a Sidearm roster URL, say), so a re-import updates it. */
  sourceKey: z.string().nullable().default(null),
});

/** One row per player-season (a Player is already one roster spot in one season). */
export const PlayerSeasonStats = z.object({
  id: PlayerId,
  stats: z.discriminatedUnion('sport', [basketball.BasketballPlayerSeasonStats]),
});

export const Staff = z.object({
  id: StaffId,
  teamId: TeamId,
  seasonId: SeasonId,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  title: z.string().min(1),
  /** `11th season`. */
  detail: z.string().default(''),
});

/** Broadcast talent. Not tied to a team; a show's crew picks from them. */
export const Talent = z.object({
  id: TalentId,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.string().min(1),
});

/**
 * Scenes draw a sponsor on dark glass (a white wordmark) or on a white chip (full colour).
 * Each graphic's registry entry names the variant it needs.
 */
export const Sponsor = z.object({
  id: SponsorId,
  name: z.string().min(1),
  logoOnDark: Url.nullable().default(null),
  logoOnLight: Url.nullable().default(null),
});

/** Which sponsor presents a graphic. Keyed by graphic id; a missing row means no sponsor. */
export const Sponsorship = z.object({
  id: GraphicId,
  sponsorId: SponsorId,
});

export const Venue = z.object({
  id: VenueId,
  name: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2),
});

export const Game = z.object({
  id: GameId,
  seasonId: SeasonId,
  program: ProgramCode,
  awayTeamId: TeamId,
  homeTeamId: TeamId,
  venueId: VenueId.nullable().default(null),
  startsAt: z.iso.datetime({ offset: true }),
  conferenceGame: z.boolean().default(false),
  /** The matchup locator lower third's event title, such as `CAA opener`. */
  title: z.string().nullable().default(null),
});

/**
 * A graphic and its parameters. `params` is checked against the graphic's own schema in
 * the registry wherever a cue enters the system; the domain package cannot know it.
 * `overrides` replaces bound scene values by name: the escape hatch for fixing text on air.
 */
export const Cue = z.object({
  id: CueId,
  graphic: GraphicId,
  params: z.record(z.string(), z.unknown()),
  overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  note: z.string().default(''),
});
export type Cue = z.infer<typeof Cue>;

/** A game's broadcast: its crew and the rundown of cues. Its id is the game's id. */
export const Show = z.object({
  id: GameId,
  crew: z.array(z.object({ talentId: TalentId, role: z.string().nullable().default(null) })).default([]),
  rundown: z.array(Cue).default([]),
});

type Fields<S extends z.ZodObject> = keyof z.output<S> & string;

interface EntitySpec<S extends z.ZodObject, Kind extends string> {
  readonly schema: S;
  readonly table: string;
  /**
   * Top-level id fields that reference another kind; each becomes a foreign key. Deleting
   * a referenced row fails unless the reference cascades. SET NULL is not offered: SQLite
   * cannot update the generated column the key lives on.
   */
  readonly refs?: { readonly [F in Fields<S>]?: { readonly to: Kind; readonly cascade?: true } };
  /** Natural keys; each becomes a unique index. */
  readonly unique?: readonly (readonly Fields<S>[])[];
}

type Specs<E> = { [K in keyof E]: E[K] extends { schema: infer S extends z.ZodObject } ? EntitySpec<S, keyof E & string> : never };

/** Checks that every `refs.to` names a kind in the same registry and every key names a field. */
const defineEntities = <const E extends Specs<E>>(entities: E) => entities;

export const ENTITIES = defineEntities({
  conference: { schema: Conference, table: 'conferences', unique: [['espnId']] },
  school: { schema: School, table: 'schools', unique: [['espnId']] },
  team: { schema: Team, table: 'teams', refs: { schoolId: { to: 'school' } }, unique: [['schoolId', 'program']] },
  season: { schema: Season, table: 'seasons' },
  teamSeason: {
    schema: TeamSeason,
    table: 'team_seasons',
    refs: { teamId: { to: 'team', cascade: true }, seasonId: { to: 'season' }, conferenceId: { to: 'conference' } },
    unique: [['teamId', 'seasonId']],
  },
  player: {
    schema: Player,
    table: 'players',
    refs: { teamId: { to: 'team', cascade: true }, seasonId: { to: 'season' } },
    unique: [['teamId', 'seasonId', 'sourceKey']],
  },
  playerStats: { schema: PlayerSeasonStats, table: 'player_stats', refs: { id: { to: 'player', cascade: true } } },
  staff: { schema: Staff, table: 'staff', refs: { teamId: { to: 'team', cascade: true }, seasonId: { to: 'season' } } },
  talent: { schema: Talent, table: 'talent' },
  sponsor: { schema: Sponsor, table: 'sponsors' },
  sponsorship: { schema: Sponsorship, table: 'sponsorships', refs: { sponsorId: { to: 'sponsor', cascade: true } } },
  venue: { schema: Venue, table: 'venues' },
  game: {
    schema: Game,
    table: 'games',
    refs: { seasonId: { to: 'season' }, awayTeamId: { to: 'team' }, homeTeamId: { to: 'team' }, venueId: { to: 'venue' } },
  },
  show: { schema: Show, table: 'shows', refs: { id: { to: 'game', cascade: true } } },
});

export type EntityKind = keyof typeof ENTITIES;
export type EntityOf<K extends EntityKind> = z.output<(typeof ENTITIES)[K]['schema']>;
export type IdOf<K extends EntityKind> = EntityOf<K>['id'];
/** The fields a lock can name: every top-level field but the id. */
export type FieldOf<K extends EntityKind> = Exclude<keyof EntityOf<K> & string, 'id'>;
export const ENTITY_KINDS = Object.keys(ENTITIES) as [EntityKind, ...EntityKind[]];

/** Parses a document of `kind`. The cast is safe: the schema just checked the value. */
export const parseEntity = <K extends EntityKind>(kind: K, doc: unknown): EntityOf<K> =>
  ENTITIES[kind].schema.parse(doc) as EntityOf<K>;

export type Conference = EntityOf<'conference'>;
export type School = EntityOf<'school'>;
export type Branding = z.output<typeof Branding>;
export type Team = EntityOf<'team'>;
export type Season = EntityOf<'season'>;
export type TeamSeason = EntityOf<'teamSeason'>;
export type Player = EntityOf<'player'>;
export type PlayerSeasonStats = EntityOf<'playerStats'>;
export type Staff = EntityOf<'staff'>;
export type Talent = EntityOf<'talent'>;
export type Sponsor = EntityOf<'sponsor'>;
export type Sponsorship = EntityOf<'sponsorship'>;
export type Venue = EntityOf<'venue'>;
export type Game = EntityOf<'game'>;
export type Show = EntityOf<'show'>;
