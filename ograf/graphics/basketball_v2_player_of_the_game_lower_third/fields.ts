import type { Field } from '../../shared/schema';
import { featureFields } from '../basketball_v2_player_to_watch_lower_third/fields';

export const FIELDS: readonly Field[] = featureFields({
  title: 'PLAYER OF THE GAME',
  context: "VS ST. JOHN'S",
  stats: [['24', 'PTS'], ['8', 'REB'], ['5', 'AST'], ['9-14', 'FG']],
  text: 'SCORED 15 OF HIS 24 POINTS IN THE SECOND HALF, INCLUDING THE GO-AHEAD THREE WITH 41 SECONDS LEFT',
  sponsor: 'Steamfitters Local 420',
});
