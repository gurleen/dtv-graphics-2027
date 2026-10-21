import { defineGraphic } from '@dtv/playout';
import { SCENES } from '../scenes.gen';
import { featureLabel, featureParams, featureValues, motionHeadshot } from './player-feature';

export const playerOfTheGame = defineGraphic({
  id: 'basketball-v2/player-of-the-game',
  scene: SCENES.player_of_the_game_lower_third,
  params: featureParams({ kind: 'game', stats: ['pts', 'reb', 'ast', 'fg'] }),
})({
  name: 'Player Of The Game',
  sport: 'basketball',
  layer: 'lower',
  demo: { player: 'drexel-mbb@2026-27/reed-josh' },
  site: 'full-frame',
  label: (params, context) => featureLabel('Player of the game', params, context),
  bind: (params, context) => ({ ...featureValues(params, context), sponsorLogo: context.sponsor?.logoOnLight ?? null }),
  overlay: motionHeadshot,
});
