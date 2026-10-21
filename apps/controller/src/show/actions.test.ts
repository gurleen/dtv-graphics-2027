import { describe, expect, test } from 'bun:test';
import { CueId, GraphicId } from '@dtv/domain';
import { type Bus, type CueView, OperatorId, type Slot, SlotId } from '@dtv/playout';
import { nextTarget } from './actions';

const slot = (id: string, graphic: string, origin: Slot['origin']): Slot => ({
  id: SlotId.parse(id), origin, graphic: GraphicId.parse(graphic), params: {}, overrides: {}, step: 0, by: OperatorId.parse('alex'),
});
const scorebug = slot('bug-1', 'basketball-v2/scorebug', { kind: 'free', graphic: GraphicId.parse('basketball-v2/scorebug') });
const reed = slot('lower-1', 'basketball-v2/player-lower-third', { kind: 'rundown', cue: CueId.parse('reed') });

describe('nextTarget', () => {
  test('without a selection it moves the topmost rundown graphic, one step or many', () => {
    expect(nextTarget({ bug: scorebug, lower: reed } as Bus, undefined)).toEqual({ layer: 'lower', slot: reed });
  });

  test('it never reaches a free-panel graphic unless that graphic is selected', () => {
    expect(nextTarget({ bug: scorebug } as Bus, undefined)).toBeNull();
    const selected = { onProgram: scorebug.id, layer: 'bug' } as CueView;
    expect(nextTarget({ bug: scorebug, lower: reed } as Bus, selected)).toEqual({ layer: 'bug', slot: scorebug });
  });
});
