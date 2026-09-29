import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Halftime Statistics v2',
  stateMachine: 'Halftime Statistics',
  viewModel: 'BasketballHalftimeStatisticsV2',
  onAirProperty: 'isPlaying',
  introDuration: 1433,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'halftime_statistics.rml',
  entry: 'graphic.ts',
};
