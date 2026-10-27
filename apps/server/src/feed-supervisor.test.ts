import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Feed } from '@dtv/api';
import { GameId } from '@dtv/domain';
import { createFeedSupervisor, type FeedSupervisor } from './feed-supervisor';
import type { StatcrewSupervisor } from './feeds';

const FAKE = join(import.meta.dir, 'feed-fake-tool.ts');
const A = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const B = GameId.parse('2026-27/2026-11-12/drexel-mbb.at.hofstra-mbb');

let dir: string;
let file: string;
let supervisors: { stop(): Promise<unknown> }[] = [];

const supervise = (mode: 'run' | 'crash' | 'stubborn' | 'events', extra: { readonly killAfterMs?: number } = {}) => {
  const supervisor: StatcrewSupervisor = createFeedSupervisor({
    inputs: ['file', 'game'],
    command: ({ file, game }) => [process.execPath, FAKE, mode, file, game],
    validate: async ({ file, game }) => (game !== A && game !== B ? 'no-game' : (await Bun.file(file).exists()) ? null : 'no-file'),
    ...extra,
  });
  supervisors.push(supervisor);
  return supervisor;
};

const until = async <I, E>(what: string, supervisor: FeedSupervisor<I, string, E>, ready: (feed: Feed<I, E>) => boolean) => {
  const deadline = Date.now() + 8_000;
  while (!ready(supervisor.feed())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; feed is ${JSON.stringify(supervisor.feed())}`);
    await Bun.sleep(20);
  }
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'feed-supervisor-'));
  file = join(dir, 'game.xml');
  writeFileSync(file, '<bbgame/>');
});

afterEach(async () => {
  await Promise.all(supervisors.map((supervisor) => supervisor.stop()));
  supervisors = [];
  rmSync(dir, { recursive: true, force: true });
});

describe('the feed supervisor', () => {
  test('starts stopped, runs a start, and stops with the tool having handed back', async () => {
    const supervisor = supervise('run');
    expect(supervisor.feed()).toMatchObject({ state: 'stopped', file: null, game: null, startedAt: null, log: [] });

    const started = await supervisor.start({ file, game: A });
    expect(started).toMatchObject({ ok: true, feed: { state: 'running', file, game: A, exitCode: null } });
    await until('the first log line', supervisor, (feed) => feed.log.length > 0);
    expect(supervisor.feed().log).toEqual([`started ${file} ${A}`]);

    const stopped = await supervisor.stop();
    expect(stopped).toMatchObject({ state: 'stopped', file, game: A, exitCode: null });
    expect(stopped.log).toEqual([`started ${file} ${A}`, 'handed back']);
  });

  test('a repeated start with the same file and game changes nothing', async () => {
    const supervisor = supervise('run');
    const first = await supervisor.start({ file, game: A });
    await until('the first log line', supervisor, (feed) => feed.log.length > 0);
    const again = await supervisor.start({ file, game: A });
    expect(again).toEqual({ ok: true, feed: supervisor.feed() });
    expect(supervisor.feed().startedAt).toBe(first.ok ? first.feed.startedAt : null);
    expect(supervisor.feed().log).toEqual([`started ${file} ${A}`]);
  });

  test('a start with another game stops the old run before it starts the new one', async () => {
    const supervisor = supervise('run');
    await supervisor.start({ file, game: A });
    await until('the first log line', supervisor, (feed) => feed.log.length > 0);
    await supervisor.start({ file, game: B });
    await until('the new run', supervisor, (feed) => feed.log.length > 0);
    expect(supervisor.feed()).toMatchObject({ state: 'running', game: B, log: [`started ${file} ${B}`] });
  });

  test('an events line replaces the events and stays out of the log, and a new run starts with none', async () => {
    const supervisor = supervise('events');
    await supervisor.start({ file, game: A });
    await until('the last line', supervisor, (feed) => feed.log.includes('after'));
    expect(supervisor.feed().events as readonly unknown[]).toEqual(['second', 'third']);
    expect(supervisor.feed().log).toEqual([`started ${file} ${A}`, 'events line did not parse: @events {broken', 'after']);
    await supervisor.stop();
    expect(supervisor.feed().events as readonly unknown[]).toEqual(['second', 'third']);
    await supervisor.start({ file, game: B });
    expect(supervisor.feed().events).toEqual([]);
  });

  test('a process that ends on its own is exited, with its code and what it printed', async () => {
    const supervisor = supervise('crash');
    await supervisor.start({ file, game: A });
    await until('the exit', supervisor, (feed) => feed.state === 'exited');
    expect(supervisor.feed()).toMatchObject({ state: 'exited', exitCode: 3, log: [`started ${file} ${A}`, 'bad arguments'] });
    const again = await supervisor.start({ file, game: A });
    expect(again).toMatchObject({ ok: true, feed: { state: 'running' } });
  });

  test('stop is idempotent, and kills a process that ignores the stop', async () => {
    const stubborn = supervise('stubborn', { killAfterMs: 300 });
    expect((await stubborn.stop()).state).toBe('stopped');
    await stubborn.start({ file, game: A });
    await until('the first log line', stubborn, (feed) => feed.log.length > 0);
    expect((await stubborn.stop()).state).toBe('stopped');
    expect((await stubborn.stop()).state).toBe('stopped');
  });

  test('a start with another value of any input restarts the run, whatever the type', async () => {
    const supervisor = createFeedSupervisor<{ port: string; score: boolean }, never>({
      inputs: ['port', 'score'],
      command: ({ port, score }) => [process.execPath, FAKE, 'run', port, String(score)],
      validate: () => null,
    });
    supervisors.push(supervisor);
    const first = await supervisor.start({ port: 'tty', score: true });
    await until('the first log line', supervisor, (feed) => feed.log.length > 0);
    const same = await supervisor.start({ port: 'tty', score: true });
    expect(same.ok && first.ok && same.feed.startedAt === first.feed.startedAt).toBe(true);
    await supervisor.start({ port: 'tty', score: false });
    await until('the new run', supervisor, (feed) => feed.log.length > 0);
    expect(supervisor.feed()).toMatchObject({ state: 'running', port: 'tty', score: false, log: ['started tty false'] });
  });

  test('refuses a game that is not a basketball game in the World and a file that does not exist', async () => {
    const supervisor = supervise('run');
    expect(await supervisor.start({ file, game: GameId.parse('2026-27/2026-11-08/nobody.at.nowhere') })).toEqual({ ok: false, reason: 'no-game' });
    expect(await supervisor.start({ file: join(dir, 'missing.xml'), game: A })).toEqual({ ok: false, reason: 'no-file' });
    expect(supervisor.feed().state).toBe('stopped');
  });

  test('watch sends each new state once, newest first to a late reader', async () => {
    const supervisor = supervise('run');
    const controller = new AbortController();
    const seen: string[] = [];
    const reading = (async () => {
      for await (const feed of supervisor.watch(controller.signal)) seen.push(feed.state + feed.log.length);
    })();
    await supervisor.start({ file, game: A });
    await until('the first log line', supervisor, (feed) => feed.log.length > 0);
    await supervisor.stop();
    await Bun.sleep(50);
    controller.abort();
    await reading;
    expect(seen[0]).toBe('stopped0');
    expect(seen).toContain('running0');
    expect(seen).toContain('running1');
    expect(seen.at(-1)).toBe('stopped2');
    expect(new Set(seen).size).toBe(seen.length);
  });
});
