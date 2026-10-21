import { defineGraphic } from '@dtv/playout';
import { SCENES } from '../scenes.gen';
import { featureLabel, featureParams, featureValues, motionHeadshot } from './player-feature';

export const playerToWatch = defineGraphic({
  id: 'basketball-v2/player-to-watch',
  scene: SCENES.player_to_watch_lower_third,
  params: featureParams({ kind: 'season', stats: ['ppg', 'rpg', 'apg', 'fgPct'] }),
})({
  name: 'Player To Watch',
  sport: 'basketball',
  layer: 'lower',
  demo: { player: 'drexel-mbb@2026-27/reed-josh' },
  site: 'full-frame',
  label: (params, context) => featureLabel('Player to watch', params, context),
  bind: (params, context) => ({ ...featureValues(params, context), sponsorLogo: context.sponsor?.logoOnLight ?? null }),
  overlay: motionHeadshot,
});
