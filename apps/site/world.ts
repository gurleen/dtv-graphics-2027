/** `world.json`: what the build script bakes in and the page runs a local show over. */

import type { EpochMs, GameLive, ShowId, WorldSnapshot } from '@dtv/domain';

export interface SiteWorld {
  readonly snapshot: WorldSnapshot;
  /** The demo game's live state. */
  readonly live: GameLive;
  /** The show whose rundown holds one cue per graphic, from each entry's `demo`. */
  readonly showId: ShowId;
  readonly now: EpochMs;
}
