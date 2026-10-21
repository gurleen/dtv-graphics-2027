import { describe, expect, test } from 'bun:test';
import { checkEdits, emptySnapshot, Game, indexWorld, Revision, School, Team, type WorldSnapshot } from './index';

const drexel = School.parse({ id: 'drexel', name: 'Drexel', shortName: 'Drexel', mascot: 'Dragons', abbreviation: 'DREX', primaryColor: '#07294d', secondaryColor: '#ffc600' });
const elon = School.parse({ ...drexel, id: 'elon', name: 'Elon', abbreviation: 'ELON' });
const drexelMbb = Team.parse({ id: 'drexel-mbb', schoolId: 'drexel', program: 'mbb' });
const elonMbb = Team.parse({ id: 'elon-mbb', schoolId: 'elon', program: 'mbb' });
const elonWbb = Team.parse({ id: 'elon-wbb', schoolId: 'elon', program: 'wbb' });
const game = (away: string, program: 'mbb' | 'wbb' = 'mbb') =>
  Game.parse({ id: `2026-27/2026-11-08/${away}.at.drexel-mbb`, seasonId: '2026-27', program, awayTeamId: away, homeTeamId: 'drexel-mbb', startsAt: '2026-11-08T19:00:00-05:00' });

const base: WorldSnapshot = (() => {
  const empty = emptySnapshot();
  return { ...empty, entities: { ...empty.entities, school: [drexel, elon], team: [drexelMbb, elonMbb, elonWbb] } };
})();
const WORLD = indexWorld(base);

describe('checkEdits: both teams of a game play its program', () => {
  test('a game between two men’s teams is consistent', () => {
    expect(checkEdits(WORLD, { origin: 'import', edits: [{ op: 'put', kind: 'game', value: game('elon-mbb') }] })).toEqual([]);
  });

  test("a women's team in a men's game is refused, naming the side", () => {
    const problems = checkEdits(WORLD, { origin: 'import', edits: [{ op: 'put', kind: 'game', value: game('elon-wbb') }] });
    expect(problems.map((problem) => [problem.rule, problem.rule === 'game-program' && problem.side])).toEqual([['game-program', 'away']]);
  });

  test('changing a team’s program breaks the games it already plays in', () => {
    const world = indexWorld({ ...base, entities: { ...base.entities, game: [game('elon-mbb')] } });
    const problems = checkEdits(world, { origin: 'import', edits: [{ op: 'put', kind: 'team', value: { ...elonMbb, program: 'wbb' } }] });
    expect(problems.map((problem) => problem.rule)).toEqual(['game-program']);
  });

  test('an import cannot break it through a locked field, because the lock keeps the stored value', () => {
    const world = indexWorld({
      ...base,
      entities: { ...base.entities, game: [game('elon-mbb')] },
      locks: { ...base.locks, team: { 'elon-mbb': [{ field: 'program', actor: null, at: null }] } },
    });
    expect(checkEdits(world, { origin: 'import', edits: [{ op: 'put', kind: 'team', value: { ...elonMbb, program: 'wbb' } }] })).toEqual([]);
    const manual = checkEdits(world, { origin: 'manual', basis: Revision.parse(0), edits: [{ op: 'put', kind: 'team', value: { ...elonMbb, program: 'wbb' } }] });
    expect(manual.map((problem) => problem.rule)).toEqual(['game-program']);
  });

  test('a batch that puts the game and its teams together is checked as a whole', () => {
    const world = indexWorld(emptySnapshot());
    const edits = [
      { op: 'put', kind: 'game', value: game('elon-wbb') },
      { op: 'put', kind: 'team', value: drexelMbb },
      { op: 'put', kind: 'team', value: elonWbb },
    ] as const;
    expect(checkEdits(world, { origin: 'import', edits }).map((problem) => problem.rule)).toEqual(['game-program']);
  });
});
