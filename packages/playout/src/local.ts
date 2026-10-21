/**
 * A show with no server: the reducer and projector the server runs, over a World that
 * never changes, one game's live state and a single operator. The stakeholder site runs
 * one in the browser, and a test can run the same.
 *
 * The rundown is the only thing that changes. `edit` rewrites one cue and refreshes the
 * slot on air that came from it, the path an operator's rundown edit takes.
 */

import { type CueId, type EpochMs, type GameId, type GameLive, indexWorld, Revision, type Show, type ShowId, type WorldSnapshot } from '@dtv/domain';
import { showContext } from './context';
import type { LayerId, Registry } from './graphic';
import { bindValues, type OutputFrame, project } from './project';
import type { WireValue } from './scene';
import { checkCue, EMPTY_SHOW, OperatorId, type Overrides, reduceShow, type ShowCommand, type ShowResult, type ShowState, type Slot, SlotId } from './show';

/** The one operator of a local show. */
export const LOCAL_OPERATOR = OperatorId.parse('local');

export interface LocalShow {
  /** The operator to name in `cue`, `air` and `toggle`. */
  readonly operator: OperatorId;
  /** The show with its rundown as edited so far. */
  show(): Show;
  /** What a renderer draws now. */
  frame(): OutputFrame;
  command(command: ShowCommand): ShowResult;
  /** Replaces a rundown cue's params, its overrides, or both, and refreshes the slot on air from it. */
  edit(
    cue: CueId,
    change: { readonly params?: Record<string, unknown>; readonly overrides?: Overrides },
  ): { readonly ok: true } | { readonly ok: false; readonly error: string };
  /** A cue's scene values without its overrides, so a form can show what an override replaces. Null if the bind fails. */
  unedited(cue: CueId): Readonly<Record<string, WireValue>> | null;
  /** Called after every change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

export function createLocalShow(input: {
  readonly registry: Registry;
  readonly snapshot: WorldSnapshot;
  readonly showId: ShowId;
  readonly live?: GameLive;
  readonly now: EpochMs;
}): LocalShow {
  const { registry } = input;
  const world = indexWorld(input.snapshot);
  const initial = world.get('show', input.showId);
  if (!initial) throw new Error(`The snapshot has no show ${input.showId}`);
  const base = showContext({ world, showId: input.showId, live: (game: GameId) => (game === input.live?.gameId ? input.live : undefined), now: input.now });

  let show = initial;
  let state: ShowState = { ...EMPTY_SHOW, showId: input.showId };
  let revision = 0;
  let slots = 0;
  const listeners = new Set<() => void>();

  const frame = () => project({ registry, bus: state.program, ref: { kind: 'program' }, revision: Revision.parse(revision), context: { ...base, show } });

  const run = (command: ShowCommand): ShowResult => {
    const result = reduceShow(state, command, { registry, context: { ...base, show }, newSlotId: () => SlotId.parse(`local-${++slots}`) });
    if (result.ok && result.changed) {
      state = result.state;
      changed();
    }
    return result;
  };
  const frameOn = (layer: LayerId) => frame().layers.find((each) => each.layer === layer);
  const changed = () => {
    revision++;
    for (const listener of listeners) listener();
  };

  return {
    operator: LOCAL_OPERATOR,
    show: () => show,
    frame,
    command: run,
    edit(id, change) {
      const cue = show.rundown.find((candidate) => candidate.id === id);
      if (!cue) return { ok: false, error: `The rundown has no cue ${id}` };
      const edited = { ...cue, ...change };
      const check = checkCue(registry, edited);
      if (!check.ok) return check;
      show = { ...show, rundown: show.rundown.map((each) => (each.id === id ? { ...edited, params: check.params } : each)) };
      let refreshed = false;
      for (const [layer, slot] of Object.entries(state.program) as [LayerId, Slot][]) {
        if (slot.origin.kind !== 'rundown' || slot.origin.cue !== id) continue;
        const before = frameOn(layer);
        const result = run({ type: 'refresh', layer, slot: slot.id });
        if (!result.ok) return result;
        refreshed = true;
        // The scene holds these still while on air, so a change shows only on a new take.
        const after = frameOn(layer);
        if (before && after && (registry[slot.graphic]?.frozenOnAir ?? []).some((name) => before.values[name] !== after.values[name])) {
          run({ type: 'clear', layer, slot: slot.id });
          run({ type: 'air', operator: LOCAL_OPERATOR, ref: slot.origin });
        }
      }
      if (!refreshed) changed();
      return { ok: true };
    },
    unedited(id) {
      const cue = show.rundown.find((candidate) => candidate.id === id);
      const entry = cue && registry[cue.graphic];
      if (!cue || !entry) return null;
      try {
        return bindValues(entry, { graphic: cue.graphic, params: cue.params, step: 0, overrides: {} }, { ...base, show });
      } catch {
        return null;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
