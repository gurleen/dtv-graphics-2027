/**
 * What every controller page reads: one connection to the server, this browser's operator,
 * and the newest World. The shell provides it; the show page and the data page consume it.
 */

import type { Api, WatchStatus } from '@dtv/api';
import type { Revision, World } from '@dtv/domain';
import type { OperatorId, Registry } from '@dtv/playout';
import { createContext, useContext } from 'react';

export interface Controller {
  readonly api: Api;
  /** This browser's operator, kept in localStorage. It names the caller in the journal and owns one preview. */
  readonly operator: OperatorId;
  /** The newest World from `data.watch`; null until the first snapshot arrives. */
  readonly world: World | null;
  /** The World's revision, the basis of every manual edit. */
  readonly revision: Revision | null;
  /** 'reconnecting' while any stream is being restored; the shell shows the badge. */
  readonly status: WatchStatus;
  readonly registry: Registry;
}

export const ControllerContext = createContext<Controller | null>(null);

export function useController(): Controller {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('useController outside the controller shell');
  return controller;
}
