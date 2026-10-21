/** The contract, implemented as thin calls into the store. No logic lives here. */

import { contract } from '@dtv/api';
import { implement } from '@orpc/server';
import type { Store } from './store';

/** Who sent a call, from the socket's `?client=` label: a name for the journal, not authentication. */
export interface CallContext {
  readonly client: string;
}

const os = implement(contract).$context<CallContext>();

/** oRPC passes a signal on every streamed call; this one stands in where the types allow none. */
const NEVER = new AbortController().signal;

export function createRouter(store: Store) {
  return os.router({
    data: {
      watch: os.data.watch.handler(({ signal }) => store.watchData(signal ?? NEVER)),
      apply: os.data.apply.handler(({ input, context, errors }) => {
        const result = store.applyEdits(context.client, input);
        if (result.ok) return { revision: result.revision, skipped: result.skipped };
        const data = { detail: result.detail };
        if (result.reason === 'conflict') throw errors.CONFLICT({ data });
        if (result.reason === 'duplicate') throw errors.DUPLICATE({ data });
        if (result.reason === 'inconsistent') throw errors.INCONSISTENT({ data });
        throw errors.INVALID_REFERENCE({ data });
      }),
      planRoster: os.data.planRoster.handler(({ input }) => store.planRoster(input)),
    },
    game: {
      watch: os.game.watch.handler(({ input, signal }) => store.watchGame(input.game, signal ?? NEVER)),
      apply: os.game.apply.handler(({ input, context, errors }) => {
        const result = store.applyGame(context.client, input);
        if (result.ok) return { revision: result.revision, live: result.live };
        if (result.reason === 'not-authority') throw errors.NOT_AUTHORITY({ data: { group: result.group } });
        throw errors.NO_GAME();
      }),
    },
    show: {
      watch: os.show.watch.handler(({ input, signal }) => store.watchShow(input.operator, signal ?? NEVER)),
      command: os.show.command.handler(({ input, context, errors }) => {
        const result = store.command(context.client, input);
        if (result.ok) return { revision: result.revision, changed: result.changed };
        throw errors.REJECTED({ data: { reason: result.reason } });
      }),
    },
    output: {
      watch: os.output.watch.handler(({ input, signal }) => store.watchOutput(input.bus, signal ?? NEVER)),
    },
  });
}
