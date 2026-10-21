import { describe, expect, test } from 'bun:test';
import { Revision } from '@dtv/domain';
import { fieldOf } from './fields';
import { defaultSide, disagreements, isDirty, mergeChoices, openNewSession, openSession, problemsOf, readyToSave, typeInto } from './session';

const reed = {
  id: 'drexel-mbb@2026-27/reed-josh', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'Josh', lastName: 'Reed', jersey: '5',
  position: 'G', classYear: 'JR', redshirt: false, hometown: null, headshot: null, motionHeadshot: null, sourceKey: null,
};
const rev = (n: number) => Revision.parse(n);
const field = (id: string) => fieldOf('player', id)!;

describe('a session', () => {
  test('typing makes the session dirty, and typing the original back does not', () => {
    const opened = openSession('player', reed, rev(3));
    expect(isDirty(opened)).toBe(false);
    const typed = typeInto(opened, field('lastName'), 'Reed-Jones');
    expect(isDirty(typed)).toBe(true);
    expect(isDirty(typeInto(typed, field('lastName'), 'Reed'))).toBe(false);
  });

  test('text a field cannot parse is held aside and blocks the save', () => {
    const session = typeInto(openSession('player', reed, rev(3)), fieldOf('playerStats', 'stats.gp')!, 'abc');
    expect(session.pending['stats.gp']).toEqual({ text: 'abc', error: 'a whole number' });
    expect(readyToSave(session, () => null)).toEqual({ ok: false, message: 'a whole number' });
  });

  test('a new row needs names before it can save, and gets its id from them', () => {
    const blank = { teamId: 'drexel-mbb', seasonId: '2026-27', firstName: '', lastName: '', jersey: '' };
    const idFor = (_kind: string, draft: Record<string, unknown>) => (draft.lastName ? `drexel-mbb@2026-27/${String(draft.lastName).toLowerCase()}` : null);
    let session = openNewSession('player', blank, rev(3));
    expect(readyToSave(session, idFor)).toEqual({ ok: false, message: 'Type a name first' });
    session = typeInto(typeInto(session, field('lastName'), 'House'), field('jersey'), '14');
    expect(readyToSave(session, idFor)).toMatchObject({ ok: true, doc: { id: 'drexel-mbb@2026-27/house', lastName: 'House', jersey: '14' } });
    expect(problemsOf(openNewSession('player', blank, rev(3)))).toMatchObject({ lastName: expect.any(String), jersey: 'one or two digits' });
  });
});

describe('a conflict', () => {
  const yours = { ...reed, lastName: 'Reed-Jones', classYear: 'SR' };
  const theirs = { ...reed, lastName: 'Reid', classYear: 'JR', hometown: 'Philadelphia' };

  test('lists the fields that differ now, each marked with who changed it', () => {
    const found = disagreements(reed, yours, theirs);
    expect(found.map((each) => [each.id, each.youChanged, each.theyChanged])).toEqual([
      ['lastName', true, true],
      ['classYear', true, false],
      ['hometown', false, true],
    ]);
    expect(found.map(defaultSide)).toEqual([null, 'yours', 'theirs']);
  });

  test('lays your choices over their row and nothing else', () => {
    const found = disagreements(reed, yours, theirs);
    const merged = mergeChoices(theirs, yours, found, (each) => (each.id === 'lastName' ? 'yours' : 'theirs'));
    expect(merged).toMatchObject({ lastName: 'Reed-Jones', classYear: 'JR', hometown: 'Philadelphia' });
  });

  test('use yours keeps their changes to fields you did not touch', () => {
    const found = disagreements(reed, yours, theirs);
    const merged = mergeChoices(theirs, yours, found, (each) => (each.youChanged ? 'yours' : 'theirs'));
    expect(merged).toMatchObject({ lastName: 'Reed-Jones', classYear: 'SR', hometown: 'Philadelphia' });
  });

  test('a field present only on one side is removed when theirs is chosen', () => {
    const team = { id: 'drexel-mbb', schoolId: 'drexel', program: 'mbb', branding: {} };
    const mine = { ...team, branding: { logo: '/assets/a.png' } };
    const [only] = disagreements(team, mine, team);
    expect(only).toMatchObject({ id: 'branding.logo', youChanged: true, theyChanged: false });
    expect(mergeChoices(team, mine, [only!], () => 'yours')).toEqual(mine);
    expect(mergeChoices(mine, team, disagreements(mine, team, mine), () => 'yours')).toEqual(team);
  });
});
