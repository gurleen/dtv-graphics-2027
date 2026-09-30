import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Team Lower Third v2',
  stateMachine: 'Team Lower Third',
  viewModel: 'BasketballTeamLowerThirdV2',
  onAirProperty: 'isPlaying',
  introDuration: 1200,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'team_lower_third.rml',
  entry: 'graphic.ts',
};
