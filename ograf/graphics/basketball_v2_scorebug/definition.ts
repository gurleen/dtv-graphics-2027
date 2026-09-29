import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Scorebug v2',
  stateMachine: 'Scorebug',
  viewModel: 'BasketballScorebugV2',
  onAirProperty: 'isPlaying',
  introDuration: 1100,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'basketball_scorebug.rml',
  entry: 'graphic.ts',
};
