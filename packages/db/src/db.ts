import { Database } from 'bun:sqlite';

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
