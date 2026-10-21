/**
 * The live game as the show page holds it, and the actions that change it. Every action
 * sends absolute values computed from what the page shows (`score home 74`), so a resend
 * changes nothing and two operators pressing +2 for one basket agree. A button and its key
 * call the same action.
 *
 * What the page shows is the newest state it heard, from the stream or from an answer, with
 * the commands still on their way laid over it. A second press before the first is answered
 * therefore counts from the first: Q twice is +2, not +1 sent twice.
 */

import { untilAnswered } from '@dtv/api';
import { basketball, type GameId, type GameLive, type Side, SourceId } from '@dtv/domain';
import { useRef, useState } from 'react';
import { ANSWER_MS, reasonOf, useCommands } from '../app/commands';
import { useController } from '../app/context';
import { useStream } from '../app/streams';

type Live = basketball.BasketballLive;
export type GameCommand = basketball.BasketballCommand;

const OPERATOR = SourceId.parse('operator');

export interface GameActions {
  /** `by` points onto `side`'s score; never below zero. */
  score(side: Side, by: number): void;
  /** Starts a stopped game clock, stops a running one; the shot clock moves with it. */
  clock(): void;
  /** Resets the shot clock, running if the game clock runs. */
  shotClock(seconds: number): void;
  possession(side: Side | null): void;
  apply(...commands: GameCommand[]): void;
}

export interface Game {
  /** The newest state heard, with pending commands laid over it; null until the first value. */
  readonly live: Live | null;
  /** Commands sent and not yet answered, oldest first. */
  readonly pending: readonly GameCommand[];
  readonly actions: GameActions | null;
}

/** `live` after `commands`, as the server will apply them; a command the server would refuse changes nothing. */
const laidOver = (live: Live, commands: readonly GameCommand[], now: number): Live =>
  commands.reduce((state, command) => {
    const result = basketball.applyBasketball(state, command, { source: OPERATOR, now });
    return result.ok ? result.live : state;
  }, live);

export function useGame(gameId: GameId | null): Game {
  const { api } = useController();
  const { fail } = useCommands();
  const streamed = useStream(gameId ? (signal) => api.game.watch({ game: gameId }, { signal }) : null, [api, gameId]);
  // An answer stands until the stream sends anything newer than the value it superseded.
  const [answered, setAnswered] = useState<{ readonly over: GameLive | null; readonly live: GameLive } | null>(null);
  const [pending, setPending] = useState<readonly (readonly GameCommand[])[]>([]);
  const streamedNow = useRef(streamed);
  streamedNow.current = streamed;

  const heard = answered && answered.over === streamed ? answered.live : streamed;
  const commands = pending.flat();
  const live = heard?.sport === 'basketball' ? laidOver(heard, commands, Date.now()) : null;
  if (!live) return { live: null, pending: commands, actions: null };

  const apply = (...batch: GameCommand[]) => {
    const [first, ...rest] = batch;
    if (!first) return;
    setPending((current) => [...current, batch]);
    untilAnswered((signal) => api.game.apply({ sport: 'basketball', gameId: live.gameId, source: OPERATOR, commands: [first, ...rest] }, { signal }), {
      withinMs: ANSWER_MS,
    }).then(
      (answer) => {
        setAnswered({ over: streamedNow.current, live: answer.live });
        setPending((current) => current.filter((each) => each !== batch));
      },
      (error: unknown) => {
        fail(`Game not updated: ${reasonOf(error)}.`);
        setPending((current) => current.filter((each) => each !== batch));
      },
    );
  };
  const actions: GameActions = {
    score(side, by) {
      const value = Math.max(0, live.score[side] + by);
      if (value !== live.score[side]) apply({ type: 'score', side, value });
    },
    clock: () => apply({ type: 'clock', action: live.clock.running ? 'stop' : 'start' }),
    shotClock: (seconds) => apply({ type: 'shotClock', remainingMs: seconds * 1000, running: live.clock.running }),
    possession: (side) => apply({ type: 'possession', side }),
    apply,
  };
  return { live, pending: commands, actions };
}
