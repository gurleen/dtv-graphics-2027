/** A StatCrew XML box score generated from a game's rosters, for the proofs. */

import type { Player, Side } from '@dtv/domain';

const stats = (jersey: number, bonus: number) => {
  const pts = jersey + 2 + bonus;
  return `min="20" fgm="${pts}" fga="${pts + 3}" fgm3="1" fga3="2" ftm="0" fta="0" tp="${pts}" treb="${jersey % 7}" ast="${jersey % 5}" stl="1" blk="0" to="1" pf="2"`;
};

/** A box score whose jerseys are the rosters', the first five of each starting, plus one player no roster has. */
export function boxScore(rosters: Record<Side, readonly Player[]>, scores: Record<Side, number>, bonus: number) {
  const team = (side: Side, vh: string) => {
    const players = rosters[side].map((player, index) => {
      const jersey = Number(player.jersey);
      return `<player uni="${player.jersey}" name="${player.lastName.toUpperCase()},${player.firstName.toUpperCase()}"${index < 5 ? ' gs="1"' : ''}><stats ${stats(jersey, bonus)}/></player>`;
    });
    return `<team vh="${vh}" id="${side}" name="${side}"><linescore score="${scores[side]}"/><totals><stats ${stats(50, bonus)} /></totals><player uni="TM" name="TEAM"><stats treb="2"/></player>${players.join('')}<player uni="98" name="NOBODY,UNKNOWN"><stats tp="2"/></player></team>`;
  };
  return `<?xml version="1.0"?><bbgame>${team('away', 'V')}${team('home', 'H')}</bbgame>`;
}
