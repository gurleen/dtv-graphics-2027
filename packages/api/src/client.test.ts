import { expect, test } from 'bun:test';
import { first, watch, type WatchStatus } from './client';

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
