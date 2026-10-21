/**
 * The typed client every caller uses, over one reconnecting WebSocket. When the socket
 * drops, the link ends every open call; `watch` sees its stream end and opens it again on
 * the reconnected socket, and the new stream's first value is complete.
 */

import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/websocket';
import type { ContractRouterClient } from '@orpc/contract';
import ReconnectingWebSocket from 'partysocket/ws';
import type { Contract } from './contract';

export type Api = ContractRouterClient<Contract>;

export interface Connection {
  readonly api: Api;
  close(): void;
}

/** `url` is the server's `ws://host:port/rpc`; `client` names the caller in the journal. */
export function connect(options: { readonly url: string; readonly client?: string }): Connection {
  const url = new URL(options.url);
  if (options.client) url.searchParams.set('client', options.client);
  const websocket = new ReconnectingWebSocket(url.toString(), [], { minReconnectionDelay: 250, maxReconnectionDelay: 2000 });
  // partysocket forwards `send` and `readyState` to a real WebSocket; only its declared types differ from the DOM's.
  const api: Api = createORPCClient(new RPCLink({ websocket: websocket as unknown as WebSocket }));
  return {
    api,
    // Aborting a stream sends its abort message a few microtasks later; closing in the same tick would make that send throw.
    close: () => setTimeout(() => websocket.close()),
  };
}

export type WatchStatus = 'live' | 'reconnecting';

const RETRY_MS = 250;

/**
 * Keeps a stream open until `signal` aborts: whenever it ends or fails, it waits briefly and
 * opens it again. `onStatus` can drive a "reconnecting" badge.
 */
export async function watch<T>(
  open: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
  onValue: (value: T) => void,
  options: { readonly signal?: AbortSignal; readonly onStatus?: (status: WatchStatus) => void } = {},
): Promise<void> {
  const { signal } = options;
  while (!signal?.aborted) {
    const attempt = new AbortController();
    const stop = () => attempt.abort();
    signal?.addEventListener('abort', stop, { once: true });
    try {
      let live = false;
      for await (const value of await open(attempt.signal)) {
        if (!live) options.onStatus?.('live');
        live = true;
        onValue(value);
      }
    } catch {
      // The socket dropped or the server restarted; the loop opens the stream again.
    } finally {
      signal?.removeEventListener('abort', stop);
    }
    if (signal?.aborted) return;
    options.onStatus?.('reconnecting');
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}

/** The first value of a stream, which then closes: `await first((signal) => api.data.watch(undefined, { signal }))`. */
export async function first<T>(open: (signal: AbortSignal) => Promise<AsyncIterable<T>>): Promise<T> {
  const controller = new AbortController();
  try {
    for await (const value of await open(controller.signal)) return value;
    throw new Error('The stream ended before its first value');
  } finally {
    controller.abort();
  }
}

/** The server did not answer a call in time. A call cut off mid-flight may still have landed. */
export class NoAnswer extends Error {
  constructor(readonly withinMs: number) {
    super(`The server did not answer within ${withinMs / 1000} s`);
  }
}

/**
 * Makes `call` until the server answers it, with a result or with its own error, or until
 * `withinMs` passes. A call the socket dropped, sent while it was down or cut off mid-flight,
 * is made again on the reconnected socket. Only for a call whose repeat changes nothing: a
 * show command keeps its id, which the server dedupes, and a live command's values are absolute.
 */
export async function untilAnswered<T>(call: (signal: AbortSignal) => Promise<T>, options: { readonly withinMs: number }): Promise<T> {
  const deadline = AbortSignal.timeout(options.withinMs);
  while (!deadline.aborted) {
    try {
      return await call(deadline);
    } catch (error) {
      if (error instanceof ORPCError) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  throw new NoAnswer(options.withinMs);
}
