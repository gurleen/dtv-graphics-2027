/** Turns a parsed box score into the `game.apply` commands that write it. Pure. */

import { basketball, type PlayerId, type ProgramOf, type Side, SIDES, type Sides } from '@dtv/domain';
import type { StatcrewGame } from './statcrew';

export interface Commands {
  readonly commands: basketball.BasketballCommand[];
  /** `home #23 SMITH,JOHN`: on the StatCrew file but not on the roster, so no command names them. */
  readonly unmatched: string[];
}

const STARTERS = 5;

/** NCAA: four a game, at most three carried into the second half, and one more for each overtime. */
const TIMEOUTS = 4;
const SECOND_HALF_CARRY = 3;
/** NCAA: the bonus starts on the opponent's 7th foul of a half or 5th of a quarter; overtime continues the last period. */
const BONUS_FOULS = { halves: 7, quarters: 5 } as const;

const OTHER = { away: 'home', home: 'away' } as const;

/** Each side's timeouts left, from the file's `TIMEOUT` plays. A media timeout is charged to a team but is not the team's. */
function timeoutsLeft(game: StatcrewGame, period: number, periods: number): Sides<number> {
  const used = (side: Side, at: number) =>
    game.plays.filter((play) => play.side === side && play.period === at && play.action === 'TIMEOUT' && play.type !== 'MEDIA').length;
  const left = (side: Side) => {
    let remaining = TIMEOUTS;
    for (let at = 1; at <= period; at++) {
      if (periods === 2 && at === 2) remaining = Math.min(remaining, SECOND_HALF_CARRY);
      if (at > periods) remaining++;
      remaining = Math.max(0, remaining - used(side, at));
    }
    return remaining;
  };
  return { away: left('away'), home: left('home') };
}

/** Whether each side shoots the bonus: the other side's team fouls this half or quarter, overtime counting as the last one. */
function inBonus(game: StatcrewGame, period: number, periods: number): Sides<boolean> {
  const from = Math.min(period, periods);
  const fouls = (side: Side) => [...game.teams[side].fouls].reduce((sum, [at, count]) => (at >= from && at <= period ? sum + count : sum), 0);
  const limit = periods === 2 ? BONUS_FOULS.halves : BONUS_FOULS.quarters;
  return { away: fouls(OTHER.away) >= limit, home: fouls(OTHER.home) >= limit };
}

/**
 * Only `score` and `stats` are written. A player off the roster is reported and skipped,
 * because the server refuses a whole batch that names one (NOT_IN_GAME). Timeouts and bonus
 * need the period, so a file with neither a `<status>` nor a play leaves them alone.
 */
export function commandsFor(game: StatcrewGame, rosters: Sides<ReadonlyMap<string, PlayerId>>, program: ProgramOf<'basketball'>): Commands {
  const commands: basketball.BasketballCommand[] = [];
  const unmatched: string[] = [];
  const period = game.period ?? game.plays.at(-1)?.period;
  const periods = game.periods ?? basketball.BASKETBALL_FORMAT[program].periods;
  const timeouts = period ? timeoutsLeft(game, period, periods) : null;
  const bonus = period ? inBonus(game, period, periods) : null;
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
      ...(timeouts ? [{ type: 'timeouts' as const, side, remaining: timeouts[side] }] : []),
      ...(bonus ? [{ type: 'bonus' as const, side, value: bonus[side] }] : []),
      { type: 'teamLine', side, line: team.line },
      ...matched.map(({ id, player }) => ({ type: 'playerLine' as const, player: id, line: player.line })),
      ...(starters.length === STARTERS ? [{ type: 'starters' as const, side, players: starters }] : []),
    );
  }
  return { commands, unmatched };
}
