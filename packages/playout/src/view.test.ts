import { expect, test } from 'bun:test';
import { CueId, GraphicId, Revision, ShowId } from '@dtv/domain';
import { fixtureContext, fixtureWorld, REGISTRY } from './registry.fixture';
import { EMPTY_SHOW, OperatorId, reduceShow, type ShowCommand, type ShowState, SlotId } from './show';
import { viewShow } from './view';

const alex = OperatorId.parse('alex');
const sam = OperatorId.parse('sam');

const stateAfter = (commands: ShowCommand[], context = fixtureContext()) => {
  let slots = 0;
  return commands.reduce<ShowState>((state, command) => {
    const result = reduceShow(state, command, { registry: REGISTRY, context, newSlotId: () => SlotId.parse(`slot-${++slots}`) });
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }, { ...EMPTY_SHOW, showId: ShowId.parse('demo') });
};

const view = (state: ShowState, context = fixtureContext()) =>
  viewShow({ registry: REGISTRY, state, operator: alex, operators: [alex, sam], revision: Revision.parse(3), context });

test('the free panel lists the registry’s free graphics in order, without those the show cannot fill', () => {
  expect(view(stateAfter([])).free.map((cue) => [cue.graphic, cue.label])).toEqual([
    ['test/bug', 'Bug'],
    ['test/wide', 'Wide'],
  ]);
  const other = fixtureContext(fixtureWorld(), ShowId.parse('other'));
  expect(view(stateAfter([], other), other).free.map((cue) => cue.graphic)).toEqual([GraphicId.parse('test/bug')]);
});

test('each rundown cue shows its label, layer and steps, and where it is on air', () => {
  const state = stateAfter([
    { type: 'air', operator: sam, ref: { kind: 'rundown', cue: CueId.parse('starters') } },
    { type: 'cue', operator: alex, ref: { kind: 'rundown', cue: CueId.parse('brooks') } },
  ]);
  const rundown = view(state).rundown;
  expect(rundown.map(({ label, layer, steps, onProgram, inMyPreview, error }) => ({ label, layer, steps, onProgram, inMyPreview, error }))).toEqual([
    { label: 'Rob Brooks', layer: 'lower', steps: null, onProgram: null, inMyPreview: true, error: null },
    { label: 'Mike Tuberosa', layer: 'lower', steps: null, onProgram: null, inMyPreview: false, error: null },
    { label: 'Steps', layer: 'lower', steps: 2, onProgram: SlotId.parse('slot-1'), inMyPreview: false, error: null },
    { label: 'Table', layer: 'card', steps: null, onProgram: null, inMyPreview: false, error: null },
    { label: 'test/name', layer: 'lower', steps: null, onProgram: null, inMyPreview: false, error: 'Talent nobody is gone' },
  ]);
});

test('an operator sees their own preview apart from everyone else’s', () => {
  const state = stateAfter([
    { type: 'cue', operator: alex, ref: { kind: 'free', graphic: GraphicId.parse('test/bug') } },
    { type: 'cue', operator: sam, ref: { kind: 'rundown', cue: CueId.parse('standings') } },
  ]);
  const { preview, otherPreviews, program, operators, show, revision } = view(state);
  expect(Object.keys(preview)).toEqual(['bug']);
  expect(Object.keys(otherPreviews)).toEqual([sam]);
  expect(program).toEqual({});
  expect(operators).toEqual([alex, sam]);
  expect(show?.id).toBe(ShowId.parse('demo'));
  expect(revision).toBe(Revision.parse(3));
});

test('with no active show the panels hold only what needs no show', () => {
  const none = fixtureContext(fixtureWorld(), null);
  const result = view({ ...EMPTY_SHOW }, none);
  expect(result.show).toBeNull();
  expect(result.rundown).toEqual([]);
  expect(result.free.map((cue) => cue.graphic)).toEqual([GraphicId.parse('test/bug')]);
});
