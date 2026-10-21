/**
 * The seed's hand-written fixtures (data/seed/fixtures.json), and how the seed layers its
 * sources. Each source is a list of rows; a row merges field by field over the row an
 * earlier source gave the same kind and id, so a fixture can correct one field of a
 * teams.json school without restating the rest.
 */

import { z } from 'zod';
import { type ImportEdit, importPut } from '../edits';
import { ENTITY_KINDS, type EntityKind, parseEntity } from '../entities';
import { SeasonId } from '../ids';
import { ProgramCode } from '../programs';
import { GameLive } from '../sports';
import type { ImportWarning } from './espn';

const Row = z.looseObject({ id: z.string() });
type Row = z.infer<typeof Row>;

export const SeedFixtures = z.object({
  /** The season and programs teams.json is seeded for. */
  teams: z.object({ season: SeasonId, programs: z.array(ProgramCode).min(1) }),
  /** Rows by kind. A row with a new id must be complete; one that corrects an earlier source names only what it changes. */
  entities: z.partialRecord(z.enum(ENTITY_KINDS), z.array(Row)),
  live: z.array(GameLive).default([]),
});
export type SeedFixtures = z.infer<typeof SeedFixtures>;

export interface LayerRow {
  readonly kind: EntityKind;
  readonly row: Row;
}

export const fixtureRows = (fixtures: SeedFixtures): LayerRow[] =>
  ENTITY_KINDS.flatMap((kind) => (fixtures.entities[kind] ?? []).map((row) => ({ kind, row })));

export const editRows = (edits: readonly ImportEdit[]): LayerRow[] =>
  edits.flatMap((edit) => (edit.op === 'put' ? [{ kind: edit.kind, row: edit.value }] : []));

export interface LayerWarning {
  readonly code: 'conference-changed';
  readonly message: string;
  readonly subjects: readonly string[];
}

/**
 * Merges the sources in order, later over earlier, and parses every merged row. A later
 * source that moves a team's season to another conference is reported: it is how the seed
 * notices that teams.json predates a realignment.
 */
export function layerEdits(
  layers: readonly (readonly LayerRow[])[],
  onExisting?: 'keep',
): { readonly edits: ImportEdit[]; readonly warnings: (ImportWarning | LayerWarning)[] } {
  const merged = new Map<string, LayerRow>();
  const warnings: LayerWarning[] = [];
  for (const layer of layers) {
    for (const { kind, row } of layer) {
      const key = `${kind}/${row.id}`;
      const earlier = merged.get(key)?.row;
      if (kind === 'teamSeason' && earlier && 'conferenceId' in row && row.conferenceId !== earlier.conferenceId) {
        warnings.push({
          code: 'conference-changed',
          message: `${row.id} is in ${earlier.conferenceId} in an earlier source and ${row.conferenceId} in a later one; using ${row.conferenceId}`,
          subjects: [row.id],
        });
      }
      merged.set(key, { kind, row: { ...earlier, ...row } });
    }
  }
  const edits = [...merged.values()].map(({ kind, row }) => {
    try {
      return importPut(kind, parseEntity(kind, row), onExisting);
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      throw new Error(`${kind} ${row.id} is not valid once its sources are merged:\n${z.prettifyError(error)}`);
    }
  });
  return { edits, warnings };
}
