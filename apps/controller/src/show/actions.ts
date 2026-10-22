/**
 * Every show action an operator can take, by name. A button and its key call the same
 * action, so a key can never do what its button does not. Each sends `show.command`s
 * computed from the view the operator is looking at: a Clear names the slot it saw.
 */

import { sameJson } from '@dtv/domain';
import { type Bus, type CueView, entryOf, LAYERS, type LayerId, type Registry, type ShowView, type Slot } from '@dtv/playout';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';

/** The view of the cue a slot came from, for its label; undefined for a cue since removed. */
export const cueOfSlot = (view: ShowView, slot: Slot): CueView | undefined =>
  [...view.free, ...view.rundown].find((cue) => sameJson(cue.ref, slot.origin));

export const slotLabel = (view: ShowView, registry: Registry, slot: Slot): string =>
  cueOfSlot(view, slot)?.label ?? entryOf(registry, slot.graphic)?.name ?? slot.graphic;

/** The step a stepped slot is on and how many it has; null for a one-step graphic. */
export function stepsOf(registry: Registry, slot: Slot): { readonly step: number; readonly count: number } | null {
  const count = entryOf(registry, slot.graphic)?.steps?.count;
  return count ? { step: slot.step, count } : null;
}

/**
 * The graphic Next moves: the selected cue if it is on program, else the topmost rundown
 * graphic on program. Past its last step it leaves air, so Next takes a one-step graphic
 * off. Free-panel graphics have their own keys, so Next never reaches them unselected.
 */
export function nextTarget(program: Bus, selected: CueView | undefined): { readonly layer: LayerId; readonly slot: Slot } | null {
  if (selected?.onProgram && selected.layer) {
    const slot = program[selected.layer];
    if (slot && slot.id === selected.onProgram) return { layer: selected.layer, slot };
  }
  for (const layer of [...LAYERS].reverse()) {
    const slot = program[layer];
    if (slot && slot.origin.kind === 'rundown') return { layer, slot };
  }
  return null;
}

export interface ShowActions {
  take(): void;
  cue(cue: CueView): void;
  /** Make my preview the cue alone, or empty when it cannot air: the rundown selection calls it. */
  preview(cue: CueView): void;
  /** Next on the graphic on program; past its last step, or at once for a one-step graphic, it leaves air. */
  next(): void;
  clearPreview(): void;
  clearLayer(layer: LayerId): void;
  /** A free-panel key: air it, or clear it when it is already on program. */
  free(cue: CueView): void;
}

export function useShowActions(selected: CueView | undefined): ShowActions | null {
  const { operator, registry, show: view } = useController();
  const { send, pending } = useCommands();
  if (!view?.show) return null;
  return {
    take() {
      // A take still on its way already holds my preview; a second would find it empty.
      if (!pending.some((command) => command.type === 'take')) void send({ type: 'take', operator });
    },
    cue: (cue) => void send({ type: 'cue', operator, ref: cue.ref }),
    preview(cue) {
      const keep = cue.error ? null : cue.layer;
      for (const layer of LAYERS) if (view.preview[layer] && layer !== keep) void send({ type: 'uncue', operator, layer });
      if (keep) void send({ type: 'cue', operator, ref: cue.ref });
    },
    next() {
      const target = nextTarget(view.program, selected);
      if (target) void send({ type: 'step', layer: target.layer, slot: target.slot.id, to: target.slot.step + 1 });
    },
    clearPreview() {
      for (const layer of LAYERS) if (view.preview[layer]) void send({ type: 'uncue', operator, layer });
    },
    clearLayer(layer) {
      const slot = view.program[layer];
      if (slot) void send({ type: 'clear', layer, slot: slot.id });
    },
    free(cue) {
      if (cue.onProgram && cue.layer) void send({ type: 'clear', layer: cue.layer, slot: cue.onProgram });
      else void send({ type: 'air', operator, ref: cue.ref });
    },
  };
}
