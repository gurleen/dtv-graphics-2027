import { defineGraphic } from '@dtv/playout';
import { SCENES } from '../scenes.gen';
import { talentLabel, talentParams, talentRows } from './talent';

export const talentLowerThirdDouble = defineGraphic({
  id: 'basketball-v2/talent-lower-third-double',
  scene: SCENES.talent_lower_third_double,
  params: talentParams(2),
})({
  name: 'Talent Lower Third (Double)',
  sport: 'basketball',
  layer: 'lower',
  clears: ['bug'],
  demo: { talents: ['rob-brooks', 'mike-tuberosa'] },
  site: 'full-frame',
  label: (params, context) => `Talent · ${talentLabel(params.talents, context)}`,
  bind: (params, context) => ({ talent: talentRows(params.talents, context) }),
});
