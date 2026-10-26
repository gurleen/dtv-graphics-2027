/**
 * Pushes a StatCrew basketball XML file's box score into the running show server.
 *
 *   bun packages/live-statcrew/src/main.ts --file=<path> --game=<GameId> [--server=ws://localhost:8975/rpc] [--source=statcrew]
 */

import { connect, untilAnswered, watch } from '@dtv/api';
import { basketball, GameId, indexWorld, PROGRAMS, resolveGame, SIDES, SourceId, type World } from '@dtv/domain';
import { readFile } from 'node:fs/promises';
import { unwatchFile, watchFile } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { commandsFor } from './commands';
import { parseStatcrew } from './statcrew';

const USAGE = 'usage: bun packages/live-statcrew/src/main.ts --file=<path> --game=<GameId> [--server=ws://localhost:8975/rpc] [--source=statcrew]';
const POLL_MS = 500;
const SEND_WITHIN_MS = 10_000;
const GROUPS = ['score', 'stats'] as const;

const Args = z.object({
  file: z.string().min(1),
  game: GameId,
  server: z.string().default('ws://localhost:8975/rpc'),
  source: SourceId.default(SourceId.parse('statcrew')),
});

const parsedArgs = Args.safeParse(parseArgs({ options: { file: { type: 'string' }, game: { type: 'string' }, server: { type: 'string' }, source: { type: 'string' } }, strict: false }).values);
if (!parsedArgs.success) {
  console.error(`${z.prettifyError(parsedArgs.error)}\n${USAGE}`);
  process.exit(2);
}
const { file, game: gameId, server, source } = parsedArgs.data;

const log = (message: string) => console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
const refusal = (error: unknown) => error as { code?: string; data?: { group?: string; player?: string }; message?: string };

const { api, close } = connect({ url: server, client: 'statcrew' });
const stop = new AbortController();

let world: World | undefined;
const firstWorld = Promise.withResolvers<void>();
void watch(
  (signal) => api.data.watch(undefined, { signal }),
  (snapshot) => {
    world = indexWorld(snapshot);
    firstWorld.resolve();
    void push();
  },
  { signal: stop.signal, onStatus: (status) => status === 'reconnecting' && log(`server ${server} unreachable, reconnecting`) },
);
await firstWorld.promise;

const view = resolveGame(world!, gameId);
if (!view) fail(`game ${gameId} is not in the server's data`);
if (PROGRAMS[view.program].sport !== 'basketball') fail(`game ${gameId} is ${PROGRAMS[view.program].sport}, not basketball`);

const hand = (to: SourceId) =>
  untilAnswered(
    (signal) =>
      api.game.apply(
        { sport: 'basketball', gameId, source: basketball.OPERATOR, commands: GROUPS.map((group) => ({ type: 'authority', group, source: to })) },
        { signal },
      ),
    { withinMs: SEND_WITHIN_MS },
  ).then(() => log(`handed ${GROUPS.join(' and ')} to ${to}`));

let lastSent = '';
const reported = new Set<string>();
let queue: Promise<void> = Promise.resolve();
let armed = false;
let running = true;

/** Reads the file and writes what changed. Runs one at a time, so two changes never race their sends. */
const push = () => (queue = queue.then(pushOnce));

async function pushOnce() {
  if (!armed || !running || !world) return;
  const game = world.get('game', gameId);
  if (!game) return log(`game ${gameId} is gone from the server's data`);
  let parsed;
  try {
    parsed = parseStatcrew(await readFile(file, 'utf8'));
  } catch (error) {
    return log(`waiting for the next change: ${(error as Error).message.split('\n')[0]}`);
  }
  const rosters = {
    away: new Map(world.roster(game.awayTeamId, game.seasonId).map((player) => [player.jersey, player.id])),
    home: new Map(world.roster(game.homeTeamId, game.seasonId).map((player) => [player.jersey, player.id])),
  };
  const { commands, unmatched } = commandsFor(parsed, rosters);
  for (const player of unmatched.filter((name) => !reported.has(name))) {
    reported.add(player);
    log(`not on the roster, skipped: ${player}`);
  }
  const body = JSON.stringify(commands);
  if (body === lastSent) return;
  try {
    await untilAnswered((signal) => api.game.apply({ sport: 'basketball', gameId, source, commands }, { signal }), { withinMs: SEND_WITHIN_MS });
    lastSent = body;
    const { away, home } = parsed.teams;
    log(`${away.name} ${away.score}, ${home.name} ${home.score}; ${commands.filter((command) => command.type === 'playerLine').length} players pushed`);
  } catch (error) {
    const { code, data, message } = refusal(error);
    log(code === 'NOT_AUTHORITY' ? `the operator took ${data?.group} back; still watching` : `push failed, will retry on the next change: ${code ?? message}`);
  }
}

async function shutdown() {
  if (!running) return;
  running = false;
  unwatchFile(file);
  await queue;
  await hand(basketball.OPERATOR).catch((error) => log(`could not hand back: ${refusal(error).message}`));
  stop.abort();
  close();
  // A listening stdin would keep the process alive.
  process.stdin.destroy();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await hand(source);
armed = true;
watchFile(file, { interval: POLL_MS }, () => void push());
void push();
log(`watching ${file} for ${view.sides.away.team.id} at ${view.sides.home.team.id}, writing as ${source}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown());
// The server stops a feed with a `stop` line on stdin: Windows has no SIGINT to send a child.
process.stdin.on('data', (chunk) => /^stop\r?$/m.test(String(chunk)) && void shutdown());
