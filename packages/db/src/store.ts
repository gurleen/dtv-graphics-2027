/** Reads and writes of the document tables, the live state and the show state. */

import { SQLiteError } from 'bun:sqlite';
import {
  type EditBatch, emptySnapshot, ENTITIES, type EntityKind, type EntityOf, GameLive, type GameId,
  mergePut, parseEntity, Revision, type WorldSnapshot,
} from '@dtv/domain';
import type { Db } from './db';

type JournalKind = 'data' | 'live' | 'show';

const parseRow = <K extends EntityKind>(kind: K, id: string, doc: string): EntityOf<K> => {
  try {
    return parseEntity(kind, JSON.parse(doc));
  } catch (error) {
    throw new Error(`${kind} ${id} does not match its schema; a shape change shipped without its DocMigration`, { cause: error });
  }
};

/** The revision of the last data commit. Live and show commits do not move the World. */
const dataRevision = (db: Db): Revision =>
  Revision.parse(db.sqlite.query<{ seq: number }, []>(`SELECT coalesce(max(seq), 0) AS seq FROM journal WHERE kind = 'data'`).get()!.seq);

const journal = (db: Db, input: { readonly at: number; readonly actor: string; readonly kind: JournalKind; readonly payload: unknown }): Revision =>
  Revision.parse(
    db.sqlite
      .query<{ seq: number }, [number, string, string, string]>('INSERT INTO journal (at, actor, kind, payload) VALUES (?, ?, ?, ?) RETURNING seq')
      .get(input.at, input.actor, input.kind, JSON.stringify(input.payload))!.seq,
  );

/**
 * Every document, parsed, with its locks. A row that fails its schema stops the load and
 * names its kind and id.
 */
export function loadSnapshot(db: Db): WorldSnapshot {
  const locks: Record<EntityKind, Record<string, readonly string[]>> = emptySnapshot().locks;
  const load = <K extends EntityKind>(kind: K): EntityOf<K>[] => {
    const lockedById: Record<string, readonly string[]> = locks[kind];
    return db.sqlite
      .query<{ id: string; doc: string; locked: string }, []>(`SELECT id, doc, locked FROM "${ENTITIES[kind].table}" ORDER BY id`)
      .all()
      .map((row) => {
        const locked: string[] = JSON.parse(row.locked);
        if (locked.length) lockedById[row.id] = locked;
        return parseRow(kind, row.id, row.doc);
      });
  };
  return {
    revision: dataRevision(db),
    entities: {
      conference: load('conference'),
      school: load('school'),
      team: load('team'),
      season: load('season'),
      teamSeason: load('teamSeason'),
      player: load('player'),
      playerStats: load('playerStats'),
      staff: load('staff'),
      talent: load('talent'),
      sponsor: load('sponsor'),
      sponsorship: load('sponsorship'),
      venue: load('venue'),
      game: load('game'),
      show: load('show'),
    },
    locks,
  };
}

export interface SkippedFields {
  readonly kind: EntityKind;
  readonly id: string;
  readonly fields: readonly string[];
}

export type CommitResult =
  | {
      readonly ok: true;
      /** The new revision, or the current one when the batch changed nothing and wrote no journal row. */
      readonly revision: Revision;
      readonly inserted: number;
      readonly updated: number;
      readonly deleted: number;
      /** Locked fields an import put would have changed and left alone. */
      readonly skipped: readonly SkippedFields[];
    }
  | { readonly ok: false; readonly reason: 'conflict' | 'invalid-reference' | 'duplicate'; readonly detail: string };

class Refusal extends Error {
  constructor(
    readonly reason: 'conflict' | 'invalid-reference' | 'duplicate',
    readonly detail: string,
  ) {
    super(detail);
  }
}

class NothingChanged extends Error {}

/** The first row a deferred foreign key would refuse at COMMIT, named, so the refusal can say which. */
function danglingReference(db: Db): string | null {
  const [dangling] = db.sqlite.query<{ table: string; rowid: number; parent: string }, []>('PRAGMA foreign_key_check').all();
  if (!dangling) return null;
  const row = db.sqlite.query<{ id: string }, [number]>(`SELECT id FROM "${dangling.table}" WHERE rowid = ?`).get(dangling.rowid);
  return `${dangling.table} ${row?.id ?? `rowid ${dangling.rowid}`} refers to a missing row of ${dangling.parent}`;
}

/**
 * One batch, one transaction, one journal row; a batch that changes nothing writes none.
 * With a basis, a put or delete of a row written after it refuses the whole batch. The
 * caller reloads the snapshot afterwards rather than patching memory, so a cascaded
 * delete can never leave the in-memory World behind the file.
 */
export function commitEdits(db: Db, input: { readonly actor: string; readonly at: number; readonly batch: EditBatch }): CommitResult {
  const { batch } = input;
  const skipped: SkippedFields[] = [];
  const counts = { inserted: 0, updated: 0, deleted: 0 };
  try {
    const revision = db.sqlite.transaction(() => {
      const seq = journal(db, { at: input.at, actor: input.actor, kind: 'data', payload: batch });
      for (const edit of batch.edits) {
        const table = ENTITIES[edit.kind].table;
        const id = edit.op === 'put' ? edit.value.id : edit.id;
        const row = db.sqlite.query<{ doc: string; seq: number; locked: string }, [string]>(`SELECT doc, seq, locked FROM "${table}" WHERE id = ?`).get(id);
        if (row && batch.basis !== undefined && row.seq > batch.basis && row.seq !== seq) {
          throw new Refusal('conflict', `${edit.kind} ${id} was written at revision ${row.seq}, after this batch's basis ${batch.basis}`);
        }
        if (edit.op === 'delete') {
          if (!row) continue;
          db.sqlite.run(`DELETE FROM "${table}" WHERE id = ?`, [id]);
          counts.deleted++;
          continue;
        }
        const existing = row ? { doc: parseRow(edit.kind, id, row.doc), locked: JSON.parse(row.locked) } : undefined;
        const merge = mergePut(batch.origin, existing, edit);
        if (merge.skipped.length) skipped.push({ kind: edit.kind, id, fields: merge.skipped });
        if (merge.change === 'none') continue;
        try {
          const values = [JSON.stringify(merge.row.doc), seq, JSON.stringify(merge.row.locked), id];
          if (merge.change === 'insert') db.sqlite.run(`INSERT INTO "${table}" (doc, seq, locked, id) VALUES (?, ?, ?, ?)`, values);
          else db.sqlite.run(`UPDATE "${table}" SET doc = ?, seq = ?, locked = ? WHERE id = ?`, values);
        } catch (error) {
          if (error instanceof SQLiteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new Refusal('duplicate', `${edit.kind} ${id} repeats a natural key: ${error.message}`);
          }
          throw error;
        }
        counts[merge.change === 'insert' ? 'inserted' : 'updated']++;
      }
      const dangling = danglingReference(db);
      if (dangling) throw new Refusal('invalid-reference', dangling);
      if (!counts.inserted && !counts.updated && !counts.deleted) throw new NothingChanged();
      return seq;
    })();
    return { ok: true, revision, ...counts, skipped };
  } catch (error) {
    if (error instanceof NothingChanged) return { ok: true, revision: dataRevision(db), inserted: 0, updated: 0, deleted: 0, skipped };
    if (error instanceof Refusal) return { ok: false, reason: error.reason, detail: error.detail };
    throw error;
  }
}

export function loadLive(db: Db): ReadonlyMap<GameId, GameLive> {
  const rows = db.sqlite.query<{ game_id: string; doc: string }, []>('SELECT game_id, doc FROM live').all();
  return new Map(
    rows.map((row) => {
      const live = GameLive.safeParse(JSON.parse(row.doc));
      if (!live.success) throw new Error(`live state of ${row.game_id} does not match its schema`, { cause: live.error });
      return [live.data.gameId, live.data];
    }),
  );
}

/** The journal row and the state row in one transaction; returns the new revision. */
export function commitLive(db: Db, input: { readonly actor: string; readonly at: number; readonly live: GameLive; readonly payload: unknown }): Revision {
  return db.sqlite.transaction(() => {
    const seq = journal(db, { at: input.at, actor: input.actor, kind: 'live', payload: input.payload });
    db.sqlite.run('INSERT INTO live (game_id, doc, seq) VALUES (?, ?, ?) ON CONFLICT (game_id) DO UPDATE SET doc = excluded.doc, seq = excluded.seq', [
      input.live.gameId,
      JSON.stringify(input.live),
      seq,
    ]);
    return seq;
  })();
}

/** Program and the operators' previews. Its shape belongs to the playout package, so it is opaque here. */
export function loadShowState(db: Db): unknown {
  const row = db.sqlite.query<{ doc: string }, []>('SELECT doc FROM show_state WHERE id = 1').get();
  return row ? JSON.parse(row.doc) : null;
}

export function commitShowState(db: Db, input: { readonly actor: string; readonly at: number; readonly state: unknown; readonly payload: unknown }): Revision {
  return db.sqlite.transaction(() => {
    const seq = journal(db, { at: input.at, actor: input.actor, kind: 'show', payload: input.payload });
    db.sqlite.run('INSERT INTO show_state (id, doc, seq) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET doc = excluded.doc, seq = excluded.seq', [
      JSON.stringify(input.state),
      seq,
    ]);
    return seq;
  })();
}
