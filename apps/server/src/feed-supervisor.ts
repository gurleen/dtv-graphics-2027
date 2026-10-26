/**
 * Supervises a feed tool (`packages/live-statcrew`, `packages/live-allsport`) as a child process. A tool stays an
 * ordinary API client that can also be run by hand; this module only starts it, stops it, and keeps what it printed.
 * The server never imports a tool.
 *
 * Stopping sends SIGINT, which a tool answers by handing its field groups back to the operator, and waits for the
 * process to end; a process that ignores SIGINT is killed after `killAfterMs`.
 */

import type { Feed, FeedStatus } from '@dtv/api';

const LOG_LINES = 200;

export type StartResult<I, Reason extends string> = { readonly ok: true; readonly feed: Feed<I> } | { readonly ok: false; readonly reason: Reason };

export interface FeedSupervisor<I, Reason extends string> {
  feed(): Feed<I>;
  start(input: I): Promise<StartResult<I, Reason>>;
  stop(): Promise<Feed<I>>;
  watch(signal: AbortSignal): AsyncGenerator<Feed<I>, void>;
}

/** `I` is what a start asks for; `Reason` is why one is refused. */
export function createFeedSupervisor<I extends object, Reason extends string>(options: {
  /** The keys of `I`: what the feed remembers of its last start, and what makes a start the same as the running one. */
  readonly inputs: readonly (keyof I)[];
  /** The argv that runs the tool for `input`. */
  readonly command: (input: I) => string[];
  /** Why `input` cannot start, or null when it can. */
  readonly validate: (input: I) => Promise<Reason | null> | Reason | null;
  readonly now?: () => number;
  readonly killAfterMs?: number;
}): FeedSupervisor<I, Reason> {
  const now = options.now ?? Date.now;
  const killAfterMs = options.killAfterMs ?? 5_000;

  let feed = {
    state: 'stopped',
    ...Object.fromEntries(options.inputs.map((key) => [key, null])),
    startedAt: null,
    exitCode: null,
    log: [],
  } as unknown as Feed<I>;
  /** The process that is running and not yet asked to stop. */
  let current: { readonly process: Bun.Subprocess; readonly finished: Promise<void> } | null = null;
  /** The newest process, running or not: its output is the log, down to what it prints while stopping. */
  let latest: Bun.Subprocess | null = null;
  const wakes = new Set<() => void>();
  const set = (patch: Partial<FeedStatus> | I) => {
    feed = { ...feed, ...patch } as Feed<I>;
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

  async function begin(input: I) {
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
    set(input);
    set({ state: 'running', startedAt: now(), exitCode: null, log: [] });
  }

  return {
    feed: () => feed,

    start: (input) =>
      serial(async () => {
        const reason = await options.validate(input);
        if (reason) return { ok: false, reason };
        if (current && options.inputs.every((key) => feed[key] === input[key])) return { ok: true, feed };
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
