import { describe, expect, test } from 'bun:test';
import {
  type EntityKind, type ImportEdit, emptySnapshot, indexWorld, mergePut, parseEntity, putValues, SDV_DATASET_NAMES, type SdvRow, type SdvSources,
  SeasonId, sportsdataverseEdits, standings, VenueId, type World, type WorldSnapshot, SchoolId,
} from '../index';

const season = SeasonId.parse('2025-26');
const HOME = { school: SchoolId.parse('drexel'), venue: VenueId.parse('daskalakis-athletic-center') };

const SCHOOLS = [
  ['drexel', 'Drexel', '2182', '100'],
  ['hofstra', 'Hofstra', '2275', '200'],
  ['towson', 'Towson', '119', '300'],
  ['saint-josephs', "Saint Joseph's", '2603', '400'],
  ['pennsylvania', 'Penn', '219', '500'],
] as const;
const ncaaOf = Object.fromEntries(SCHOOLS.map(([, name, , ncaa]) => [name, ncaa]));
const espnOf = Object.fromEntries(SCHOOLS.map(([, name, espn]) => [name, espn]));

const seeded = (): WorldSnapshot => {
  const empty = emptySnapshot();
  const parse = <K extends EntityKind>(kind: K, rows: readonly unknown[]) => rows.map((row) => parseEntity(kind, row));
  return {
    ...empty,
    entities: {
      ...empty.entities,
      conference: parse('conference', [{ id: 'caa', name: 'Coastal Athletic Association', shortName: 'CAA' }, { id: 'a-10', name: 'Atlantic 10', shortName: 'A 10' }]),
      school: parse(
        'school',
        SCHOOLS.map(([id, name, espnId]) => ({ id, name, shortName: name, mascot: 'Mascot', abbreviation: 'ABC', primaryColor: '#000000', secondaryColor: '#ffffff', espnId })),
      ),
      team: parse('team', SCHOOLS.map(([id]) => ({ id: `${id}-mbb`, schoolId: id, program: 'mbb' }))),
      venue: parse('venue', [{ id: 'daskalakis-athletic-center', name: 'Daskalakis Athletic Center', city: 'Philadelphia', state: 'PA' }]),
    },
  };
};

/** The store's commit, in memory: every put merges as an import over a row with no locks. */
function commit(world: World, edits: readonly ImportEdit[]): World {
  const snapshot = world.snapshot;
  const entities = { ...snapshot.entities } as Record<EntityKind, readonly { id: string }[]>;
  for (const edit of edits) {
    if (edit.op !== 'put') continue;
    const rows = new Map(entities[edit.kind].map((row) => [row.id, row]));
    const existing = rows.get(edit.value.id);
    const merge = mergePut({ origin: 'import' }, existing && { doc: existing, locks: [] }, edit);
    if (merge.change !== 'none') rows.set(edit.value.id, parseEntity(edit.kind, merge.row.doc));
    entities[edit.kind] = [...rows.values()];
  }
  return indexWorld({ ...snapshot, entities: entities as WorldSnapshot['entities'] });
}

const unchanged = (world: World, edits: readonly ImportEdit[]) =>
  edits.filter((edit) => {
    if (edit.op !== 'put') return false;
    const existing = world.get(edit.kind, edit.value.id as never);
    return mergePut({ origin: 'import' }, existing && { doc: existing, locks: [] }, edit).change !== 'none';
  });

type Game = readonly [contest: string, date: string, away: string, home: string, awayPts: number | null, homePts: number | null];
/** Game 6's schedule row swaps its score; the team box has Hofstra winning. Game 9 is the conference tournament; game 10 is not played yet. */
const GAMES: readonly Game[] = [
  ['c0', '11/05/2025', 'Penn', "Saint Joseph's", 60, 70],
  ['c1', '11/08/2025', "Saint Joseph's", 'Drexel', 60, 70],
  ['c2', '11/12/2025', 'Widener', 'Drexel', 50, 90],
  ['c3', '01/10/2026', 'Hofstra', 'Drexel', 65, 70],
  ['c4', '01/20/2026', 'Drexel', 'Towson', 60, 62],
  ['c5', '01/25/2026', 'Towson', 'Hofstra', 70, 60],
  ['c6', '02/10/2026', 'Drexel', 'Hofstra', 55, 75],
  ['c7', '02/15/2026', 'Towson', 'Drexel', 60, 68],
  ['c8', '02/20/2026', 'Hofstra', 'Towson', 70, 71],
  ['c9', '03/09/2026', 'Towson', 'Drexel', 64, 60],
  ['c10', '03/12/2026', 'Penn', 'Drexel', null, null],
];

const schedule: SdvRow<'schedule'>[] = GAMES.map(([contest_id, game_date, away, home, away_score, home_score]) =>
  contest_id === 'c6'
    ? { contest_id, game_date, away, home, away_score: home_score, home_score: away_score }
    : { contest_id, game_date, away, home, away_score, home_score },
);

const teamBox: SdvRow<'teamBox'>[] = GAMES.flatMap(([contest_id, , away, home, awayPts, homePts]) => {
  if (awayPts === null || homePts === null) return [];
  const ids = (name: string) => [ncaaOf[name] ?? null, espnOf[name] ?? null] as const;
  const [[homeNcaa, homeEspn], [awayNcaa, awayEspn]] = [ids(home), ids(away)];
  return [
    [home, homePts, awayPts],
    [away, awayPts, homePts],
  ].flatMap(([team, pts, d_pts]) => {
    const [ncaa, espn] = ids(team as string);
    if (!ncaa) return [];
    return [
      {
        contest_id, team: team as string, home, away,
        team_ncaa_team_id: ncaa, team_espn_team_id: espn, home_ncaa_team_id: homeNcaa, home_espn_team_id: homeEspn, away_ncaa_team_id: awayNcaa, away_espn_team_id: awayEspn,
        pts: pts as number, d_pts: d_pts as number, fgm: 1, fga: 1, tpm: 1, tpa: 1, ftm: 1, fta: 1, orb: 2, drb: 3, ast: 1, blk: 1, to: 1,
      },
    ];
  });
});

const line = (contest_id: string, values: readonly number[]): SdvRow<'playerBox'> => {
  const [mins, pts, fgm, fga, tpm, tpa, ftm, fta, orb, drb, ast, stl, blk, tov, pf] = values as number[];
  return { player_id: '9335965', team_ncaa_team_id: '100', contest_id, mins: mins!, pts: pts!, fgm: fgm!, fga: fga!, tpm: tpm!, tpa: tpa!, ftm: ftm!, fta: fta!, orb: orb!, drb: drb!, ast: ast!, stl: stl!, blk: blk!, tov: tov!, pf: pf! };
};

const SOURCES: SdvSources = {
  groups: [
    { team_id: '2182', team_name: 'Drexel Dragons', conference_id: 'mbb:caa' },
    { team_id: '2275', team_name: 'Hofstra Pride', conference_id: 'mbb:caa' },
    { team_id: '119', team_name: 'Towson Tigers', conference_id: 'mbb:caa' },
    { team_id: '2603', team_name: "Saint Joseph's Hawks", conference_id: 'mbb:atlantic-10' },
    { team_id: '219', team_name: 'Pennsylvania Quakers', conference_id: 'mbb:ivy-north' },
    { team_id: '2330', team_name: 'Le Moyne Dolphins', conference_id: 'mbb:nec' },
  ],
  teamIds: [...SCHOOLS.map(([, name, , id]) => ({ team: name, id, conference: 'CAA' })), { team: 'Le Moyne', id: '600', conference: 'NEC' }],
  schedule,
  teamBox,
  priorTeamBox: [],
  teamRosters: [
    { player_id: '9335965', team_id: '100', clean_name: 'Josh Reed', jersey: '5', class: 'So.', position: 'G', hometown: 'Wyndmoor, PA' },
    { player_id: '1', team_id: '100', clean_name: 'Sam Nojersey', jersey: null, class: 'Fr.', position: 'F', hometown: null },
    { player_id: '2', team_id: '600', clean_name: 'Lee Dolphin', jersey: '3', class: '---', position: '', hometown: null },
  ],
  playerBox: [
    line('c1', [30.4, 20, 8, 15, 2, 5, 2, 2, 1, 4, 3, 1, 0, 2, 3]),
    line('c3', [25.2, 10, 4, 9, 0, 1, 2, 4, 0, 6, 5, 2, 1, 1, 2]),
    line('c3', [25.2, 10, 4, 9, 0, 1, 2, 4, 0, 6, 5, 2, 1, 1, 2]),
    line('c4', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  ],
};

const world = indexWorld(seeded());
const plan = sportsdataverseEdits(world, SOURCES, { program: 'mbb', season, gamesFor: HOME });
const teamSeason = (school: string) => putValues(plan.edits, 'teamSeason').find((row) => row.teamId === `${school}-mbb`);

describe('sportsdataverseEdits', () => {
  test('records count every game; the conference record stops at the regular season; streaks and ranks follow', () => {
    const rows = ['drexel', 'hofstra', 'towson', 'saint-josephs', 'pennsylvania'].map((school) => {
      const row = teamSeason(school)!;
      return [school, row.conferenceId, `${row.overall.wins}-${row.overall.losses}`, `${row.conference.wins}-${row.conference.losses}`, row.streak, row.rank];
    });
    expect(rows).toEqual([
      ['drexel', 'caa', '4-3', '2-2', 'L1', 2],
      ['hofstra', 'caa', '1-3', '1-3', 'L1', 3],
      ['towson', 'caa', '4-1', '3-1', 'W2', 1],
      ['saint-josephs', 'a-10', '1-1', '0-0', 'L1', null],
      ['pennsylvania', null, '0-1', '0-0', 'L1', null],
    ]);
  });

  test('team stats sum the team box, opponent points included', () => {
    expect(teamSeason('drexel')!.stats).toEqual({
      sport: 'basketball',
      gp: 7,
      totals: { min: 0, pts: 473, fgm: 7, fga: 7, tpm: 7, tpa: 7, ftm: 7, fta: 7, reb: 35, ast: 7, stl: 0, blk: 7, to: 7, pf: 0 },
      opponentPts: 436,
    });
  });

  test('a roster row becomes a player keyed by its NCAA id, with season totals from the player box', () => {
    expect(putValues(plan.edits, 'player')).toEqual([
      {
        id: 'drexel-mbb@2025-26/reed-josh', teamId: 'drexel-mbb', seasonId: '2025-26', firstName: 'Josh', lastName: 'Reed', jersey: '5', position: 'G',
        classYear: 'SO', redshirt: false, hometown: 'Wyndmoor, PA', headshot: null, motionHeadshot: null, sourceKey: 'ncaa:9335965',
      },
    ] as never);
    expect(putValues(plan.edits, 'playerStats')).toEqual([
      {
        id: 'drexel-mbb@2025-26/reed-josh',
        stats: { sport: 'basketball', gp: 2, totals: { min: 56, pts: 30, fgm: 12, fga: 24, tpm: 2, tpa: 6, ftm: 4, fta: 6, reb: 11, ast: 8, stl: 3, blk: 1, to: 3, pf: 5 } },
      },
    ] as never);
  });

  test("each Drexel home game is a game at 7 pm New York time, in Eastern Standard or Daylight Time", () => {
    expect(putValues(plan.edits, 'game').map((game) => [game.id, game.startsAt, game.venueId, game.conferenceGame])).toEqual([
      ['2025-26/2025-11-08/saint-josephs-mbb.at.drexel-mbb', '2025-11-08T19:00:00-05:00', 'daskalakis-athletic-center', false],
      ['2025-26/2026-01-10/hofstra-mbb.at.drexel-mbb', '2026-01-10T19:00:00-05:00', 'daskalakis-athletic-center', true],
      ['2025-26/2026-02-15/towson-mbb.at.drexel-mbb', '2026-02-15T19:00:00-05:00', 'daskalakis-athletic-center', true],
      ['2025-26/2026-03-09/towson-mbb.at.drexel-mbb', '2026-03-09T19:00:00-04:00', 'daskalakis-athletic-center', true],
      ['2025-26/2026-03-12/pennsylvania-mbb.at.drexel-mbb', '2026-03-12T19:00:00-04:00', 'daskalakis-athletic-center', false],
    ]);
  });

  test("before a season's team box exists, last season's box joins the schedule's names, so home games load", () => {
    const next = SeasonId.parse('2026-27');
    const unpublished = Object.fromEntries(SDV_DATASET_NAMES.map((dataset) => [dataset, null])) as unknown as SdvSources;
    const upcoming = sportsdataverseEdits(
      world,
      {
        ...unpublished,
        teamIds: SCHOOLS.map(([, name, , ncaa]) => ({ team: name, id: `9${ncaa}`, conference: 'CAA' })),
        schedule: [{ contest_id: 'n1', game_date: '11/04/2026', home: 'Drexel', away: 'Hofstra', home_score: null, away_score: null }],
        priorTeamBox: teamBox,
      },
      { program: 'mbb', season: next, gamesFor: HOME },
    );
    expect(putValues(upcoming.edits, 'game').map((game) => [game.id, game.startsAt, game.conferenceGame])).toEqual([
      ['2026-27/2026-11-04/hofstra-mbb.at.drexel-mbb', '2026-11-04T19:00:00-05:00', true],
    ]);
    expect(upcoming.warnings.map((warning) => warning.code)).toEqual(['not-published']);
  });

  test('warnings name what the files hold that we cannot place', () => {
    expect(plan.warnings.map((warning) => [warning.code, warning.subjects])).toEqual([
      ['unmatched-team', ['Le Moyne', 'Le Moyne Dolphins']],
      ['unknown-conference', ['ivy-north']],
      ['no-jersey', ['Sam Nojersey (Drexel)']],
      ['unmatched-opponent', ['Widener, 2025-11-12']],
    ]);
    expect(plan.summary).toEqual({
      rows: { groups: 6, teamIds: 6, schedule: 11, teamBox: 19, priorTeamBox: 0, teamRosters: 3, playerBox: 4 },
      teamSeasons: 5,
      players: 1,
      playerStats: 1,
      games: 5,
    });
  });

  test('a second plan on the committed World changes nothing', () => {
    const after = commit(world, plan.edits);
    expect(after.get('player', 'drexel-mbb@2025-26/reed-josh' as never)?.jersey).toBe('5');
    expect(unchanged(after, sportsdataverseEdits(after, SOURCES, { program: 'mbb', season, gamesFor: HOME }).edits)).toEqual([]);
  });

  test('with only groups published, conferences change and records stay', () => {
    const before = commit(world, plan.edits);
    const groupsOnly = Object.fromEntries(SDV_DATASET_NAMES.map((dataset) => [dataset, null])) as unknown as SdvSources;
    const moved = { ...groupsOnly, groups: [{ team_id: '2182', team_name: 'Drexel Dragons', conference_id: 'mbb:atlantic-10' }] };
    const next = sportsdataverseEdits(before, moved, { program: 'mbb', season, gamesFor: HOME });
    expect(putValues(next.edits, 'teamSeason').map((row) => [row.id, row.conferenceId, row.overall, row.rank])).toEqual([
      ['drexel-mbb@2025-26', 'a-10', { wins: 4, losses: 3 }, 2],
    ]);
    expect(next.warnings).toEqual([
      {
        code: 'not-published',
        message: '6 datasets are not published for this season yet',
        subjects: [
          'ncaa_mbb_player_box/ncaa_mbb_player_box_2026',
          'ncaa_mbb_schedule/ncaa_mbb_schedule_2026',
          'ncaa_mbb_team_box/ncaa_mbb_team_box_2025',
          'ncaa_mbb_team_box/ncaa_mbb_team_box_2026',
          'ncaa_mbb_team_ids/ncaa_mbb_team_ids_2026',
          'ncaa_mbb_team_rosters/ncaa_mbb_team_rosters_2026',
        ],
      },
    ]);
  });
});

describe('standings', () => {
  test('a tie in conference record goes to head-to-head before overall win percentage', () => {
    const result = (contest: string, date: string, away: string, home: string, awayPts: number, homePts: number) => ({ contest, date, away, home, awayPts, homePts });
    const table = standings({
      results: [
        result('1', '2026-01-01', 'b', 'a', 60, 70),
        result('2', '2026-01-02', 'a', 'c', 60, 70),
        result('3', '2026-01-03', 'd', 'b', 60, 70),
        result('4', '2026-01-04', 'd', 'c', 60, 70),
        result('5', '2025-11-10', 'x', 'b', 60, 70),
      ],
      teams: ['a', 'b', 'c', 'd'],
      conferenceOf: (team) => (team === 'x' ? 'other' : 'east'),
      nameOf: (team) => team,
      march: '2026-03-01',
    });
    expect([...table].map(([team, row]) => [team, row.rank, `${row.overall.wins}-${row.overall.losses}`, `${row.conference.wins}-${row.conference.losses}`])).toEqual([
      ['a', 2, '1-1', '1-1'],
      ['b', 3, '2-1', '1-1'],
      ['c', 1, '2-0', '2-0'],
      ['d', 4, '0-2', '0-2'],
    ]);
  });

  test('a tie head-to-head does not settle goes to overall win percentage, then name', () => {
    const result = (contest: string, date: string, away: string, home: string, awayPts: number, homePts: number) => ({ contest, date, away, home, awayPts, homePts });
    const table = standings({
      results: [
        result('1', '2026-01-01', 'b', 'a', 60, 70),
        result('2', '2026-01-08', 'a', 'b', 60, 70),
        result('3', '2026-01-02', 'x', 'c', 60, 70),
        result('4', '2026-01-03', 'c', 'd', 60, 70),
        result('5', '2026-01-09', 'd', 'c', 60, 70),
      ],
      teams: ['a', 'b', 'c', 'd'],
      conferenceOf: (team) => (team === 'x' ? 'other' : 'east'),
      nameOf: (team) => team,
      march: '2026-03-01',
    });
    expect([...table].map(([team, row]) => [team, row.rank, `${row.overall.wins}-${row.overall.losses}`, `${row.conference.wins}-${row.conference.losses}`])).toEqual([
      ['a', 2, '1-1', '1-1'],
      ['b', 3, '1-1', '1-1'],
      ['c', 1, '2-1', '1-1'],
      ['d', 4, '1-1', '1-1'],
    ]);
  });
});
