import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db';

const BACKUP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9-]+\.sqlite$/;

/**
 * A consistent copy of the file, taken while readers keep reading: VACUUM INTO writes a
 * fresh database. Names start with the time, so name order is age order; a name already
 * taken moves the time on a millisecond. Keeps the newest `keep`.
 */
export function backup(db: Db, dir: string, reason: string, keep = 30): string {
  mkdirSync(dir, { recursive: true });
  const nameAt = (time: number) => `${new Date(time).toISOString().replace(/[:.]/g, '-')}-${reason}.sqlite`;
  let time = Date.now();
  while (existsSync(join(dir, nameAt(time)))) time++;
  const file = join(dir, nameAt(time));
  db.sqlite.run('VACUUM INTO ?', [file]);
  const backups = readdirSync(dir)
    .filter((name) => BACKUP.test(name))
    .sort()
    .reverse();
  for (const old of backups.slice(keep)) rmSync(join(dir, old));
  return file;
}
