import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Connection, connect, first } from '@dtv/api';
import { type Db, migrate, openDb, seed } from '@dtv/db';
import { GameId } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { OperatorId, type Registry } from '@dtv/playout';
import { createFeedSupervisor } from './feed-supervisor';
import type { Feeds } from './feeds';
import { rpcWebSocket } from './router';
import { createStore, systemClock } from './store';

const SEED = join(import.meta.dir, '../../../data/seed');

let dir: string;
let db: Db;
let server: ReturnType<typeof Bun.serve>;
let client: Connection;
let feeds: Feeds;

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
  const hasGame = (game: GameId) => store.world().get('game', game) !== undefined;
  const fake = join(import.meta.dir, 'feed-fake-tool.ts');
  feeds = {
    statcrew: createFeedSupervisor({
      inputs: ['file', 'game'],
      command: ({ file, game }) => [process.execPath, fake, 'run', file, game],
      validate: async ({ file, game }) => (!hasGame(game) ? 'no-game' : (await Bun.file(file).exists()) ? null : 'no-file'),
    }),
    allsport: createFeedSupervisor({
      inputs: ['port', 'game', 'score'],
      command: ({ port, game, score }) => [process.execPath, fake, 'run', port, game, String(score)],
      validate: async ({ port, game }) => (!hasGame(game) ? 'no-game' : (await Bun.file(port).exists()) ? null : 'no-port'),
    }),
    ports: () => ['/dev/cu.fake'],
  };
  server = Bun.serve({
    port: 0,
    fetch: (request, server) => (server.upgrade(request, { data: { client: 'test' } }) ? undefined : new Response('', { status: 426 })),
    websocket: rpcWebSocket(store, feeds),
  });
  client = connect({ url: `ws://localhost:${server.port}/rpc` });
});

afterEach(async () => {
  await Promise.all([feeds.statcrew.stop(), feeds.allsport.stop()]);
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

test('the AllSport feed lists ports, refuses a missing device or game, and a different score restarts it', async () => {
  const { api } = client;
  const game = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
  const port = join(dir, 'tty');
  writeFileSync(port, '');

  expect(await api.tools.allsport.ports()).toEqual(['/dev/cu.fake']);
  expect(await first((signal) => api.tools.allsport.watch(undefined, { signal }))).toMatchObject({ state: 'stopped', port: null, score: null });
  await expect(api.tools.allsport.start({ port: join(dir, 'missing'), game, score: true })).rejects.toMatchObject({ code: 'NO_PORT' });
  await expect(api.tools.allsport.start({ port, game: GameId.parse('2026-27/2026-11-08/nobody.at.nowhere'), score: true })).rejects.toMatchObject({ code: 'NO_GAME' });

  const started = await api.tools.allsport.start({ port, game, score: true });
  expect(started).toMatchObject({ state: 'running', port, game, score: true });
  const restarted = await api.tools.allsport.start({ port, game, score: false });
  expect(restarted).toMatchObject({ state: 'running', score: false });
  expect(restarted.startedAt).not.toBe(started.startedAt);
  expect(await api.tools.allsport.stop()).toMatchObject({ state: 'stopped', port, game, score: false });
});
