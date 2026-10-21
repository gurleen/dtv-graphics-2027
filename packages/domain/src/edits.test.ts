import { describe, expect, test } from 'bun:test';
import { EditBatch, mergePut, sameJson } from './index';

const school = { id: 'saint-josephs', name: "Saint Joseph's", abbreviation: 'JOES', mascot: 'Hawks', website: null };
const stored = { doc: school, locks: [] };
const IMPORT = { origin: 'import' } as const;
const alex = { origin: 'manual', actor: 'alex', at: 1_000 } as const;
const sam = { origin: 'manual', actor: 'sam', at: 2_000 } as const;
const lock = (field: string, by: { readonly actor: string; readonly at: number } = alex) => ({ field, actor: by.actor, at: by.at });

describe('mergePut: how manual and import writes share a row', () => {
  test('a manual edit writes and locks the fields it changed', () => {
    expect(mergePut(alex, stored, { kind: 'school', value: { ...school, abbreviation: 'SJU' } })).toEqual({
      change: 'update',
      row: { doc: { ...school, abbreviation: 'SJU' }, locks: [lock('abbreviation')] },
      skipped: [],
    });
  });

  test('a second manual edit of a locked field takes the lock over, and leaves the other locks alone', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU', mascot: 'Hawk' }, locks: [lock('abbreviation'), lock('mascot')] };
    expect(mergePut(sam, edited, { kind: 'school', value: { ...edited.doc, abbreviation: "ST JOE'S" } })).toEqual({
      change: 'update',
      row: { doc: { ...edited.doc, abbreviation: "ST JOE'S" }, locks: [lock('abbreviation', sam), lock('mascot')] },
      skipped: [],
    });
  });

  test('a lock with no known author gets one when a person edits its field again', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locks: [{ field: 'abbreviation', actor: null, at: null }] };
    expect(mergePut(sam, edited, { kind: 'school', value: { ...school, abbreviation: 'SJ' } })).toMatchObject({
      change: 'update',
      row: { locks: [lock('abbreviation', sam)] },
    });
  });

  test('a later import skips the locked field, reports it, and still writes the others', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locks: [lock('abbreviation')] };
    expect(mergePut(IMPORT, edited, { kind: 'school', value: { ...school, abbreviation: 'JOES', mascot: 'Hawks!' } })).toEqual({
      change: 'update',
      row: { doc: { ...school, abbreviation: 'SJU', mascot: 'Hawks!' }, locks: [lock('abbreviation')] },
      skipped: ['abbreviation'],
    });
  });

  test('an import that only meets locked fields changes nothing and still reports them', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locks: [lock('abbreviation')] };
    expect(mergePut(IMPORT, edited, { kind: 'school', value: school })).toEqual({ change: 'none', skipped: ['abbreviation'] });
  });

  test('unlocking lets the next import write the field again', () => {
    const edited = { doc: { ...school, abbreviation: 'SJU' }, locks: [lock('abbreviation')] };
    const unlocked = mergePut(alex, edited, { kind: 'school', value: edited.doc, unlock: ['abbreviation'] });
    expect(unlocked).toEqual({ change: 'update', row: { doc: edited.doc, locks: [] }, skipped: [] });
    if (unlocked.change === 'none') throw new Error('unlock changed nothing');
    expect(mergePut(IMPORT, unlocked.row, { kind: 'school', value: school })).toEqual({ change: 'update', row: stored, skipped: [] });
  });

  test('an explicit unlock wins over the lock a change would add', () => {
    expect(mergePut(alex, stored, { kind: 'school', value: { ...school, mascot: 'Hawk' }, unlock: ['mascot'] })).toEqual({
      change: 'update',
      row: { doc: { ...school, mascot: 'Hawk' }, locks: [] },
      skipped: [],
    });
  });

  test('a manual insert locks every field it sets to a value, so an import can fill the nulls', () => {
    expect(mergePut(alex, undefined, { kind: 'school', value: school })).toEqual({
      change: 'insert',
      row: { doc: school, locks: [lock('abbreviation'), lock('mascot'), lock('name')] },
      skipped: [],
    });
  });

  test('a manual insert does not lock a field left at its schema default, so an import can fill it', () => {
    const batch = EditBatch.parse({
      origin: 'manual',
      basis: 0,
      edits: [{ op: 'put', kind: 'player', value: { id: 'drexel-mbb@2026-27/on-walk', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'Walk', lastName: 'On', jersey: '42' } }],
    });
    const [put] = batch.edits;
    if (put?.op !== 'put') throw new Error('expected a put');
    const inserted = mergePut(alex, undefined, put);
    expect(inserted.change === 'insert' && inserted.row.locks.map((held) => held.field)).toEqual(['firstName', 'jersey', 'lastName', 'seasonId', 'teamId']);
    if (inserted.change !== 'insert') return;
    const imported = mergePut(IMPORT, inserted.row, { kind: 'player', value: { ...put.value, position: 'G', redshirt: true } });
    expect(imported).toMatchObject({ change: 'update', skipped: [], row: { doc: { position: 'G', redshirt: true } } });
  });

  test('an import insert locks nothing', () => {
    expect(mergePut(IMPORT, undefined, { kind: 'school', value: school })).toEqual({ change: 'insert', row: stored, skipped: [] });
  });

  test('keep leaves an existing row alone and inserts a missing one', () => {
    expect(mergePut(IMPORT, stored, { kind: 'school', value: { ...school, mascot: 'Hawk' }, onExisting: 'keep' })).toEqual({ change: 'none', skipped: [] });
    expect(mergePut(IMPORT, undefined, { kind: 'school', value: school, onExisting: 'keep' }).change).toBe('insert');
  });

  test('an equal document is no change, whatever its key order', () => {
    const reordered = Object.fromEntries(Object.entries(school).reverse());
    expect(mergePut(alex, stored, { kind: 'school', value: reordered })).toEqual({ change: 'none', skipped: [] });
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
