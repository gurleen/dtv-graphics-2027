import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Connection, connect, first } from '@dtv/api';
import { type Db, migrate, openDb, seed } from '@dtv/db';
import { GRAPHICS } from '@dtv/graphics';
import { OperatorId, type Registry } from '@dtv/playout';
import { rpcWebSocket } from './router';
import { createStore, systemClock } from './store';

const SEED = join(import.meta.dir, '../../../data/seed');

let dir: string;
let db: Db;
let server: ReturnType<typeof Bun.serve>;
let client: Connection;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dtv-router-'));
  db = openDb(join(dir, 'dtv.sqlite'));
  migrate(db, { backupDir: join(dir, 'backups') });
  await seed(db, { dir: SEED, at: 0 });
  const scorebug = GRAPHICS['basketball-v2/scorebug']!;
  const registry: Registry = {
    ...GRAPHICS,
    [scorebug.id]: {
      ...scorebug,
      free: () => {
        throw new Error('free() broke');
      },
    },
  };
  const store = createStore({ db, registry, clock: systemClock, backupDir: join(dir, 'backups') });
  server = Bun.serve({
    port: 0,
    fetch: (request, server) => (server.upgrade(request, { data: { client: 'test' } }) ? undefined : new Response('', { status: 426 })),
    websocket: rpcWebSocket(store),
  });
  client = connect({ url: `ws://localhost:${server.port}/rpc` });
});

afterEach(async () => {
  client.close();
  await server.stop(true);
  db.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a stream that throws fails for its caller only; the same socket keeps answering', async () => {
  const failure = await first((signal) => client.api.show.watch({ operator: OperatorId.parse('alex') }, { signal })).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  const world = await first((signal) => client.api.data.watch(undefined, { signal }));
  expect(world.revision).toBeGreaterThan(0);
});
