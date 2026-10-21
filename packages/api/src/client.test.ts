import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { first, NoAnswer, untilAnswered, watch, type WatchStatus } from './client';

test('watch opens the stream again after it fails, and stops when its signal aborts', async () => {
  const attempts = [
    async function* () {
      yield 1;
      yield 2;
      throw new Error('socket closed');
    },
    async function* (signal: AbortSignal) {
      yield 3;
      if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve));
    },
  ];
  const values: number[] = [];
  const statuses: WatchStatus[] = [];
  const done = new AbortController();
  let opened = 0;
  const watching = watch(
    async (signal) => attempts[opened++]!(signal),
    (value) => {
      values.push(value);
      if (value === 3) done.abort();
    },
    { signal: done.signal, onStatus: (status) => statuses.push(status) },
  );
  await watching;
  expect(values).toEqual([1, 2, 3]);
  expect(statuses).toEqual(['live', 'reconnecting', 'live']);
  expect(opened).toBe(2);
});

test('first returns the first value and aborts the stream', async () => {
  let signal: AbortSignal | undefined;
  const value = await first(async (given) => {
    signal = given;
    return (async function* () {
      yield 'a';
      yield 'b';
    })();
  });
  expect(value).toBe('a');
  expect(signal?.aborted).toBe(true);
});

test('untilAnswered makes a dropped call again until the server answers', async () => {
  let calls = 0;
  const value = await untilAnswered(async () => {
    calls++;
    if (calls < 3) throw new Error('Cannot send message, WebSocket is not open.');
    return 'landed';
  }, { withinMs: 5_000 });
  expect(value).toBe('landed');
  expect(calls).toBe(3);
});

test('untilAnswered does not repeat a call the server refused', async () => {
  let calls = 0;
  const refused = untilAnswered(async () => {
    calls++;
    throw new ORPCError('REJECTED', { data: { reason: 'Nothing in your preview' } });
  }, { withinMs: 5_000 });
  await expect(refused).rejects.toBeInstanceOf(ORPCError);
  expect(calls).toBe(1);
});

test('untilAnswered gives up when the window passes, aborting the call in flight', async () => {
  let aborted = false;
  const started = Date.now();
  const unanswered = untilAnswered(
    (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(signal.reason);
        }),
      ),
    { withinMs: 400 },
  );
  await expect(unanswered).rejects.toBeInstanceOf(NoAnswer);
  expect(aborted).toBe(true);
  expect(Date.now() - started).toBeLessThan(1_000);
});
