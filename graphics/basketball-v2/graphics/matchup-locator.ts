import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { matchupValues, requireGame } from './shared';

export const matchupLocator = defineGraphic({
  id: 'basketball-v2/matchup-locator',
  scene: SCENES.matchup_locator,
  params: z.object({}),
})({
  name: 'Matchup Locator',
  sport: 'basketball',
  layer: 'card',
  demo: {},
  site: 'full-frame',
  label: () => 'Matchup locator',
  bind: (_params, context) => ({ ...matchupValues(requireGame(context)), sponsorLogo: context.sponsor?.logoOnDark ?? null }),
});
