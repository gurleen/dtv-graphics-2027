import { Database } from 'bun:sqlite';
import { dirname, join, resolve } from 'node:path';

export interface Db {
  readonly sqlite: Database;
  readonly path: string;
}

export function openDb(path: string): Db {
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.run('PRAGMA journal_mode = WAL');
  sqlite.run('PRAGMA synchronous = NORMAL');
  sqlite.run('PRAGMA foreign_keys = ON');
  sqlite.run('PRAGMA busy_timeout = 5000');
  return { sqlite, path };
}

/** The file the server and the db scripts open: `DTV_DB`, else data/db/dtv.sqlite. Backups go beside it. */
export function dbLocation(): { readonly path: string; readonly backups: string } {
  const path = resolve(process.env.DTV_DB ?? join(import.meta.dir, '../../../data/db/dtv.sqlite'));
  return { path, backups: join(dirname(path), 'backups') };
}
