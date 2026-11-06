import { expect, test } from 'bun:test';
import { PlayerId } from '@dtv/domain';
import { commandsFor, shotsOf } from './commands';
import { parseStatcrew } from './statcrew';

const GAME = parseStatcrew(await Bun.file(new URL('../fixtures/bbgame.xml', import.meta.url)).text());
const LIVESTATS = parseStatcrew(await Bun.file(new URL('../fixtures/livestats.xml', import.meta.url)).text());

const roster = (side: string, jerseys: string[]) =>
  new Map(jerseys.map((jersey) => [jersey, PlayerId.parse(`${side}-${jersey}`)]));
const ROSTERS = {
  away: roster('away', ['1', '2', '3', '4', '5', '6']),
  home: roster('home', ['5', '0', '23', '6', '11']),
};

test('writes each side team line, a line per matched player, and the five starters', () => {
  const { commands, unmatched } = commandsFor(GAME, ROSTERS);
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

test('writes only the stats group, never anything AllSport writes', () => {
  const STATS: string[] = ['playerLine', 'shots', 'starters', 'teamLine'];
  expect([...new Set(commandsFor(GAME, ROSTERS).commands.map((command): string => command.type))].sort()).toEqual(STATS);
  for (const command of commandsFor(LIVESTATS, ROSTERS).commands) expect(STATS).toContain(command.type);
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

test('shots are the GOOD and MISS plays, valued by type', () => {
  const shots = shotsOf(LIVESTATS);
  expect(shots).toHaveLength(LIVESTATS.plays.filter((play) => play.action === 'GOOD' || play.action === 'MISS').length);
  expect(shots.slice(0, 2)).toEqual([
    { period: 1, remainingMs: 19 * 60_000 + 29_000, side: 'home', value: 2, made: false },
    { period: 1, remainingMs: 18 * 60_000 + 40_000, side: 'home', value: 3, made: true },
  ]);
  const points = (side: 'away' | 'home') => shots.reduce((sum, shot) => (shot.side === side && shot.made ? sum + shot.value : sum), 0);
  const last = LIVESTATS.plays.findLast((play) => play.score)!.score!;
  expect({ away: points('away'), home: points('home') }).toEqual(last);
});

test('a play with no side or a blank time is not a shot', () => {
  const play = { period: 1, time: '10:00', side: 'home' as const, team: 'DREX', uni: '5', name: 'REED,JOSH', action: 'GOOD', type: 'LAYUP', score: null };
  const shots = shotsOf({ ...GAME, plays: [play, { ...play, side: null }, { ...play, time: '' }, { ...play, action: 'REBOUND' }] });
  expect(shots).toEqual([{ period: 1, remainingMs: 600_000, side: 'home', value: 2, made: true }]);
});
