import type { GraphicSource, RiveGraphicDefinition } from '../../shared/definition';
import { FIELDS } from './fields';

export const DEFINITION: RiveGraphicDefinition = {
  riv: './graphic.riv',
  artboard: 'Basketball Matchup Locator Lower Third v2',
  stateMachine: 'Matchup Locator Lower Third',
  viewModel: 'BasketballMatchupLocatorLowerThirdV2',
  onAirProperty: 'isPlaying',
  introDuration: 1400,
  outroDuration: 400,
  fields: FIELDS,
};

export const SOURCE: GraphicSource = {
  sceneDirectory: 'graphics/basketball-v2',
  sceneFile: 'matchup_locator_lower_third.rml',
  entry: 'graphic.ts',
};

export const TAG_NAME = 'dtv-basketball-v2-matchup-locator-lower-third';
