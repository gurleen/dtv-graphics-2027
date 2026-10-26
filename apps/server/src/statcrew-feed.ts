/**
 * Supervises the StatCrew feed tool (`packages/live-statcrew`) as a child process. The tool stays an ordinary API
 * client that can also be run by hand; this module only starts it, stops it, and keeps what it printed. The server
 * never imports the tool.
 *
 * Stopping sends SIGINT, which the tool answers by handing score and stats back to the operator, and waits for the
 * process to end; a process that ignores SIGINT is killed after `killAfterMs`.
 */

import type { StatcrewFeed } from '@dtv/api';
import type { GameId } from '@dtv/domain';

const LOG_LINES = 200;

export type StartResult = { readonly ok: true; readonly feed: StatcrewFeed } | { readonly ok: false; readonly reason: 'no-game' | 'no-file' };

export interface StatcrewSupervisor {
  feed(): StatcrewFeed;
  start(input: { readonly file: string; readonly game: GameId }): Promise<StartResult>;
  stop(): Promise<StatcrewFeed>;
  watch(signal: AbortSignal): AsyncGenerator<StatcrewFeed, void>;
}

export function createStatcrewSupervisor(options: {
  /** The argv that runs the tool on `file` for `game`. */
  readonly command: (input: { readonly file: string; readonly game: GameId }) => string[];
  /** True for a game in the World that is basketball. */
  readonly hasGame: (game: GameId) => boolean;
  readonly now?: () => number;
  readonly killAfterMs?: number;
}): StatcrewSupervisor {
  const now = options.now ?? Date.now;
  const killAfterMs = options.killAfterMs ?? 5_000;

  let feed: StatcrewFeed = { state: 'stopped', file: null, game: null, startedAt: null, exitCode: null, log: [] };
  /** The process that is running and not yet asked to stop. */
  let current: { readonly process: Bun.Subprocess; readonly finished: Promise<void> } | null = null;
  /** The newest process, running or not: its output is the log, down to what it prints while stopping. */
  let latest: Bun.Subprocess | null = null;
  const wakes = new Set<() => void>();
  const set = (patch: Partial<StatcrewFeed>) => {
    feed = { ...feed, ...patch };
    for (const wake of wakes) wake();
  };
  const append = (lines: string[]) => lines.length && set({ log: [...feed.log, ...lines].slice(-LOG_LINES) });

  /** Feeds a stream's lines into the log as they complete, and resolves when the stream ends. */
  async function pump(stream: ReadableStream<Uint8Array<ArrayBuffer>>, isLatest: () => boolean) {
    let partial = '';
    for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() ?? '';
      if (isLatest()) append(lines.filter(Boolean));
    }
    if (partial && isLatest()) append([partial]);
  }

  /** Stops, starts and exits are queued so two calls never both own the process. */
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };

  async function end() {
    if (!current) return;
    const { process, finished } = current;
    current = null;
    process.kill('SIGINT');
    const timer = setTimeout(() => process.kill('SIGKILL'), killAfterMs);
    await process.exited;
    clearTimeout(timer);
    await finished;
    set({ state: 'stopped', exitCode: null });
  }

  async function begin(input: { readonly file: string; readonly game: GameId }) {
    const process = Bun.spawn(options.command(input), { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    latest = process;
    const isLatest = () => latest === process;
    const finished = (async () => {
      await Promise.all([pump(process.stdout, isLatest), pump(process.stderr, isLatest)]);
      const code = await process.exited;
      // A run that ended by itself; one that `end` took off `current` has been stopped.
      if (current?.process === process) {
        current = null;
        set({ state: 'exited', exitCode: code });
      }
    })();
    current = { process, finished };
    set({ state: 'running', file: input.file, game: input.game, startedAt: now(), exitCode: null, log: [] });
  }

  return {
    feed: () => feed,

    start: (input) =>
      serial(async () => {
        if (!options.hasGame(input.game)) return { ok: false, reason: 'no-game' };
        if (!(await Bun.file(input.file).exists())) return { ok: false, reason: 'no-file' };
        if (current && feed.file === input.file && feed.game === input.game) return { ok: true, feed };
        await end();
        await begin(input);
        return { ok: true, feed };
      }),

    stop: () =>
      serial(async () => {
        await end();
        return feed;
      }),

    async *watch(signal) {
      let sent: string | undefined;
      let wake: (() => void) | null = null;
      const listener = () => wake?.();
      wakes.add(listener);
      signal.addEventListener('abort', listener);
      try {
        while (!signal.aborted) {
          const key = JSON.stringify(feed);
          if (key !== sent) {
            sent = key;
            yield feed;
            continue;
          }
          await new Promise<void>((resolve) => (wake = resolve));
          wake = null;
        }
      } finally {
        wakes.delete(listener);
        signal.removeEventListener('abort', listener);
      }
    },
  };
}
