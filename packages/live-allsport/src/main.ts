/**
 * Pushes a Daktronics AllSport 5000 console's basketball clock, score and more into the running show server.
 *
 *   bun packages/live-allsport/src/main.ts --port=<path> --game=<GameId> [--score=true|false] [--baud=19200] [--server=ws://localhost:8975/rpc] [--source=allsport]
 */

import { connect, untilAnswered, watch } from '@dtv/api';
import { basketball, GameId, indexWorld, PROGRAMS, resolveGame, SourceId, type World } from '@dtv/domain';
import { closeSync, createReadStream, openSync, type ReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { readBasketball } from './basketball';
import { type AllsportGroup, commandsFor, NOTHING_SENT } from './commands';
import { createFramer, createRtdBuffer } from './rtd';

const USAGE =
  'usage: bun packages/live-allsport/src/main.ts --port=<path> --game=<GameId> [--score=true|false] [--baud=19200] [--server=ws://localhost:8975/rpc] [--source=allsport]';
const SEND_WITHIN_MS = 10_000;
const MIN_PUSH_GAP_MS = 100;
const RETRY_MS = 1_000;
const DROPPED_REPORT_MS = 10_000;

const Args = z.object({
  port: z.string().min(1),
  game: GameId,
  score: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  baud: z.coerce.number().int().positive().default(19200),
  server: z.string().default('ws://localhost:8975/rpc'),
  source: SourceId.default(SourceId.parse('allsport')),
});

const parsedArgs = Args.safeParse(
  parseArgs({ options: { port: { type: 'string' }, game: { type: 'string' }, score: { type: 'string' }, baud: { type: 'string' }, server: { type: 'string' }, source: { type: 'string' } }, strict: false }).values,
);
if (!parsedArgs.success) {
  console.error(`${z.prettifyError(parsedArgs.error)}\n${USAGE}`);
  process.exit(2);
}
const { port, game: gameId, score, baud, server, source } = parsedArgs.data;
const groups: readonly AllsportGroup[] = score ? ['clock', 'score'] : ['clock'];

const log = (message: string) => console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
const refusal = (error: unknown) => error as { code?: string; data?: { group?: string }; message?: string };

const { api, close } = connect({ url: server, client: 'allsport' });
const stop = new AbortController();

let world: World | undefined;
const firstWorld = Promise.withResolvers<void>();
void watch(
  (signal) => api.data.watch(undefined, { signal }),
  (snapshot) => {
    world = indexWorld(snapshot);
    firstWorld.resolve();
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
        { sport: 'basketball', gameId, source: basketball.OPERATOR, commands: groups.map((group) => ({ type: 'authority', group, source: to })) },
        { signal },
      ),
    { withinMs: SEND_WITHIN_MS },
  ).then(() => log(`handed ${groups.join(' and ')} to ${to}`));

const buffer = createRtdBuffer();
let sent = NOTHING_SENT;
let running = true;
let lastPushAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let problem = '';
let dropped = 0;
let queue: Promise<void> = Promise.resolve();
let reading: ReadStream | undefined;
/** The last reason the device could not be read, so a missing device is reported once and not every second. */
let reported = '';

/** Pushes soon, from the newest screen. The queue keeps one push in flight; the gap keeps it to about ten a second. */
function schedule(delayMs = Math.max(0, lastPushAt + MIN_PUSH_GAP_MS - Date.now())) {
  if (timer || !running) return;
  timer = setTimeout(() => {
    timer = undefined;
    queue = queue.then(pushOnce);
  }, delayMs);
}

async function pushOnce() {
  if (!running) return;
  lastPushAt = Date.now();
  try {
    const next = commandsFor(readBasketball(buffer), sent, Date.now(), groups);
    if (!next.commands.length) return;
    await untilAnswered((signal) => api.game.apply({ sport: 'basketball', gameId, source, commands: next.commands }, { signal }), { withinMs: SEND_WITHIN_MS });
    describe(next.commands, sent.clock?.running);
    sent = next.sent;
    problem = '';
  } catch (error) {
    const { code, data, message } = refusal(error);
    const text = code === 'NOT_AUTHORITY' ? `the operator took ${data?.group} back; still reading` : `push failed, will retry: ${code ?? message}`;
    if (text !== problem) log(text);
    problem = text;
    schedule(RETRY_MS);
  }
}

/** One line per meaningful change: the clock starting or stopping, a score, the period. Not one per tick. */
function describe(commands: readonly basketball.BasketballCommand[], wasRunning: boolean | undefined) {
  for (const command of commands) {
    if (command.type === 'clockSet' && command.running !== (wasRunning ?? false)) {
      log(`clock ${command.running ? 'started' : 'stopped'} at ${basketball.formatGameClock(command.remainingMs)}`);
    } else if (command.type === 'score') log(`score ${command.side} ${command.value}`);
    else if (command.type === 'period') log(`period ${command.period}`);
  }
}

/** Opens the console's device and reads it until it ends or fails. */
function readDevice(): Promise<void> {
  const fd = openSync(port, 'r');
  const flag = process.platform === 'darwin' ? '-f' : '-F';
  // The settings last while this descriptor stays open.
  const configured = spawnSync('stty', [flag, port, String(baud), 'cs8', '-cstopb', '-parenb', 'raw', '-echo']);
  if (configured.status !== 0) {
    closeSync(fd);
    throw new Error(`stty failed: ${configured.stderr.toString().trim()}`);
  }
  log(`reading ${port} at ${baud} baud`);
  reported = '';
  const framer = createFramer();
  const stream = createReadStream('', { fd });
  reading = stream;
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      for (const frame of framer.push(chunk as Buffer)) {
        if (frame.kind === 'rejected') dropped++;
        else buffer.apply(frame);
      }
      schedule();
    });
    stream.on('error', reject);
    stream.on('close', resolve);
  });
}

/** Keeps the device open: when it is missing or fails, say so once and try again every second. */
async function readForever() {
  while (running) {
    try {
      await readDevice();
      if (running) log(`${port} closed, reopening`);
    } catch (error) {
      const text = (error as Error).message;
      if (running && text !== reported) log(`cannot read ${port}: ${text}; retrying every ${RETRY_MS / 1000} s`);
      reported = text;
    }
    if (running) await Bun.sleep(RETRY_MS);
  }
}

const droppedTimer = setInterval(() => {
  if (dropped) log(`dropped ${dropped} packets in the last ${DROPPED_REPORT_MS / 1000} s (bad checksum or unsupported)`);
  dropped = 0;
}, DROPPED_REPORT_MS);

async function shutdown() {
  if (!running) return;
  running = false;
  clearInterval(droppedTimer);
  clearTimeout(timer);
  reading?.destroy();
  await queue;
  await hand(basketball.OPERATOR).catch((error) => log(`could not hand back: ${refusal(error).message}`));
  stop.abort();
  close();
  // A destroyed stream on a terminal can leave its read pending, which would keep the process alive.
  process.exit(0);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await hand(source);
log(`${view.sides.away.team.id} at ${view.sides.home.team.id}, writing ${groups.join(' and ')} as ${source}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown());
await readForever();
