/**
 * The live game as the show page shows it: the newest state the server streamed. Nobody sets
 * it from the controller; a live data feed will.
 */

import { basketball, type GameId } from '@dtv/domain';
import { useController } from '../app/context';
import { useStream } from '../app/streams';

/** The game's live state; null until the first value, or for a game that is not basketball. */
export function useGame(gameId: GameId | null): basketball.BasketballLive | null {
  const { api } = useController();
  const live = useStream(gameId ? (signal) => api.game.watch({ game: gameId }, { signal }) : null, [api, gameId]);
  return live?.sport === 'basketball' ? live : null;
}
