/** `world.json`: what the build script bakes in and the page runs a local show over. */

import type { EpochMs, GameId, GameLive, WorldSnapshot } from '@dtv/domain';

export interface SiteWorld {
  readonly snapshot: WorldSnapshot;
  /** The demo game's live state. */
  readonly live: GameLive;
  /** The game whose show's rundown holds one cue per graphic, from each entry's `demo`. */
  readonly gameId: GameId;
  readonly now: EpochMs;
}
