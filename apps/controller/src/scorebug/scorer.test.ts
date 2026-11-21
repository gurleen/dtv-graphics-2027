import { describe, expect, test } from 'bun:test';
import type { StatcrewPlay } from '@dtv/api';
import { basketball, type GameView, type Player, PlayerId, type World } from '@dtv/domain';
import { scorerFromLines, scorerFromPlays } from './scorer';

const player = (team: string, jersey: string, lastName: string) => ({ id: PlayerId.parse(`${team}@2026-27/${lastName}`), teamId: team, jersey, firstName: 'A', lastName }) as unknown as Player;
const ROSTERS: Record<string, Player[]> = {
  'drexel-mbb': [player('drexel-mbb', '15', 'petkovic'), player('drexel-mbb', '5', 'reed')],
  'saint-josephs-mbb': [player('saint-josephs-mbb', '15', 'smith')],
};
const world = { roster: (team: string) => ROSTERS[team] ?? [] } as unknown as World;
const game = {
  season: { id: '2026-27' },
  sides: { away: { team: { id: 'saint-josephs-mbb' } }, home: { team: { id: 'drexel-mbb' } } },
} as unknown as GameView;

const play = (patch: Partial<StatcrewPlay>): StatcrewPlay => ({ period: 1, time: '18:40', side: 'home', team: 'DREX', uni: '15', name: 'X', action: 'GOOD', type: 'JUMPER', score: { away: 0, home: 2 }, ...patch });

describe('the latest scorer', () => {
  test('is the newest made basket’s player, matched by side and jersey', () => {
    const plays = [play({}), play({ side: 'away', uni: '15', score: { away: 2, home: 2 } }), play({ action: 'MISS', uni: '5', score: null }), play({ action: 'ASSIST', uni: '5', score: null })];
    expect(scorerFromPlays(plays, game, world)?.lastName).toBe('smith');
  });

  test('skips team plays and jerseys off the roster, and is null with no basket', () => {
    expect(scorerFromPlays([play({ uni: '5' }), play({ uni: 'TM' }), play({ uni: '99' })], game, world)?.lastName).toBe('reed');
    expect(scorerFromPlays([play({ action: 'MISS', score: null })], game, world)).toBeNull();
  });

  test('without plays, is whoever’s points went up', () => {
    const line = (pts: number) => basketball.StatLine.parse({ pts });
    const reed = PlayerId.parse('drexel-mbb@2026-27/reed');
    const petkovic = PlayerId.parse('drexel-mbb@2026-27/petkovic');
    expect(scorerFromLines({ [reed]: line(4), [petkovic]: line(3) }, { [reed]: line(6), [petkovic]: line(3) })).toBe(reed);
    expect(scorerFromLines({ [reed]: line(4) }, { [reed]: line(4), [petkovic]: line(2) })).toBe(petkovic);
    expect(scorerFromLines({ [reed]: line(4) }, { [reed]: line(4) })).toBeNull();
  });
});
