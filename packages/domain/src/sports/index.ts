/**
 * The sport registry. Every sport-specific type and rule hangs off one row here, so a new
 * sport is a module in this folder and one line in SPORT_MODULES; the `satisfies` makes a
 * missing sport a compile error.
 */

import { z } from 'zod';
import { GameId, type PlayerId, SourceId } from '../ids';
import type { EpochMs, Side } from '../primitives';
import type { ProgramOf, Sport } from '../programs';
import * as basketball from './basketball';

interface SportModule<Live, Command, Program> {
  readonly live: z.ZodType<Live>;
  readonly command: z.ZodType<Command>;
  readonly initial: (gameId: GameId, program: Program) => Live;
  readonly apply: (live: Live, command: Command, context: { source: SourceId; now: EpochMs }) => basketball.ApplyResult<Live>;
  /** The earliest moment any displayed value derived from `live` changes on its own. */
  readonly nextChange: (live: Live, now: EpochMs) => EpochMs | null;
  /** The players a command names, each with the side it puts them on, or null for either team. */
  readonly players: (command: Command) => readonly { readonly player: PlayerId; readonly side: Side | null }[];
}

const earliest = (times: readonly (EpochMs | null)[]): EpochMs | null => {
  const known = times.filter((time): time is EpochMs => time !== null);
  return known.length ? Math.min(...known) : null;
};

export const SPORT_MODULES = {
  basketball: {
    live: basketball.BasketballLive,
    command: basketball.BasketballCommand,
    initial: basketball.initialBasketball,
    apply: basketball.applyBasketball,
    nextChange: (live, now) =>
      earliest([
        basketball.nextDisplayChange(live.clock, now, 'game'),
        basketball.nextShotClockChange(live, now),
      ]),
    players: (command) => {
      if (command.type === 'starters') return command.players.map((player) => ({ player, side: command.side }));
      if (command.type === 'playerLine') return [{ player: command.player, side: null }];
      return [];
    },
  },
} as const satisfies {
  [S in Sport]: SportModule<basketball.BasketballLive, basketball.BasketballCommand, ProgramOf<S>>;
};

/** Live state of any game, discriminated by `sport`. Stored per game, apart from the game's schedule data. */
export const GameLive = z.discriminatedUnion('sport', [basketball.BasketballLive]);
export type GameLive = z.infer<typeof GameLive>;

/**
 * One call's worth of live updates. Discriminated by sport so a caller gets the right
 * command type; the store rejects a sport that does not match the game.
 */
export const GameApplyInput = z.discriminatedUnion('sport', [
  z.object({
    sport: z.literal('basketball'),
    gameId: GameId,
    source: SourceId,
    commands: z.array(basketball.BasketballCommand).min(1),
  }),
]);
export type GameApplyInput = z.infer<typeof GameApplyInput>;

export { basketball };
