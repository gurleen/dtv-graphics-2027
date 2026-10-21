import { ENTITIES, ENTITY_KINDS, type EntityKind, parseEntity } from '@dtv/domain';
import { backup } from './backup';
import type { Db } from './db';
import { TABLES, type TableSql } from './schema';

/**
 * A document change a schema default cannot absorb, such as a rename. An added field needs
 * no migration: every load parses each document and the default fills it in.
 * `PRAGMA user_version` records the last one applied.
 */
export interface DocMigration {
  readonly version: number;
  readonly kind: EntityKind;
  readonly up: (doc: unknown) => unknown;
  /** Fields `up` renames, old name to new, so each row's locks follow them. */
  readonly renames?: Readonly<Record<string, string>>;
}

/** The migration for a rename: the document's field and the row's lock on it both move. */
export const renameField = (version: number, kind: EntityKind, from: string, to: string): DocMigration => ({
  version,
  kind,
  up: (doc) => {
    if (doc === null || typeof doc !== 'object' || !(from in doc)) return doc;
    const { [from]: value, ...rest } = doc as Record<string, unknown>;
    return { ...rest, [to]: value };
  },
  renames: { [from]: to },
});

export const DOC_MIGRATIONS: readonly DocMigration[] = [];

export interface MigrationReport {
  readonly created: readonly string[];
  readonly rebuilt: readonly string[];
  readonly docMigrations: readonly number[];
  readonly backup: string | null;
}

const storedColumns = (db: Db, table: string) =>
  db.sqlite
    .query<{ name: string; hidden: number }, []>(`PRAGMA table_xinfo("${table}")`)
    .all()
    .filter((column) => column.hidden === 0)
    .map((column) => column.name);

interface Row {
  readonly id: string;
  readonly doc: string;
  readonly seq: number;
  readonly locked: string;
}

/** A row through `migrations` in order: its document reshaped and checked, its locks renamed. */
function migrateRow(kind: EntityKind, migrations: readonly DocMigration[], row: Row): Row {
  let doc: unknown = JSON.parse(row.doc);
  let locked: string[] = JSON.parse(row.locked);
  for (const migration of migrations) {
    doc = migration.up(doc);
    locked = locked.map((field) => migration.renames?.[field] ?? field);
  }
  return { ...row, doc: JSON.stringify(parseEntity(kind, doc)), locked: JSON.stringify(locked) };
}

/** SQLite's documented rebuild. `reshape` rewrites each row on the way, so generated columns read the new documents. */
function rebuild(db: Db, table: TableSql, reshape: ((row: Row) => Row) | null) {
  const staging = `${table.table}_new`;
  db.sqlite.run(table.create.replace(`CREATE TABLE "${table.table}"`, `CREATE TABLE "${staging}"`));
  if (reshape) {
    const insert = db.sqlite.prepare(`INSERT INTO "${staging}" (id, doc, seq, locked) VALUES (?, ?, ?, ?)`);
    for (const row of db.sqlite.query<Row, []>(`SELECT id, doc, seq, locked FROM "${table.table}"`).all()) {
      const next = reshape(row);
      insert.run(next.id, next.doc, next.seq, next.locked);
    }
  } else {
    const kept = new Set(storedColumns(db, table.table));
    const shared = storedColumns(db, staging)
      .filter((name) => kept.has(name))
      .join(', ');
    db.sqlite.run(`INSERT INTO "${staging}" (${shared}) SELECT ${shared} FROM "${table.table}"`);
  }
  db.sqlite.run(`DROP TABLE "${table.table}"`);
  db.sqlite.run(`ALTER TABLE "${staging}" RENAME TO "${table.table}"`);
  for (const index of table.indexes) db.sqlite.run(index);
}

/**
 * Brings the file to the schema the code expects. It compares each table's SQL and
 * indexes with what the code derives and rebuilds only the tables that differ, so a
 * second run does nothing, and a crashed run (one transaction) is redone by the next.
 * A backup comes first whenever existing data will be rewritten.
 */
export function migrate(
  db: Db,
  options: { readonly backupDir: string; readonly migrations?: readonly DocMigration[] },
): MigrationReport {
  const migrations = [...(options.migrations ?? DOC_MIGRATIONS)].sort((a, b) => a.version - b.version);
  const tables = new Map(
    db.sqlite.query<{ name: string; sql: string }, []>(`SELECT name, sql FROM sqlite_schema WHERE type = 'table'`).all().map((row) => [row.name, row.sql]),
  );
  const indexesOf = (table: string) =>
    db.sqlite
      .query<{ sql: string }, [string]>(`SELECT sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY sql`)
      .all(table)
      .map((row) => row.sql);

  const fresh = TABLES.every((table) => !tables.has(table.table));
  const create = TABLES.filter((table) => !tables.has(table.table));
  const rebuilt = TABLES.filter(
    (table) => tables.has(table.table) && (tables.get(table.table) !== table.create || indexesOf(table.table).join('\n') !== [...table.indexes].sort().join('\n')),
  );
  const version = db.sqlite.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
  const latest = Math.max(version, ...migrations.map((migration) => migration.version));
  const pending = fresh ? [] : migrations.filter((migration) => migration.version > version);

  if (!create.length && !rebuilt.length && !pending.length) return { created: [], rebuilt: [], docMigrations: [], backup: null };
  const backupFile = rebuilt.length || pending.length ? backup(db, options.backupDir, 'pre-migrate') : null;

  // Foreign keys cannot be switched inside a transaction, and a rebuild drops tables others reference.
  db.sqlite.run('PRAGMA foreign_keys = OFF');
  try {
    db.sqlite.transaction(() => {
      for (const table of create) {
        db.sqlite.run(table.create);
        for (const index of table.indexes) db.sqlite.run(index);
      }
      const reshapes = new Map<string, (row: Row) => Row>(
        ENTITY_KINDS.flatMap((kind) => {
          const own = pending.filter((migration) => migration.kind === kind);
          return own.length ? [[ENTITIES[kind].table, (row: Row) => migrateRow(kind, own, row)] as const] : [];
        }),
      );
      for (const table of rebuilt) rebuild(db, table, reshapes.get(table.table) ?? null);
      const rebuiltNames = new Set(rebuilt.map((table) => table.table));
      for (const [table, reshape] of reshapes) {
        if (rebuiltNames.has(table)) continue;
        const update = db.sqlite.prepare(`UPDATE "${table}" SET doc = ?, locked = ? WHERE id = ?`);
        for (const row of db.sqlite.query<Row, []>(`SELECT id, doc, seq, locked FROM "${table}"`).all()) {
          const next = reshape(row);
          update.run(next.doc, next.locked, next.id);
        }
      }
      db.sqlite.run(`PRAGMA user_version = ${latest}`);
      const dangling = db.sqlite.query<{ table: string; parent: string }, []>('PRAGMA foreign_key_check').all();
      if (dangling.length) {
        throw new Error(`migrate left ${dangling.length} dangling references, first ${dangling[0]!.table} -> ${dangling[0]!.parent}`);
      }
    })();
  } finally {
    db.sqlite.run('PRAGMA foreign_keys = ON');
  }
  return {
    created: create.map((table) => table.table),
    rebuilt: rebuilt.map((table) => table.table),
    docMigrations: pending.map((migration) => migration.version),
    backup: backupFile,
  };
}
