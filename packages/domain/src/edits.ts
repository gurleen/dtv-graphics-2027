import { z } from 'zod';
import { ENTITIES, ENTITY_KINDS, type EntityKind, type EntityOf, type FieldOf, type IdOf } from './entities';
import { Revision } from './primitives';

/** `manual` is a person on the data page; `import` is the seed, an importer, or a live-data package. */
export type Origin = 'manual' | 'import';

type Put<K extends EntityKind> = { readonly op: 'put'; readonly kind: K; readonly value: EntityOf<K> };
type Delete<K extends EntityKind> = { readonly op: 'delete'; readonly kind: K; readonly id: IdOf<K> };

/** `onExisting: 'keep'` writes the row only when it is missing. */
export type ImportEdit = { [K in EntityKind]: (Put<K> & { readonly onExisting?: 'keep' }) | Delete<K> }[EntityKind];
/** `unlock` clears field locks, so the next import writes those fields again. */
export type ManualEdit = { [K in EntityKind]: (Put<K> & { readonly unlock?: readonly FieldOf<K>[] }) | Delete<K> }[EntityKind];
export type DataEdit = ImportEdit | ManualEdit;

export const isPutOf = <K extends EntityKind>(edit: { readonly op: 'put' | 'delete'; readonly kind: EntityKind }, kind: K): edit is Put<K> =>
  edit.op === 'put' && edit.kind === kind;

export const putValues = <K extends EntityKind>(edits: readonly DataEdit[], kind: K): EntityOf<K>[] =>
  edits.flatMap((edit) => (isPutOf(edit, kind) ? [edit.value] : []));

/** A put of a kind chosen at run time. The cast only restates that ImportEdit has a member for every kind. */
export const importPut = <K extends EntityKind>(kind: K, value: EntityOf<K>, onExisting?: 'keep'): ImportEdit =>
  ({ op: 'put', kind, value, ...(onExisting && { onExisting }) }) as ImportEdit;

/**
 * `basis` is the World revision the writer read. A put or delete of a row written after
 * it fails the whole batch, so one editor never overwrites another.
 */
export type EditBatch =
  | { readonly origin: 'import'; readonly basis?: Revision; readonly edits: readonly ImportEdit[] }
  | { readonly origin: 'manual'; readonly basis: Revision; readonly edits: readonly ManualEdit[] };

const fieldNames = (kind: EntityKind) => Object.keys(ENTITIES[kind].schema.shape).filter((field) => field !== 'id');

const perKind = (put: (kind: EntityKind) => z.ZodObject) => {
  const union = (kind: EntityKind) =>
    z.discriminatedUnion('op', [
      put(kind),
      z.strictObject({ op: z.literal('delete'), kind: z.literal(kind), id: ENTITIES[kind].schema.shape.id }),
    ]);
  const [first, ...rest] = ENTITY_KINDS;
  return [union(first), ...rest.map(union)] as const;
};

const importEdit = z.discriminatedUnion(
  'kind',
  perKind((kind) =>
    z.strictObject({ op: z.literal('put'), kind: z.literal(kind), value: ENTITIES[kind].schema, onExisting: z.literal('keep').optional() }),
  ),
);

const manualEdit = z.discriminatedUnion(
  'kind',
  perKind((kind) =>
    z.strictObject({
      op: z.literal('put'),
      kind: z.literal(kind),
      value: ENTITIES[kind].schema,
      unlock: z.array(z.enum(fieldNames(kind))).optional(),
    }),
  ),
);

// The edit unions are built from ENTITIES, so zod infers each put's kind and value as
// uncorrelated unions; this is the one place the parsed shape is asserted to be EditBatch.
export const EditBatch = z.discriminatedUnion('origin', [
  z.strictObject({ origin: z.literal('import'), basis: Revision.optional(), edits: z.array(importEdit).min(1) }),
  z.strictObject({ origin: z.literal('manual'), basis: Revision, edits: z.array(manualEdit).min(1) }),
]) as unknown as z.ZodType<EditBatch>;

export interface Row {
  readonly doc: Readonly<Record<string, unknown>>;
  readonly locked: readonly string[];
}

export type Merge =
  | { readonly change: 'insert' | 'update'; readonly row: Row; readonly skipped: readonly string[] }
  | { readonly change: 'none'; readonly skipped: readonly string[] };

const defaultsOf = (kind: EntityKind): ReadonlyMap<string, unknown> => {
  const shape: Readonly<Record<string, z.ZodType>> = ENTITIES[kind].schema.shape;
  const defaults = new Map<string, unknown>();
  for (const [field, schema] of Object.entries(shape)) {
    const parsed = schema.safeParse(undefined);
    if (parsed.success) defaults.set(field, parsed.data);
  }
  return defaults;
};

/** Each field's schema default, for the fields whose schema accepts a missing value. */
const DEFAULTS = new Map(ENTITY_KINDS.map((kind) => [kind, defaultsOf(kind)]));

/**
 * What one put does to the row it targets.
 *
 * - A manual put writes and locks every field it changes. On a new row that is every field
 *   it sets to a value other than null or the field's schema default, so an import can
 *   still fill the rest.
 * - An import put writes only unlocked fields and reports the locked ones it would have
 *   changed in `skipped`.
 * - `unlock` clears locks last, so an explicit unlock wins over the lock a change would add.
 * - `onExisting: 'keep'` leaves an existing row alone.
 */
export function mergePut(
  origin: Origin,
  existing: Row | undefined,
  put: {
    readonly kind: EntityKind;
    readonly value: Readonly<Record<string, unknown>>;
    readonly onExisting?: 'keep';
    readonly unlock?: readonly string[];
  },
): Merge {
  const unlock = new Set(put.unlock ?? []);
  if (!existing) {
    const defaults = DEFAULTS.get(put.kind)!;
    const typed = (field: string, value: unknown) => value !== null && !(defaults.has(field) && sameJson(value, defaults.get(field)));
    const locked =
      origin === 'manual'
        ? Object.entries(put.value)
            .filter(([field, value]) => field !== 'id' && typed(field, value) && !unlock.has(field))
            .map(([field]) => field)
        : [];
    return { change: 'insert', row: { doc: put.value, locked: locked.sort() }, skipped: [] };
  }
  if (put.onExisting === 'keep') return { change: 'none', skipped: [] };

  const doc: Record<string, unknown> = { ...existing.doc };
  const locked = new Set(existing.locked);
  const skipped: string[] = [];
  for (const [field, value] of Object.entries(put.value)) {
    if (sameJson(existing.doc[field], value)) continue;
    if (origin === 'import' && locked.has(field)) {
      skipped.push(field);
      continue;
    }
    doc[field] = value;
    if (origin === 'manual') locked.add(field);
  }
  for (const field of unlock) locked.delete(field);

  const row = { doc, locked: [...locked].sort() };
  const changed = !sameJson(row.doc, existing.doc) || !sameJson(row.locked, [...existing.locked].sort());
  return changed ? { change: 'update', row, skipped } : { change: 'none', skipped };
}

/** Structural equality of JSON values; object key order does not matter. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  }
  const left = Object.entries(a);
  const right = new Map(Object.entries(b));
  return left.length === right.size && left.every(([key, value]) => right.has(key) && sameJson(value, right.get(key)));
}
