/**
 * The database commands, on data/db/dtv.sqlite:
 *
 *   bun run db:migrate   bring the file to the schema the code expects
 *   bun run db:seed      migrate, then fill in the prefilled data from data/seed/
 *   bun run db:backup    write a copy to data/db/backups/
 *
 * Run db:seed with the server stopped: the server is the file's one writer.
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { backup, migrate, type MigrationReport, openDb, seed } from '../src/index';

const ROOT = resolve(import.meta.dir, '../../..');
const DB_DIR = join(ROOT, 'data/db');
const BACKUPS = join(DB_DIR, 'backups');

const describe = (report: MigrationReport) =>
  [
    report.created.length ? `created ${report.created.length} tables` : null,
    report.rebuilt.length ? `rebuilt ${report.rebuilt.join(', ')}` : null,
    report.docMigrations.length ? `applied document migrations ${report.docMigrations.join(', ')}` : null,
    report.backup ? `backed up to ${report.backup}` : null,
  ]
    .filter(Boolean)
    .join('; ') || 'already current';

const command = process.argv[2];
if (command !== 'migrate' && command !== 'seed' && command !== 'backup') {
  console.error('usage: bun packages/db/scripts/db.ts migrate | seed | backup');
  process.exit(1);
}

mkdirSync(DB_DIR, { recursive: true });
const db = openDb(join(DB_DIR, 'dtv.sqlite'));
if (command === 'backup') {
  console.log(`backup: ${backup(db, BACKUPS, 'manual')}`);
} else {
  console.log(`migrate: ${describe(migrate(db, { backupDir: BACKUPS }))}`);
  if (command === 'seed') {
    const report = await seed(db, { dir: join(ROOT, 'data/seed') });
    console.log(`seed: inserted ${report.inserted} rows, updated ${report.updated}, wrote ${report.liveInserted} live states; revision ${report.revision}`);
    for (const warning of report.warnings) console.log(`warning (${warning.code}): ${warning.message}`);
  }
}
db.sqlite.close();
