import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { backup, dbLocation, migrate, type MigrationReport, openDb, seed } from '../src/index';

const ROOT = resolve(import.meta.dir, '../../..');
const { path, backups: BACKUPS } = dbLocation();

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

mkdirSync(dirname(path), { recursive: true });
const db = openDb(path);
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
