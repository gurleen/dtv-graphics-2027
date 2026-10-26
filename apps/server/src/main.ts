/**
 * The show server: one process, one port, one writer of the SQLite file.
 *
 *   bun run start            serve data/db/dtv.sqlite on port 8975
 *   bun run dev              the same, restarting when a source file changes
 *   ... --seed               seed from data/seed before serving
 *
 * `PORT` and `DTV_DB` override the port and the database file.
 *
 *   /                   the controller: the show (#/show), data (#/data) and tools (#/tools) pages
 *   /status             a plain status page
 *   /rpc                the oRPC WebSocket
 *   /renderer           the page OBS loads; it draws program
 *   /riv/<stem>.riv     the signed scenes, from build/riv (`bun run riv:build`)
 *   /assets/...         images and fonts, from assets/
 *   /headshots/...      <espnId>/<program>/<jersey>.png, cached in data/cache/headshots from the R2 bucket
 *
 * `DTV_HEADSHOT_ORIGIN` overrides the bucket's public URL.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { backup, dbLocation, migrate, openDb, seed } from '@dtv/db';
import controllerPage from '@dtv/controller';
import { PROGRAMS } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import rendererPage from '@dtv/renderer-page';
import { rpcWebSocket } from './router';
import { headshotHandler } from './headshots';
import { createStatcrewSupervisor } from './statcrew-feed';
import { createStore, systemClock } from './store';

const ROOT = resolve(import.meta.dir, '../../..');
const PORT = Number(process.env.PORT ?? 8975);
const { path: DB_PATH, backups: BACKUPS } = dbLocation();
const HEADSHOT_ORIGIN = process.env.DTV_HEADSHOT_ORIGIN ?? 'https://pub-64b137d0bba74538ba1be1f9a07df1ce.r2.dev';

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
const migration = migrate(db, { backupDir: BACKUPS });
if (migration.created.length || migration.rebuilt.length) {
  console.info(`migrate: created ${migration.created.length} tables, rebuilt ${migration.rebuilt.length}`);
}
if (process.argv.includes('--seed')) {
  const report = await seed(db, { dir: join(ROOT, 'data/seed') });
  console.info(`seed: inserted ${report.inserted} rows, ${report.liveInserted} live states; revision ${report.revision}`);
}

const store = createStore({ db, registry: GRAPHICS, clock: systemClock, backupDir: BACKUPS });

const statcrew = createStatcrewSupervisor({
  command: ({ file, game }) => [process.execPath, join(ROOT, 'packages/live-statcrew/src/main.ts'), `--file=${file}`, `--game=${game}`, `--server=ws://localhost:${PORT}/rpc`],
  hasGame: (id) => {
    const game = store.world().get('game', id);
    return game !== undefined && PROGRAMS[game.program].sport === 'basketball';
  },
});

const escape = (text: string) => text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);

const statusPage = () => {
  const status = store.status();
  const rows = [
    ['Database', DB_PATH],
    ['Revision', String(status.revision)],
    ['Active game', status.gameId ?? 'none'],
    ['Operators', status.operators.join(', ') || 'none'],
    ['Open streams', String(status.streams)],
  ];
  const table = rows.map(([name, value]) => `<tr><th>${escape(name!)}</th><td>${escape(value!)}</td></tr>`).join('');
  return new Response(`<!doctype html><meta charset="utf-8"><title>DTV server</title><h1>DTV server</h1><table>${table}</table>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

/** The file under `dir` that `path` names, or null for a path that leaves it. */
function fileUnder(dir: string, path: string): ReturnType<typeof Bun.file> | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  const file = resolve(dir, `.${sep}${decoded}`);
  return file.startsWith(dir + sep) ? Bun.file(file) : null;
}

/** Serves `/<prefix>/...` from `dir`; a missing file or a path out of `dir` is a 404. */
const staticFiles = (prefix: string, dir: string) => async (request: Request) => {
  const file = fileUnder(dir, new URL(request.url).pathname.slice(prefix.length + 2));
  if (!file || !(await file.exists())) return new Response('Not found', { status: 404 });
  return new Response(file, { headers: { 'cache-control': 'no-cache' } });
};

const server = Bun.serve({
  port: PORT,
  // Hot reloading reloads every open page when this server restarts: each controller loses its
  // unsaved edits and every monitor and /renderer replays its intros. A restart must change nothing on screen.
  development: { hmr: false },
  routes: {
    '/': controllerPage,
    '/renderer': rendererPage,
    '/riv/*': staticFiles('riv', join(ROOT, 'build/riv')),
    '/assets/*': staticFiles('assets', join(ROOT, 'assets')),
    '/headshots/*': headshotHandler({
      cacheDir: join(ROOT, 'data/cache/headshots'),
      origin: HEADSHOT_ORIGIN,
      placeholder: Bun.file(join(ROOT, 'assets/images/headshots/placeholder.png')),
    }),
  },
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/rpc') {
      if (server.upgrade(request, { data: { client: url.searchParams.get('client') ?? 'anonymous' } })) return;
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (url.pathname === '/status') return statusPage();
    return new Response('Not found', { status: 404 });
  },
  websocket: rpcWebSocket(store, statcrew),
});
console.info(`dtv server on http://localhost:${server.port} with ${DB_PATH}`);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  // The feed hands score and stats back over this server's socket, so it stops first.
  await statcrew.stop();
  store.close();
  void server.stop(true);
  backup(db, BACKUPS, 'shutdown');
  db.sqlite.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
