import { describe, expect, test } from 'bun:test';
import { type EntityOf, emptySnapshot, indexWorld } from '@dtv/domain';
import { buildGame, type GameForm, offsetText, sameConference } from './games';

const school = (id: string, shortName: string): EntityOf<'school'> =>
  ({ id, name: shortName, shortName, mascot: 'M', abbreviation: id.slice(0, 4).toUpperCase(), primaryColor: '#000000', secondaryColor: '#ffffff', logo: null, website: null, espnId: null }) as EntityOf<'school'>;
const team = (id: string, schoolId: string, program: 'mbb' | 'wbb' = 'mbb') => ({ id, schoolId, program, branding: {} }) as EntityOf<'team'>;
const teamSeason = (teamId: string, conferenceId: string | null) =>
  ({ id: `${teamId}@2026-27`, teamId, seasonId: '2026-27', conferenceId, overall: { wins: 0, losses: 0 }, conference: { wins: 0, losses: 0 }, streak: null, rank: null, stats: null }) as EntityOf<'teamSeason'>;

const OLD = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const base = emptySnapshot();
const world = indexWorld({
  ...base,
  entities: {
    ...base.entities,
    school: [school('drexel', 'Drexel'), school('saint-josephs', "Saint Joseph's"), school('hofstra', 'Hofstra'), school('delaware', 'Delaware')],
    team: [team('drexel-mbb', 'drexel'), team('drexel-wbb', 'drexel', 'wbb'), team('saint-josephs-mbb', 'saint-josephs'), team('hofstra-mbb', 'hofstra'), team('delaware-mbb', 'delaware')],
    season: [{ id: '2026-27', name: '2026-27' }] as EntityOf<'season'>[],
    teamSeason: [teamSeason('drexel-mbb', 'caa'), teamSeason('hofstra-mbb', 'caa'), teamSeason('saint-josephs-mbb', 'a10')],
    game: [
      { id: OLD, seasonId: '2026-27', program: 'mbb', awayTeamId: 'saint-josephs-mbb', homeTeamId: 'drexel-mbb', venueId: null, startsAt: '2026-11-08T19:00:00-05:00', conferenceGame: false, title: null },
    ] as EntityOf<'game'>[],
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
