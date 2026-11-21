/**
 * Who scored last. StatCrew's play by play names the scorer of every basket; without it,
 * the box score's points still say who scored since the page last looked.
 */

import type { StatcrewPlay } from '@dtv/api';
import type { basketball, GameView, Player, PlayerId, World } from '@dtv/domain';

/** The player on the newest made basket in the plays, matched to the game's rosters by jersey. */
export function scorerFromPlays(plays: readonly StatcrewPlay[], game: GameView, world: World): Player | null {
  for (let at = plays.length - 1; at >= 0; at--) {
    const play = plays[at]!;
    if (play.action !== 'GOOD' || !play.score || !play.side || play.uni === 'TM') continue;
    const { team } = game.sides[play.side];
    const player = world.roster(team.id, game.season.id).find((each) => each.jersey === play.uni);
    if (player) return player;
  }
  return null;
}

/** A player whose points went up between two box scores, or null when nobody's did. */
export function scorerFromLines(before: basketball.BasketballLive['players'], after: basketball.BasketballLive['players']): PlayerId | null {
  for (const [id, line] of Object.entries(after)) {
    if (line.pts > (before[id as PlayerId]?.pts ?? 0)) return id as PlayerId;
  }
  return null;
}
