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
