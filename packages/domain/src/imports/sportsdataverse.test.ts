import { describe, expect, test } from 'bun:test';
import {
  type EntityKind, type ImportEdit, emptySnapshot, indexWorld, mergePut, parseEntity, putValues, SDV_DATASET_NAMES, type SdvRow, type SdvSources,
  SeasonId, sportsdataverseEdits, standings, VenueId, type World, type WorldSnapshot, SchoolId,
} from '../index';

const season = SeasonId.parse('2025-26');
const HOME = { school: SchoolId.parse('drexel'), venue: VenueId.parse('daskalakis-athletic-center') };
const OPTIONS = { program: 'mbb', season, gamesFor: HOME, inUse: new Set<string>() } as const;

/** Our schools, with their ESPN ids. */
const SCHOOLS = [
  ['drexel', 'Drexel', '2182'],
  ['hofstra', 'Hofstra', '2275'],
  ['towson', 'Towson', '119'],
  ['saint-josephs', "Saint Joseph's", '2603'],
  ['pennsylvania', 'Penn', '219'],
] as const;

/** How the schedule names each team: ESPN id, location, mascot, abbreviation, short name, colours, logo. */
const ESPN_TEAMS = {
  Drexel: ['2182', 'Drexel', 'Dragons', 'DREX', 'Drexel', '07294d', 'ffc600'],
  Hofstra: ['2275', 'Hofstra', 'Pride', 'HOF', 'Hofstra', '00337f', 'ffd100'],
  Towson: ['119', 'Towson', 'Tigers', 'TOW', 'Towson', 'ffc72c', '000000'],
  "Saint Joseph's": ['2603', "Saint Joseph's", 'Hawks', 'JOES', "Saint Joe's", '9e1b32', '6c6f70'],
  Penn: ['219', 'Pennsylvania', 'Quakers', 'PENN', 'Penn', '082a74', 'a6163d'],
  'Le Moyne': ['2330', 'Le Moyne', 'Dolphins', 'LEM', 'Le Moyne', null, null],
  Widener: ['9001', 'Widener', 'Pride', 'WID', 'Widener', '003366', 'ffcc00'],
} as const;
type Name = keyof typeof ESPN_TEAMS;

const seeded = (): WorldSnapshot => {
  const empty = emptySnapshot();
  const parse = <K extends EntityKind>(kind: K, rows: readonly unknown[]) => rows.map((row) => parseEntity(kind, row));
  return {
    ...empty,
    entities: {
      ...empty.entities,
      conference: parse('conference', [
        { id: 'caa', name: 'Coastal Athletic Association', shortName: 'CAA' },
        { id: 'a-10', name: 'Atlantic 10', shortName: 'A 10' },
        { id: 'nec', name: 'Northeast Conference', shortName: 'NEC' },
      ]),
      school: parse(
        'school',
        SCHOOLS.map(([id, name, espnId]) => ({ id, name, shortName: name, mascot: 'Mascot', abbreviation: 'ABC', primaryColor: '#000000', secondaryColor: '#ffffff', espnId })),
      ),
      team: parse('team', SCHOOLS.map(([id]) => ({ id: `${id}-mbb`, schoolId: id, program: 'mbb' }))),
      venue: parse('venue', [{ id: 'daskalakis-athletic-center', name: 'Daskalakis Athletic Center', city: 'Philadelphia', state: 'PA' }]),
    },
  };
};

/** The store's commit, in memory: every put merges as an import over a row with no locks; a player's delete takes his stats. */
function commit(world: World, edits: readonly ImportEdit[]): World {
  const snapshot = world.snapshot;
  const entities = { ...snapshot.entities } as Record<EntityKind, readonly { id: string }[]>;
  for (const edit of edits) {
    if (edit.op === 'delete') {
      for (const kind of edit.kind === 'player' ? (['player', 'playerStats'] as const) : [edit.kind]) entities[kind] = entities[kind].filter((row) => row.id !== edit.id);
      continue;
    }
    const rows = new Map(entities[edit.kind].map((row) => [row.id, row]));
    const existing = rows.get(edit.value.id);
    const merge = mergePut({ origin: 'import' }, existing && { doc: existing, locks: [] }, edit);
    if (merge.change !== 'none') rows.set(edit.value.id, parseEntity(edit.kind, merge.row.doc));
    entities[edit.kind] = [...rows.values()];
  }
  return indexWorld({ ...snapshot, entities: entities as WorldSnapshot['entities'] });
}

const changing = (world: World, edits: readonly ImportEdit[]) =>
  edits.filter((edit) => {
    if (edit.op !== 'put') return true;
    const existing = world.get(edit.kind, edit.value.id as never);
    return mergePut({ origin: 'import' }, existing && { doc: existing, locks: [] }, edit).change !== 'none';
  });

const unpublished = Object.fromEntries(SDV_DATASET_NAMES.map((dataset) => [dataset, null])) as unknown as SdvSources;

const side = (prefix: 'home' | 'away', name: Name) => {
  const [id, location, mascot, abbreviation, short, color, alternate] = ESPN_TEAMS[name];
  return {
    [`${prefix}_id`]: id, [`${prefix}_location`]: location, [`${prefix}_name`]: mascot, [`${prefix}_abbreviation`]: abbreviation,
    [`${prefix}_short_display_name`]: short, [`${prefix}_color`]: color, [`${prefix}_alternate_color`]: alternate,
    [`${prefix}_logo`]: `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`,
  };
};

type Game = readonly [game: string, date: string, away: Name, home: Name, awayPts: number, homePts: number, more?: Partial<SdvRow<'schedule'>>];
/**
 * `date` is ESPN's UTC instant. Game 9 is the conference tournament, on a neutral floor;
 * game 10 has no time yet; game 11 was postponed.
 */
const GAMES: readonly Game[] = [
  ['c0', '2025-11-06T00:00Z', 'Penn', "Saint Joseph's", 60, 70],
  ['c1', '2025-11-09T00:00Z', "Saint Joseph's", 'Drexel', 60, 70],
  ['c2', '2025-11-12T23:00Z', 'Widener', 'Drexel', 50, 90],
  ['c12', '2025-11-15T00:00Z', 'Le Moyne', 'Penn', 55, 80],
  ['c3', '2026-01-10T19:00Z', 'Hofstra', 'Drexel', 65, 70],
  ['c4', '2026-01-21T00:00Z', 'Drexel', 'Towson', 60, 62],
  ['c5', '2026-01-25T19:00Z', 'Towson', 'Hofstra', 70, 60],
  ['c11', '2026-02-01T00:00Z', 'Hofstra', 'Drexel', 0, 0, { status_type_name: 'STATUS_POSTPONED' }],
  ['c6', '2026-02-10T23:00Z', 'Drexel', 'Hofstra', 55, 75],
  ['c7', '2026-02-15T19:00Z', 'Towson', 'Drexel', 60, 68],
  ['c8', '2026-02-20T23:00Z', 'Hofstra', 'Towson', 70, 71],
  ['c9', '2026-03-09T23:30Z', 'Towson', 'Drexel', 64, 60, { neutral_site: true }],
  ['c10', '2026-03-12T05:00Z', 'Penn', 'Drexel', 0, 0, { time_valid: false, status_type_name: 'STATUS_SCHEDULED' }],
];

const schedule = GAMES.map(
  ([game_id, date, away, home, away_score, home_score, more]) =>
    ({
      game_id, date, time_valid: true, neutral_site: false, season_type: 2, status_type_name: 'STATUS_FINAL', home_score, away_score,
      ...side('home', home), ...side('away', away), ...more,
    }) as SdvRow<'schedule'>,
);

const teamBox: SdvRow<'teamBox'>[] = GAMES.flatMap(([game_id, , away, home, awayPts, homePts, more]) => {
  if (more?.status_type_name) return [];
  return [
    [home, homePts, awayPts],
    [away, awayPts, homePts],
  ].map(([team, team_score, opponent_team_score]) => ({
    game_id, team_id: ESPN_TEAMS[team as Name][0], team_score: team_score as number, opponent_team_score: opponent_team_score as number,
    field_goals_made: 1, field_goals_attempted: 1, three_point_field_goals_made: 1, three_point_field_goals_attempted: 1, free_throws_made: 1,
    free_throws_attempted: 1, offensive_rebounds: 2, defensive_rebounds: 3, assists: 1, steals: 1, blocks: 1, turnovers: 1, fouls: 1,
  }));
});

const athlete = (athlete_id: string, team_id: string, first_name: string, last_name: string, jersey: string | null, experience: string): SdvRow<'rosters'> => ({
  athlete_id, team_id, first_name, last_name, jersey, position_abbreviation: 'G', experience_display_value: experience,
  birth_place_city: 'Wyndmoor', birth_place_state: 'PA', birth_place_country: 'USA',
  headshot_href: `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${athlete_id}.png`,
});

const line = (game_id: string, values: readonly number[], did_not_play = false): SdvRow<'playerBox'> => {
  const [minutes, points, fgm, fga, tpm, tpa, ftm, fta, orb, drb, ast, stl, blk, tov, pf] = values as number[];
  return {
    athlete_id: '5239623', athlete_display_name: 'Josh Reed', athlete_jersey: '5', team_id: '2182', game_id, did_not_play, minutes: minutes!, points: points!, field_goals_made: fgm!, field_goals_attempted: fga!,
    three_point_field_goals_made: tpm!, three_point_field_goals_attempted: tpa!, free_throws_made: ftm!, free_throws_attempted: fta!,
    offensive_rebounds: orb!, defensive_rebounds: drb!, assists: ast!, steals: stl!, blocks: blk!, turnovers: tov!, fouls: pf!,
  };
};

const SOURCES: SdvSources = {
  groups: [
    { team_id: '2182', team_name: 'Drexel Dragons', conference_id: 'mbb:caa' },
    { team_id: '2275', team_name: 'Hofstra Pride', conference_id: 'mbb:caa' },
    { team_id: '119', team_name: 'Towson Tigers', conference_id: 'mbb:caa' },
    { team_id: '2603', team_name: "Saint Joseph's Hawks", conference_id: 'mbb:atlantic-10' },
    { team_id: '219', team_name: 'Pennsylvania Quakers', conference_id: 'mbb:ivy-north' },
    { team_id: '2330', team_name: 'Le Moyne Dolphins', conference_id: 'mbb:nec' },
    { team_id: '2385', team_name: 'Mercyhurst Lakers', conference_id: 'mbb:nec' },
  ],
  schedule,
  teamBox,
  rosters: [
    athlete('5239623', '2182', 'Josh', 'Reed', '5', 'Sophomore'),
    athlete('1', '2182', 'Sam', 'Nojersey', null, 'Freshman'),
    athlete('2', '9001', 'Lee', 'Widener', '3', 'Junior'),
  ],
  // Last season's file now holds this season's roster; with box scores published it is not compared.
  priorRosters: [{ athlete_id: '5239623', team_id: '2182', experience_display_value: 'Sophomore' }],
  playerBox: [
    line('c1', [30.4, 20, 8, 15, 2, 5, 2, 2, 1, 4, 3, 1, 0, 2, 3]),
    line('c3', [25.2, 10, 4, 9, 0, 1, 2, 4, 0, 6, 5, 2, 1, 1, 2]),
    line('c3', [25.2, 10, 4, 9, 0, 1, 2, 4, 0, 6, 5, 2, 1, 1, 2]),
    line('c4', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], true),
  ],
};

const world = indexWorld(seeded());
const plan = sportsdataverseEdits(world, SOURCES, OPTIONS);
const teamSeason = (school: string) => putValues(plan.edits, 'teamSeason').find((row) => row.teamId === `${school}-mbb`);

describe('sportsdataverseEdits', () => {
  test('records count every final; the conference record stops at the regular season; streaks and ranks follow', () => {
    const rows = ['drexel', 'hofstra', 'towson', 'saint-josephs', 'pennsylvania', 'le-moyne'].map((school) => {
      const row = teamSeason(school)!;
      return [school, row.conferenceId, `${row.overall.wins}-${row.overall.losses}`, `${row.conference.wins}-${row.conference.losses}`, row.streak, row.rank];
    });
    expect(rows).toEqual([
      ['drexel', 'caa', '4-3', '2-2', 'L1', 2],
      ['hofstra', 'caa', '1-3', '1-3', 'L1', 3],
      ['towson', 'caa', '4-1', '3-1', 'W2', 1],
      ['saint-josephs', 'a-10', '1-1', '0-0', 'L1', null],
      ['pennsylvania', null, '1-1', '0-0', 'W1', null],
      ['le-moyne', 'nec', '0-1', '0-0', 'L1', null],
    ]);
  });

  test('team stats sum the team box, opponent points included', () => {
    expect(teamSeason('drexel')!.stats).toEqual({
      sport: 'basketball',
      gp: 7,
      totals: { min: 0, pts: 473, fgm: 7, fga: 7, tpm: 7, tpa: 7, ftm: 7, fta: 7, reb: 35, ast: 7, stl: 7, blk: 7, to: 7, pf: 7 },
      opponentPts: 436,
    });
  });

  test('a roster row becomes a player keyed by its ESPN id, with season totals from the games he played', () => {
    expect(putValues(plan.edits, 'player')).toEqual([
      {
        id: 'drexel-mbb@2025-26/reed-josh', teamId: 'drexel-mbb', seasonId: '2025-26', firstName: 'Josh', lastName: 'Reed', jersey: '5', position: 'G',
        classYear: 'SO', redshirt: false, hometown: 'Wyndmoor, PA',
        headshot: 'https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/5239623.png', motionHeadshot: null, sourceKey: 'espn:5239623',
      },
    ] as never);
    expect(putValues(plan.edits, 'playerStats')).toEqual([
      {
        id: 'drexel-mbb@2025-26/reed-josh',
        stats: { sport: 'basketball', gp: 2, totals: { min: 56, pts: 30, fgm: 12, fga: 24, tpm: 2, tpa: 6, ftm: 4, fta: 6, reb: 11, ast: 8, stl: 3, blk: 1, to: 3, pf: 5 } },
      },
    ] as never);
  });

  test("each Drexel home game starts at its New York time on its New York day, or 7 pm when ESPN has no time; neutral and postponed games are not home games", () => {
    expect(putValues(plan.edits, 'game').map((game) => [game.id, game.startsAt, game.venueId, game.conferenceGame])).toEqual([
      ['2025-26/2025-11-08/saint-josephs-mbb.at.drexel-mbb', '2025-11-08T19:00:00-05:00', 'daskalakis-athletic-center', false],
      ['2025-26/2026-01-10/hofstra-mbb.at.drexel-mbb', '2026-01-10T14:00:00-05:00', 'daskalakis-athletic-center', true],
      ['2025-26/2026-02-15/towson-mbb.at.drexel-mbb', '2026-02-15T14:00:00-05:00', 'daskalakis-athletic-center', true],
      ['2025-26/2026-03-12/pennsylvania-mbb.at.drexel-mbb', '2026-03-12T19:00:00-04:00', 'daskalakis-athletic-center', false],
    ]);
  });

  test('a Division I team with no school gets one from the schedule, kept if it exists; a school we have is not written', () => {
    const schools = plan.edits.filter((edit) => edit.op === 'put' && edit.kind === 'school');
    expect(schools).toEqual([
      {
        op: 'put',
        kind: 'school',
        onExisting: 'keep',
        value: {
          id: 'le-moyne', name: 'Le Moyne', shortName: 'Le Moyne', mascot: 'Dolphins', abbreviation: 'LEM', primaryColor: '#333333', secondaryColor: '#ffffff',
          logo: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2330.png', website: null, espnId: '2330',
        },
      },
    ] as never);
    const curated = commit(world, [{ op: 'put', kind: 'school', value: parseEntity('school', { ...schools[0]!.value, name: 'Le Moyne College', primaryColor: '#00573f' }) }]);
    const after = commit(curated, sportsdataverseEdits(curated, SOURCES, OPTIONS).edits);
    expect([after.get('school', 'le-moyne' as never)?.name, after.get('school', 'le-moyne' as never)?.primaryColor]).toEqual(['Le Moyne College', '#00573f']);
    expect(after.get('school', 'drexel' as never)).toEqual(world.get('school', 'drexel' as never));
  });

  test('warnings name what the files hold that we cannot place', () => {
    expect(plan.warnings.map((warning) => [warning.code, warning.message, warning.subjects])).toEqual([
      ['unmatched-team', '1 team has no school and no game in the schedule to make one from; skipped', ['Mercyhurst Lakers']],
      ['unknown-conference', '1 conference label names no conference we have; those teams keep theirs', ['ivy-north']],
      ['no-jersey', '1 player has no jersey number; skipped', ['Sam Nojersey (Drexel)']],
      ['unmatched-opponent', '1 home game is against a team we have no school for; skipped', ['Widener, 2025-11-12']],
    ]);
    expect(plan.summary).toEqual({
      rows: { groups: 7, schedule: 13, teamBox: 22, rosters: 3, priorRosters: 1, playerBox: 4 },
      teamSeasons: 6,
      newSchools: 1,
      players: 1,
      playerStats: 1,
      rematched: 0,
      removed: 0,
      games: 4,
    });
  });

  test('a new school whose id another school has is warned about, not written', () => {
    const imposter = { ...SOURCES, groups: [{ team_id: '7777', team_name: 'Drexel Imposters', conference_id: 'mbb:caa' }] };
    const imposterGame = { ...schedule[1]!, game_id: 'x1', away_id: '7777', away_location: 'Drexel' };
    const next = sportsdataverseEdits(world, { ...imposter, schedule: [imposterGame] }, { ...OPTIONS, gamesFor: null });
    expect(putValues(next.edits, 'school')).toEqual([]);
    expect(next.warnings.find((warning) => warning.code === 'school-id-taken')?.subjects).toEqual(['Drexel Imposters (drexel)']);
  });

  test('a second plan on the committed World changes nothing', () => {
    const after = commit(world, plan.edits);
    expect(after.get('player', 'drexel-mbb@2025-26/reed-josh' as never)?.jersey).toBe('5');
    expect(changing(after, sportsdataverseEdits(after, SOURCES, OPTIONS).edits)).toEqual([]);
  });

  test("NCAA-keyed players take their ESPN row's key under the names ESPN spells differently; the rest go with their stats unless something holds them", () => {
    const player = (slug: string, firstName: string, lastName: string, jersey: string, sourceKey: string | null) =>
      ({ op: 'put', kind: 'player', value: parseEntity('player', { id: `drexel-mbb@2025-26/${slug}`, teamId: 'drexel-mbb', seasonId: '2025-26', firstName, lastName, jersey, sourceKey }) }) as const;
    const stats = (slug: string) =>
      ({ op: 'put', kind: 'playerStats', value: parseEntity('playerStats', { id: `drexel-mbb@2025-26/${slug}`, stats: { sport: 'basketball', gp: 3, totals: { pts: 30 } } }) }) as const;
    const ncaa = commit(world, [
      player('reed-josh', 'Josh', 'Reed', '5', 'ncaa:9335965'),
      player('philon-labaron', 'Labaron', 'Philon', '0', 'ncaa:9333106'),
      stats('philon-labaron'),
      player('guimares-gustavo', 'Gustavo', 'Guimares', '11', 'ncaa:2'),
      player('gone-old', 'Old', 'Gone', '0', 'ncaa:3'),
      stats('gone-old'),
      player('baker-amaris', 'Amaris', 'Baker', '4', 'ncaa:4'),
      player('walk-on', 'Walk', 'On', '40', null),
    ]);
    const sources = {
      ...SOURCES,
      rosters: [
        ...SOURCES.rosters!,
        athlete('4873090', '2182', 'Labaron', 'Philon Jr.', '0', 'Sophomore'),
        athlete('77', '2182', 'Gustavo', 'Guimarães', '11', 'Junior'),
      ],
    };
    const next = sportsdataverseEdits(ncaa, sources, { ...OPTIONS, inUse: new Set(['drexel-mbb@2025-26/baker-amaris']) });
    const after = commit(ncaa, next.edits);
    expect(after.all('player').map((row) => [row.id, row.lastName, row.sourceKey])).toEqual([
      ['drexel-mbb@2025-26/reed-josh', 'Reed', 'espn:5239623'],
      ['drexel-mbb@2025-26/philon-labaron', 'Philon Jr.', 'espn:4873090'],
      ['drexel-mbb@2025-26/guimares-gustavo', 'Guimarães', 'espn:77'],
      ['drexel-mbb@2025-26/baker-amaris', 'Baker', 'ncaa:4'],
      ['drexel-mbb@2025-26/walk-on', 'On', null],
    ]);
    expect(after.all('playerStats').map((row) => [row.id, row.stats.gp])).toEqual([
      ['drexel-mbb@2025-26/philon-labaron', 3],
      ['drexel-mbb@2025-26/reed-josh', 2],
    ]);
    expect([next.summary.rematched, next.summary.removed]).toEqual([3, 1]);
    expect(next.warnings.find((warning) => warning.code === 'ncaa-player-kept')).toEqual({
      code: 'ncaa-player-kept',
      message: "1 player from the retired NCAA files is on no ESPN roster, but a show, a live game or a person's edit holds it; kept",
      subjects: ['Amaris Baker (Drexel)'],
    });
    const again = sportsdataverseEdits(after, sources, { ...OPTIONS, inUse: new Set(['drexel-mbb@2025-26/baker-amaris']) });
    expect([changing(after, again.edits), again.summary.rematched, again.summary.removed]).toEqual([[], 0, 0]);
  });

  test('an NCAA-keyed player ESPN lacks is kept while a person has locked a field of his stats', () => {
    const id = 'drexel-mbb@2025-26/gone-old';
    const ncaa = commit(world, [
      { op: 'put', kind: 'player', value: parseEntity('player', { id, teamId: 'drexel-mbb', seasonId: '2025-26', firstName: 'Old', lastName: 'Gone', jersey: '0', sourceKey: 'ncaa:3' }) },
      { op: 'put', kind: 'playerStats', value: parseEntity('playerStats', { id, stats: { sport: 'basketball', gp: 3, totals: { pts: 31 } } }) },
    ]).snapshot;
    const locked = indexWorld({ ...ncaa, locks: { ...ncaa.locks, playerStats: { [id]: [{ field: 'stats', actor: 'alex', at: null }] } } });
    const next = sportsdataverseEdits(locked, SOURCES, OPTIONS);
    expect(next.edits.filter((edit) => edit.op === 'delete')).toEqual([]);
    expect([next.summary.removed, next.warnings.find((warning) => warning.code === 'ncaa-player-kept')?.subjects]).toEqual([0, ['Old Gone (Drexel)']]);
  });

  test("an NCAA-keyed player missing from ESPN's roster file but in its player box takes the box's key and stats", () => {
    const ncaa = commit(world, [
      { op: 'put', kind: 'player', value: parseEntity('player', { id: 'drexel-mbb@2025-26/spearman-zee', teamId: 'drexel-mbb', seasonId: '2025-26', firstName: 'Zee', lastName: 'Spearman', jersey: '11', sourceKey: 'ncaa:7' }) },
    ]);
    const boxOnly = { ...line('c1', [20, 8, 3, 6, 0, 1, 2, 2, 1, 2, 1, 0, 0, 1, 2]), athlete_id: '88', athlete_display_name: 'Lazaria Spearman', athlete_jersey: '11' };
    const next = sportsdataverseEdits(ncaa, { ...SOURCES, playerBox: [...SOURCES.playerBox!, boxOnly] }, OPTIONS);
    const after = commit(ncaa, next.edits);
    expect(after.get('player', 'drexel-mbb@2025-26/spearman-zee' as never)?.sourceKey).toBe('espn:88');
    expect(after.get('playerStats', 'drexel-mbb@2025-26/spearman-zee' as never)?.stats).toEqual({
      sport: 'basketball',
      gp: 1,
      totals: { min: 20, pts: 8, fgm: 3, fga: 6, tpm: 0, tpa: 1, ftm: 2, fta: 2, reb: 3, ast: 1, stl: 0, blk: 0, to: 1, pf: 2 },
    });
    expect([next.summary.rematched, next.summary.removed]).toEqual([1, 0]);
  });

  test("an NCAA-keyed player whose whole name is a jersey-less row of ESPN's roster takes that row's key and keeps his jersey", () => {
    const put = (slug: string, firstName: string, jersey: string, sourceKey: string) =>
      ({ op: 'put', kind: 'player', value: parseEntity('player', { id: `drexel-mbb@2025-26/${slug}`, teamId: 'drexel-mbb', seasonId: '2025-26', firstName, lastName: 'Nojersey', jersey, sourceKey }) }) as const;
    // ESPN's Sam Nojersey has no jersey; Pat shares only his family name, so he is not ESPN's row.
    const ncaa = commit(world, [put('nojersey-sam', 'Sam', '14', 'ncaa:9'), put('nojersey-pat', 'Pat', '15', 'ncaa:10')]);
    const next = sportsdataverseEdits(ncaa, SOURCES, OPTIONS);
    const after = commit(ncaa, next.edits);
    expect(after.all('player').map((player) => [player.id, player.jersey, player.sourceKey])).toEqual([
      ['drexel-mbb@2025-26/nojersey-sam', '14', 'espn:1'],
      ['drexel-mbb@2025-26/reed-josh', '5', 'espn:5239623'],
    ]);
    expect([next.summary.rematched, next.summary.removed]).toEqual([1, 1]);
    expect(changing(after, sportsdataverseEdits(after, SOURCES, OPTIONS).edits)).toEqual([]);
  });

  test('an NCAA-keyed twin of a player an earlier ESPN load already wrote is deleted, not given the same key', () => {
    const put = (slug: string, lastName: string, sourceKey: string) =>
      ({ op: 'put', kind: 'player', value: parseEntity('player', { id: `drexel-mbb@2025-26/${slug}`, teamId: 'drexel-mbb', seasonId: '2025-26', firstName: 'Labaron', lastName, jersey: '0', sourceKey }) }) as const;
    const twins = commit(world, [put('philon-jr-labaron', 'Philon Jr.', 'espn:4873090'), put('philon-labaron', 'Philon', 'ncaa:9333106')]);
    const boxOnly = { ...line('c1', [20, 8, 3, 6, 0, 1, 2, 2, 1, 2, 1, 0, 0, 1, 2]), athlete_id: '4873090', athlete_display_name: 'Labaron Philon Jr.', athlete_jersey: '0' };
    const after = commit(twins, sportsdataverseEdits(twins, { ...SOURCES, playerBox: [...SOURCES.playerBox!, boxOnly] }, OPTIONS).edits);
    expect(after.all('player').map((player) => [player.id, player.sourceKey])).toEqual([
      ['drexel-mbb@2025-26/philon-jr-labaron', 'espn:4873090'],
      ['drexel-mbb@2025-26/reed-josh', 'espn:5239623'],
    ]);
    expect(after.get('playerStats', 'drexel-mbb@2025-26/philon-jr-labaron' as never)?.stats.totals.pts).toBe(8);
  });

  test("before tip-off, a roster whose returning players are all still in last season's class is skipped; one that moved up is planned", () => {
    const next = SeasonId.parse('2026-27');
    const upcoming = sportsdataverseEdits(
      world,
      {
        ...unpublished,
        groups: SOURCES.groups,
        rosters: [
          athlete('5239623', '2182', 'Josh', 'Reed', '5', 'Sophomore'),
          athlete('6000001', '2182', 'New', 'Dragon', '12', 'Freshman'),
          athlete('6000002', '2275', 'Pat', 'Pride', '3', 'Sophomore'),
          athlete('6000003', '2275', 'Fresh', 'Face', '4', 'Freshman'),
        ],
        priorRosters: [
          { athlete_id: '5239623', team_id: '2182', experience_display_value: 'Sophomore' },
          { athlete_id: '6000002', team_id: '2275', experience_display_value: 'Freshman' },
        ],
      },
      { ...OPTIONS, season: next },
    );
    expect(putValues(upcoming.edits, 'player').map((player) => [player.id, player.classYear])).toEqual([
      ['hofstra-mbb@2026-27/pride-pat', 'SO'],
      ['hofstra-mbb@2026-27/face-fresh', 'FR'],
    ]);
    expect(upcoming.warnings.find((warning) => warning.code === 'stale-roster')).toEqual({
      code: 'stale-roster',
      message: "1 team's roster is last season's, copied forward; not loaded",
      subjects: ['Drexel'],
    });
  });

  describe("the stale guard, for a season ESPN may still serve last season's rosters as", () => {
    const next = SeasonId.parse('2026-27');
    const prior = (athlete_id: string, team_id: string, experience_display_value: string) => ({ athlete_id, team_id, experience_display_value });
    const guarded = (on: World, sources: Partial<SdvSources>) => {
      const result = sportsdataverseEdits(on, { ...unpublished, groups: SOURCES.groups, ...sources }, { ...OPTIONS, season: next });
      return {
        result,
        loaded: [...new Set(putValues(result.edits, 'player').map((player) => player.teamId))],
        stale: result.warnings.find((warning) => warning.code === 'stale-roster')?.subjects ?? [],
        unpublished: result.warnings.find((warning) => warning.code === 'not-published')?.subjects ?? [],
      };
    };
    /** Drexel's returner is still a sophomore, Hofstra's too, Towson's only returner is a senior. */
    const rosters = [
      athlete('5239623', '2182', 'Josh', 'Reed', '5', 'Sophomore'),
      athlete('6000001', '2182', 'New', 'Dragon', '12', 'Freshman'),
      athlete('6000002', '2275', 'Pat', 'Pride', '3', 'Sophomore'),
      athlete('6000004', '119', 'Old', 'Hand', '10', 'Senior'),
      athlete('6000005', '119', 'Fresh', 'Face', '4', 'Freshman'),
    ];
    const lastFile = [prior('5239623', '2182', 'Sophomore'), prior('6000002', '2275', 'Sophomore'), prior('6000004', '119', 'Senior')];
    const played = (athlete_id: string, team_id: string) => ({ ...line('n1', [10, 2, 1, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), athlete_id, team_id });

    /** A player a 2025-26 load wrote, keyed by his ESPN athlete id. */
    const player = (team: string, slug: string, athleteId: string, classYear: string) =>
      ({
        op: 'put',
        kind: 'player',
        value: parseEntity('player', { id: `${team}@2025-26/${slug}`, teamId: team, seasonId: '2025-26', firstName: 'A', lastName: slug, jersey: '1', classYear, sourceKey: `espn:${athleteId}` }),
      }) as const;

    test('a team is decided alone: one with a box score is loaded, one without stays guarded; a senior staying a senior proves nothing', () => {
      const { loaded, stale } = guarded(world, { rosters, priorRosters: lastFile, playerBox: [played('6000002', '2275')] });
      expect([loaded, stale]).toEqual([['hofstra-mbb', 'towson-mbb'], ['Drexel']]);
    });

    test("last season's players an earlier load wrote outrank last season's file, which ESPN rebuilds", () => {
      const loadedLastSeason = commit(world, [player('drexel-mbb', 'reed', '5239623', 'FR'), player('hofstra-mbb', 'pride', '6000002', 'SO')]);
      // The rebuilt file has Reed a sophomore already and Pride a freshman; the World remembers otherwise.
      const rebuilt = [prior('5239623', '2182', 'Sophomore'), prior('6000002', '2275', 'Freshman'), prior('6000004', '119', 'Senior')];
      const { result, loaded, stale } = guarded(loadedLastSeason, { rosters, priorRosters: rebuilt });
      expect([loaded, stale]).toEqual([['drexel-mbb', 'towson-mbb'], ['Hofstra']]);
      const after = commit(loadedLastSeason, result.edits);
      expect(changing(after, guarded(after, { rosters, priorRosters: rebuilt }).result.edits)).toEqual([]);
    });

    test('a returner with no class on one side, or one a class lower than the World has him, proves nothing; one moving up loads the team', () => {
      // Drexel's World classes came from the NCAA files: Gregwer a senior there, a junior to ESPN.
      const loadedLastSeason = commit(world, [
        player('drexel-mbb', 'reed', '5239623', 'SO'),
        player('drexel-mbb', 'nolan', '6000010', 'JR'),
        player('drexel-mbb', 'gregwer', '6000011', 'SR'),
        player('hofstra-mbb', 'pride', '6000002', 'FR'),
        player('hofstra-mbb', 'down', '6000012', 'SR'),
      ]);
      const copiedForward = [
        athlete('5239623', '2182', 'Josh', 'Reed', '5', 'Sophomore'),
        { ...athlete('6000010', '2182', 'Kim', 'Nolan', '20', ''), experience_display_value: null },
        athlete('6000011', '2182', 'Claire', 'Gregwer', '21', 'Junior'),
        athlete('6000002', '2275', 'Pat', 'Pride', '3', 'Sophomore'),
        athlete('6000012', '2275', 'Dee', 'Down', '22', 'Junior'),
      ];
      const { loaded, stale } = guarded(loadedLastSeason, { rosters: copiedForward });
      expect([loaded, stale]).toEqual([['hofstra-mbb'], ['Drexel']]);
    });

    test("last season's file is reported missing only when a team needed it", () => {
      const path = 'espn_mens_college_basketball_rosters/rosters_2026';
      const drexel = rosters.slice(0, 2);
      const unguarded = guarded(world, { rosters: drexel, priorRosters: null });
      expect([unguarded.loaded, unguarded.stale, unguarded.unpublished.includes(path)]).toEqual([['drexel-mbb'], [], true]);
      const tippedOff = guarded(world, { rosters: drexel, priorRosters: null, playerBox: [played('5239623', '2182')] });
      expect([tippedOff.loaded, tippedOff.unpublished.includes(path)]).toEqual([['drexel-mbb'], false]);
    });
  });

  test('with only groups published, conferences change and records stay', () => {
    const before = commit(world, plan.edits);
    const moved = { ...unpublished, groups: [{ team_id: '2182', team_name: 'Drexel Dragons', conference_id: 'mbb:atlantic-10' }] };
    const next = sportsdataverseEdits(before, moved, OPTIONS);
    expect(putValues(next.edits, 'teamSeason').map((row) => [row.id, row.conferenceId, row.overall, row.rank])).toEqual([
      ['drexel-mbb@2025-26', 'a-10', { wins: 4, losses: 3 }, 2],
    ]);
    expect(next.warnings).toEqual([
      {
        code: 'not-published',
        message: '4 datasets are not published for this season yet',
        subjects: [
          'espn_mens_college_basketball_player_boxscores/player_box_2026',
          'espn_mens_college_basketball_rosters/rosters_2026',
          'espn_mens_college_basketball_schedules/mbb_schedule_2026',
          'espn_mens_college_basketball_team_boxscores/team_box_2026',
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
