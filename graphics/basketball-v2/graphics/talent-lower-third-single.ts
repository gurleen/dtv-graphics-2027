import { defineGraphic } from '@dtv/playout';
import { SCENES } from '../scenes.gen';
import { talentLabel, talentParams, talentRows } from './talent';

export const talentLowerThirdSingle = defineGraphic({
  id: 'basketball-v2/talent-lower-third-single',
  scene: SCENES.talent_lower_third_single,
  params: talentParams(1),
})({
  name: 'Talent Lower Third (Single)',
  sport: 'basketball',
  layer: 'lower',
  demo: { talents: ['rob-brooks'] },
  site: 'with-scorebug',
  label: (params, context) => `Talent · ${talentLabel(params.talents, context)}`,
  bind: (params, context) => ({ talent: talentRows(params.talents, context) }),
});
