/** The contract, implemented as thin calls into the store, and the WebSocket that serves it. No logic lives here. */

import { contract } from '@dtv/api';
import { implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/bun-ws';
import type { StatcrewSupervisor } from './statcrew-feed';
import type { Store } from './store';

/** Who sent a call, from the socket's `?client=` label: a name for the journal, not authentication. */
export interface CallContext {
  readonly client: string;
}

const os = implement(contract).$context<CallContext>();

/** oRPC passes a signal on every streamed call; this one stands in where the types allow none. */
const NEVER = new AbortController().signal;

export function createRouter(store: Store, statcrew: StatcrewSupervisor) {
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
      load: os.data.load.handler(async ({ input, context, errors }) => {
        const result = await store.loadSportsdataverse(context.client, input);
        if (result.ok) return result.report;
        const data = { detail: result.detail };
        if (result.reason === 'unavailable') throw errors.UNAVAILABLE({ data });
        if (result.reason === 'conflict') throw errors.CONFLICT({ data });
        if (result.reason === 'duplicate') throw errors.DUPLICATE({ data });
        if (result.reason === 'inconsistent') throw errors.INCONSISTENT({ data });
        throw errors.INVALID_REFERENCE({ data });
      }),
    },
    game: {
      watch: os.game.watch.handler(({ input, signal }) => store.watchGame(input.game, signal ?? NEVER)),
      apply: os.game.apply.handler(({ input, context, errors }) => {
        const result = store.applyGame(context.client, input);
        if (result.ok) return { revision: result.revision, live: result.live };
        if (result.reason === 'not-authority') throw errors.NOT_AUTHORITY({ data: { group: result.group } });
        if (result.reason === 'not-in-game') throw errors.NOT_IN_GAME({ data: { player: result.player } });
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
    tools: {
      statcrew: {
        watch: os.tools.statcrew.watch.handler(({ signal }) => statcrew.watch(signal ?? NEVER)),
        start: os.tools.statcrew.start.handler(async ({ input, errors }) => {
          const result = await statcrew.start(input);
          if (result.ok) return result.feed;
          throw result.reason === 'no-game' ? errors.NO_GAME() : errors.NO_FILE();
        }),
        stop: os.tools.statcrew.stop.handler(() => statcrew.stop()),
      },
    },
    output: {
      watch: os.output.watch.handler(({ input, signal }) => store.watchOutput(input.bus, signal ?? NEVER)),
    },
  });
}

/** `websocket` for `Bun.serve`, upgraded with `data: { client }`. */
export function rpcWebSocket(store: Store, statcrew: StatcrewSupervisor): Bun.WebSocketHandler<CallContext> {
  const handler = new RPCHandler(createRouter(store, statcrew));
  return {
    data: {} as CallContext,
    // A World snapshot is about 430 KB of JSON and 34 KB compressed.
    perMessageDeflate: true,
    message(ws, message) {
      // A frame oRPC cannot decode rejects here; it fails that frame, not the server.
      handler.message(ws, message, { context: ws.data }).catch((error: unknown) => {
        console.error(`rpc: dropped a frame from ${ws.data.client}:`, error);
      });
    },
    close(ws) {
      handler.close(ws);
    },
  };
}
