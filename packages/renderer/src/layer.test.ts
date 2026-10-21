import { describe, expect, test } from 'bun:test';
import { GraphicId, Url } from '@dtv/domain';
import { type LayerFrame, SlotId, type WireValue } from '@dtv/playout';
import { EMPTY, type Effect, type LayerEvent, type LayerRules, type LayerState, transition } from './layer';

const PLAIN: LayerRules = { frozenOnAir: new Set(), stepKeys: new Set(), transition: null };
const RULES: Readonly<Record<string, LayerRules>> = {
  'test/plain': PLAIN,
  'test/frozen': { ...PLAIN, frozenOnAir: new Set(['alignRight']) },
  'test/steps': { ...PLAIN, stepKeys: new Set(['step']), transition: 'Away To Home' },
};
const rulesOf = (frame: LayerFrame) => RULES[frame.graphic]!;

const frame = (
  slot: string,
  values: Record<string, WireValue> = { title: 'A' },
  extra: { readonly graphic?: string } & Partial<Pick<LayerFrame, 'step' | 'media' | 'error'>> = {},
): LayerFrame => ({
  layer: 'lower',
  slot: SlotId.parse(slot),
  graphic: GraphicId.parse(extra.graphic ?? 'test/plain'),
  step: extra.step ?? 0,
  values,
  media: extra.media ?? null,
  error: extra.error ?? null,
});

const slot = (id: string) => SlotId.parse(id);

/** Runs events in order from `start`, returning the final state and every effect. */
function run(start: LayerState, ...events: LayerEvent[]): { state: LayerState; effects: Effect[] } {
  let state = start;
  const effects: Effect[] = [];
  for (const event of events) {
    const next = transition(state, event, rulesOf);
    state = next.state;
    effects.push(...next.effects);
  }
  return { state, effects };
}

const show = (f: LayerFrame): LayerEvent => ({ type: 'frame', frame: f });
const clear: LayerEvent = { type: 'frame', frame: null };
const loaded = (id: string): LayerEvent => ({ type: 'loaded', slot: slot(id) });
const animated = (id: string): LayerEvent => ({ type: 'animated', slot: slot(id) });
const exited = (id: string): LayerEvent => ({ type: 'exited', slot: slot(id) });

/** A layer showing `f`, its intro done. */
const onAir = (f: LayerFrame) => run(EMPTY, show(f), loaded(f.slot), animated(f.slot)).state;
/** A layer playing `f`'s intro. */
const entering = (f: LayerFrame) => run(EMPTY, show(f), loaded(f.slot)).state;

describe('the section 5 table', () => {
  test('empty, a frame: loading, creating the instance with every value', () => {
    const a = frame('a');
    expect(run(EMPTY, show(a))).toEqual({ state: { phase: 'loading', frame: a, next: undefined }, effects: [{ type: 'load', frame: a }] });
  });

  test('loading, a frame for another slot: loading with that frame pending', () => {
    const b = frame('b');
    const { state, effects } = run(EMPTY, show(frame('a')), show(b));
    expect(state).toMatchObject({ phase: 'loading', frame: { slot: 'a' }, next: b });
    expect(effects).toEqual([{ type: 'load', frame: frame('a') }]);
  });

  test('loading, loaded: entering, setting isPlaying', () => {
    const { state, effects } = run(EMPTY, show(frame('a')), loaded('a'));
    expect(state).toMatchObject({ phase: 'entering', animation: 'Intro' });
    expect(effects.at(-1)).toEqual({ type: 'play' });
  });

  test('loading, loaded with another slot pending: straight to the pending frame, never showing the first', () => {
    const b = frame('b');
    const { state, effects } = run(EMPTY, show(frame('a')), show(b), loaded('a'));
    expect(state).toEqual({ phase: 'loading', frame: b, next: undefined });
    expect(effects.slice(1)).toEqual([{ type: 'dispose' }, { type: 'load', frame: b }]);
  });

  test('loading, loaded after a clear: disposed and empty, never shown', () => {
    const { state, effects } = run(EMPTY, show(frame('a')), clear, loaded('a'));
    expect(state).toEqual(EMPTY);
    expect(effects.slice(1)).toEqual([{ type: 'dispose' }]);
  });

  test('loading, load failed: empty', () => {
    const { state, effects } = run(EMPTY, show(frame('a')), { type: 'loadFailed', slot: slot('a'), error: 'no .riv' });
    expect(state).toEqual({ phase: 'empty', failed: slot('a') });
    expect(effects.slice(1)).toEqual([{ type: 'dispose' }]);
  });

  test('entering, a frame for the same slot: entering, writing the changed values', () => {
    const { state, effects } = run(entering(frame('a', { title: 'A', score: 1 })), show(frame('a', { title: 'A', score: 2 })));
    expect(state).toMatchObject({ phase: 'entering', frame: { values: { score: 2 } } });
    expect(effects).toEqual([{ type: 'write', values: { score: 2 } }]);
  });

  test('entering, another slot or none: the intro finishes first, with the change pending', () => {
    const b = frame('b');
    const another = run(entering(frame('a')), show(b));
    expect(another).toMatchObject({ state: { phase: 'entering', next: b }, effects: [] });
    const none = run(entering(frame('a')), clear);
    expect(none).toMatchObject({ state: { phase: 'entering', next: null }, effects: [] });
  });

  test('entering, intro done: on', () => {
    expect(run(entering(frame('a')), animated('a'))).toEqual({
      state: { phase: 'on', frame: frame('a'), written: { values: { title: 'A' }, step: 0, media: null } },
      effects: [],
    });
  });

  test('entering, intro done with a change pending: leaving', () => {
    const b = frame('b');
    expect(run(entering(frame('a')), show(b), animated('a'))).toEqual({
      state: { phase: 'leaving', frame: frame('a'), next: b },
      effects: [{ type: 'stop' }],
    });
  });

  test('on, a frame for the same slot: on, writing the changed values', () => {
    const { state, effects } = run(onAir(frame('a', { title: 'A', score: 1 })), show(frame('a', { title: 'A', score: 3 })));
    expect(state).toMatchObject({ phase: 'on', written: { values: { title: 'A', score: 3 } } });
    expect(effects).toEqual([{ type: 'write', values: { score: 3 } }]);
  });

  test('on, another slot or none: leaving, clearing isPlaying', () => {
    const b = frame('b');
    expect(run(onAir(frame('a')), show(b))).toEqual({ state: { phase: 'leaving', frame: frame('a'), next: b }, effects: [{ type: 'stop' }] });
    expect(run(onAir(frame('a')), clear)).toEqual({ state: { phase: 'leaving', frame: frame('a'), next: null }, effects: [{ type: 'stop' }] });
  });

  test('leaving, any frame: leaving, keeping only the newest pending frame', () => {
    const c = frame('c');
    const { state, effects } = run(onAir(frame('a')), show(frame('b')), clear, show(c));
    expect(state).toEqual({ phase: 'leaving', frame: frame('a'), next: c });
    expect(effects).toEqual([{ type: 'stop' }]);
  });

  test('leaving, exited: dispose, then load the pending frame', () => {
    const b = frame('b');
    expect(run(onAir(frame('a')), show(b), exited('a'))).toEqual({
      state: { phase: 'loading', frame: b, next: undefined },
      effects: [{ type: 'stop' }, { type: 'dispose' }, { type: 'load', frame: b }],
    });
  });

  test('leaving, exited with nothing pending: dispose, then empty', () => {
    expect(run(onAir(frame('a')), clear, exited('a'))).toEqual({ state: EMPTY, effects: [{ type: 'stop' }, { type: 'dispose' }] });
  });
});

describe('the rules', () => {
  test('a newer pending frame replaces an older one, while loading too', () => {
    const c = frame('c');
    expect(run(EMPTY, show(frame('a')), show(frame('b')), show(c)).state).toMatchObject({ phase: 'loading', next: c });
  });

  test('a same-slot frame that lands during the load is written before the intro, frozen values included', () => {
    const a1 = frame('a', { alignRight: false, title: 'A' }, { graphic: 'test/frozen' });
    const a2 = frame('a', { alignRight: true, title: 'B' }, { graphic: 'test/frozen' });
    const { state, effects } = run(EMPTY, show(a1), show(a2), loaded('a'));
    expect(effects.slice(1)).toEqual([{ type: 'write', values: { alignRight: true, title: 'B' } }, { type: 'play' }]);
    expect(state).toMatchObject({ phase: 'entering', frame: a2 });
  });

  test('a failed slot is not loaded again until a new slot arrives', () => {
    const failed = run(EMPTY, show(frame('a')), { type: 'loadFailed', slot: slot('a'), error: 'no .riv' }).state;
    expect(run(failed, show(frame('a', { title: 'again' })))).toEqual({ state: failed, effects: [] });
    expect(run(failed, clear, show(frame('a')))).toEqual({ state: failed, effects: [] });
    expect(run(failed, show(frame('b'))).effects).toEqual([{ type: 'load', frame: frame('b') }]);
  });

  test('a load that fails with another slot pending loads that slot', () => {
    const b = frame('b');
    expect(run(EMPTY, show(frame('a')), show(b), { type: 'loadFailed', slot: slot('a'), error: 'no .riv' }).effects.slice(1)).toEqual([
      { type: 'dispose' },
      { type: 'load', frame: b },
    ]);
  });

  test('frozenOnAir values are not written while on air, or during the intro', () => {
    const graphic = { graphic: 'test/frozen' } as const;
    const a = frame('a', { alignRight: false, score: 1 }, graphic);
    const moved = frame('a', { alignRight: true, score: 2 }, graphic);
    expect(run(onAir(a), show(moved)).effects).toEqual([{ type: 'write', values: { score: 2 } }]);
    expect(run(entering(a), show(moved)).effects).toEqual([{ type: 'write', values: { score: 2 } }]);
  });

  test('a step change on air writes the step values and plays the step timeline', () => {
    const graphic = { graphic: 'test/steps' } as const;
    const step0 = frame('a', { title: 'A', step: 0 }, graphic);
    const step1 = frame('a', { title: 'A', step: 1 }, { ...graphic, step: 1 });
    const { state, effects } = run(onAir(step0), show(step1));
    expect(effects).toEqual([
      { type: 'write', values: { step: 1 } },
      { type: 'animate', animation: 'Away To Home' },
    ]);
    expect(state).toMatchObject({ phase: 'entering', animation: 'Away To Home', written: { step: 1 } });
    expect(run(state, animated('a')).state).toMatchObject({ phase: 'on', written: { step: 1 } });
  });

  test('a step change during an animation waits for it to land, then plays', () => {
    const graphic = { graphic: 'test/steps' } as const;
    const step0 = frame('a', { title: 'A', step: 0 }, graphic);
    const step1 = frame('a', { title: 'B', step: 1 }, { ...graphic, step: 1 });
    const during = run(entering(step0), show(step1));
    expect(during.effects).toEqual([{ type: 'write', values: { title: 'B' } }]);
    expect(run(during.state, animated('a')).effects).toEqual([
      { type: 'write', values: { step: 1 } },
      { type: 'animate', animation: 'Away To Home' },
    ]);
  });

  test('a step chosen before the take is written with the values, not played', () => {
    const step1 = frame('a', { step: 1 }, { graphic: 'test/steps', step: 1 });
    const { state, effects } = run(EMPTY, show(step1), loaded('a'), animated('a'));
    expect(effects).toEqual([{ type: 'load', frame: step1 }, { type: 'play' }]);
    expect(state).toMatchObject({ phase: 'on' });
  });

  test('an error frame keeps what is shown', () => {
    const a = frame('a', { title: 'A' });
    const broken = frame('a', {}, { error: 'Player gone' });
    const brokenOther = frame('b', {}, { error: 'Player gone' });
    for (const start of [EMPTY, entering(a), onAir(a)]) {
      expect(run(start, show(broken))).toEqual({ state: start, effects: [] });
      expect(run(start, show(brokenOther))).toEqual({ state: start, effects: [] });
    }
  });

  test('media changes are written on their own', () => {
    const url = Url.parse('/assets/motion/reed.webm');
    expect(run(onAir(frame('a')), show(frame('a', { title: 'A' }, { media: url }))).effects).toEqual([{ type: 'media', url }]);
  });

  test('a completion for an instance the layer let go of changes nothing', () => {
    const b = frame('b');
    const loadingB = run(onAir(frame('a')), show(b), exited('a')).state;
    for (const late of [loaded('a'), animated('a'), exited('a')]) expect(run(loadingB, late)).toEqual({ state: loadingB, effects: [] });
  });

  test('a frame for the shown slot cancels a pending change during the intro', () => {
    const { state } = run(entering(frame('a')), clear, show(frame('a')), animated('a'));
    expect(state).toMatchObject({ phase: 'on' });
  });
});
