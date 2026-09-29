import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Starting Five Lower Third v2',
  stateMachine: 'Starting Five Lower Third',
  viewModel: 'BasketballStartingFiveLowerThirdV2',
  onAirProperty: 'isPlaying',
  introDuration: 1400,
  outroDuration: 400,
  // Step 0 shows the away team, step 1 the home team.
  steps: { count: 2, property: 'step', transitionDuration: 1000 },
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'starting_five_lower_third.rml',
  entry: 'graphic.ts',
};
