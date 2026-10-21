import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db';

const BACKUP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(?<reason>[a-z0-9-]+)\.sqlite$/;

/**
 * A consistent copy of the file, taken while readers keep reading. Keeps the newest `keep`,
 * and the newest of each reason, so a run of show activations never evicts the only
 * backup taken before a migration.
 */
export function backup(db: Db, dir: string, reason: string, keep = 30): string {
  mkdirSync(dir, { recursive: true });
  const nameAt = (time: number) => `${new Date(time).toISOString().replace(/[:.]/g, '-')}-${reason}.sqlite`;
  let time = Date.now();
  while (existsSync(join(dir, nameAt(time)))) time++;
  const file = join(dir, nameAt(time));
  db.sqlite.run('VACUUM INTO ?', [file]);
  const newestFirst = readdirSync(dir)
    .flatMap((name) => {
      const match = BACKUP.exec(name);
      return match ? [{ name, reason: match.groups!.reason! }] : [];
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  const reasons = new Set<string>();
  newestFirst.forEach(({ name, reason }, index) => {
    const newestOfReason = !reasons.has(reason);
    reasons.add(reason);
    if (index >= keep && !newestOfReason) rmSync(join(dir, name));
  });
  return file;
}
