/** Turns a parsed box score into the `game.apply` commands that write it. Pure. */

import { type basketball, type PlayerId, SIDES, type Sides } from '@dtv/domain';
import type { StatcrewGame } from './statcrew';

export interface Commands {
  readonly commands: basketball.BasketballCommand[];
  /** `home #23 SMITH,JOHN`: on the StatCrew file but not on the roster, so no command names them. */
  readonly unmatched: string[];
}

const STARTERS = 5;

const SHOT_VALUE = { FT: 1, '3PTR': 3 } as const;

/** `5:11` as milliseconds, or null for a time StatCrew left blank or garbled. */
const clockMs = (time: string): number | null => {
  const match = /^(\d+):(\d{2})$/.exec(time.trim());
  return match ? (Number(match[1]) * 60 + Number(match[2])) * 1000 : null;
};

/** Every `GOOD` and `MISS` play with a side and a time, in the file's order. Any type but `FT` and `3PTR` is a 2. */
export function shotsOf(game: StatcrewGame): basketball.Shot[] {
  return game.plays.flatMap((play) => {
    const remainingMs = clockMs(play.time);
    if ((play.action !== 'GOOD' && play.action !== 'MISS') || !play.side || remainingMs === null || play.period < 1) return [];
    const value = SHOT_VALUE[play.type as keyof typeof SHOT_VALUE] ?? 2;
    return [{ period: play.period, remainingMs, side: play.side, value, made: play.action === 'GOOD' }];
  });
}

/**
 * Only `stats` is written: the score, timeouts, bonus and clock are AllSport's or the operator's.
 * A player off the roster is reported and skipped, because the server refuses a whole batch
 * that names one (NOT_IN_GAME).
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
      { type: 'teamLine', side, line: team.line },
      ...matched.map(({ id, player }) => ({ type: 'playerLine' as const, player: id, line: player.line })),
      ...(starters.length === STARTERS ? [{ type: 'starters' as const, side, players: starters }] : []),
    );
  }
  commands.push({ type: 'shots', shots: shotsOf(game) });
  return { commands, unmatched };
}
