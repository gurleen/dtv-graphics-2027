/**
 * One editor's unsaved work on one row, as plain data. A session remembers the revision the
 * editor read (`basis`) and the row as it was then (`original`), so a save is always made on
 * the basis the editor saw, and a refused save can show what changed underneath.
 */

import { type EditBatch, type EntityKind, type ManualEdit, type Revision, sameJson } from '@dtv/domain';
import { type EditableKind, type Field, type Validated, validate, writeField } from './fields';
import { type Doc, getPath, leaves, type Path, setPath } from './paths';

export interface Session {
  readonly kind: EditableKind;
  /** A new row has no id until its names are typed; this is a stand-in until then. */
  readonly id: string;
  readonly isNew: boolean;
  readonly basis: Revision;
  /** The row as the editor read it; null for a new row. */
  readonly original: Doc | null;
  readonly draft: Doc;
  /** The fields the editor has typed into, so a new row does not scold the ones they have not reached. */
  readonly touched: readonly string[];
  /** Text a field could not parse, kept so the typing is not lost. */
  readonly pending: Readonly<Record<string, { readonly text: string; readonly error: string }>>;
  readonly phase: 'editing' | 'saving' | 'conflict' | 'saved';
  /** Set once saved: the session ends when the World reaches this revision. */
  readonly awaiting: Revision | null;
  readonly error: string | null;
}

export const NEW_ID = '(new)';
export const keyOf = (kind: EntityKind, id: string) => `${kind}:${id}`;
export const keyOfSession = (session: Pick<Session, 'kind' | 'id'>) => keyOf(session.kind, session.id);

export const openSession = (kind: EditableKind, row: Doc, basis: Revision): Session => ({
  kind, id: String(row.id), isNew: false, basis, original: row, draft: row, touched: [], pending: {}, phase: 'editing', awaiting: null, error: null,
});

export const openNewSession = (kind: EditableKind, blank: Doc, basis: Revision): Session => ({
  kind, id: NEW_ID, isNew: true, basis, original: null, draft: blank, touched: [], pending: {}, phase: 'editing', awaiting: null, error: null,
});

/** Typing into a field of the draft. Text the field cannot parse is held aside rather than dropped. */
export function typeInto(session: Session, field: Field, text: string): Session {
  const written = writeField(session.draft, field, text);
  const { [field.id]: _dropped, ...rest } = session.pending;
  const touched = session.touched.includes(field.id) ? session.touched : [...session.touched, field.id];
  if (!written.ok) return { ...session, touched, pending: { ...rest, [field.id]: { text, error: written.error } } };
  return { ...session, draft: written.doc, touched, pending: rest, error: null };
}

/** Sets a path directly, for editors that are not text (a crew list, a select). */
export const setDraft = (session: Session, path: Path, value: unknown): Session => ({
  ...session,
  draft: setPath(session.draft, path, value),
  touched: session.touched.includes(path.join('.')) ? session.touched : [...session.touched, path.join('.')],
  error: null,
});

export const isDirty = (session: Session): boolean =>
  session.isNew || Object.keys(session.pending).length > 0 || !sameJson(session.draft, session.original);

/** The id a new row will be saved under, from its names; null until the names make one. */
export type IdFor = (kind: EditableKind, draft: Doc) => string | null;

export type Saveable = { readonly ok: true; readonly doc: Doc } | { readonly ok: false; readonly message: string };

/** The document to send, or the first reason it cannot go yet. */
export function readyToSave(session: Session, idFor: IdFor): Saveable {
  const pending = Object.values(session.pending)[0];
  if (pending) return { ok: false, message: pending.error };
  let doc = session.draft;
  if (session.isNew) {
    const id = idFor(session.kind, doc);
    if (!id) return { ok: false, message: 'Give it a name no other row has' };
    doc = setPath(doc, ['id'], id);
  }
  const checked: Validated = validate(session.kind, doc);
  if (checked.ok) return { ok: true, doc: checked.doc };
  return { ok: false, message: Object.values(checked.errors)[0] ?? checked.general ?? 'The record is not valid yet' };
}

/** Every error the draft has: the unparsed texts, then the schema's complaints. */
export function problemsOf(session: Session): Readonly<Record<string, string>> {
  const found: Record<string, string> = {};
  const checked = validate(session.kind, session.isNew ? setPath(session.draft, ['id'], 'placeholder') : session.draft);
  if (!checked.ok) Object.assign(found, checked.errors);
  for (const [id, entry] of Object.entries(session.pending)) found[id] = entry.error;
  return found;
}

/** The errors worth showing beside a field now: on a new row, only the fields the editor has typed into. */
export function shownProblems(session: Session): Readonly<Record<string, string>> {
  const all = problemsOf(session);
  return session.isNew ? Object.fromEntries(Object.entries(all).filter(([id]) => session.touched.includes(id))) : all;
}

/** A put of a kind chosen at run time. The cast only restates that ManualEdit has a member for every kind. */
export const manualPut = (kind: EditableKind, value: Doc, unlock?: readonly string[]): ManualEdit =>
  ({ op: 'put', kind, value, ...(unlock?.length ? { unlock } : {}) }) as unknown as ManualEdit;

export const manualDelete = (kind: EditableKind, id: string): ManualEdit => ({ op: 'delete', kind, id }) as unknown as ManualEdit;

export const manualBatch = (basis: Revision, edit: ManualEdit): EditBatch => ({ origin: 'manual', basis, edits: [edit] });

/** One field both editors changed, or that differs between the draft and the row now. */
export interface Disagreement {
  readonly id: string;
  readonly path: Path;
  readonly original: unknown;
  readonly yours: unknown;
  readonly theirs: unknown;
  readonly youChanged: boolean;
  readonly theyChanged: boolean;
}

export type Chosen = 'yours' | 'theirs';

/** The fields where the draft and the row now differ, each marked with who changed it since the basis. */
export function disagreements(original: Doc | null, yours: Doc, theirs: Doc): readonly Disagreement[] {
  const paths = new Map([...leaves(yours), ...leaves(theirs)]);
  const found: Disagreement[] = [];
  for (const [id, path] of paths) {
    const [mine, theirsValue, before] = [getPath(yours, path), getPath(theirs, path), original ? getPath(original, path) : undefined];
    if (sameJson(mine, theirsValue)) continue;
    found.push({ id, path, original: before, yours: mine, theirs: theirsValue, youChanged: !sameJson(mine, before), theyChanged: !sameJson(theirsValue, before) });
  }
  return found;
}

/** Their change stands unless only you changed the field; a field both changed has no default. */
export const defaultSide = (each: Disagreement): Chosen | null => (each.youChanged && each.theyChanged ? null : each.youChanged ? 'yours' : 'theirs');

/** The row as it stands now, with `yours` laid over it for each field you chose. */
export function mergeChoices(theirs: Doc, yours: Doc, choices: readonly Disagreement[], side: (each: Disagreement) => Chosen): Doc {
  return choices.reduce((doc, each) => (side(each) === 'yours' ? setPath(doc, each.path, getPath(yours, each.path)) : doc), theirs);
}
