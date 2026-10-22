/**
 * sportsdataverse's NCAA basketball files as import edits: each team's conference, record,
 * streak, rank and season stats, rosters with season stats, and one school's home games.
 *
 * The files name a team three ways. Groups and the team box carry ESPN ids, which match
 * `School.espnId`; the team ids, rosters and player box carry NCAA ids, and the schedule NCAA
 * names. The team box pairs NCAA and ESPN ids, so it is the join. `ncaa_<g>_rosters` is not
 * read: it has only the team name, `JOSH.REED` and games played, and the team rosters cover it.
 */

import { z } from 'zod';
import { type ImportEdit, importPut } from '../edits';
import { type EntityKind, type Game, Player, type School, Season, Team, TeamSeason } from '../entities';
import { type ConferenceId, idFor, type SchoolId, type SeasonId, slugify, type TeamId, type VenueId } from '../ids';
import type { Revision } from '../primitives';
import type { ProgramCode } from '../programs';
import type { BasketballTeamSeasonStats } from '../sports/basketball';
import type { World } from '../world';
import { parseClass, parsePosition, planRoster, type RosterRow } from './roster';
import { type Result, standings } from './standings';

const id = z.string().min(1);
/** A count; the files leave some cells empty. */
const stat = z.number().nullable().transform((value) => value ?? 0);

/** Each dataset this importer reads, the columns it reads, and where it is published. `<g>` is the program, `<y>` the season's end year. */
export const SDV_DATASETS = {
  groups: {
    path: (g: ProgramCode, y: number) => `${g}_groups/${g}_team_group_seasons_${y}`,
    row: z.object({ team_id: id, team_name: z.string().nullable(), conference_id: z.string().nullable() }),
  },
  teamIds: {
    path: (g: ProgramCode, y: number) => `ncaa_${g}_team_ids/ncaa_${g}_team_ids_${y}`,
    row: z.object({ team: z.string(), id, conference: z.string().nullable() }),
  },
  schedule: {
    path: (g: ProgramCode, y: number) => `ncaa_${g}_schedule/ncaa_${g}_schedule_${y}`,
    row: z.object({
      contest_id: id,
      game_date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
      home: z.string(),
      away: z.string(),
      home_score: z.number().nullable(),
      away_score: z.number().nullable(),
    }),
  },
  teamBox: {
    path: (g: ProgramCode, y: number) => `ncaa_${g}_team_box/ncaa_${g}_team_box_${y}`,
    row: z.object({
      contest_id: id,
      team: z.string(),
      home: z.string(),
      away: z.string(),
      team_ncaa_team_id: id.nullable(),
      team_espn_team_id: id.nullable(),
      home_ncaa_team_id: id.nullable(),
      home_espn_team_id: id.nullable(),
      away_ncaa_team_id: id.nullable(),
      away_espn_team_id: id.nullable(),
      pts: stat, d_pts: stat, fgm: stat, fga: stat, tpm: stat, tpa: stat, ftm: stat, fta: stat, orb: stat, drb: stat, ast: stat, blk: stat, to: stat,
    }),
  },
  teamRosters: {
    path: (g: ProgramCode, y: number) => `ncaa_${g}_team_rosters/ncaa_${g}_team_rosters_${y}`,
    row: z.object({
      player_id: id,
      team_id: id,
      clean_name: z.string(),
      jersey: z.string().nullable(),
      class: z.string().nullable(),
      position: z.string().nullable(),
      hometown: z.string().nullable(),
    }),
  },
  playerBox: {
    path: (g: ProgramCode, y: number) => `ncaa_${g}_player_box/ncaa_${g}_player_box_${y}`,
    row: z.object({
      player_id: id.nullable(),
      team_ncaa_team_id: id.nullable(),
      contest_id: id,
      mins: stat, pts: stat, fgm: stat, fga: stat, tpm: stat, tpa: stat, ftm: stat, fta: stat,
      orb: stat, drb: stat, ast: stat, stl: stat, blk: stat, tov: stat, pf: stat,
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
  readonly code: 'not-published' | 'unmatched-team' | 'unknown-conference' | 'no-jersey' | 'unmatched-opponent';
  readonly message: string;
  /** What it concerns: datasets, teams, conference labels or players, by name. */
  readonly subjects: readonly string[];
}

export interface SdvSummary {
  /** Rows read per dataset; null when not published. */
  readonly rows: { readonly [D in SdvDataset]: number | null };
  readonly teamSeasons: number;
  readonly players: number;
  readonly playerStats: number;
  readonly games: number;
}

/** The school whose home games become Game rows, and the venue they get. */
export interface HomeGames {
  readonly school: SchoolId;
  readonly venue: VenueId;
}

/**
 * Conference labels of both files (`mbb:atlantic-10` with its program stripped, `Atlantic 10`),
 * slugged, to our ids, which are slugs of teams.json's short names. A label not here is its own slug.
 */
const CONFERENCE_ALIASES: Readonly<Record<string, string>> = {
  'atlantic-10': 'a-10',
  'america-east': 'am-east',
  aac: 'american',
  cusa: 'c-usa',
  mwc: 'mountain-west',
  socon: 'southern',
  'summit-league': 'summit',
  'ivy-league': 'ivy',
};

const isoDate = (mdy: string) => `${mdy.slice(6)}-${mdy.slice(0, 2)}-${mdy.slice(3, 5)}`;

/** `-05:00` in winter and `-04:00` in summer: New York's offset at 7 pm on `date`. */
export function newYorkOffset(date: string): string {
  // 23:00 UTC is 18:00 or 19:00 in New York, far from the 2 am switch, so it shares 7 pm's offset.
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T23:00:00Z`))
    .find((part) => part.type === 'timeZoneName')!.value;
  return name.replace('GMT', '');
}

export function sportsdataverseEdits(
  world: World,
  sources: SdvSources,
  options: { readonly program: ProgramCode; readonly season: SeasonId; readonly gamesFor: HomeGames | null },
): { readonly edits: ImportEdit[]; readonly warnings: SdvWarning[]; readonly summary: SdvSummary } {
  const { program, season } = options;
  const subjects = new Map<SdvWarning['code'], Set<string>>();
  const warn = (code: SdvWarning['code'], subject: string) => subjects.set(code, (subjects.get(code) ?? new Set()).add(subject));
  for (const dataset of SDV_DATASET_NAMES) if (!sources[dataset]) warn('not-published', SDV_DATASETS[dataset].path(program, sdvYear(season)));

  const schoolByEspn = new Map(world.all('school').flatMap((school) => (school.espnId ? [[school.espnId, school] as const] : [])));
  const espnByNcaa = new Map<string, string>();
  for (const row of sources.teamBox ?? []) {
    for (const [ncaa, espn] of [
      [row.team_ncaa_team_id, row.team_espn_team_id],
      [row.home_ncaa_team_id, row.home_espn_team_id],
      [row.away_ncaa_team_id, row.away_espn_team_id],
    ]) {
      if (ncaa && espn) espnByNcaa.set(ncaa, espn);
    }
  }
  const ncaaByName = new Map((sources.teamIds ?? []).map((row) => [row.team, row.id]));
  const nameOfNcaa = new Map((sources.teamIds ?? []).map((row) => [row.id, row.team]));
  const ncaaByEspn = new Map([...espnByNcaa].map(([ncaa, espn]) => [espn, ncaa]));
  /** A team the files name but teams.json lacks, by its NCAA name where the files give one, so each is warned about once. */
  const unmatched = (name: string) => warn('unmatched-team', name);
  const schoolOfNcaa = (ncaa: string | null) => {
    const espn = ncaa && espnByNcaa.get(ncaa);
    return espn ? schoolByEspn.get(espn) : undefined;
  };

  // The teams this load writes, with the conference label each file gives.
  const label = new Map<SchoolId, string>();
  const schools = new Map<SchoolId, School>();
  for (const row of sources.groups ?? []) {
    const school = schoolByEspn.get(row.team_id);
    if (!school) {
      unmatched(nameOfNcaa.get(ncaaByEspn.get(row.team_id) ?? '') ?? row.team_name ?? `ESPN team ${row.team_id}`);
      continue;
    }
    schools.set(school.id, school);
    if (row.conference_id) label.set(school.id, row.conference_id.replace(/^[a-z]+:/, ''));
  }
  for (const row of sources.teamIds ?? []) {
    const school = schoolOfNcaa(row.id);
    if (!school) {
      if (sources.teamBox) unmatched(row.team);
      continue;
    }
    schools.set(school.id, school);
    if (row.conference && !label.has(school.id)) label.set(school.id, row.conference);
  }

  const teamOf = (school: SchoolId) => idFor.team(school, program);
  const existing = (school: SchoolId) => world.teamSeason(teamOf(school), season);
  const conferenceOf = new Map<SchoolId, ConferenceId | null>();
  for (const school of schools.keys()) {
    const text = label.get(school);
    const slug = text === undefined ? '' : slugify(text);
    const conference = world.get('conference', (CONFERENCE_ALIASES[slug] ?? slug) as ConferenceId);
    if (text !== undefined && !conference) warn('unknown-conference', text);
    conferenceOf.set(school, conference?.id ?? existing(school)?.conferenceId ?? null);
  }

  const edits: ImportEdit[] = [importPut('season', Season.parse({ id: season, name: season }), 'keep')];
  for (const school of schools.keys()) edits.push(importPut('team', Team.parse({ id: teamOf(school), schoolId: school, program }), 'keep'));

  // Points by team name per contest. The team box is right where the schedule swaps the scores of a game.
  const pointsIn = new Map<string, Map<string, number>>();
  for (const row of sources.teamBox ?? []) {
    const points = pointsIn.get(row.contest_id) ?? new Map<string, number>();
    points.set(row.team, row.pts);
    points.set(row.team === row.home ? row.away : row.home, row.d_pts);
    pointsIn.set(row.contest_id, points);
  }
  const schoolOfName = (name: string) => schoolOfNcaa(ncaaByName.get(name) ?? null);
  const results: Result<SchoolId>[] = (sources.schedule ?? []).flatMap((row) => {
    const points = pointsIn.get(row.contest_id);
    const homePts = points?.get(row.home) ?? row.home_score;
    const awayPts = points?.get(row.away) ?? row.away_score;
    if (homePts === null || awayPts === null) return [];
    const [home, away] = [schoolOfName(row.home)?.id ?? null, schoolOfName(row.away)?.id ?? null];
    return [{ contest: row.contest_id, date: isoDate(row.game_date), home, away, homePts, awayPts }];
  });
  const table = standings({
    results,
    teams: [...schools.keys()],
    conferenceOf: (school) => conferenceOf.get(school) ?? null,
    nameOf: (school) => schools.get(school)?.name ?? school,
    march: `${sdvYear(season)}-03-01`,
  });

  const lines = new Map<SchoolId, SdvRow<'teamBox'>[]>();
  for (const row of sources.teamBox ?? []) {
    const school = (row.team_espn_team_id && schoolByEspn.get(row.team_espn_team_id)) || schoolOfNcaa(row.team_ncaa_team_id);
    if (school) lines.set(school.id, [...(lines.get(school.id) ?? []), row]);
  }
  const teamStats = (rows: readonly SdvRow<'teamBox'>[]): BasketballTeamSeasonStats => {
    const sum = (pick: (row: SdvRow<'teamBox'>) => number) => rows.reduce((total, row) => total + pick(row), 0);
    return {
      sport: 'basketball',
      gp: rows.length,
      totals: {
        min: 0, stl: 0, pf: 0,
        pts: sum((row) => row.pts), fgm: sum((row) => row.fgm), fga: sum((row) => row.fga), tpm: sum((row) => row.tpm), tpa: sum((row) => row.tpa),
        ftm: sum((row) => row.ftm), fta: sum((row) => row.fta), reb: sum((row) => row.orb + row.drb), ast: sum((row) => row.ast),
        blk: sum((row) => row.blk), to: sum((row) => row.to),
      },
      opponentPts: sum((row) => row.d_pts),
    };
  };

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
        ...(sources.teamBox && rows && { stats: teamStats(rows) }),
      }),
    );
  }

  const players = rosterEdits(world, sources, { program, season, schoolOfNcaa, unmatched: (ncaa) => unmatched(nameOfNcaa.get(ncaa) ?? `NCAA team ${ncaa}`), warn });
  edits.push(...players.edits);

  const games = options.gamesFor ? homeGames(world, sources, { ...options, gamesFor: options.gamesFor, schoolOfName, conferenceOf, warn }) : [];
  edits.push(...games.map((game) => importPut('game', game)));

  const warnings: SdvWarning[] = [...subjects].map(([code, set]) => {
    const list = [...set].sort();
    return { code, message: WARNING_TEXT[code](list.length), subjects: list };
  });
  const rows = Object.fromEntries(SDV_DATASET_NAMES.map((dataset) => [dataset, sources[dataset]?.length ?? null])) as SdvSummary['rows'];
  return {
    edits,
    warnings,
    summary: { rows, teamSeasons: schools.size, players: players.players, playerStats: players.playerStats, games: games.length },
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const WARNING_TEXT: { readonly [C in SdvWarning['code']]: (n: number) => string } = {
  'not-published': (n) => `${plural(n, 'dataset is', 'datasets are')} not published for this season yet`,
  'unmatched-team': (n) => `${plural(n, 'team matches', 'teams match')} no school in teams.json; skipped`,
  'unknown-conference': (n) => `${plural(n, 'conference label names', 'conference labels name')} no conference we have; those teams keep theirs`,
  'no-jersey': (n) => `${plural(n, 'player has', 'players have')} no jersey number; skipped`,
  'unmatched-opponent': (n) => `${plural(n, 'home game is', 'home games are')} against a team we have no school for; skipped`,
};

type Warn = (code: SdvWarning['code'], subject: string) => void;

/** Players through `planRoster`, so matching and ids are the roster importer's, and their season totals from the player box. */
function rosterEdits(
  world: World,
  sources: SdvSources,
  context: {
    readonly program: ProgramCode;
    readonly season: SeasonId;
    readonly schoolOfNcaa: (ncaa: string) => School | undefined;
    readonly unmatched: (ncaa: string) => void;
    readonly warn: Warn;
  },
): { readonly edits: ImportEdit[]; readonly players: number; readonly playerStats: number } {
  const rosters = new Map<string, SdvRow<'teamRosters'>[]>();
  for (const row of sources.teamRosters ?? []) rosters.set(row.team_id, [...(rosters.get(row.team_id) ?? []), row]);

  const edits: ImportEdit[] = [];
  const playerOf = new Map<string, Player['id']>();
  let players = 0;
  for (const [ncaa, rows] of rosters) {
    const school = context.schoolOfNcaa(ncaa);
    if (!school) {
      context.unmatched(ncaa);
      continue;
    }
    const team: TeamId = idFor.team(school.id, context.program);
    const roster: RosterRow[] = [];
    for (const row of rows) {
      if (!row.jersey || !/^\d{1,2}$/.test(row.jersey)) {
        context.warn('no-jersey', `${row.clean_name} (${school.name})`);
        continue;
      }
      const [first = '', ...rest] = row.clean_name.trim().split(/\s+/);
      const parsedClass = parseClass(row.class ?? '');
      const position = parsePosition(row.position ?? '');
      roster.push({
        jersey: row.jersey,
        firstName: rest.length ? first : '',
        lastName: rest.length ? rest.join(' ') : first,
        position: typeof position === 'string' ? position : '',
        classYear: typeof parsedClass === 'string' ? null : parsedClass.classYear,
        // The files never mark a redshirt (no `R-` class), so they leave the player's flag alone.
        redshirt: typeof parsedClass !== 'string' && parsedClass.redshirt ? true : null,
        hometown: row.hometown || null,
        headshot: null,
        motionHeadshot: null,
        sourceKey: `ncaa:${row.player_id}`,
      });
    }
    const plan = planRoster(world, { team, season: context.season, rows: roster, prune: false });
    edits.push(...plan.edits);
    players += roster.length;
    for (const player of [...world.roster(team, context.season), ...plan.add, ...plan.update.map((change) => change.after)]) {
      if (player.sourceKey?.startsWith('ncaa:')) playerOf.set(player.sourceKey.slice('ncaa:'.length), player.id);
    }
  }

  // A player's box score appears once per contest; the files repeat one now and then.
  const games = new Map<string, Map<string, SdvRow<'playerBox'>>>();
  for (const row of sources.playerBox ?? []) {
    if (!row.player_id || !playerOf.has(row.player_id)) continue;
    const byContest = games.get(row.player_id) ?? new Map<string, SdvRow<'playerBox'>>();
    if (!byContest.has(row.contest_id)) byContest.set(row.contest_id, row);
    games.set(row.player_id, byContest);
  }
  for (const [ncaa, byContest] of games) {
    const rows = [...byContest.values()];
    const sum = (pick: (row: SdvRow<'playerBox'>) => number) => rows.reduce((total, row) => total + pick(row), 0);
    edits.push(
      importPut('playerStats', {
        id: playerOf.get(ncaa)!,
        stats: {
          sport: 'basketball',
          gp: rows.filter((row) => row.mins > 0).length,
          totals: {
            min: Math.round(sum((row) => row.mins)),
            pts: sum((row) => row.pts), fgm: sum((row) => row.fgm), fga: sum((row) => row.fga), tpm: sum((row) => row.tpm), tpa: sum((row) => row.tpa),
            ftm: sum((row) => row.ftm), fta: sum((row) => row.fta), reb: sum((row) => row.orb + row.drb), ast: sum((row) => row.ast),
            stl: sum((row) => row.stl), blk: sum((row) => row.blk), to: sum((row) => row.tov), pf: sum((row) => row.pf),
          },
        },
      }),
    );
  }
  return { edits, players, playerStats: games.size };
}

/** Each scheduled game at `gamesFor.school`, played or not, at 7 pm New York time on its day. */
function homeGames(
  world: World,
  sources: SdvSources,
  context: {
    readonly program: ProgramCode;
    readonly season: SeasonId;
    readonly gamesFor: HomeGames;
    readonly schoolOfName: (name: string) => School | undefined;
    readonly conferenceOf: ReadonlyMap<SchoolId, ConferenceId | null>;
    readonly warn: Warn;
  },
): Game[] {
  const venue = world.get('venue', context.gamesFor.venue) ? context.gamesFor.venue : null;
  return (sources.schedule ?? []).flatMap((row) => {
    if (context.schoolOfName(row.home)?.id !== context.gamesFor.school) return [];
    const away = context.schoolOfName(row.away);
    if (!away) {
      context.warn('unmatched-opponent', `${row.away}, ${isoDate(row.game_date)}`);
      return [];
    }
    const date = isoDate(row.game_date);
    const [awayTeamId, homeTeamId] = [idFor.team(away.id, context.program), idFor.team(context.gamesFor.school, context.program)];
    const gameId = idFor.game(context.season, date, awayTeamId, homeTeamId);
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
        startsAt: `${date}T19:00:00${newYorkOffset(date)}`,
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
  /** Locked fields the load left alone, per row. */
  readonly skipped: readonly { readonly kind: EntityKind; readonly id: string; readonly fields: readonly string[] }[];
  readonly warnings: readonly SdvWarning[];
  readonly summary: SdvSummary;
  /** Download, plan and commit, in milliseconds. */
  readonly ms: number;
}
