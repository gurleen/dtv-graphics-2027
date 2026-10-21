import { basketball, PlayerId } from '@dtv/domain';
import { defineGraphic, FALLBACK_IMAGES } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { classYearName, fullName, playerOf, seasonStatsOf, statKey, tonightOf } from './shared';

const { PLAYER_GAME_STATS, PLAYER_SEASON_STATS, positionName } = basketball;

const StatLine = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('game'), stats: z.array(statKey(PLAYER_GAME_STATS)).max(4).default(['pts', 'reb', 'ast']) }),
  z.object({ kind: z.literal('season'), stats: z.array(statKey(PLAYER_SEASON_STATS)).max(4).default(['ppg', 'rpg', 'apg']) }),
  z.object({ kind: z.literal('text'), label: z.string(), text: z.string() }),
  z.object({ kind: z.literal('none') }),
]);

const SEPARATOR = '  ·  ';

export const playerLowerThird = defineGraphic({
  id: 'basketball-v2/player-lower-third',
  scene: SCENES.player_lower_third,
  params: z.object({ player: PlayerId, line: StatLine.default({ kind: 'season', stats: ['ppg', 'rpg', 'apg'] }) }),
})({
  name: 'Player Lower Third',
  sport: 'basketball',
  layer: 'lower',
  demo: { player: 'drexel-mbb@2026-27/reed-josh', line: { kind: 'game', stats: ['pts', 'reb', 'ast', 'threes'] } },
  site: 'with-scorebug',
  label: (params, context) => {
    const { player } = playerOf(context.world, params.player);
    return `${fullName(player)} #${player.jersey} · ${params.line.kind}`;
  },
  bind(params, context) {
    const { player, team } = playerOf(context.world, params.player);
    const { line } = params;
    let statLabel = '';
    let statLine = '';
    if (line.kind === 'game') {
      const tonight = tonightOf(context, player.id);
      statLabel = 'Tonight';
      statLine = tonight ? line.stats.map((key) => `${PLAYER_GAME_STATS[key].value(tonight)} ${PLAYER_GAME_STATS[key].label}`).join(SEPARATOR) : '';
    } else if (line.kind === 'season') {
      const season = seasonStatsOf(context.world, player.id);
      statLabel = 'Season';
      statLine = season ? line.stats.map((key) => `${PLAYER_SEASON_STATS[key].value(season)} ${PLAYER_SEASON_STATS[key].label}`).join(SEPARATOR) : '';
    } else if (line.kind === 'text') {
      statLabel = line.label;
      statLine = line.text;
    }
    return {
      firstName: player.firstName,
      lastName: player.lastName,
      jerseyNumber: player.jersey,
      position: positionName(player.position),
      classYear: classYearName(player),
      statLabel,
      statLine,
      headshot: player.headshot ?? FALLBACK_IMAGES.headshot,
      teamLogo: team.brand.logo,
      teamPrimaryColor: team.brand.primaryColor,
      teamSecondaryColor: team.brand.secondaryColor,
    };
  },
});
