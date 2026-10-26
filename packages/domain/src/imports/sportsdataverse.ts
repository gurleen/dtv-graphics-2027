/**
 * sportsdataverse's ESPN basketball files as import edits: each team's conference, record,
 * streak, rank and season stats, rosters with season stats, and one school's home games.
 *
 * Every file keys a team by its ESPN id, which is `School.espnId`. A Division I team (the
 * groups file) with no school yet gets one, described by the schedule; teams.json stays the
 * curated branding of every school it has. ESPN copies last season's rosters forward before
 * the new ones are out, so a team with no box score yet whose returning players are all still
 * in last season's class is skipped rather than loaded as this season's.
 */

import { z } from 'zod';
import { type ImportEdit, importPut } from '../edits';
import { ClassYear, type EntityKind, type Game, Player, School, Season, Team, TeamSeason } from '../entities';
import { type ConferenceId, idFor, type SchoolId, SeasonId, slugify, type TeamId, type VenueId } from '../ids';
import { type Revision, Url } from '../primitives';
import type { ProgramCode } from '../programs';
import type { BasketballTeamSeasonStats } from '../sports/basketball';
import type { World } from '../world';
import { FALLBACK_PRIMARY, FALLBACK_SECONDARY, toColor } from './espn';
import { parseClass, parsePosition, planRoster, type RosterRow } from './roster';
import { type Result, standings } from './standings';

/** ESPN ids arrive as numbers in some files and strings in others. */
const id = z.union([z.string().min(1), z.number().int()]).transform(String);
/** A count; the files leave some cells empty. */
const stat = z.number().nullable().transform((value) => value ?? 0);
const text = z.string().nullable();

/** The program's name in ESPN's release paths. */
const ESPN_LEAGUE: { readonly [P in ProgramCode]: string } = { mbb: 'mens', wbb: 'womens' };
const espn = (g: ProgramCode, dataset: string) => `espn_${ESPN_LEAGUE[g]}_college_basketball_${dataset}`;

const rosterRow = z.object({
  athlete_id: id,
  team_id: id,
  first_name: z.string(),
  last_name: z.string(),
  jersey: text,
  position_abbreviation: text,
  experience_display_value: text,
  birth_place_city: text,
  birth_place_state: text,
  birth_place_country: text,
});

/** Each dataset this importer reads, the columns it reads, and where it is published. `<g>` is the program, `<y>` the season's end year. */
export const SDV_DATASETS = {
  groups: {
    path: (g: ProgramCode, y: number) => `${g}_groups/${g}_team_group_seasons_${y}`,
    row: z.object({ team_id: id, team_name: text, conference_id: text }),
  },
  schedule: {
    path: (g: ProgramCode, y: number) => `${espn(g, 'schedules')}/${g}_schedule_${y}`,
    row: z.object({
      game_id: id,
      /** UTC, `2026-02-27T00:00Z`; a placeholder at 05:00Z when `time_valid` is false. */
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/),
      time_valid: z.boolean(),
      neutral_site: z.boolean(),
      season_type: z.number(),
      status_type_name: z.string(),
      home_id: id,
      away_id: id,
      home_score: z.number().nullable(),
      away_score: z.number().nullable(),
      home_location: text,
      away_location: text,
      home_name: text,
      away_name: text,
      home_abbreviation: text,
      away_abbreviation: text,
      home_short_display_name: text,
      away_short_display_name: text,
      home_color: text,
      away_color: text,
      home_alternate_color: text,
      away_alternate_color: text,
      home_logo: text,
      away_logo: text,
    }),
  },
  teamBox: {
    path: (g: ProgramCode, y: number) => `${espn(g, 'team_boxscores')}/team_box_${y}`,
    row: z.object({
      game_id: id,
      team_id: id,
      team_score: stat,
      opponent_team_score: stat,
      field_goals_made: stat,
      field_goals_attempted: stat,
      three_point_field_goals_made: stat,
      three_point_field_goals_attempted: stat,
      free_throws_made: stat,
      free_throws_attempted: stat,
      offensive_rebounds: stat,
      defensive_rebounds: stat,
      assists: stat,
      steals: stat,
      blocks: stat,
      turnovers: stat,
      fouls: stat,
    }),
  },
  rosters: {
    path: (g: ProgramCode, y: number) => `${espn(g, 'rosters')}/rosters_${y}`,
    row: rosterRow,
  },
  /** Last season's rosters, to tell this season's from a copy of them. */
  priorRosters: {
    path: (g: ProgramCode, y: number) => `${espn(g, 'rosters')}/rosters_${y - 1}`,
    row: rosterRow.pick({ athlete_id: true, team_id: true, experience_display_value: true }),
  },
  playerBox: {
    path: (g: ProgramCode, y: number) => `${espn(g, 'player_boxscores')}/player_box_${y}`,
    row: z.object({
      athlete_id: id.nullable(),
      athlete_display_name: text,
      athlete_jersey: text,
      team_id: id,
      game_id: id,
      did_not_play: z.boolean(),
      minutes: stat, points: stat, field_goals_made: stat, field_goals_attempted: stat, three_point_field_goals_made: stat,
      three_point_field_goals_attempted: stat, free_throws_made: stat, free_throws_attempted: stat, offensive_rebounds: stat,
      defensive_rebounds: stat, assists: stat, steals: stat, blocks: stat, turnovers: stat, fouls: stat,
    }),
  },
} as const;

export type SdvDataset = keyof typeof SDV_DATASETS;
export const SDV_DATASET_NAMES = Object.keys(SDV_DATASETS) as SdvDataset[];
export type SdvRow<D extends SdvDataset> = z.output<(typeof SDV_DATASETS)[D]['row']>;
/** Each dataset's rows, or null when it is not published for the season. */
export type SdvSources = { readonly [D in SdvDataset]: readonly SdvRow<D>[] | null };

/** `2025-26` is published as `2026`. */
export const sdvYear = (season: SeasonId) => Number(season.slice(0, 4)) + 1;

export interface SdvWarning {
  readonly code:
    | 'not-published' | 'unmatched-team' | 'school-id-taken' | 'unknown-conference' | 'stale-roster' | 'no-jersey' | 'ncaa-player-kept'
    | 'unmatched-opponent';
  readonly message: string;
  /** What it concerns: datasets, teams, conference labels or players, by name. */
  readonly subjects: readonly string[];
}

export interface SdvSummary {
  /** Rows read per dataset; null when not published. */
  readonly rows: { readonly [D in SdvDataset]: number | null };
  readonly teamSeasons: number;
  /** Schools this load adds: Division I teams teams.json lacks. */
  readonly newSchools: number;
  readonly players: number;
  readonly playerStats: number;
  /** Players keyed by the retired NCAA files: matched to an ESPN row and rekeyed, or deleted with their stats. */
  readonly rematched: number;
  readonly removed: number;
  readonly games: number;
}

/** The school whose home games become Game rows, and the venue they get. */
export interface HomeGames {
  readonly school: SchoolId;
  readonly venue: VenueId;
}

/** Group labels (`mbb:atlantic-10`, program stripped) to our ids, which are slugs of teams.json's short names. A label not here is its own id. */
const CONFERENCE_ALIASES: Readonly<Record<string, string>> = {
  'atlantic-10': 'a-10',
  'america-east': 'am-east',
  cusa: 'c-usa',
  socon: 'southern',
};

/** Only a final counts toward a record; a postponed or canceled game is not played on its date. */
const FINAL = 'STATUS_FINAL';
const NOT_ON_DATE = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED']);

const NEW_YORK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

/** An instant as New York's calendar day and its wall time with offset: `2026-02-27T00:00Z` is `2026-02-26`, `2026-02-26T19:00:00-05:00`. */
function newYork(instant: string): { readonly day: string; readonly time: string } {
  const part = Object.fromEntries(NEW_YORK.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  const day = `${part.year}-${part.month}-${part.day}`;
  return { day, time: `${day}T${part.hour}:${part.minute}:${part.second}${part.timeZoneName!.replace('GMT', '')}` };
}

/** A game's New York day, and its start: the real time when ESPN has one, else 7 pm New York time that day. */
function gameTime(row: SdvRow<'schedule'>): { readonly day: string; readonly startsAt: string } {
  const { day, time } = newYork(row.date);
  if (row.time_valid) return { day, startsAt: time };
  // 23:00 UTC is 18:00 or 19:00 in New York, far from the 2 am switch, so it shares 7 pm's offset.
  return { day, startsAt: `${day}T19:00:00${newYork(`${day}T23:00:00Z`).time.slice(-6)}` };
}

type Side = 'home' | 'away';

/** A school made from how the schedule names a team, or null when the schedule leaves out what a school needs. */
function schoolFrom(row: SdvRow<'schedule'>, side: Side): School | null {
  const location = row[`${side}_location` as const];
  if (!location) return null;
  const color = row[`${side}_color` as const];
  const alternate = row[`${side}_alternate_color` as const];
  const parsed = School.safeParse({
    id: idFor.school(location),
    name: location,
    shortName: row[`${side}_short_display_name` as const] || location,
    mascot: row[`${side}_name` as const],
    abbreviation: row[`${side}_abbreviation` as const],
    primaryColor: (color && toColor(color)) ?? FALLBACK_PRIMARY,
    secondaryColor: (alternate && toColor(alternate)) ?? FALLBACK_SECONDARY,
    logo: Url.safeParse(row[`${side}_logo` as const]).data ?? null,
    espnId: row[`${side}_id` as const],
  });
  return parsed.success ? parsed.data : null;
}

const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
};

export function sportsdataverseEdits(
  world: World,
  sources: SdvSources,
  options: {
    readonly program: ProgramCode;
    readonly season: SeasonId;
    readonly gamesFor: HomeGames | null;
    /** Ids a show or a live game holds; a player among them is never deleted. */
    readonly inUse: ReadonlySet<string>;
  },
): { readonly edits: ImportEdit[]; readonly warnings: SdvWarning[]; readonly summary: SdvSummary } {
  const { program, season } = options;
  const subjects = new Map<SdvWarning['code'], Set<string>>();
  const warn: Warn = (code, subject) => subjects.set(code, (subjects.get(code) ?? new Set()).add(subject));
  const unpublished = (dataset: SdvDataset) => warn('not-published', SDV_DATASETS[dataset].path(program, sdvYear(season)));
  // Last season's rosters matter only when the stale guard reads them.
  for (const dataset of SDV_DATASET_NAMES) if (!sources[dataset] && dataset !== 'priorRosters') unpublished(dataset);

  const edits: ImportEdit[] = [importPut('season', Season.parse({ id: season, name: season }), 'keep')];
  const schoolByEspn = new Map(world.all('school').flatMap((school) => (school.espnId ? [[school.espnId, school] as const] : [])));

  // Each Division I team's school, made from the schedule when we have none, and its conference label.
  const described = new Map<string, School | null>();
  for (const row of sources.schedule ?? []) {
    for (const side of ['home', 'away'] as const) if (!described.get(row[`${side}_id`])) described.set(row[`${side}_id`], schoolFrom(row, side));
  }
  const taken = new Set<string>(world.all('school').map((school) => school.id));
  const schools = new Map<SchoolId, School>();
  const label = new Map<SchoolId, string>();
  let newSchools = 0;
  for (const row of sources.groups ?? []) {
    let school = schoolByEspn.get(row.team_id);
    if (!school) {
      const made = described.get(row.team_id);
      if (!made) {
        warn('unmatched-team', row.team_name ?? `ESPN team ${row.team_id}`);
        continue;
      }
      if (taken.has(made.id)) {
        warn('school-id-taken', `${row.team_name ?? made.name} (${made.id})`);
        continue;
      }
      taken.add(made.id);
      schoolByEspn.set(row.team_id, made);
      edits.push(importPut('school', made, 'keep'));
      newSchools++;
      school = made;
    }
    schools.set(school.id, school);
    if (row.conference_id) label.set(school.id, row.conference_id.replace(/^[a-z]+:/, ''));
  }

  const teamOf = (school: SchoolId) => idFor.team(school, program);
  const existing = (school: SchoolId) => world.teamSeason(teamOf(school), season);
  const conferenceOf = new Map<SchoolId, ConferenceId | null>();
  for (const school of schools.keys()) {
    const slug = label.has(school) ? slugify(label.get(school)!) : '';
    const conference = world.get('conference', (CONFERENCE_ALIASES[slug] ?? slug) as ConferenceId);
    if (label.has(school) && !conference) warn('unknown-conference', label.get(school)!);
    conferenceOf.set(school, conference?.id ?? existing(school)?.conferenceId ?? null);
  }
  for (const school of schools.keys()) edits.push(importPut('team', Team.parse({ id: teamOf(school), schoolId: school, program }), 'keep'));

  const results: Result<SchoolId>[] = (sources.schedule ?? []).flatMap((row) => {
    if (row.status_type_name !== FINAL || row.home_score === null || row.away_score === null) return [];
    const [home, away] = [schoolByEspn.get(row.home_id)?.id ?? null, schoolByEspn.get(row.away_id)?.id ?? null];
    return [{ contest: row.game_id, date: gameTime(row).day, home, away, homePts: row.home_score, awayPts: row.away_score }];
  });
  const table = standings({
    results,
    teams: [...schools.keys()],
    conferenceOf: (school) => conferenceOf.get(school) ?? null,
    nameOf: (school) => schools.get(school)?.name ?? school,
    march: `${sdvYear(season)}-03-01`,
  });

  const lines = groupBy(sources.teamBox ?? [], (row) => schoolByEspn.get(row.team_id)?.id ?? '');
  for (const school of schools.keys()) {
    const team = teamOf(school);
    const base = existing(school) ?? TeamSeason.parse({ id: idFor.teamSeason(team, season), teamId: team, seasonId: season });
    const standing = sources.schedule && table.get(school);
    const rows = lines.get(school);
    edits.push(
      importPut('teamSeason', {
        ...base,
        conferenceId: conferenceOf.get(school) ?? null,
        ...(standing && standing),
        ...(rows && { stats: teamStats(rows) }),
      }),
    );
  }

  const players = rosterEdits(world, sources, { program, season, schools, schoolByEspn, inUse: options.inUse, warn });
  if (players.priorNeeded && !sources.priorRosters) unpublished('priorRosters');
  edits.push(...players.edits);

  const games = options.gamesFor ? homeGames(world, sources, { ...options, gamesFor: options.gamesFor, schoolByEspn, conferenceOf, warn }) : [];
  edits.push(...games.map((game) => importPut('game', game)));

  const warnings: SdvWarning[] = [...subjects].map(([code, set]) => {
    const list = [...set].sort();
    return { code, message: WARNING_TEXT[code](list.length), subjects: list };
  });
  const rows = Object.fromEntries(SDV_DATASET_NAMES.map((dataset) => [dataset, sources[dataset]?.length ?? null])) as SdvSummary['rows'];
  return {
    edits,
    warnings,
    summary: {
      rows,
      teamSeasons: schools.size,
      newSchools,
      players: players.players,
      playerStats: players.playerStats,
      rematched: players.rematched,
      removed: players.removed,
      games: games.length,
    },
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const WARNING_TEXT: { readonly [C in SdvWarning['code']]: (n: number) => string } = {
  'not-published': (n) => `${plural(n, 'dataset is', 'datasets are')} not published for this season yet`,
  'unmatched-team': (n) => `${plural(n, 'team has', 'teams have')} no school and no game in the schedule to make one from; skipped`,
  'school-id-taken': (n) => `${plural(n, 'new school', 'new schools')} would take the id of a school we have; skipped`,
  'unknown-conference': (n) => `${plural(n, 'conference label names', 'conference labels name')} no conference we have; those teams keep theirs`,
  'stale-roster': (n) => `${plural(n, "team's roster is", "teams' rosters are")} last season's, copied forward; not loaded`,
  'no-jersey': (n) => `${plural(n, 'player has', 'players have')} no jersey number; skipped`,
  'ncaa-player-kept': (n) =>
    `${plural(n, 'player', 'players')} from the retired NCAA files ${n === 1 ? 'is' : 'are'} on no ESPN roster, but a show, a live game or a person's edit holds ${n === 1 ? 'it' : 'them'}; kept`,
  'unmatched-opponent': (n) => `${plural(n, 'home game is', 'home games are')} against a team we have no school for; skipped`,
};

type Warn = (code: SdvWarning['code'], subject: string) => void;

function teamStats(rows: readonly SdvRow<'teamBox'>[]): BasketballTeamSeasonStats {
  const sum = (pick: (row: SdvRow<'teamBox'>) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    sport: 'basketball',
    gp: rows.length,
    totals: {
      min: 0,
      pts: sum((row) => row.team_score),
      fgm: sum((row) => row.field_goals_made),
      fga: sum((row) => row.field_goals_attempted),
      tpm: sum((row) => row.three_point_field_goals_made),
      tpa: sum((row) => row.three_point_field_goals_attempted),
      ftm: sum((row) => row.free_throws_made),
      fta: sum((row) => row.free_throws_attempted),
      reb: sum((row) => row.offensive_rebounds + row.defensive_rebounds),
      ast: sum((row) => row.assists),
      stl: sum((row) => row.steals),
      blk: sum((row) => row.blocks),
      to: sum((row) => row.turnovers),
      pf: sum((row) => row.fouls),
    },
    opponentPts: sum((row) => row.opponent_team_score),
  };
}

const classOf = (experience: string | null): ClassYear | null => {
  const parsed = parseClass(experience ?? '');
  return typeof parsed === 'string' ? null : parsed.classYear;
};

/** The classes a new season moves a returner out of. ESPN's class stops at Senior. */
const MOVES_UP: ReadonlySet<ClassYear> = new Set(['FR', 'SO', 'JR']);
const rank = (classYear: ClassYear) => ClassYear.options.indexOf(classYear);

/**
 * ESPN's copy of last season's roster: no returner moved up a class, and at least one of them
 * should have. Only a returner with a class on both sides is evidence: a player the World took
 * over from the NCAA files may have no ESPN class, or a higher one than ESPN gives him, so a
 * class that is missing or moved down says nothing about a new roster. A senior stays put in a
 * new season too, so a team whose returners are all seniors or classless is loaded.
 */
const isStale = (rows: readonly SdvRow<'rosters'>[], before: ReadonlyMap<string, ClassYear | null>) => {
  const returners = rows.flatMap((row) => {
    const [now, then] = [classOf(row.experience_display_value), before.get(row.athlete_id)];
    return now && then ? [[now, then] as const] : [];
  });
  return returners.some(([now]) => MOVES_UP.has(now)) && !returners.some(([now, then]) => rank(now) > rank(then));
};

/** `2026-27` is preceded by `2025-26`. */
const seasonBefore = (season: SeasonId) => {
  const start = Number(season.slice(0, 4)) - 1;
  return SeasonId.parse(`${start}-${String((start + 1) % 100).padStart(2, '0')}`);
};

/** The retired stats.ncaa.org loader's player keys. A team-season ESPN describes keeps none. */
const NCAA = 'ncaa:';

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
/** `Philon Jr.` is `philon`, `Guimarães` is `guimaraes`, `Blue-Smith` is `blue`, `smith`. */
const nameTokens = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !SUFFIXES.has(token));

/**
 * The NCAA files spelled some names their own way (`Philon` for ESPN's `Philon Jr.`, `Palomo`
 * for `Palomo Vicente`, `Guimares` for `Guimarães`) and gave some players another jersey, so
 * an NCAA-keyed player of the team-season is the row's player when the two names fold to the
 * same one, or when the jersey is the same and they share the first name or a family name token.
 */
const sameNcaaPlayer = (row: { readonly jersey: string | null; readonly firstName: string; readonly lastName: string }, player: Player) => {
  if (!player.sourceKey?.startsWith(NCAA)) return false;
  const first = nameTokens(row.firstName).join(' ');
  const sameFirst = first !== '' && first === nameTokens(player.firstName).join(' ');
  if (sameFirst && nameTokens(row.lastName).join(' ') === nameTokens(player.lastName).join(' ')) return true;
  const last = new Set(nameTokens(player.lastName));
  return row.jersey === player.jersey && (sameFirst || nameTokens(row.lastName).some((token) => last.has(token)));
};

/** `Lynn, MA`; `Belgrade, Serbia` for a player born outside the US. */
const hometown = (row: SdvRow<'rosters'>) => {
  const where = row.birth_place_state ?? (row.birth_place_country === 'USA' ? null : row.birth_place_country);
  return row.birth_place_city ? [row.birth_place_city, where].filter(Boolean).join(', ') : null;
};

/** Players through `planRoster`, so matching and ids are the roster importer's, and their season totals from the player box. */
function rosterEdits(
  world: World,
  sources: SdvSources,
  context: {
    readonly program: ProgramCode;
    readonly season: SeasonId;
    readonly schools: ReadonlyMap<SchoolId, School>;
    readonly schoolByEspn: ReadonlyMap<string, School>;
    readonly inUse: ReadonlySet<string>;
    readonly warn: Warn;
  },
): {
  readonly edits: ImportEdit[];
  readonly players: number;
  readonly playerStats: number;
  readonly rematched: number;
  readonly removed: number;
  /** Whether the stale guard wanted last season's rosters file. */
  readonly priorNeeded: boolean;
} {
  const boxByTeam = groupBy(sources.playerBox ?? [], (row) => row.team_id);
  const priorFile = groupBy(sources.priorRosters ?? [], (row) => row.team_id);
  const lastSeason = seasonBefore(context.season);
  let priorNeeded = false;
  /**
   * Each athlete's class last season. What an earlier load wrote is the season as ESPN served
   * it then; last season's file is rebuilt from whatever ESPN serves now, so it is read only
   * for a team the World has no ESPN players of last season for. Null when neither says.
   */
  const lastClasses = (team: TeamId, espnTeam: string): ReadonlyMap<string, ClassYear | null> | null => {
    const known = world.roster(team, lastSeason).flatMap((player) => (player.sourceKey?.startsWith('espn:') ? [[player.sourceKey.slice('espn:'.length), player.classYear] as const] : []));
    if (known.length) return new Map(known);
    priorNeeded = true;
    return sources.priorRosters && new Map((priorFile.get(espnTeam) ?? []).map((row) => [row.athlete_id, classOf(row.experience_display_value)]));
  };
  const edits: ImportEdit[] = [];
  /** `<ESPN team id>/<athlete id>` to the player, which is how the player box names one. */
  const playerOf = new Map<string, Player['id']>();
  let [players, rematched, removed] = [0, 0, 0];
  for (const [espnTeam, rows] of groupBy(sources.rosters ?? [], (row) => row.team_id)) {
    const school = context.schoolByEspn.get(espnTeam);
    if (!school || !context.schools.has(school.id)) continue;
    const team: TeamId = idFor.team(school.id, context.program);
    // A team with a box score this season has this season's roster.
    const before = boxByTeam.has(espnTeam) ? null : lastClasses(team, espnTeam);
    if (before && isStale(rows, before)) {
      context.warn('stale-roster', school.name);
      continue;
    }
    const roster: RosterRow[] = [];
    const unnumbered: SdvRow<'rosters'>[] = [];
    for (const row of rows) {
      if (!row.jersey || !/^\d{1,2}$/.test(row.jersey)) {
        context.warn('no-jersey', `${row.first_name} ${row.last_name} (${school.name})`);
        unnumbered.push(row);
        continue;
      }
      const position = parsePosition(row.position_abbreviation ?? '');
      roster.push({
        jersey: row.jersey,
        firstName: row.first_name.trim(),
        lastName: row.last_name.trim(),
        position: typeof position === 'string' ? position : '',
        classYear: classOf(row.experience_display_value),
        // The files never mark a redshirt, so they leave the player's flag alone.
        redshirt: null,
        hometown: hometown(row),
        // Headshots come from the R2 bucket by school, program and jersey; ESPN's photos keep their backgrounds.
        headshot: null,
        motionHeadshot: null,
        sourceKey: `espn:${row.athlete_id}`,
      });
    }
    const plan = planRoster(world, { team, season: context.season, rows: roster, prune: false, lastPass: sameNcaaPlayer });
    edits.push(...plan.edits);
    players += roster.length;
    rematched += plan.update.filter(({ before }) => before.sourceKey?.startsWith(NCAA)).length;
    // ESPN rebuilds a finished season's roster file from the rosters it serves then, so it can
    // leave out a player its box scores show played that season: the box names him instead. A
    // roster row with no jersey names him too, but only by his whole name.
    const keyed = new Set([...roster, ...world.roster(team, context.season)].map((row) => row.sourceKey));
    const boxed = new Map<string, { readonly jersey: string | null; readonly firstName: string; readonly lastName: string }>(
      unnumbered.filter((row) => !keyed.has(`espn:${row.athlete_id}`)).map((row) => [row.athlete_id, { jersey: null, firstName: row.first_name.trim(), lastName: row.last_name.trim() }]),
    );
    for (const line of boxByTeam.get(espnTeam) ?? []) {
      if (!line.athlete_id || keyed.has(`espn:${line.athlete_id}`) || boxed.get(line.athlete_id)?.jersey) continue;
      const [firstName = '', ...last] = (line.athlete_display_name ?? '').trim().split(/\s+/);
      boxed.set(line.athlete_id, { jersey: line.athlete_jersey, firstName, lastName: last.join(' ') });
    }
    for (const player of plan.missing) {
      if (!player.sourceKey?.startsWith(NCAA)) continue;
      const athlete = [...boxed].find(([, named]) => sameNcaaPlayer(named, player))?.[0];
      if (athlete) {
        boxed.delete(athlete);
        edits.push(importPut('player', { ...player, sourceKey: `espn:${athlete}` }));
        playerOf.set(`${espnTeam}/${athlete}`, player.id);
        rematched++;
        continue;
      }
      // Deleting the player takes his stats row too, so a lock on either keeps him.
      if (context.inUse.has(player.id) || world.locks('player', player.id).length || world.locks('playerStats', player.id).length) {
        context.warn('ncaa-player-kept', `${player.firstName} ${player.lastName} (${school.name})`);
        continue;
      }
      edits.push({ op: 'delete', kind: 'player', id: player.id });
      removed++;
    }
    for (const player of [...world.roster(team, context.season), ...plan.add, ...plan.update.map((change) => change.after)]) {
      if (player.sourceKey?.startsWith('espn:')) playerOf.set(`${espnTeam}/${player.sourceKey.slice('espn:'.length)}`, player.id);
    }
  }

  // A player's line appears once per game; the files repeat one now and then.
  const games = new Map<string, Map<string, SdvRow<'playerBox'>>>();
  for (const row of sources.playerBox ?? []) {
    const key = `${row.team_id}/${row.athlete_id}`;
    if (row.did_not_play || !playerOf.has(key)) continue;
    const byGame = games.get(key) ?? new Map<string, SdvRow<'playerBox'>>();
    if (!byGame.has(row.game_id)) byGame.set(row.game_id, row);
    games.set(key, byGame);
  }
  for (const [key, byGame] of games) {
    const rows = [...byGame.values()];
    const sum = (pick: (row: SdvRow<'playerBox'>) => number) => rows.reduce((total, row) => total + pick(row), 0);
    edits.push(
      importPut('playerStats', {
        id: playerOf.get(key)!,
        stats: {
          sport: 'basketball',
          gp: rows.length,
          totals: {
            min: Math.round(sum((row) => row.minutes)),
            pts: sum((row) => row.points),
            fgm: sum((row) => row.field_goals_made),
            fga: sum((row) => row.field_goals_attempted),
            tpm: sum((row) => row.three_point_field_goals_made),
            tpa: sum((row) => row.three_point_field_goals_attempted),
            ftm: sum((row) => row.free_throws_made),
            fta: sum((row) => row.free_throws_attempted),
            reb: sum((row) => row.offensive_rebounds + row.defensive_rebounds),
            ast: sum((row) => row.assists),
            stl: sum((row) => row.steals),
            blk: sum((row) => row.blocks),
            to: sum((row) => row.turnovers),
            pf: sum((row) => row.fouls),
          },
        },
      }),
    );
  }
  return { edits, players, playerStats: games.size, rematched, removed, priorNeeded };
}

/** Each game on `gamesFor.school`'s home floor, played or not. A neutral-site game is not a home game. */
function homeGames(
  world: World,
  sources: SdvSources,
  context: {
    readonly program: ProgramCode;
    readonly season: SeasonId;
    readonly gamesFor: HomeGames;
    readonly schoolByEspn: ReadonlyMap<string, School>;
    readonly conferenceOf: ReadonlyMap<SchoolId, ConferenceId | null>;
    readonly warn: Warn;
  },
): Game[] {
  const host = world.get('school', context.gamesFor.school)?.espnId;
  const venue = world.get('venue', context.gamesFor.venue) ? context.gamesFor.venue : null;
  return (sources.schedule ?? []).flatMap((row) => {
    if (!host || row.home_id !== host || row.neutral_site || NOT_ON_DATE.has(row.status_type_name)) return [];
    const { day, startsAt } = gameTime(row);
    const away = context.schoolByEspn.get(row.away_id);
    if (!away) {
      context.warn('unmatched-opponent', `${row.away_location ?? `ESPN team ${row.away_id}`}, ${day}`);
      return [];
    }
    const [awayTeamId, homeTeamId] = [idFor.team(away.id, context.program), idFor.team(context.gamesFor.school, context.program)];
    const gameId = idFor.game(context.season, day, awayTeamId, homeTeamId);
    const conference = context.conferenceOf.get(away.id);
    return [
      {
        title: null,
        ...world.get('game', gameId),
        id: gameId,
        seasonId: context.season,
        program: context.program,
        awayTeamId,
        homeTeamId,
        venueId: venue,
        startsAt,
        conferenceGame: !!conference && conference === context.conferenceOf.get(context.gamesFor.school),
      },
    ];
  });
}

/** What a load committed, for the data page. */
export interface SdvLoadReport {
  readonly program: ProgramCode;
  readonly season: SeasonId;
  /** The revision after the commit; unchanged when the load wrote nothing. */
  readonly revision: Revision;
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  /** Locked fields the load left alone, per row. */
  readonly skipped: readonly { readonly kind: EntityKind; readonly id: string; readonly fields: readonly string[] }[];
  readonly warnings: readonly SdvWarning[];
  readonly summary: SdvSummary;
  /** Download, plan and commit, in milliseconds. */
  readonly ms: number;
}
