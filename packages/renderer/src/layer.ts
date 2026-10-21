/**
 * One layer of a renderer as a state machine: docs/ARCHITECTURE.md section 5, "Each layer
 * is a state machine". Pure: it takes the newest frame for the layer or the completion of
 * an effect, and returns the next state and the effects to run. The renderer runs the
 * effects and feeds their completions back.
 *
 * What the OGraf subclasses did per graphic are rules here, read from the registry entry:
 * `frozenOnAir` values are not written once `isPlaying` is set, a step change on air plays
 * the entry's step timeline, and the exit signal is the instance's business.
 */

import type { Url } from '@dtv/domain';
import type { LayerFrame, SlotId, WireValue } from '@dtv/playout';

/** What the layer has written into the instance on screen. */
export interface Written {
  readonly values: Readonly<Record<string, WireValue>>;
  readonly step: number;
  readonly media: Url | null;
}

/** A change waiting for an animation to land: another slot, or null to go empty. */
type Pending = LayerFrame | null | undefined;

export type LayerState =
  /** `failed` is a slot whose load failed; it is not loaded again until another slot arrives. */
  | { readonly phase: 'empty'; readonly failed: SlotId | null }
  /** The instance is being created with `frame`'s values, then two frames pass. Nothing shows yet. */
  | { readonly phase: 'loading'; readonly frame: LayerFrame; readonly next: Pending }
  /** `isPlaying` is set and `animation` (the Intro, or the entry's step timeline) is playing. */
  | { readonly phase: 'entering'; readonly frame: LayerFrame; readonly written: Written; readonly animation: string; readonly next: Pending }
  | { readonly phase: 'on'; readonly frame: LayerFrame; readonly written: Written }
  /** `isPlaying` is cleared and the outro is playing. */
  | { readonly phase: 'leaving'; readonly frame: LayerFrame; readonly next: Pending };

export type LayerEvent =
  | { readonly type: 'frame'; readonly frame: LayerFrame | null }
  | { readonly type: 'loaded'; readonly slot: SlotId }
  | { readonly type: 'loadFailed'; readonly slot: SlotId; readonly error: string }
  | { readonly type: 'animated'; readonly slot: SlotId }
  | { readonly type: 'exited'; readonly slot: SlotId };

export type Effect =
  /** Create the instance, write every value and the media, decode images, wait two frames; then `loaded` or `loadFailed`. */
  | { readonly type: 'load'; readonly frame: LayerFrame }
  | { readonly type: 'write'; readonly values: Readonly<Record<string, WireValue>> }
  | { readonly type: 'media'; readonly url: Url | null }
  /** Set `isPlaying`; after the Intro's length, `animated`. */
  | { readonly type: 'play' }
  /** After the named timeline's length, `animated`. The scene plays it on its own when the step values change. */
  | { readonly type: 'animate'; readonly animation: string }
  /** Clear `isPlaying`; once the exit signal reads 0, or after the Outro's length, `exited`. */
  | { readonly type: 'stop' }
  | { readonly type: 'dispose' };

/** What a layer needs from the frame's registry entry. */
export interface LayerRules {
  readonly frozenOnAir: ReadonlySet<string>;
  /** Every value `steps.values` writes, by its scene name. */
  readonly stepKeys: ReadonlySet<string>;
  /** The scene's step timeline, or null for a graphic without steps. */
  readonly transition: string | null;
}

export const INTRO = 'Intro';

export const EMPTY: LayerState = { phase: 'empty', failed: null };

export interface Transition {
  readonly state: LayerState;
  readonly effects: readonly Effect[];
}

const stay = (state: LayerState): Transition => ({ state, effects: [] });

const writtenBy = (frame: LayerFrame): Written => ({ values: frame.values, step: frame.step, media: frame.media });

/**
 * The writes that bring the instance from `written` to `frame`. Before the intro every
 * value goes; once on air `frozenOnAir` ones never do, and step values wait unless
 * `playStep`, because a step change during an animation would play over it.
 */
function catchUp(written: Written, frame: LayerFrame, rules: LayerRules, options: { readonly onAir: boolean; readonly playStep: boolean }) {
  const playStep = options.playStep && frame.step !== written.step;
  const values: Record<string, WireValue> = {};
  for (const [name, value] of Object.entries(frame.values)) {
    if (written.values[name] === value) continue;
    if (options.onAir && rules.frozenOnAir.has(name)) continue;
    if (rules.stepKeys.has(name) && frame.step !== written.step && !playStep) continue;
    values[name] = value;
  }
  const effects: Effect[] = [];
  if (Object.keys(values).length) effects.push({ type: 'write', values });
  if (frame.media !== written.media) effects.push({ type: 'media', url: frame.media });
  const next: Written = {
    values: { ...written.values, ...values },
    step: playStep || !options.onAir ? frame.step : written.step,
    media: frame.media,
  };
  return { effects, written: next, playedStep: playStep };
}

/** On air with `frame`: play its step timeline if the step moved, else hold. */
function settle(frame: LayerFrame, written: Written, rules: LayerRules): Transition {
  const sync = catchUp(written, frame, rules, { onAir: true, playStep: true });
  if (sync.playedStep && rules.transition) {
    return {
      state: { phase: 'entering', frame, written: sync.written, animation: rules.transition, next: undefined },
      effects: [...sync.effects, { type: 'animate', animation: rules.transition }],
    };
  }
  return { state: { phase: 'on', frame, written: sync.written }, effects: sync.effects };
}

const load = (frame: LayerFrame, before: readonly Effect[] = []): Transition => ({
  state: { phase: 'loading', frame, next: undefined },
  effects: [...before, { type: 'load', frame }],
});

/** After a dispose: the pending frame, or nothing. */
const afterDispose = (next: Pending, failed: SlotId | null = null): Transition =>
  next ? load(next, [{ type: 'dispose' }]) : { state: { phase: 'empty', failed }, effects: [{ type: 'dispose' }] };

export function transition(state: LayerState, event: LayerEvent, rulesOf: (frame: LayerFrame) => LayerRules): Transition {
  if (event.type === 'frame') {
    // A failed bind keeps what is shown; the next good frame for the layer carries on.
    if (event.frame?.error) return stay(state);
    return onFrame(state, event.frame, rulesOf);
  }
  // A completion for an instance the layer has already let go of.
  if (state.phase === 'empty' || event.slot !== state.frame.slot) return stay(state);

  switch (state.phase) {
    case 'loading': {
      if (event.type === 'loadFailed') return afterDispose(state.next?.slot === state.frame.slot ? null : state.next, state.frame.slot);
      if (event.type !== 'loaded') return stay(state);
      const { next } = state;
      if (next === undefined || next?.slot === state.frame.slot) {
        const frame = next ?? state.frame;
        // Still off air, so every change is written, frozen and step values included.
        const sync = catchUp(writtenBy(state.frame), frame, rulesOf(frame), { onAir: false, playStep: true });
        return {
          state: { phase: 'entering', frame, written: sync.written, animation: INTRO, next: undefined },
          effects: [...sync.effects, { type: 'play' }],
        };
      }
      // Cleared or replaced before it ever showed.
      return afterDispose(next);
    }
    case 'entering': {
      if (event.type !== 'animated') return stay(state);
      if (state.next !== undefined) return { state: { phase: 'leaving', frame: state.frame, next: state.next }, effects: [{ type: 'stop' }] };
      return settle(state.frame, state.written, rulesOf(state.frame));
    }
    case 'on':
      return stay(state);
    case 'leaving':
      return event.type === 'exited' ? afterDispose(state.next) : stay(state);
  }
}

function onFrame(state: LayerState, frame: LayerFrame | null, rulesOf: (frame: LayerFrame) => LayerRules): Transition {
  switch (state.phase) {
    case 'empty':
      if (!frame || frame.slot === state.failed) return stay(state);
      return load(frame);
    case 'loading':
      return stay({ ...state, next: frame });
    case 'entering': {
      if (frame?.slot !== state.frame.slot) return stay({ ...state, next: frame });
      const sync = catchUp(state.written, frame, rulesOf(frame), { onAir: true, playStep: false });
      return { state: { ...state, frame, written: sync.written, next: undefined }, effects: sync.effects };
    }
    case 'on':
      if (frame?.slot !== state.frame.slot) return { state: { phase: 'leaving', frame: state.frame, next: frame }, effects: [{ type: 'stop' }] };
      return settle(frame, state.written, rulesOf(frame));
    case 'leaving':
      return stay({ ...state, next: frame });
  }
}
