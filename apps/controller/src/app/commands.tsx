/**
 * Sending show commands, and what an operator must see when one fails. Every show change
 * is one `show.command` with a fresh id, sent again under the same id while the socket is
 * down, so a Take pressed during a blip lands once: the server dedupes by id. While a
 * command waits it is `pending`, which its control shows. A REJECTED reason, a failed write,
 * or no answer within `ANSWER_MS` lands in `problem`, which the show page shows beside
 * Take, where the operator is looking.
 */

import { type Api, NoAnswer, untilAnswered } from '@dtv/api';
import { CommandId, type ShowCommand } from '@dtv/playout';
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';

export interface Problem {
  readonly message: string;
  readonly at: number;
}

/** How long a command is sent again while the server cannot be reached, before it fails. */
const ANSWER_MS = 10_000;

export interface Commands {
  /** Resolves to whether the server applied it; a failure becomes the problem. */
  send(command: ShowCommand): Promise<boolean>;
  /** Commands sent and not yet answered, oldest first. */
  readonly pending: readonly ShowCommand[];
  /** Shows a failure that did not come from a show command, such as a refused rundown edit. */
  fail(message: string): void;
  readonly problem: Problem | null;
  dismiss(): void;
  /** Clear All, armed by a hold of 600 ms or a second press within a second. */
  readonly clearAll: Guard;
}

export const CommandsContext = createContext<Commands | null>(null);

export function useCommands(): Commands {
  const commands = useContext(CommandsContext);
  if (!commands) throw new Error('useCommands outside the controller shell');
  return commands;
}

/** The reason an oRPC call failed, in the server's words when it gave some. */
export function reasonOf(error: unknown): string {
  if (error instanceof NoAnswer) return `the server did not answer within ${error.withinMs / 1000} s`;
  const data = (error as { data?: { reason?: unknown; detail?: unknown } } | null)?.data;
  if (typeof data?.reason === 'string') return data.reason;
  if (typeof data?.detail === 'string') return data.detail;
  return error instanceof Error ? error.message : String(error);
}

export interface Guard {
  /** A press began: the second within a second fires; otherwise holding for 600 ms does. */
  down(): void;
  /** The press ended before it fired. */
  up(): void;
  /** True while a hold is counting down, for the button's fill. */
  readonly arming: boolean;
}

const HOLD_MS = 600;
const DOUBLE_MS = 1000;

function useGuard(fire: () => void): Guard {
  const [arming, setArming] = useState(false);
  const state = useRef<{ timer: ReturnType<typeof setTimeout> | null; lastTap: number }>({ timer: null, lastTap: -Infinity });
  const fireRef = useRef(fire);
  fireRef.current = fire;
  return useMemo(() => {
    const stop = () => {
      if (state.current.timer) clearTimeout(state.current.timer);
      state.current.timer = null;
      setArming(false);
    };
    return {
      arming,
      down() {
        if (state.current.timer) return;
        if (performance.now() - state.current.lastTap < DOUBLE_MS) {
          state.current.lastTap = -Infinity;
          fireRef.current();
          return;
        }
        setArming(true);
        state.current.timer = setTimeout(() => {
          stop();
          state.current.lastTap = -Infinity;
          fireRef.current();
        }, HOLD_MS);
      },
      up() {
        if (!state.current.timer) return;
        stop();
        state.current.lastTap = performance.now();
      },
    };
  }, [arming]);
}

/** What each command is called in a failure: "Take failed: …". */
const COMMAND_NAMES: Record<ShowCommand['type'], string> = {
  activate: 'Activate',
  cue: 'Cue',
  uncue: 'Clear preview',
  take: 'Take',
  air: 'Air',
  toggle: 'Air',
  clear: 'Clear',
  clearAll: 'Clear All',
  step: 'Next',
  refresh: 'Refresh',
  patch: 'Text fix',
};

export function CommandsProvider(props: { readonly api: Api; readonly children: ReactNode }) {
  const { api } = props;
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, setPending] = useState<readonly ShowCommand[]>([]);
  const fail = (message: string) => setProblem({ message, at: Date.now() });
  const send = async (command: ShowCommand) => {
    const id = CommandId.parse(crypto.randomUUID());
    setPending((current) => [...current, command]);
    try {
      await untilAnswered((signal) => api.show.command({ id, command }, { signal }), { withinMs: ANSWER_MS });
      return true;
    } catch (error) {
      // The server's own refusal already says what; a dropped call needs the command named.
      fail(error instanceof NoAnswer ? `${COMMAND_NAMES[command.type]} failed: ${reasonOf(error)}.` : reasonOf(error));
      return false;
    } finally {
      setPending((current) => current.filter((each) => each !== command));
    }
  };
  const clearAll = useGuard(() => void send({ type: 'clearAll' }));
  const value: Commands = { send, pending, fail, problem, dismiss: () => setProblem(null), clearAll };
  return <CommandsContext.Provider value={value}>{props.children}</CommandsContext.Provider>;
}
