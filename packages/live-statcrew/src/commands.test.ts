import { expect, test } from 'bun:test';
import { PlayerId } from '@dtv/domain';
import { commandsFor as commandsForProgram } from './commands';
import { parseStatcrew, type StatcrewGame } from './statcrew';

const GAME = parseStatcrew(await Bun.file(new URL('../fixtures/bbgame.xml', import.meta.url)).text());

const roster = (side: string, jerseys: string[]) =>
  new Map(jerseys.map((jersey) => [jersey, PlayerId.parse(`${side}-${jersey}`)]));
const commandsFor = (game: StatcrewGame, rosters: typeof ROSTERS, program: 'mbb' | 'wbb' = 'mbb') => commandsForProgram(game, rosters, program);
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
  expect([...types].sort()).toEqual(['bonus', 'playerLine', 'score', 'starters', 'teamLine', 'timeouts']);
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

const LIVESTATS = parseStatcrew(await Bun.file(new URL('../fixtures/livestats.xml', import.meta.url)).text());
const NO_ROSTERS = { away: new Map(), home: new Map() };

const stateOf = (game: StatcrewGame, program: 'mbb' | 'wbb' = 'mbb') => {
  const { commands } = commandsFor(game, NO_ROSTERS, program);
  const value = (type: 'timeouts' | 'bonus', side: string) => {
    const command = commands.find((candidate) => candidate.type === type && candidate.side === side);
    return command && ('remaining' in command ? command.remaining : 'value' in command ? command.value : undefined);
  };
  return { timeouts: { away: value('timeouts', 'away'), home: value('timeouts', 'home') }, bonus: { away: value('bonus', 'away'), home: value('bonus', 'home') } };
};

const play = (period: number, side: 'away' | 'home', action: string, type = '') =>
  ({ period, time: '10:00', side, team: '', uni: 'TM', name: 'TEAM', action, type, score: null }) as const;

test('a LiveStats file: two home timeouts taken, media timeouts not charged, and home 9 fouls put away in the bonus', () => {
  expect(stateOf(LIVESTATS)).toEqual({ timeouts: { away: 4, home: 2 }, bonus: { away: true, home: false } });
});

test('no more than three timeouts carry into the second half, and each overtime adds one', () => {
  const firstHalfOnly = { ...LIVESTATS, plays: [play(1, 'home', 'TIMEOUT', '30SEC')] };
  expect(stateOf({ ...firstHalfOnly, period: 1 }).timeouts.home).toBe(3);
  expect(stateOf({ ...firstHalfOnly, period: 2 }).timeouts.home).toBe(3);
  expect(stateOf({ ...LIVESTATS, plays: [], period: 2 }).timeouts.home).toBe(3);
  expect(stateOf({ ...LIVESTATS, plays: [play(2, 'home', 'TIMEOUT', '30SEC')], period: 3 }).timeouts.home).toBe(3);
});

test('quarters carry every timeout over', () => {
  expect(stateOf({ ...LIVESTATS, periods: 4, plays: [play(1, 'home', 'TIMEOUT', '30SEC')], period: 3 }).timeouts.home).toBe(3);
});

test('the bonus counts this half, resets at the half, and overtime continues the second half', () => {
  const fouls = (byPeriod: [number, number][]) => ({ ...LIVESTATS.teams, home: { ...LIVESTATS.teams.home, fouls: new Map(byPeriod) } });
  expect(stateOf({ ...LIVESTATS, teams: fouls([[1, 6]]) }).bonus.away).toBe(false);
  expect(stateOf({ ...LIVESTATS, teams: fouls([[1, 7]]) }).bonus.away).toBe(true);
  expect(stateOf({ ...LIVESTATS, period: 2, teams: fouls([[1, 9], [2, 2]]) }).bonus.away).toBe(false);
  expect(stateOf({ ...LIVESTATS, period: 3, teams: fouls([[2, 5], [3, 2]]) }).bonus.away).toBe(true);
});

test('quarters put a team in the bonus on the fifth foul of the quarter', () => {
  const teams = { ...LIVESTATS.teams, home: { ...LIVESTATS.teams.home, fouls: new Map([[2, 4], [3, 5]]) } };
  expect(stateOf({ ...LIVESTATS, periods: 4, period: 3, teams }).bonus.away).toBe(true);
  expect(stateOf({ ...LIVESTATS, periods: 4, period: 2, teams }).bonus.away).toBe(false);
});

test('without <rules> the program decides halves or quarters', () => {
  const teams = { ...LIVESTATS.teams, home: { ...LIVESTATS.teams.home, fouls: new Map([[1, 5]]) } };
  expect(stateOf({ ...LIVESTATS, periods: null, teams }, 'mbb').bonus.away).toBe(false);
  expect(stateOf({ ...LIVESTATS, periods: null, teams }, 'wbb').bonus.away).toBe(true);
});

test('a file with no <status> and no plays leaves timeouts and bonus alone', () => {
  const types = commandsFor({ ...GAME, plays: [] }, ROSTERS).commands.map((command) => command.type);
  expect(types).not.toContain('timeouts');
  expect(types).not.toContain('bonus');
});
