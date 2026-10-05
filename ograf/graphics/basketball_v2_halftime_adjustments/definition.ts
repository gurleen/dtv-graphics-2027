import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Halftime Adjustments v2',
  stateMachine: 'Halftime Adjustments',
  viewModel: 'BasketballHalftimeAdjustmentsV2',
  onAirProperty: 'isPlaying',
  introDuration: 1200,
  outroDuration: 400,
  // Step 0 shows the away team, step 1 the home team.
  steps: { count: 2, property: 'step', transitionDuration: 800 },
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'halftime_adjustments.rml',
  entry: 'graphic.ts',
};
