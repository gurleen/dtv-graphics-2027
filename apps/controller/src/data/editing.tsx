/**
 * The data page's editing state: one session per row being edited, and the calls that
 * save, resolve, unlock and delete. Every save is `data.apply` with origin `manual` and the
 * basis the editor read when the edit began, never the newest revision.
 */

import { type EntityKind, idFor, type Revision, type World } from '@dtv/domain';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useController } from '../app/context';
import { type EditableKind, type Field } from './fields';
import { type Doc } from './paths';
import { rowOf } from './rows';
import {
  type Chosen, disagreements, type Disagreement, type IdFor, keyOf, isDirty, keyOfSession, manualBatch, manualDelete, manualPut,
  mergeChoices, NEW_ID, openNewSession, openSession, readyToSave, type Session, setDraft, typeInto,
} from './session';

type Outcome = { readonly status: 'saved' } | { readonly status: 'conflict' } | { readonly status: 'refused'; readonly message: string };

export interface Editing {
  session(kind: EntityKind, id: string): Session | undefined;
  /** What the table and panel show for a row: the editor's draft while they have one, else the World's row. */
  docOf(kind: EditableKind, id: string): Doc | undefined;
  /** Starts an edit: remembers the revision the editor is reading. A second call on the same row changes nothing. */
  open(kind: EditableKind, row: Doc): void;
  /** Ends an edit that changed nothing, so the row follows the World again. */
  release(kind: EditableKind, id: string): void;
  /** Typing in the record panel: updates the draft, saves nothing. */
  type(kind: EditableKind, row: Doc, field: Field, text: string): void;
  setValue(kind: EditableKind, row: Doc, path: readonly string[], value: unknown): void;
  /** Enter in a table cell: updates the draft and saves it at once. */
  commit(kind: EditableKind, row: Doc, field: Field, text: string): Promise<Outcome>;
  save(kind: EditableKind, id: string): Promise<Outcome>;
  discard(kind: EditableKind, id: string): void;
  startNew(kind: EditableKind, blank: Doc): void;
  /** The new row's id once saved, or why it was refused. */
  saveNew(kind: EditableKind): Promise<{ readonly id: string } | { readonly message: string }>;
  remove(kind: EditableKind, id: string): Promise<string | null>;
  unlock(kind: EditableKind, id: string, field: string): Promise<string | null>;
  /** Saves `theirs` with your chosen fields laid over, on the revision you are now looking at. */
  resolve(kind: EditableKind, id: string, side: (each: Disagreement) => Chosen): Promise<Outcome>;
}

const EditingContext = createContext<Editing | null>(null);

export function useEditing(): Editing {
  const editing = useContext(EditingContext);
  if (!editing) throw new Error('useEditing outside the data page');
  return editing;
}

/** ORPC errors carry a `code`, and the defined ones a `data.detail`. */
export function describeError(error: unknown): { readonly code: string; readonly message: string } {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';
  const data = typeof error === 'object' && error !== null && 'data' in error ? error.data : null;
  const detail = typeof data === 'object' && data !== null && 'detail' in data ? String(data.detail) : null;
  return { code, message: detail ?? (error instanceof Error ? error.message : String(error)) };
}

/** The id a new row is saved under; null until its names make one, or when another row has it. */
const idForDraft =
  (world: World): IdFor =>
  (kind, draft) => {
    const text = (field: string) => String(draft[field] ?? '').trim();
    try {
      let id: string;
      switch (kind) {
        case 'player':
        case 'staff': {
          const [team, season] = [draft.teamId, draft.seasonId] as [Parameters<typeof idFor.player>[0], Parameters<typeof idFor.player>[1]];
          id = idFor[kind](team, season, text('firstName'), text('lastName'));
          if (kind === 'player' && rowOf(world, 'player', id)) id = `${id}-${text('jersey')}`;
          break;
        }
        case 'talent':
          id = idFor.talent(text('firstName'), text('lastName'));
          break;
        case 'sponsor':
          id = idFor.sponsor(text('name'));
          break;
        case 'venue':
          id = idFor.venue(text('name'));
          break;
        default:
          return null;
      }
      return rowOf(world, kind, id) ? null : id;
    } catch {
      return null;
    }
  };

export function EditingProvider({ children }: { readonly children: ReactNode }) {
  const controller = useController();
  const latest = useRef(controller);
  latest.current = controller;
  const held = useRef<ReadonlyMap<string, Session>>(new Map());
  const [sessions, setSessions] = useState<ReadonlyMap<string, Session>>(held.current);

  const put = useCallback((session: Session) => {
    held.current = new Map(held.current).set(keyOfSession(session), session);
    setSessions(held.current);
  }, []);
  const drop = useCallback((key: string) => {
    const next = new Map(held.current);
    next.delete(key);
    held.current = next;
    setSessions(next);
  }, []);

  // A saved session ends once the World has caught up to its revision, so the row never flickers back to its old value.
  useEffect(() => {
    for (const [key, session] of held.current) {
      if (session.phase === 'saved' && session.awaiting !== null && controller.revision !== null && controller.revision >= session.awaiting) drop(key);
    }
  }, [controller.revision, sessions, drop]);

  const editing = useMemo<Editing>(() => {
    const world = () => latest.current.world;
    const readRevision = (): Revision => {
      const revision = latest.current.revision;
      if (revision === null) throw new Error('the World has not arrived yet');
      return revision;
    };
    const begin = (kind: EditableKind, row: Doc): Session => {
      const id = typeof row.id === 'string' ? row.id : NEW_ID;
      return held.current.get(keyOf(kind, id)) ?? openSession(kind, row, readRevision());
    };

    const apply = async (kind: EditableKind, doc: Doc, basis: Revision) => {
      try {
        const result = await latest.current.api.data.apply(manualBatch(basis, manualPut(kind, doc)));
        return { ok: true, revision: result.revision } as const;
      } catch (error) {
        return { ok: false, ...describeError(error) } as const;
      }
    };

    /** Sends the session's document and files how it ended. */
    const send = async (session: Session, doc: Doc, basis: Revision): Promise<Outcome> => {
      put({ ...session, basis, phase: 'saving', error: null });
      const result = await apply(session.kind, doc, basis);
      if (result.ok) {
        put({ ...session, basis, draft: doc, phase: 'saved', awaiting: result.revision, error: null });
        return { status: 'saved' };
      }
      const conflict = result.code === 'CONFLICT';
      put({ ...session, basis, phase: conflict ? 'conflict' : 'editing', error: result.message });
      return conflict ? { status: 'conflict' } : { status: 'refused', message: result.message };
    };

    const saveSession = async (session: Session): Promise<Outcome> => {
      const w = world();
      const ready = readyToSave(session, w ? idForDraft(w) : () => null);
      if (!ready.ok) {
        put({ ...session, error: ready.message });
        return { status: 'refused', message: ready.message };
      }
      return send(session, ready.doc, session.basis);
    };

    return {
      session: (kind, id) => held.current.get(keyOf(kind, id)),
      docOf: (kind, id) => held.current.get(keyOf(kind, id))?.draft ?? (world() ? rowOf(world()!, kind, id) : undefined),
      open: (kind, row) => put(begin(kind, row)),
      release(kind, id) {
        const session = held.current.get(keyOf(kind, id));
        if (session && session.phase === 'editing' && !isDirty(session)) drop(keyOf(kind, id));
      },
      type: (kind, row, field, text) => put(typeInto(begin(kind, row), field, text)),
      setValue: (kind, row, path, value) => put(setDraft(begin(kind, row), path, value)),
      async commit(kind, row, field, text) {
        const session = typeInto(begin(kind, row), field, text);
        const refused = session.pending[field.id];
        if (refused) return { status: 'refused', message: refused.error };
        const ready = readyToSave(session, () => null);
        if (!ready.ok) return { status: 'refused', message: ready.message };
        return send(session, ready.doc, session.basis);
      },
      save: (kind, id) => {
        const session = held.current.get(keyOf(kind, id));
        return session ? saveSession(session) : Promise.resolve({ status: 'saved' });
      },
      discard: (kind, id) => drop(keyOf(kind, id)),
      startNew: (kind, blank) => put(openNewSession(kind, blank, readRevision())),
      async saveNew(kind) {
        const session = held.current.get(keyOf(kind, NEW_ID));
        const w = world();
        if (!session || !w) return { message: 'Nothing to save' };
        const ready = readyToSave(session, idForDraft(w));
        if (!ready.ok) {
          put({ ...session, error: ready.message });
          return { message: ready.message };
        }
        put({ ...session, phase: 'saving', error: null });
        const result = await apply(kind, ready.doc, session.basis);
        if (!result.ok) {
          put({ ...session, phase: 'editing', error: result.message });
          return { message: result.message };
        }
        const id = String(ready.doc.id);
        drop(keyOf(kind, NEW_ID));
        put({ ...session, id, isNew: false, original: null, draft: ready.doc, phase: 'saved', awaiting: result.revision, error: null });
        return { id };
      },
      async remove(kind, id) {
        try {
          await latest.current.api.data.apply(manualBatch(readRevision(), manualDelete(kind, id)));
          drop(keyOf(kind, id));
          return null;
        } catch (error) {
          return describeError(error).message;
        }
      },
      async unlock(kind, id, field) {
        const w = world();
        const row = w && rowOf(w, kind, id);
        if (!row) return 'The row is gone';
        try {
          await latest.current.api.data.apply(manualBatch(readRevision(), manualPut(kind, row, [field])));
          return null;
        } catch (error) {
          return describeError(error).message;
        }
      },
      async resolve(kind, id, side) {
        const session = held.current.get(keyOf(kind, id));
        const w = world();
        if (!session || !w) return { status: 'refused', message: 'Nothing to resolve' };
        const theirs = rowOf(w, kind, id);
        // The row was deleted: only "use yours" is left, which writes the draft again.
        const doc = theirs ? mergeChoices(theirs, session.draft, disagreements(session.original, session.draft, theirs), side) : session.draft;
        const ready = readyToSave({ ...session, draft: doc }, () => null);
        if (!ready.ok) return { status: 'refused', message: ready.message };
        return send({ ...session, original: theirs ?? null, draft: ready.doc }, ready.doc, w.revision);
      },
    };
  }, [put, drop]);

  return <EditingContext.Provider value={useMemo(() => ({ ...editing }), [editing, sessions])}>{children}</EditingContext.Provider>;
}
