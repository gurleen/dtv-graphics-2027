import { expect, test } from 'bun:test';
import { parseStatcrew } from './statcrew';

const FIXTURE = await Bun.file(new URL('../fixtures/bbgame.xml', import.meta.url)).text();

test('maps V to away and H to home, with each score from the linescore', () => {
  const { teams } = parseStatcrew(FIXTURE);
  expect([teams.away.name, teams.away.score]).toEqual(["Saint Joseph's", 64]);
  expect([teams.home.name, teams.home.score]).toEqual(['Drexel', 72]);
});

test('reads a player into the domain stat line and skips the TM row', () => {
  const { home } = parseStatcrew(FIXTURE).teams;
  expect(home.players.map((player) => player.uni)).toEqual(['5', '0', '23', '6', '11', '99']);
  const reed = home.players[0]!;
  expect(reed.name).toBe('Reed, Josh');
  expect(reed.starter).toBe(true);
  expect(reed.line).toEqual({ min: 33, pts: 19, fgm: 7, fga: 14, tpm: 3, tpa: 7, ftm: 2, fta: 2, reb: 4, ast: 3, stl: 2, blk: 0, to: 1, pf: 2 });
  expect(home.players.at(-1)!.starter).toBe(false);
});

test('reads the team totals as the team line', () => {
  expect(parseStatcrew(FIXTURE).teams.home.line).toMatchObject({ pts: 72, fgm: 19, tpm: 6, reb: 27, to: 8 });
});

test('a missing stat attribute is zero', () => {
  const xml = FIXTURE.replace(/ ast="3"/, '');
  expect(parseStatcrew(xml).teams.home.players[0]!.line.ast).toBe(0);
});

test('a file without both teams throws', () => {
  const awayOnly = FIXTURE.slice(0, FIXTURE.indexOf('<team vh="H"')) + '</bbgame>';
  expect(() => parseStatcrew(awayOnly)).toThrow(/vh="H"/);
});

test('a half-written file throws', () => {
  expect(() => parseStatcrew(FIXTURE.slice(0, FIXTURE.length / 2))).toThrow();
  expect(() => parseStatcrew('')).toThrow();
});

test('reads the play by play in order, with a side, a team id when the play has none, and a score on scoring plays', () => {
  const { plays } = parseStatcrew(FIXTURE);
  expect(plays.map((play) => `${play.period} ${play.time} ${play.side} ${play.team} ${play.uni} ${play.action} ${play.type}`)).toEqual([
    '1 19:41 away SJU 1 MISS 3PTR',
    '1 19:38 home DREX 23 REBOUND DEF',
    '1 19:20 home DREX 5 GOOD JUMPER',
    '1 18:02 away SJU TM TIMEOUT 30SEC',
    '2 19:44 home DREX 0 GOOD 3PTR',
  ]);
  expect(plays[0]!.score).toBeNull();
  expect(plays[2]!).toMatchObject({ name: 'REED, JOSH', score: { away: 0, home: 2 } });
});

test('a file with no plays, or an empty <plays/>, has none', () => {
  const noPlays = FIXTURE.slice(0, FIXTURE.indexOf('<plays')) + '</bbgame>';
  expect(parseStatcrew(noPlays).plays).toEqual([]);
  expect(parseStatcrew(noPlays.replace('</bbgame>', '<plays/></bbgame>')).plays).toEqual([]);
});

const LIVESTATS = await Bun.file(new URL('../fixtures/livestats.xml', import.meta.url)).text();

test('reads a LiveStats file: the period from <status>, regulation periods from <rules>, and team fouls by period', () => {
  const game = parseStatcrew(LIVESTATS);
  expect([game.period, game.periods]).toEqual([1, 2]);
  expect([...game.teams.away.fouls]).toEqual([[1, 3]]);
  expect([...game.teams.home.fouls]).toEqual([[1, 9]]);
  expect(game.plays.filter((play) => play.action === 'TIMEOUT').map((play) => `${play.side} ${play.type}`)).toEqual([
    'away MEDIA',
    'away MEDIA',
    'home 30SEC',
    'away MEDIA',
    'home 30SEC',
  ]);
});

test('a file without <status>, <rules> or <statsbyprd> has no period, periods or fouls', () => {
  const game = parseStatcrew(FIXTURE);
  expect([game.period, game.periods, game.teams.home.fouls.size]).toEqual([null, null, 0]);
});
