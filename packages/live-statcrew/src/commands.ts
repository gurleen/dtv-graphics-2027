/** Turns a parsed box score into the `game.apply` commands that write it. Pure. */

import { type basketball, type PlayerId, SIDES, type Sides } from '@dtv/domain';
import type { StatcrewGame } from './statcrew';

export interface Commands {
  readonly commands: basketball.BasketballCommand[];
  /** `home #23 SMITH,JOHN`: on the StatCrew file but not on the roster, so no command names them. */
  readonly unmatched: string[];
}

const STARTERS = 5;

/**
 * Only `score` and `stats` are written. A player off the roster is reported and skipped,
 * because the server refuses a whole batch that names one (NOT_IN_GAME).
 */
export function commandsFor(game: StatcrewGame, rosters: Sides<ReadonlyMap<string, PlayerId>>): Commands {
  const commands: basketball.BasketballCommand[] = [];
  const unmatched: string[] = [];
  for (const side of SIDES) {
    const team = game.teams[side];
    const matched = team.players.flatMap((player) => {
      const id = rosters[side].get(player.uni);
      if (!id) unmatched.push(`${side} #${player.uni} ${player.name}`);
      return id ? [{ id, player }] : [];
    });
    const starters = matched.filter(({ player }) => player.starter).map(({ id }) => id);
    commands.push(
      { type: 'score', side, value: team.score },
      { type: 'teamLine', side, line: team.line },
      ...matched.map(({ id, player }) => ({ type: 'playerLine' as const, player: id, line: player.line })),
      ...(starters.length === STARTERS ? [{ type: 'starters' as const, side, players: starters }] : []),
    );
  }
  return { commands, unmatched };
}
