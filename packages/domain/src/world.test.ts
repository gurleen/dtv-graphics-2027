import { describe, expect, test } from 'bun:test';
import {
  ConferenceId, emptySnapshot, Game, GameId, GraphicId, indexWorld, Player, resolveGame, resolveTeam, School, Season,
  SeasonId, Sponsor, Sponsorship, Team, TeamId, TeamSeason, type WorldSnapshot,
} from './index';

const season = SeasonId.parse('2026-27');
const drexelMbb = TeamId.parse('drexel-mbb');
const sjuMbb = TeamId.parse('saint-josephs-mbb');
const caa = ConferenceId.parse('caa');

const snapshot = (entities: Partial<WorldSnapshot['entities']>): WorldSnapshot => {
  const empty = emptySnapshot();
  return { ...empty, entities: { ...empty.entities, ...entities } };
};

const school = (id: string, name: string, abbreviation: string) =>
  School.parse({ id, name, shortName: name, mascot: 'M', abbreviation, primaryColor: '#07294d', secondaryColor: '#ffc600', logo: `/logos/${id}.png` });

const player = (jersey: string, lastName: string) =>
  Player.parse({ id: `drexel-mbb@2026-27/${lastName.toLowerCase()}`, teamId: drexelMbb, seasonId: season, firstName: '', lastName, jersey });

const standing = (team: string, rank: number | null, program = 'mbb') =>
  TeamSeason.parse({ id: `${team}-${program}@2026-27`, teamId: `${team}-${program}`, seasonId: season, conferenceId: caa, rank });

const WORLD = indexWorld(
  snapshot({
    school: [school('drexel', 'Drexel', 'DREX'), school('saint-josephs', "Saint Joseph's", 'JOES'), school('elon', 'Elon', 'ELON'), school('towson', 'Towson', 'TOW')],
    team: [
      Team.parse({ id: drexelMbb, schoolId: 'drexel', program: 'mbb' }),
      Team.parse({ id: 'drexel-wbb', schoolId: 'drexel', program: 'wbb' }),
      Team.parse({ id: sjuMbb, schoolId: 'saint-josephs', program: 'mbb', branding: { abbreviation: 'SJU', primaryColor: '#c2071b' } }),
      Team.parse({ id: 'elon-mbb', schoolId: 'elon', program: 'mbb' }),
      Team.parse({ id: 'towson-mbb', schoolId: 'towson', program: 'mbb' }),
    ],
    season: [Season.parse({ id: season, name: '2026-27' })],
    teamSeason: [standing('towson', null), standing('drexel', 5), standing('elon', null), standing('drexel', 1, 'wbb'), standing('saint-josephs', 2)],
    player: [player('23', 'Tingler'), player('00', 'Double'), player('5', 'Reed'), player('0', 'Hipps')],
    sponsor: [Sponsor.parse({ id: 'independence-blue-cross', name: 'Independence Blue Cross' })],
    sponsorship: [Sponsorship.parse({ id: 'basketball-v2/scorebug', sponsorId: 'independence-blue-cross' })],
    game: [
      Game.parse({
        id: '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb',
        seasonId: season,
        program: 'mbb',
        awayTeamId: sjuMbb,
        homeTeamId: drexelMbb,
        startsAt: '2026-11-08T19:00:00-05:00',
      }),
    ],
  }),
);

describe('indexWorld', () => {
  test('a roster is ordered by jersey number, 0 before 00', () => {
    expect(WORLD.roster(drexelMbb, season).map((row) => row.jersey)).toEqual(['0', '00', '5', '23']);
  });

  test('standings are by rank, unranked teams last by name, one program at a time', () => {
    expect<string[]>(WORLD.standings(caa, season, 'mbb').map((row) => row.teamId)).toEqual([
      'saint-josephs-mbb', 'drexel-mbb', 'elon-mbb', 'towson-mbb',
    ]);
    expect<string[]>(WORLD.standings(caa, season, 'wbb').map((row) => row.teamId)).toEqual(['drexel-wbb']);
  });

  test('team seasons and sponsors resolve by their natural keys', () => {
    expect(WORLD.teamSeason(drexelMbb, season)?.rank).toBe(5);
    expect(WORLD.teamSeason(drexelMbb, SeasonId.parse('2025-26'))).toBeUndefined();
    expect(WORLD.sponsorFor(GraphicId.parse('basketball-v2/scorebug'))?.name).toBe('Independence Blue Cross');
    expect(WORLD.sponsorFor(GraphicId.parse('basketball-v2/starting-five'))).toBeUndefined();
  });
});

describe('resolveGame', () => {
  const view = resolveGame(WORLD, GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb'));

  test('resolves both sides with their school, season row and conference', () => {
    expect(view?.sides.home.school.name).toBe('Drexel');
    expect(view?.sides.home.season?.rank).toBe(5);
    expect(view?.sides.home.conference).toBeUndefined();
    expect(view?.season.name).toBe('2026-27');
  });

  test("a team's branding overrides its school's values in brand, field by field", () => {
    expect<unknown>(view?.sides.away.brand).toEqual({ abbreviation: 'SJU', primaryColor: '#c2071b', secondaryColor: '#ffc600', logo: '/logos/saint-josephs.png' });
    expect(view?.sides.home.brand.abbreviation).toBe('DREX');
  });

  test('a missing game or team resolves to undefined', () => {
    expect(resolveGame(WORLD, GameId.parse('2026-27/2026-11-09/elon-mbb.at.drexel-mbb'))).toBeUndefined();
    expect(resolveTeam(WORLD, TeamId.parse('nope-mbb'), season)).toBeUndefined();
  });
});
