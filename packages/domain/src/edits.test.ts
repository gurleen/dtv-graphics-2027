import { describe, expect, test } from 'bun:test';
import { EditBatch, mergePut, sameJson } from './index';

const school = { id: 'saint-josephs', name: "Saint Joseph's", abbreviation: 'JOES', mascot: 'Hawks', website: null };
const stored = { doc: school, locked: [] };

describe('mergePut: how manual and import writes share a row', () => {
  test('a manual edit writes and locks the fields it changed', () => {
    expect(mergePut('manual', stored, { value: { ...school, abbreviation: 'SJU' } })).toEqual({
      change: 'update',
      row: { doc: { ...school, abbreviation: 'SJU' }, locked: ['abbreviation'] },
      skipped: [],
    });
  });

  test('a later import skips the locked field, reports it, and still writes the others', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locked: ['abbreviation'] };
    expect(mergePut('import', edited, { value: { ...school, abbreviation: 'JOES', mascot: 'Hawks!' } })).toEqual({
      change: 'update',
      row: { doc: { ...school, abbreviation: 'SJU', mascot: 'Hawks!' }, locked: ['abbreviation'] },
      skipped: ['abbreviation'],
    });
  });

  test('an import that only meets locked fields changes nothing and still reports them', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locked: ['abbreviation'] };
    expect(mergePut('import', edited, { value: school })).toEqual({ change: 'none', skipped: ['abbreviation'] });
  });

  test('unlocking lets the next import write the field again', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locked: ['abbreviation'] };
    const unlocked = mergePut('manual', edited, { value: edited.doc, unlock: ['abbreviation'] });
    expect(unlocked).toEqual({ change: 'update', row: { doc: edited.doc, locked: [] }, skipped: [] });
    if (unlocked.change === 'none') throw new Error('unlock changed nothing');
    expect(mergePut('import', unlocked.row, { value: school })).toEqual({ change: 'update', row: stored, skipped: [] });
  });

  test('an explicit unlock wins over the lock a change would add', () => {
    expect(mergePut('manual', stored, { value: { ...school, mascot: 'Hawk' }, unlock: ['mascot'] })).toEqual({
      change: 'update',
      row: { doc: { ...school, mascot: 'Hawk' }, locked: [] },
      skipped: [],
    });
  });

  test('a manual insert locks every field it sets to a value, so an import can fill the nulls', () => {
    expect(mergePut('manual', undefined, { value: school })).toEqual({
      change: 'insert',
      row: { doc: school, locked: ['abbreviation', 'mascot', 'name'] },
      skipped: [],
    });
  });

  test('an import insert locks nothing', () => {
    expect(mergePut('import', undefined, { value: school })).toEqual({ change: 'insert', row: stored, skipped: [] });
  });

  test('keep leaves an existing row alone and inserts a missing one', () => {
    expect(mergePut('import', stored, { value: { ...school, mascot: 'Hawk' }, onExisting: 'keep' })).toEqual({ change: 'none', skipped: [] });
    expect(mergePut('import', undefined, { value: school, onExisting: 'keep' }).change).toBe('insert');
  });

  test('an equal document is no change, whatever its key order', () => {
    const reordered = Object.fromEntries(Object.entries(school).reverse());
    expect(mergePut('manual', stored, { value: reordered })).toEqual({ change: 'none', skipped: [] });
  });
});

describe('sameJson', () => {
  test.each([
    [{ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 }, true],
    [{ a: 1 }, { a: 1, b: undefined }, false],
    [[1, 2], [2, 1], false],
    [{}, [], false],
    [null, {}, false],
    ['1', 1, false],
  ])('%p vs %p is %p', (a, b, same) => {
    expect(sameJson(a, b)).toBe(same);
  });
});

describe('EditBatch at the boundary', () => {
  const put = { op: 'put', kind: 'season', value: { id: '2026-27', name: '2026-27' } };

  test('an import batch needs no basis', () => {
    expect(EditBatch.safeParse({ origin: 'import', edits: [put] }).success).toBe(true);
  });

  test('a manual batch must carry the revision its writer read', () => {
    expect(EditBatch.safeParse({ origin: 'manual', edits: [put] }).success).toBe(false);
    expect(EditBatch.safeParse({ origin: 'manual', basis: 3, edits: [put] }).success).toBe(true);
  });

  test('unlock names fields of the kind, and only a manual put carries it', () => {
    expect(EditBatch.safeParse({ origin: 'manual', basis: 3, edits: [{ ...put, unlock: ['name'] }] }).success).toBe(true);
    expect(EditBatch.safeParse({ origin: 'manual', basis: 3, edits: [{ ...put, unlock: ['nope'] }] }).success).toBe(false);
    expect(EditBatch.safeParse({ origin: 'import', edits: [{ ...put, unlock: ['name'] }] }).success).toBe(false);
  });

  test('keep is an import option only', () => {
    expect(EditBatch.safeParse({ origin: 'import', edits: [{ ...put, onExisting: 'keep' }] }).success).toBe(true);
    expect(EditBatch.safeParse({ origin: 'manual', basis: 3, edits: [{ ...put, onExisting: 'keep' }] }).success).toBe(false);
  });

  test('a value is parsed against its kind, and the error names the field', () => {
    const result = EditBatch.safeParse({ origin: 'import', edits: [{ op: 'put', kind: 'season', value: { id: '2026', name: 'x' } }] });
    expect(result.error?.issues[0]?.path).toEqual(['edits', 0, 'value', 'id']);
  });
});
