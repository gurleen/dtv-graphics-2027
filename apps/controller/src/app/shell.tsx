/**
 * The controller's frame: one connection per page, named for this browser's operator; the
 * World and the show view every page reads; the top bar; and the route, `#/show`, `#/data` or `#/tools`.
 */

import { type Api, connect, first } from '@dtv/api';
import { indexWorld } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { OperatorId } from '@dtv/playout';
import { useEffect, useMemo, useState } from 'react';
import { DataPage } from '../data';
import { ShowPage } from '../show/page';
import { ToolsPage } from '../tools/page';
import { CommandsProvider } from './commands';
import { type Controller, ControllerContext } from './context';
import { NameDialog } from './name';
import { storedOperator } from './operator';
import { StreamStatusContext, useStream, useStreamStatus } from './streams';
import { TopBar } from './topbar';

const RPC = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rpc`;

export type Route = 'show' | 'data' | 'tools';

const routeOf = (hash: string): Route => (hash === '#/data' ? 'data' : hash === '#/tools' || hash.startsWith('#/tools/') ? 'tools' : 'show');

/** The page the hash names, and the hash itself, which the Tools page reads its tab from. */
function useHash(): string {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const changed = () => setHash(location.hash);
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  return hash;
}

export function Shell() {
  const [operator] = useState(storedOperator);
  return operator ? <Connected operator={operator} /> : <FirstVisit />;
}

/** The first visit asks for a name before anything connects as an operator. */
function FirstVisit() {
  const [connected, setConnected] = useState<readonly OperatorId[]>([]);
  useEffect(() => {
    // A throwaway viewer reads who is connected; it is listed for the moment it takes.
    const { api, close } = connect({ url: RPC, client: 'controller-setup' });
    const probe = OperatorId.parse(`setup-${crypto.randomUUID().slice(0, 8)}`);
    first((signal) => api.show.watch({ operator: probe }, { signal }))
      .then((view) => setConnected(view.operators.filter((operator) => operator !== probe)))
      .catch(() => {})
      .finally(close);
  }, []);
  return <NameDialog current={null} connected={connected} />;
}

function Connected(props: { readonly operator: OperatorId }) {
  const [connection] = useState(() => connect({ url: RPC, client: props.operator }));
  useEffect(() => () => connection.close(), [connection]);
  const { status, report } = useStreamStatus();
  return (
    <StreamStatusContext.Provider value={report}>
      <CommandsProvider api={connection.api}>
        <Pages api={connection.api} operator={props.operator} status={status} />
      </CommandsProvider>
    </StreamStatusContext.Provider>
  );
}

function Pages(props: { readonly api: Api; readonly operator: OperatorId; readonly status: Controller['status'] }) {
  const { api, operator } = props;
  const snapshot = useStream((signal) => api.data.watch(undefined, { signal }), [api]);
  const world = useMemo(() => (snapshot ? indexWorld(snapshot) : null), [snapshot]);
  const show = useStream((signal) => api.show.watch({ operator }, { signal }), [api, operator]);
  const hash = useHash();
  const route = routeOf(hash);
  const controller: Controller = { api, operator, world, revision: world?.revision ?? null, status: props.status, registry: GRAPHICS, show };
  return (
    <ControllerContext.Provider value={controller}>
      <div className="app" data-route={route}>
        <TopBar route={route} />
        <main className="page">
          {route === 'data' ? <DataPage /> : route === 'tools' ? <ToolsPage hash={hash} /> : <ShowPage />}
        </main>
      </div>
    </ControllerContext.Provider>
  );
}
