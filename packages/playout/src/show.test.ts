import { describe, expect, test } from 'bun:test';
import { CueId, GraphicId, ShowId } from '@dtv/domain';
import { fixtureContext, fixtureWorld, REGISTRY } from './registry.fixture';
import { type CueRef, EMPTY_SHOW, OperatorId, reduceShow, type ShowCommand, type ShowEnv, ShowState, SlotId } from './show';

const alex = OperatorId.parse('alex');
const sam = OperatorId.parse('sam');
const free = (graphic: string): CueRef => ({ kind: 'free', graphic: GraphicId.parse(graphic) });
const rundown = (cue: string): CueRef => ({ kind: 'rundown', cue: CueId.parse(cue) });

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

/** Runs commands in order the way the store does, and keeps the state of the last one that applied. */
const harness = (env: Partial<ShowEnv> = {}) => {
  let slots = 0;
  let state = ShowState.parse({ ...EMPTY_SHOW, showId: 'demo' });
  const full: ShowEnv = { registry: REGISTRY, context: fixtureContext(), newSlotId: () => SlotId.parse(`slot-${++slots}`), ...env };
  const send = (command: ShowCommand, patch: Partial<ShowEnv> = {}) => {
    const result = reduceShow(deepFreeze(state), command, { ...full, ...patch });
    if (result.ok) state = result.state;
    return result;
  };
  return { send, state: () => state };
};

const changed = (result: ReturnType<ReturnType<typeof harness>['send']>) => (result.ok ? result.changed : `rejected: ${result.error}`);

describe('cue and uncue', () => {
  test('a cue lands in its operator’s preview on the graphic’s layer, and nobody else’s', () => {
    const { send, state } = harness();
    expect(changed(send({ type: 'cue', operator: alex, ref: rundown('brooks') }))).toBe(true);
    expect(changed(send({ type: 'cue', operator: sam, ref: rundown('standings') }))).toBe(true);
    expect(state().previews).toEqual({
      [alex]: { lower: { id: SlotId.parse('slot-1'), origin: rundown('brooks'), graphic: GraphicId.parse('test/name'), params: { talent: 'rob-brooks', live: false }, overrides: {}, step: 0, by: alex } },
      [sam]: { card: { id: SlotId.parse('slot-2'), origin: rundown('standings'), graphic: GraphicId.parse('test/table'), params: { rows: 3 }, overrides: {}, step: 0, by: sam } },
    });
    expect(state().program).toEqual({});
  });

  test('cueing the same cue again changes nothing and keeps its slot', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: rundown('brooks') });
    expect(changed(send({ type: 'cue', operator: alex, ref: rundown('brooks') }))).toBe(false);
    expect(state().previews[alex]?.lower?.id).toBe(SlotId.parse('slot-1'));
  });

  test('a cue on an occupied preview layer replaces it', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: rundown('brooks') });
    send({ type: 'cue', operator: alex, ref: rundown('starters') });
    expect(state().previews[alex]?.lower?.origin).toEqual(rundown('starters'));
  });

  test('a rundown cue keeps its overrides', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: rundown('tuberosa') });
    expect(state().previews[alex]?.lower?.overrides).toEqual({ role: 'Tonight' });
  });

  test('uncue empties that layer of my preview; an empty layer changes nothing', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: rundown('brooks') });
    expect(changed(send({ type: 'uncue', operator: alex, layer: 'lower' }))).toBe(true);
    expect(state().previews).toEqual({});
    expect(changed(send({ type: 'uncue', operator: alex, layer: 'lower' }))).toBe(false);
  });

  test('a ref that cannot resolve is rejected and changes nothing', () => {
    const { send, state } = harness();
    expect(send({ type: 'cue', operator: alex, ref: rundown('nope') })).toEqual({ ok: false, error: 'The rundown has no cue nope' });
    expect(send({ type: 'cue', operator: alex, ref: free('test/name') })).toEqual({ ok: false, error: 'Name is not on the free panel' });
    expect(send({ type: 'cue', operator: alex, ref: free('test/unknown') })).toEqual({ ok: false, error: 'No graphic test/unknown' });
    expect(send({ type: 'cue', operator: alex, ref: free('constructor') })).toEqual({ ok: false, error: 'No graphic constructor' });
    expect(state()).toEqual(ShowState.parse({ ...EMPTY_SHOW, showId: 'demo' }));
  });

  test('a free graphic whose params need what the show lacks is rejected', () => {
    const { send } = harness({ context: fixtureContext(fixtureWorld(), ShowId.parse('other')) });
    expect(send({ type: 'cue', operator: alex, ref: free('test/wide') })).toEqual({ ok: false, error: 'Wide is not available for this show' });
  });
});

describe('take', () => {
  test('my preview goes to program and empties; another operator’s preview stays', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: rundown('brooks') });
    send({ type: 'cue', operator: alex, ref: free('test/bug') });
    send({ type: 'cue', operator: sam, ref: rundown('standings') });
    expect(changed(send({ type: 'take', operator: alex }))).toBe(true);
    expect(state().program.lower?.id).toBe(SlotId.parse('slot-1'));
    expect(state().program.bug?.id).toBe(SlotId.parse('slot-2'));
    expect(state().previews).toEqual({ [sam]: { card: expect.objectContaining({ id: 'slot-3' }) } });
  });

  test('an empty preview changes nothing', () => {
    const { send } = harness();
    expect(changed(send({ type: 'take', operator: alex }))).toBe(false);
  });

  test('when two operators take the same layer, the later take wins with its own slot', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: rundown('brooks') });
    send({ type: 'cue', operator: sam, ref: rundown('tuberosa') });
    send({ type: 'take', operator: alex });
    send({ type: 'take', operator: sam });
    expect(state().program.lower).toMatchObject({ id: 'slot-2', origin: rundown('tuberosa'), by: sam });
  });

  test('a take clears the layers its graphic covers', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: free('test/bug') });
    send({ type: 'cue', operator: alex, ref: free('test/wide') });
    send({ type: 'take', operator: alex });
    expect(Object.keys(state().program)).toEqual(['lower']);
  });

  test('air and toggle clear the layers their graphic covers', () => {
    for (const type of ['air', 'toggle'] as const) {
      const { send, state } = harness();
      send({ type: 'air', operator: alex, ref: free('test/bug') });
      expect(changed(send({ type, operator: alex, ref: free('test/wide') }))).toBe(true);
      expect(Object.keys(state().program)).toEqual(['lower']);
    }
  });

  test('a graphic going to a layer that the on-air graphic covers takes that graphic off, by take, air or toggle', () => {
    const cases: [string, (send: ReturnType<typeof harness>['send']) => void][] = [
      ['take', (send) => (send({ type: 'cue', operator: alex, ref: free('test/bug') }), send({ type: 'take', operator: alex }))],
      ['air', (send) => send({ type: 'air', operator: alex, ref: free('test/bug') })],
      ['toggle', (send) => send({ type: 'toggle', operator: alex, ref: free('test/bug') })],
    ];
    for (const [name, bring] of cases) {
      const { send, state } = harness();
      send({ type: 'air', operator: alex, ref: free('test/wide') });
      bring(send);
      expect([name, Object.keys(state().program)]).toEqual([name, ['bug']]);
    }
  });

  test('a take never puts a covering graphic on air with what it covers, even from one preview', () => {
    const { send, state } = harness();
    send({ type: 'cue', operator: alex, ref: free('test/wide') });
    send({ type: 'cue', operator: alex, ref: free('test/bug') });
    send({ type: 'take', operator: alex });
    expect(Object.keys(state().program)).toEqual(['lower']);
  });

  test('an operator named constructor has an empty preview, not Object.prototype', () => {
    const { send, state } = harness();
    const constructor = OperatorId.parse('constructor');
    expect(changed(send({ type: 'take', operator: constructor }))).toBe(false);
    send({ type: 'cue', operator: constructor, ref: free('test/bug') });
    send({ type: 'take', operator: constructor });
    expect(Object.keys(state().program)).toEqual(['bug']);
  });
});

describe('air, toggle and clear', () => {
  test('air goes straight to program; airing the same cue again changes nothing', () => {
    const { send, state } = harness();
    expect(changed(send({ type: 'air', operator: alex, ref: free('test/bug') }))).toBe(true);
    expect(changed(send({ type: 'air', operator: sam, ref: free('test/bug') }))).toBe(false);
    expect(state().program.bug).toMatchObject({ id: 'slot-1', by: alex });
  });

  test('toggle puts a graphic on, then takes it off', () => {
    const { send, state } = harness();
    send({ type: 'toggle', operator: alex, ref: free('test/bug') });
    expect(state().program.bug).toBeDefined();
    send({ type: 'toggle', operator: alex, ref: free('test/bug') });
    expect(state().program.bug).toBeUndefined();
  });

  test('toggle clears an on-air cue even after it left the rundown', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('brooks') });
    const withoutShow = { context: fixtureContext(fixtureWorld({ show: [] }), null) };
    expect(changed(send({ type: 'toggle', operator: alex, ref: rundown('brooks') }, withoutShow))).toBe(true);
    expect(state().program).toEqual({});
    expect(send({ type: 'toggle', operator: alex, ref: rundown('brooks') }, withoutShow)).toEqual({ ok: false, error: 'The rundown has no cue brooks' });
  });

  test('a clear naming a slot that was replaced changes nothing', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('brooks') });
    send({ type: 'air', operator: sam, ref: rundown('tuberosa') });
    expect(changed(send({ type: 'clear', layer: 'lower', slot: SlotId.parse('slot-1') }))).toBe(false);
    expect(state().program.lower?.id).toBe(SlotId.parse('slot-2'));
    expect(changed(send({ type: 'clear', layer: 'lower', slot: SlotId.parse('slot-2') }))).toBe(true);
    expect(state().program).toEqual({});
  });

  test('a clear without a slot takes the layer off air; an empty layer changes nothing', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: free('test/bug') });
    expect(changed(send({ type: 'clear', layer: 'bug' }))).toBe(true);
    expect(state().program).toEqual({});
    expect(changed(send({ type: 'clear', layer: 'bug' }))).toBe(false);
  });

  test('clearAll empties program and leaves previews', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: free('test/bug') });
    send({ type: 'air', operator: alex, ref: rundown('standings') });
    send({ type: 'cue', operator: sam, ref: rundown('brooks') });
    expect(changed(send({ type: 'clearAll' }))).toBe(true);
    expect(state().program).toEqual({});
    expect(Object.keys(state().previews)).toEqual(['sam']);
    expect(changed(send({ type: 'clearAll' }))).toBe(false);
  });
});

describe('step', () => {
  test('two operators who both press Next from step 0 move it once', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('starters') });
    const slot = SlotId.parse('slot-1');
    expect(changed(send({ type: 'step', layer: 'lower', slot, to: 1 }))).toBe(true);
    expect(changed(send({ type: 'step', layer: 'lower', slot, to: 1 }))).toBe(false);
    expect(state().program.lower).toMatchObject({ id: 'slot-1', step: 1 });
    expect(changed(send({ type: 'step', layer: 'lower', slot, to: 0 }))).toBe(true);
    expect(state().program.lower?.step).toBe(0);
  });

  test('a step past the last takes the graphic off air', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('starters') });
    send({ type: 'step', layer: 'lower', slot: SlotId.parse('slot-1'), to: 2 });
    expect(state().program).toEqual({});
  });

  test('a step for a replaced slot changes nothing; Next on a graphic without steps takes it off air', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('starters') });
    expect(changed(send({ type: 'step', layer: 'lower', slot: SlotId.parse('slot-9'), to: 1 }))).toBe(false);
    send({ type: 'air', operator: alex, ref: rundown('brooks') });
    expect(changed(send({ type: 'step', layer: 'lower', slot: SlotId.parse('slot-2'), to: 1 }))).toBe(true);
    expect(state().program.lower).toBeUndefined();
  });
});

describe('refresh and patch', () => {
  test('refresh re-reads the on-air cue from the rundown and keeps its slot and step', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('starters') });
    const slot = SlotId.parse('slot-1');
    send({ type: 'step', layer: 'lower', slot, to: 1 });
    expect(changed(send({ type: 'refresh', layer: 'lower', slot }))).toBe(false);
    const demo = fixtureWorld().get('show', ShowId.parse('demo'))!;
    const edited = fixtureWorld({
      show: [{ ...demo, rundown: demo.rundown.map((cue) => (cue.id === 'starters' ? { ...cue, params: { title: 'Tonight' } } : cue)) }],
    });
    expect(changed(send({ type: 'refresh', layer: 'lower', slot }, { context: fixtureContext(edited) }))).toBe(true);
    expect(state().program.lower).toMatchObject({ id: 'slot-1', step: 1, params: { title: 'Tonight' } });
  });

  test('patch replaces the on-air overrides; a resend changes nothing', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: rundown('tuberosa') });
    const slot = SlotId.parse('slot-1');
    expect(changed(send({ type: 'patch', layer: 'lower', slot, overrides: { name: 'Michael Tuberosa' } }))).toBe(true);
    expect(changed(send({ type: 'patch', layer: 'lower', slot, overrides: { name: 'Michael Tuberosa' } }))).toBe(false);
    expect(state().program.lower?.overrides).toEqual({ name: 'Michael Tuberosa' });
  });

  test('patch refuses a property the scene lacks or a value of the wrong kind', () => {
    const { send } = harness();
    send({ type: 'air', operator: alex, ref: rundown('brooks') });
    const slot = SlotId.parse('slot-1');
    expect(send({ type: 'patch', layer: 'lower', slot, overrides: { nmae: 'Rob' } })).toEqual({ ok: false, error: 'Name: name.rml has no property nmae to override' });
    expect(send({ type: 'patch', layer: 'lower', slot, overrides: { live: 'yes' } })).toEqual({ ok: false, error: 'Name: live is a boolean property' });
    expect(send({ type: 'patch', layer: 'lower', slot, overrides: { isPlaying: true } })).toMatchObject({ ok: false });
  });
});

describe('activate', () => {
  test('a new show empties previews and keeps program on air', () => {
    const { send, state } = harness();
    send({ type: 'air', operator: alex, ref: free('test/bug') });
    send({ type: 'cue', operator: sam, ref: rundown('brooks') });
    expect(changed(send({ type: 'activate', show: ShowId.parse('other') }))).toBe(true);
    expect(state()).toEqual({ showId: ShowId.parse('other'), program: { bug: expect.objectContaining({ id: 'slot-1' }) }, previews: {} });
  });

  test('activating the active show with empty previews changes nothing; an unknown show is rejected', () => {
    const { send } = harness();
    expect(changed(send({ type: 'activate', show: ShowId.parse('demo') }))).toBe(false);
    expect(send({ type: 'activate', show: ShowId.parse('nope') })).toEqual({ ok: false, error: 'No show nope' });
  });
});

test('the state the reducer produces is what ShowState parses back from JSON', () => {
  const { send, state } = harness();
  send({ type: 'air', operator: alex, ref: rundown('tuberosa') });
  send({ type: 'cue', operator: sam, ref: free('test/bug') });
  expect(ShowState.parse(JSON.parse(JSON.stringify(state())))).toEqual(state());
});
