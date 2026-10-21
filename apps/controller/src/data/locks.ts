/**
 * The data page's one view of field locks. The World lists only which fields are locked;
 * who locked them and when is arriving in `world.locks`, and the coordinator switches
 * `locksOf` to it at merge. Everything else reads locks through this file.
 */

import type { EntityKind, EpochMs, World } from '@dtv/domain';

export interface Lock {
  readonly field: string;
  /** Null for a lock made before who-and-when was recorded. */
  readonly actor: string | null;
  readonly at: EpochMs | null;
}

export const locksOf = (world: World, kind: EntityKind, id: string): readonly Lock[] =>
  world.locked(kind, id).map((field) => ({ field, actor: null, at: null }));

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The tooltip line for a lock. */
export function describeLock(lock: Lock): string {
  if (lock.actor === null || lock.at === null) return 'Locked before who-and-when was recorded. Imports skip it.';
  return `Locked by ${lock.actor}, ${WHEN.format(lock.at)}. Imports skip it.`;
}
