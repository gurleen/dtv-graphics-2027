import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Matchup Locator v2',
  stateMachine: 'Matchup Locator',
  viewModel: 'BasketballMatchupLocatorV2',
  onAirProperty: 'isPlaying',
  introDuration: 1433,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'matchup_locator.rml',
  entry: 'graphic.ts',
};

export const TAG_NAME = 'dtv-basketball-v2-matchup-locator';
