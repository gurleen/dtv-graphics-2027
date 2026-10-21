/**
 * Streams for components. `useStream` keeps one `watch` open while its inputs hold and
 * reports its status to the shell, which shows the Reconnecting badge while any stream is
 * being restored.
 */

import { watch, type WatchStatus } from '@dtv/api';
import { createContext, type DependencyList, useContext, useEffect, useState } from 'react';

export type StatusReport = (stream: symbol, status: WatchStatus | null) => void;

export const StreamStatusContext = createContext<StatusReport>(() => {});

/** The newest value of the stream `open` opens; null until it arrives, and again while `open` is null. */
export function useStream<T>(open: ((signal: AbortSignal) => Promise<AsyncIterable<T>>) | null, deps: DependencyList): T | null {
  const report = useContext(StreamStatusContext);
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    setValue(null);
    if (!open) return;
    const stream = Symbol();
    const controller = new AbortController();
    void watch(open, setValue, { signal: controller.signal, onStatus: (status) => report(stream, status) });
    return () => {
      controller.abort();
      report(stream, null);
    };
    // `deps` names what `open` reads, as the caller passes them.
  }, deps);
  return value;
}

/** 'reconnecting' while any reported stream is. */
export function useStreamStatus(): { readonly status: WatchStatus; readonly report: StatusReport } {
  const [streams, setStreams] = useState<ReadonlyMap<symbol, WatchStatus>>(new Map());
  const [report] = useState(() => {
    const report: StatusReport = (stream, status) =>
      setStreams((current) => {
        if (current.get(stream) === status) return current;
        const next = new Map(current);
        if (status === null) next.delete(stream);
        else next.set(stream, status);
        return next;
      });
    return report;
  });
  const status = [...streams.values()].includes('reconnecting') ? 'reconnecting' : 'live';
  return { status, report };
}
