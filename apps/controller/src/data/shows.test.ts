import { describe, expect, test } from 'bun:test';
import { type Cue, type EntityOf, emptySnapshot, GameId, indexWorld, type ShowId } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { buildGame, CHECK_PREFIX, duplicateShow, freeShowId, type GameForm, isFlagged, offsetText, sameConference } from './shows';

const school = (id: string, shortName: string): EntityOf<'school'> =>
  ({ id, name: shortName, shortName, mascot: 'M', abbreviation: id.slice(0, 4).toUpperCase(), primaryColor: '#000000', secondaryColor: '#ffffff', logo: null, website: null, espnId: null }) as EntityOf<'school'>;
const team = (id: string, schoolId: string, program: 'mbb' | 'wbb' = 'mbb') => ({ id, schoolId, program, branding: {} }) as EntityOf<'team'>;
const player = (team: string, slug: string, first: string, last: string, jersey: string) =>
  ({ id: `${team}@2026-27/${slug}`, teamId: team, seasonId: '2026-27', firstName: first, lastName: last, jersey, position: 'G', classYear: null, redshirt: false, hometown: null, headshot: null, motionHeadshot: null, sourceKey: null }) as EntityOf<'player'>;
const cue = (id: string, graphic: string, params: Record<string, unknown>, note = ''): Cue => ({ id, graphic, params, overrides: {}, note }) as Cue;
const teamSeason = (teamId: string, conferenceId: string | null) =>
  ({ id: `${teamId}@2026-27`, teamId, seasonId: '2026-27', conferenceId, overall: { wins: 0, losses: 0 }, conference: { wins: 0, losses: 0 }, streak: null, rank: null, stats: null }) as EntityOf<'teamSeason'>;

const OLD = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const sourceShow = {
  id: 'drexel-sju',
  name: "Saint Joseph's at Drexel",
  gameId: OLD,
  crew: [{ talentId: 'rob-brooks', role: null }],
  rundown: [
    cue('matchup-locator', 'basketball-v2/matchup-locator', {}),
    cue('player-lower-third', 'basketball-v2/player-lower-third', { player: 'saint-josephs-mbb@2026-27/hawk-han', line: { kind: 'game', stats: ['pts'] } }, 'lead with the dunk'),
    cue('team-lower-third', 'basketball-v2/team-lower-third', { team: 'drexel-mbb' }),
    cue('burning-question', 'basketball-v2/burning-question', { question: 'Q?', answer: 'A', team: 'drexel-wbb' }),
    cue('conference-standings', 'basketball-v2/conference-standings', { season: '2026-27' }),
  ],
} as EntityOf<'show'>;

const base = emptySnapshot();
const world = indexWorld({
  ...base,
  entities: {
    ...base.entities,
    school: [school('drexel', 'Drexel'), school('saint-josephs', "Saint Joseph's"), school('hofstra', 'Hofstra'), school('delaware', 'Delaware')],
    team: [team('drexel-mbb', 'drexel'), team('drexel-wbb', 'drexel', 'wbb'), team('saint-josephs-mbb', 'saint-josephs'), team('hofstra-mbb', 'hofstra'), team('delaware-mbb', 'delaware')],
    season: [{ id: '2026-27', name: '2026-27' }] as EntityOf<'season'>[],
    teamSeason: [teamSeason('drexel-mbb', 'caa'), teamSeason('hofstra-mbb', 'caa'), teamSeason('saint-josephs-mbb', 'a10')],
    player: [player('saint-josephs-mbb', 'hawk-han', 'Han', 'Hawk', '3'), player('drexel-mbb', 'reed-josh', 'Josh', 'Reed', '12')],
    game: [
      { id: OLD, seasonId: '2026-27', program: 'mbb', awayTeamId: 'saint-josephs-mbb', homeTeamId: 'drexel-mbb', venueId: null, startsAt: '2026-11-08T19:00:00-05:00', conferenceGame: false, title: null },
    ] as EntityOf<'game'>[],
    show: [sourceShow],
  },
});

const form: GameForm = {
  seasonId: '2026-27', program: 'mbb', awayTeamId: 'hofstra-mbb', homeTeamId: 'drexel-mbb', venueId: '', date: '2026-11-15', time: '14:30', conferenceGame: true, title: ' CAA opener ',
};

describe('buildGame', () => {
  test('writes the offset into the start and takes its id from the local game day', () => {
    const built = buildGame(world, form, 300);
    expect(built.ok && built.value).toMatchObject({
      id: '2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb',
      startsAt: '2026-11-15T14:30:00-05:00',
      venueId: null,
      title: 'CAA opener',
      conferenceGame: true,
    });
    expect(offsetText(-330)).toBe('+05:30');
    expect(offsetText(0)).toBe('+00:00');
  });

  test('says what is missing or wrong rather than building a bad game', () => {
    const error = (change: Partial<GameForm>, west = 300) => {
      const built = buildGame(world, { ...form, ...change }, west);
      return built.ok ? null : built.error;
    };
    expect(error({ awayTeamId: '' })).toBe('Pick the away and the home team');
    expect(error({ awayTeamId: 'drexel-mbb' })).toBe('A team cannot play itself');
    expect(error({ time: '' })).toBe('Give the game day and the start time');
    expect(error({ awayTeamId: 'saint-josephs-mbb', date: '2026-11-08' })).toBe('Those teams already play that day');
  });
});

test('conference game is suggested only when both teams share a conference that season', () => {
  expect(sameConference(world, '2026-27', 'hofstra-mbb', 'drexel-mbb')).toBe(true);
  expect(sameConference(world, '2026-27', 'saint-josephs-mbb', 'drexel-mbb')).toBe(false);
  expect(sameConference(world, '2026-27', 'delaware-mbb', 'drexel-mbb')).toBe(false);
});

test('a show id comes from its name, with a number when the name is taken', () => {
  expect<string | null>(freeShowId(world, 'Hofstra at Drexel')).toBe('hofstra-at-drexel');
  expect<string | null>(freeShowId(world, "Saint Joseph's at Drexel")).toBe('saint-josephs-at-drexel');
  expect<string | null>(freeShowId(world, 'Drexel Sju'.replace('Sju', 'sju'))).toBe('drexel-sju-2');
  expect(freeShowId(world, '!!!')).toBeNull();
});

describe('duplicateShow', () => {
  const counter = () => {
    let n = 0;
    return () => String(++n);
  };
  const result = duplicateShow(world, GRAPHICS, sourceShow, { gameId: GameId.parse('2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb'), name: 'Hofstra at Drexel' }, counter());
  if (!result.ok) throw new Error(result.error);
  const { show, flagged } = result.value;

  test('copies the crew and the rundown onto the new game with new cue ids', () => {
    expect<string>(show.id).toBe('hofstra-at-drexel');
    expect<string | null>(show.gameId).toBe('2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb');
    expect(show.crew).toEqual(sourceShow.crew);
    expect(show.rundown.map((each) => each.graphic)).toEqual(sourceShow.rundown.map((each) => each.graphic));
    expect(show.rundown.map((each) => each.id)).toEqual(['matchup-locator-1', 'player-lower-third-2', 'team-lower-third-3', 'burning-question-4', 'conference-standings-5']);
    expect(show.rundown[1]!.params).toEqual(sourceShow.rundown[1]!.params);
    expect(show.rundown[1]!.params).not.toBe(sourceShow.rundown[1]!.params);
  });

  test('flags the cues that name the source game’s players or teams, and only those', () => {
    expect(flagged.map((each) => [each.cue, each.names])).toEqual([
      ['player-lower-third-2', ["#3 Han Hawk"]],
      ['team-lower-third-3', ['Drexel MBB']],
    ]);
    expect(show.rundown.filter(isFlagged).map((each) => each.id)).toEqual(['player-lower-third-2', 'team-lower-third-3']);
  });

  test('a flag says what the cue names and keeps the operator’s own note', () => {
    expect(show.rundown[1]!.note).toBe(`${CHECK_PREFIX}names #3 Han Hawk, from Saint Joseph's at Drexel. lead with the dunk`);
    expect(show.rundown[0]!.note).toBe('');
  });

  test('refuses a name that no id can come of', () => {
    const empty = duplicateShow(world, GRAPHICS, sourceShow, { gameId: GameId.parse(OLD), name: '  ' });
    expect(empty.ok).toBe(false);
  });
});
