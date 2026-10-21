/**
 * What a controller or control surface sees: the active show's free panel and rundown with
 * each cue's on-air state, program, the viewer's own preview and everyone else's.
 */

import { GraphicId, type Revision, sameJson, type Show } from '@dtv/domain';
import type { LayerId, Registry, ShowContext } from './graphic';
import { bindValues } from './project';
import { type Bus, type CueRef, type OperatorId, resolveCue, type ShowState, type SlotId } from './show';

export interface CueView {
  readonly ref: CueRef;
  readonly graphic: GraphicId;
  readonly name: string;
  readonly label: string;
  /** Null when the cue names a graphic the registry no longer has. */
  readonly layer: LayerId | null;
  /** The program slot showing this cue, for Clear and Next. */
  readonly onProgram: SlotId | null;
  readonly inMyPreview: boolean;
  /** Steps for Next and Previous; null for a one-step graphic. */
  readonly steps: number | null;
  /** Why it cannot go to air right now, such as a deleted player or a show without a game. */
  readonly error: string | null;
}

export interface ShowView {
  readonly revision: Revision;
  readonly show: Show | null;
  readonly free: readonly CueView[];
  readonly rundown: readonly CueView[];
  readonly program: Bus;
  readonly preview: Bus;
  readonly otherPreviews: ShowState['previews'];
  /** Operators with an open show stream. */
  readonly operators: readonly OperatorId[];
}

export function viewShow(input: {
  readonly registry: Registry;
  readonly state: ShowState;
  readonly operator: OperatorId;
  readonly operators: readonly OperatorId[];
  readonly revision: Revision;
  readonly context: ShowContext;
}): ShowView {
  const { registry, state, context } = input;
  const { [input.operator]: preview = {}, ...otherPreviews } = state.previews;
  const slotOf = (bus: Bus, ref: CueRef) => Object.values(bus).find((slot) => sameJson(slot.origin, ref));

  const view = (ref: CueRef, fallback: { graphic: GraphicId; label: string }): CueView => {
    const onAir = { onProgram: slotOf(state.program, ref)?.id ?? null, inMyPreview: slotOf(preview, ref) !== undefined };
    const cue = resolveCue(registry, ref, context);
    if (!cue.ok) {
      const entry = registry[fallback.graphic];
      return { ref, graphic: fallback.graphic, name: entry?.name ?? fallback.graphic, label: fallback.label, layer: entry?.layer ?? null, steps: null, error: cue.error, ...onAir };
    }
    const { entry } = cue;
    const common = { ref, graphic: cue.graphic, name: entry.name, layer: entry.layer, steps: entry.steps?.count ?? null, ...onAir };
    try {
      const bindContext = { ...context, sponsor: context.world.sponsorFor(cue.graphic) };
      const label = entry.label(cue.params, bindContext);
      bindValues(entry, { graphic: cue.graphic, params: cue.params, step: 0, overrides: cue.overrides }, context);
      return { ...common, label, error: null };
    } catch (error) {
      return { ...common, label: fallback.label, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const free = Object.values(registry).flatMap((entry) => {
    if (!entry.free || entry.free(context) === null) return [];
    const graphic = GraphicId.parse(entry.id);
    return [view({ kind: 'free', graphic }, { graphic, label: entry.name })];
  });
  const rundown = (context.show?.rundown ?? []).map((cue) => view({ kind: 'rundown', cue: cue.id }, { graphic: cue.graphic, label: cue.note || cue.graphic }));

  return {
    revision: input.revision,
    show: context.show ?? null,
    free,
    rundown,
    program: state.program,
    preview,
    otherPreviews,
    operators: input.operators,
  };
}
