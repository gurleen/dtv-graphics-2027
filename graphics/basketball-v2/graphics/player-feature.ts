/** What Player To Watch and Player Of The Game share: one scene layout, a player's identity and body, and the motion headshot. */

import { basketball, PlayerId } from '@dtv/domain';
import { type BindContext, FALLBACK_IMAGES } from '@dtv/playout';
import { z } from 'zod';
import { classYearName, keysOf, opponentOf, playerOf, seasonStatsOf, tonightOf } from './shared';

const { PLAYER_GAME_STATS, PLAYER_SEASON_STATS, positionName } = basketball;

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('season'), stats: z.array(z.enum(keysOf(PLAYER_SEASON_STATS))).max(4).default(['ppg', 'rpg', 'apg', 'fgPct']) }),
  z.object({ kind: z.literal('game'), stats: z.array(z.enum(keysOf(PLAYER_GAME_STATS))).max(4).default(['pts', 'reb', 'ast', 'fg']) }),
  z.object({ kind: z.literal('text'), text: z.string().min(1) }),
]);

/** A player and what the body shows. Each graphic picks which body a cue starts with. */
export const featureParams = (body: z.output<typeof Body>) => z.object({ player: PlayerId, body: Body.default(body) });
type FeatureParams = z.output<ReturnType<typeof featureParams>>;

/** The scene values both graphics bind: everything but the sponsor. */
export function featureValues(params: FeatureParams, context: BindContext) {
  const { player, team } = playerOf(context.world, params.player);
  const { body } = params;
  const stat: { value: string; label: string }[] = [];
  let contextLabel = '';
  if (body.kind === 'season') {
    const season = seasonStatsOf(context.world, player.id);
    if (season) stat.push(...body.stats.map((key) => ({ value: PLAYER_SEASON_STATS[key].value(season), label: PLAYER_SEASON_STATS[key].label })));
    contextLabel = `${context.world.get('season', player.seasonId)?.name ?? ''} season`.trim();
  } else if (body.kind === 'game') {
    const tonight = tonightOf(context, player.id);
    if (tonight) stat.push(...body.stats.map((key) => ({ value: PLAYER_GAME_STATS[key].value(tonight), label: PLAYER_GAME_STATS[key].label })));
    const opponent = context.game && opponentOf(context.game, player.teamId);
    contextLabel = opponent ? `vs ${opponent.school.name}` : '';
  }
  return {
    bodyMode: body.kind === 'text' ? 'TEXT' : 'STATS',
    firstName: player.firstName,
    lastName: player.lastName,
    jerseyNumber: player.jersey,
    position: positionName(player.position),
    classYear: classYearName(player),
    contextLabel,
    stat,
    bodyText: body.kind === 'text' ? body.text : '',
    headshot: player.headshot ?? FALLBACK_IMAGES.headshot,
    teamLogo: team.brand.logo,
    teamPrimaryColor: team.brand.primaryColor,
    teamSecondaryColor: team.brand.secondaryColor,
  };
}

export const featureLabel = (title: string, params: FeatureParams, context: BindContext) => {
  const { player } = playerOf(context.world, params.player);
  return `${title} · ${player.firstName} ${player.lastName}`.trim();
};

/**
 * The motion headshot, laid over the scene's headshot frame (block origin 260, 802; frame
 * at 8, -84 within it, 212 x 304) with the scene's own wipe, rise and fade, in 60 fps
 * frames from generate_player_feature_lower_thirds.ts and the Intro and Outro timelines.
 */
export const motionHeadshot = {
  kind: 'motion-media',
  frame: { x: 260 + 8, y: 802 - 84, width: 212, height: 304, corner: 3 },
  rise: 16,
  intro: { wipe: [6, 34], rise: [8, 44], fade: [8, 30] },
  outro: { wipe: [4, 24], sink: [0, 24], fade: [4, 20] },
  stillOpacity: '_headshotOpacity',
  source: (params: { readonly player: PlayerId }, context: BindContext) => playerOf(context.world, params.player).player.motionHeadshot,
} as const;
