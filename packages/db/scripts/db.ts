/**
 * bun packages/db/scripts/db.ts migrate | seed | backup | push | pull
 *
 * push uploads a snapshot of the file to the R2 bucket `DTV_DB_BUCKET` (default dtv-db) through
 * wrangler, so it needs `wrangler login`. pull downloads it from the bucket's public URL
 * (`DTV_DB_ORIGIN` overrides it) without credentials, checks it, backs up the local file and replaces it.
 * pull refuses while the server has the file open.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
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

const BUCKET = process.env.DTV_DB_BUCKET ?? 'dtv-db';
const ORIGIN = process.env.DTV_DB_ORIGIN || 'https://pub-80c21300152e43be9c3d1b41cf8aba59.r2.dev';
const KEY = 'dtv.sqlite';

/**
 * The other processes, such as the server, that have the file open. SQLite cannot tell: an idle WAL
 * connection holds no lock, and macOS keeps the WAL file after the last close. Empty without lsof.
 */
function holders(file: string): string[] {
  const lsof = Bun.spawnSync(['lsof', '-t', file], { stdout: 'pipe', stderr: 'ignore' });
  return lsof.stdout.toString().split('\n').filter((pid) => pid && pid !== String(process.pid));
}

async function pull() {
  const open = existsSync(path) ? holders(path) : [];
  if (open.length) throw new Error(`${path} is open in process ${open.join(', ')}; stop the server and pull again`);
  const url = `${ORIGIN.replace(/\/$/, '')}/${KEY}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const download = `${path}.pull`;
  await Bun.write(download, await response.arrayBuffer());
  let check: string | undefined;
  try {
    const pulled = new Database(download, { readonly: true });
    check = pulled.query<{ quick_check: string }, []>('PRAGMA quick_check').get()?.quick_check;
    pulled.close();
  } catch (error) {
    check = (error as Error).message;
  }
  if (check !== 'ok') {
    rmSync(download);
    throw new Error(`${url} is not a sound SQLite file: ${check}`);
  }
  if (existsSync(path)) {
    const local = openDb(path);
    console.log(`pull: backed up the local file to ${backup(local, BACKUPS, 'pre-pull')}`);
    local.sqlite.close();
  }
  for (const stale of ['-wal', '-shm']) rmSync(`${path}${stale}`, { force: true });
  renameSync(download, path);
  console.log(`pull: replaced ${path} with ${url}`);
}

const command = process.argv[2];
if (command !== 'migrate' && command !== 'seed' && command !== 'backup' && command !== 'push' && command !== 'pull') {
  console.error('usage: bun packages/db/scripts/db.ts migrate | seed | backup | push | pull');
  process.exit(1);
}

mkdirSync(dirname(path), { recursive: true });
if (command === 'pull') {
  await pull().catch((error: Error) => {
    console.error(`pull: ${error.message}`);
    process.exit(1);
  });
  process.exit(0);
}
const db = openDb(path);
if (command === 'backup') {
  console.log(`backup: ${backup(db, BACKUPS, 'manual')}`);
} else if (command === 'push') {
  const snapshot = backup(db, BACKUPS, 'push');
  const put = Bun.spawnSync(
    ['bunx', 'wrangler', 'r2', 'object', 'put', `${BUCKET}/${KEY}`, '--file', snapshot, '--content-type', 'application/vnd.sqlite3', '--cache-control', 'no-cache', '--remote'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (put.exitCode !== 0) {
    console.error(`push: upload to ${BUCKET}/${KEY} failed; is wrangler logged in to the right account?\n${put.stderr}`);
    process.exit(1);
  }
  console.log(`push: uploaded ${snapshot} to ${BUCKET}/${KEY}`);
} else {
  console.log(`migrate: ${describe(migrate(db, { backupDir: BACKUPS }))}`);
  if (command === 'seed') {
    const report = await seed(db, { dir: join(ROOT, 'data/seed') });
    console.log(`seed: inserted ${report.inserted} rows, updated ${report.updated}, wrote ${report.liveInserted} live states; revision ${report.revision}`);
    for (const warning of report.warnings) console.log(`warning (${warning.code}): ${warning.message}`);
  }
}
db.sqlite.close();
