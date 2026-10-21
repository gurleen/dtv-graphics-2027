import { defineGraphic } from '@dtv/playout';
import { SCENES } from '../scenes.gen';
import { talentLabel, talentParams, talentRows } from './talent';

export const talentLowerThirdTriple = defineGraphic({
  id: 'basketball-v2/talent-lower-third-triple',
  scene: SCENES.talent_lower_third_triple,
  params: talentParams(3),
})({
  name: 'Talent Lower Third (Triple)',
  sport: 'basketball',
  layer: 'lower',
  clears: ['bug'],
  demo: { talents: ['rob-brooks', 'mike-tuberosa', 'tessa-peloso'] },
  site: 'full-frame',
  label: (params, context) => `Talent · ${talentLabel(params.talents, context)}`,
  bind: (params, context) => ({ talent: talentRows(params.talents, context) }),
});
