import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Connection, connect, first } from '@dtv/api';
import { type Db, migrate, openDb, seed } from '@dtv/db';
import { GameId } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { OperatorId, type Registry } from '@dtv/playout';
import { rpcWebSocket } from './router';
import { createStatcrewSupervisor, type StatcrewSupervisor } from './statcrew-feed';
import { createStore, systemClock } from './store';

const SEED = join(import.meta.dir, '../../../data/seed');

let dir: string;
let db: Db;
let server: ReturnType<typeof Bun.serve>;
let client: Connection;
let statcrew: StatcrewSupervisor;

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
  statcrew = createStatcrewSupervisor({
    command: ({ file, game }) => [process.execPath, join(import.meta.dir, 'statcrew-fake-tool.ts'), 'run', file, game],
    hasGame: (game) => store.world().get('game', game) !== undefined,
  });
  server = Bun.serve({
    port: 0,
    fetch: (request, server) => (server.upgrade(request, { data: { client: 'test' } }) ? undefined : new Response('', { status: 426 })),
    websocket: rpcWebSocket(store, statcrew),
  });
  client = connect({ url: `ws://localhost:${server.port}/rpc` });
});

afterEach(async () => {
  await statcrew.stop();
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

test('the StatCrew feed starts and stops over the socket, and refuses a missing file or game with named errors', async () => {
  const { api } = client;
  const game = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
  const file = join(dir, 'game.xml');
  writeFileSync(file, '<bbgame/>');

  expect(await first((signal) => api.tools.statcrew.watch(undefined, { signal }))).toMatchObject({ state: 'stopped', file: null });
  await expect(api.tools.statcrew.start({ file: join(dir, 'missing.xml'), game })).rejects.toMatchObject({ code: 'NO_FILE' });
  await expect(api.tools.statcrew.start({ file, game: GameId.parse('2026-27/2026-11-08/nobody.at.nowhere') })).rejects.toMatchObject({ code: 'NO_GAME' });

  expect(await api.tools.statcrew.start({ file, game })).toMatchObject({ state: 'running', file, game });
  const running = await first((signal) => api.tools.statcrew.watch(undefined, { signal }));
  expect(running).toMatchObject({ state: 'running', file, game });
  expect(await api.tools.statcrew.stop()).toMatchObject({ state: 'stopped', file, game });
  expect(await api.tools.statcrew.stop()).toMatchObject({ state: 'stopped' });
});
