/** The data page's one view of field locks: who locked each field and when, from `world.locks`. */

import type { EntityKind, Lock, World } from '@dtv/domain';

export type { Lock };

export const locksOf = (world: World, kind: EntityKind, id: string): readonly Lock[] => world.locks(kind, id);

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The tooltip line for a lock. */
export function describeLock(lock: Lock): string {
  if (lock.actor === null || lock.at === null) return 'Locked before who-and-when was recorded. Imports skip it.';
  return `Locked by ${lock.actor}, ${WHEN.format(lock.at)}. Imports skip it.`;
}
