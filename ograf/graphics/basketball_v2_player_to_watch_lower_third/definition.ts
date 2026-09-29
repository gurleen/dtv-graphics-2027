import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Player To Watch Lower Third v2',
  stateMachine: 'Player To Watch Lower Third',
  viewModel: 'BasketballPlayerToWatchLowerThirdV2',
  onAirProperty: 'isPlaying',
  introDuration: 1400,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'player_to_watch_lower_third.rml',
  entry: 'graphic.ts',
};
