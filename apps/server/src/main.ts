/**
 * The show server: one process, one port, one writer of the SQLite file.
 *
 *   bun run start            serve data/db/dtv.sqlite on port 8975
 *   bun run dev              the same, restarting when a source file changes
 *   ... --seed               seed from data/seed before serving
 *
 * `PORT` and `DTV_DB` override the port and the database file.
 *
 *   /      a plain status page
 *   /rpc   the oRPC WebSocket
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { backup, migrate, openDb, seed } from '@dtv/db';
import { GRAPHICS } from '@dtv/graphics';
import { RPCHandler } from '@orpc/server/bun-ws';
import { type CallContext, createRouter } from './router';
import { createStore, systemClock } from './store';

const ROOT = resolve(import.meta.dir, '../../..');
const PORT = Number(process.env.PORT ?? 8975);
const DB_PATH = resolve(process.env.DTV_DB ?? join(ROOT, 'data/db/dtv.sqlite'));
const BACKUPS = join(dirname(DB_PATH), 'backups');

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
const handler = new RPCHandler(createRouter(store));

const escape = (text: string) => text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);

const statusPage = () => {
  const status = store.status();
  const rows = [
    ['Database', DB_PATH],
    ['Revision', String(status.revision)],
    ['Active show', status.showId ?? 'none'],
    ['Operators', status.operators.join(', ') || 'none'],
    ['Open streams', String(status.streams)],
  ];
  const table = rows.map(([name, value]) => `<tr><th>${escape(name!)}</th><td>${escape(value!)}</td></tr>`).join('');
  return new Response(`<!doctype html><meta charset="utf-8"><title>DTV server</title><h1>DTV server</h1><table>${table}</table>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

const server = Bun.serve({
  port: PORT,
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/rpc') {
      if (server.upgrade(request, { data: { client: url.searchParams.get('client') ?? 'anonymous' } })) return;
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (url.pathname === '/') return statusPage();
    return new Response('Not found', { status: 404 });
  },
  websocket: {
    data: {} as CallContext,
    // A World snapshot is about 430 KB of JSON and 34 KB compressed.
    perMessageDeflate: true,
    message(ws, message) {
      void handler.message(ws, message, { context: ws.data });
    },
    close(ws) {
      handler.close(ws);
    },
  },
});
console.info(`dtv server on http://localhost:${server.port} with ${DB_PATH}`);

const shutdown = () => {
  store.close();
  void server.stop(true);
  backup(db, BACKUPS, 'shutdown');
  db.sqlite.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
