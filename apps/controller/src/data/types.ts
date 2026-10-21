import type { TeamId } from '@dtv/domain';
import type { EditableKind } from './fields';

export const LISTS = { talent: 'Talent', sponsors: 'Sponsors', venues: 'Venues', shows: 'Shows' } as const;
export type ListId = keyof typeof LISTS;

/** What the middle column shows. */
export type View = { readonly type: 'team'; readonly team: TeamId } | { readonly type: 'list'; readonly list: ListId };

/**
 * A row of some kind: what a table lists and what the record panel shows. `fallback` stands in for a row
 * the World does not have yet, such as a player with no season stats; the first edit creates it.
 */
export interface Target {
  readonly kind: EditableKind;
  readonly id: string;
  readonly fallback?: Readonly<Record<string, unknown>>;
}

export const sameTarget = (a: Target | null, b: Target | null) => a?.kind === b?.kind && a?.id === b?.id;

export type RowRef = Target;
