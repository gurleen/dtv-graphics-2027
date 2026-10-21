import { sameJson, type Show } from '@dtv/domain';
import { watch } from '@dtv/api';
import { useEffect, useState } from 'react';
import { useController } from '../app/context';

/**
 * The show on the console now, for pinning its two teams. The data page opens its own show
 * stream for this because the shared controller context carries none yet; a stream per
 * operator is counted once in the operators list.
 */
export function useActiveShow(): Show | null {
  const { api, operator } = useController();
  const [show, setShow] = useState<Show | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void watch((signal) => api.show.watch({ operator }, { signal }), (view) => setShow((previous) => (sameJson(previous, view.show) ? previous : view.show)), {
      signal: abort.signal,
    });
    return () => abort.abort();
  }, [api, operator]);
  return show;
}
