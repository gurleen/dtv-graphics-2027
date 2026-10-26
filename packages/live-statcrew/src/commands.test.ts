import { expect, test } from 'bun:test';
import { PlayerId } from '@dtv/domain';
import { commandsFor } from './commands';
import { parseStatcrew } from './statcrew';

const GAME = parseStatcrew(await Bun.file(new URL('../fixtures/bbgame.xml', import.meta.url)).text());

const roster = (side: string, jerseys: string[]) =>
  new Map(jerseys.map((jersey) => [jersey, PlayerId.parse(`${side}-${jersey}`)]));
const ROSTERS = {
  away: roster('away', ['1', '2', '3', '4', '5', '6']),
  home: roster('home', ['5', '0', '23', '6', '11']),
};

test('writes each side score and team line, a line per matched player, and the five starters', () => {
  const { commands, unmatched } = commandsFor(GAME, ROSTERS);
  expect(commands).toContainEqual({ type: 'score', side: 'home', value: 72 });
  expect(commands).toContainEqual({ type: 'teamLine', side: 'away', line: GAME.teams.away.line });
  expect(commands).toContainEqual({ type: 'playerLine', player: 'home-5', line: GAME.teams.home.players[0]!.line });
  expect(commands.filter((command) => command.type === 'playerLine')).toHaveLength(6 + 5);
  expect(commands).toContainEqual({ type: 'starters', side: 'home', players: ['home-5', 'home-0', 'home-23', 'home-6', 'home-11'] });
  expect(unmatched).toEqual(['home #99 SMITH,JOHN']);
});

test('a player off the roster gets no command', () => {
  const { commands } = commandsFor(GAME, ROSTERS);
  expect(JSON.stringify(commands)).not.toContain('99');
});

test('writes only score and stats groups', () => {
  const types = new Set(commandsFor(GAME, ROSTERS).commands.map((command) => command.type));
  expect([...types].sort()).toEqual(['playerLine', 'score', 'starters', 'teamLine']);
});

test('starters are written only when exactly five starters match', () => {
  const short = { ...ROSTERS, home: roster('home', ['5', '0', '23', '6']) };
  const { commands, unmatched } = commandsFor(GAME, short);
  expect(commands.some((command) => command.type === 'starters' && command.side === 'home')).toBe(false);
  expect(commands.some((command) => command.type === 'starters' && command.side === 'away')).toBe(true);
  expect(unmatched).toContain('home #11 De Laporterie, Luc');
});

test('jersey 0 and 00 are different players', () => {
  const doubleZero = { ...ROSTERS, home: roster('home', ['5', '00', '23', '6', '11']) };
  expect(commandsFor(GAME, doubleZero).unmatched).toContain('home #0 Hipps, Ty');
});
