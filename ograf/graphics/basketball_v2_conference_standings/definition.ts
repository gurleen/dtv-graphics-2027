import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Conference Standings v2',
  stateMachine: 'Conference Standings',
  viewModel: 'BasketballConferenceStandingsV2',
  onAirProperty: 'isPlaying',
  introDuration: 1500,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'conference_standings.rml',
  entry: 'graphic.ts',
};
