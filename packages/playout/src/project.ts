/**
 * From a bus to what a renderer draws: per layer, the slot and every scene value. Binds run
 * here, so every output shows the same text and a renderer needs no data, rules or clock.
 */

import { type GraphicId, type Revision, Url } from '@dtv/domain';
import { z } from 'zod';
import { type AnyGraphic, type BindContext, LAYERS, type LayerId, type Registry, type ShowContext } from './graphic';
import { boundProps, groupPropName, type PropKind, type SceneFacts, type WireValue } from './scene';
import { type Bus, OperatorId, type Overrides, type SlotId } from './show';

export const BusRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('program') }),
  z.object({ kind: z.literal('preview'), operator: OperatorId }),
]);
export type BusRef = z.infer<typeof BusRef>;

export interface LayerFrame {
  readonly layer: LayerId;
  readonly slot: SlotId;
  readonly graphic: GraphicId;
  readonly step: number;
  /** Every public property but `isPlaying`, strings in capitals, every image a URL. */
  readonly values: Readonly<Record<string, WireValue>>;
  /** The entry's overlay media, or null. */
  readonly media: Url | null;
  /** Set when the bind failed, as when a row it reads was deleted. The renderer keeps what it shows. */
  readonly error: string | null;
}

/** A complete description of one bus. Every frame replaces the last; there are no deltas to miss. */
export interface OutputFrame {
  readonly bus: BusRef;
  readonly revision: Revision;
  readonly layers: readonly LayerFrame[];
}

/** What an image property binds when the data has no image, so a scene's embedded test image never reaches air. */
export const FALLBACK_IMAGES = {
  blank: Url.parse('/assets/images/blank.png'),
  headshot: Url.parse('/assets/images/headshots/placeholder.png'),
} as const;

export function project(input: {
  readonly registry: Registry;
  readonly bus: Bus;
  readonly ref: BusRef;
  readonly revision: Revision;
  readonly context: ShowContext;
}): OutputFrame {
  const layers = LAYERS.flatMap((layer): LayerFrame[] => {
    const slot = input.bus[layer];
    if (!slot) return [];
    const base = { layer, slot: slot.id, graphic: slot.graphic, step: slot.step };
    const entry = input.registry[slot.graphic];
    if (!entry) return [{ ...base, values: {}, media: null, error: `No graphic ${slot.graphic}` }];
    try {
      const params = entry.params.parse(slot.params);
      const values = bindValues(entry, { graphic: slot.graphic, params, step: slot.step, overrides: slot.overrides }, input.context);
      const media = entry.overlay ? entry.overlay.source(params, { ...input.context, sponsor: undefined }) : null;
      return [{ ...base, values, media, error: null }];
    } catch (error) {
      return [{ ...base, values: {}, media: null, error: error instanceof Error ? error.message : String(error) }];
    }
  });
  return { bus: input.ref, revision: input.revision, layers };
}

/** One graphic's scene values. Throws what its bind throws. */
export function bindValues(
  entry: AnyGraphic,
  cue: { readonly graphic: GraphicId; readonly params: unknown; readonly step: number; readonly overrides: Overrides },
  context: ShowContext,
): Record<string, WireValue> {
  const bindContext: BindContext = { ...context, sponsor: context.world.sponsorFor(cue.graphic) };
  const bound = { ...entry.bind(cue.params, bindContext), ...entry.steps?.values(cue.step) };
  return toWire({ ...flatten(bound, entry.scene), ...cue.overrides }, entry.scene);
}

const BLANK: Record<PropKind, WireValue | null> = { string: '', number: 0, boolean: false, color: '#000000', image: null };

/** Group rows back to the scene's numbered names, blanking the rows the bind left out. */
export function flatten(bound: Readonly<Record<string, unknown>>, scene: SceneFacts): Record<string, WireValue | null> {
  const values: Record<string, WireValue | null> = {};
  for (const [name, value] of Object.entries(bound)) {
    const group = scene.groups[name];
    if (!group) {
      // A returned literal escapes TypeScript's excess-property check; this catches the extra key.
      if (!(name in scene.props) || name === 'isPlaying') throw new Error(`${scene.file} has no bindable property ${name}`);
      values[name] = value as WireValue | null;
      continue;
    }
    const rows = value as readonly Readonly<Record<string, WireValue | null>>[];
    if (rows.length > group.count) throw new Error(`${name} has ${rows.length} rows; ${scene.file} has ${group.count}`);
    for (let row = 1; row <= group.count; row++) {
      for (const [field, kind] of Object.entries(group.fields)) {
        values[groupPropName(name, row, field)] = rows[row - 1]?.[field] ?? BLANK[kind];
      }
    }
  }
  return values;
}

/** Rive has no case transform and every scene sets its text in capitals, so strings are uppercased once, here. */
function toWire(values: Readonly<Record<string, WireValue | null>>, scene: SceneFacts): Record<string, WireValue> {
  const kinds = boundProps(scene);
  return Object.fromEntries(
    Object.entries(values).map(([name, value]): [string, WireValue] => {
      // Only an image property binds null.
      if (value === null) return [name, FALLBACK_IMAGES.blank];
      return [name, kinds.get(name) === 'string' && typeof value === 'string' ? value.toUpperCase() : value];
    }),
  );
}
