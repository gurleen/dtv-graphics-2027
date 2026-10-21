/**
 * A stand-in for the controller shell: connects to the real server and renders the data
 * page, so it can be driven before the shell lands.
 *
 *   /?operator=alex&rpc=ws://localhost:8992/rpc
 */

import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '../../src/app/tokens.css';
import { connect, watch, type WatchStatus } from '@dtv/api';
import { indexWorld, type World } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { OperatorId } from '@dtv/playout';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type Controller, ControllerContext } from '../../src/app/context';
import { DataPage } from '../../src/data';

const query = new URLSearchParams(location.search);
const operator = OperatorId.parse(query.get('operator') ?? 'alex');
const connection = connect({ url: query.get('rpc') ?? `ws://${location.hostname}:8992/rpc`, client: operator });

function Provider() {
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState<WatchStatus>('reconnecting');
  useEffect(() => {
    const abort = new AbortController();
    void watch((signal) => connection.api.data.watch(undefined, { signal }), (snapshot) => setWorld(indexWorld(snapshot)), {
      signal: abort.signal,
      onStatus: setStatus,
    });
    return () => abort.abort();
  }, []);
  const controller = useMemo<Controller>(
    () => ({ api: connection.api, operator, world, revision: world?.revision ?? null, status, registry: GRAPHICS }),
    [world, status],
  );
  return (
    <ControllerContext.Provider value={controller}>
      {world ? <DataPage /> : <p>Connecting to the server</p>}
    </ControllerContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<Provider />);
