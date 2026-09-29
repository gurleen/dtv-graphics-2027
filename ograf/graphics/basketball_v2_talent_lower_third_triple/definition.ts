import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Talent Lower Third Triple v2',
  stateMachine: 'Talent Lower Third',
  viewModel: 'BasketballTalentLowerThirdTripleV2',
  onAirProperty: 'isPlaying',
  introDuration: 1200,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'talent_lower_third_triple.rml',
  entry: 'graphic.ts',
};
