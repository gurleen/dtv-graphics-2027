import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CueId, GraphicId, Revision, ShowId, Sponsor, Sponsorship } from '@dtv/domain';
import { FALLBACK_IMAGES, flatten, project } from './project';
import { fixtureContext, fixtureWorld, REGISTRY } from './registry.fixture';
import type { SceneFacts } from './scene';
import { type Bus, OperatorId, type Slot, SlotId } from './show';

const slot = (layer: string, graphic: string, params: Record<string, unknown>, extra: Partial<Slot> = {}): Slot => ({
  id: SlotId.parse(`${layer}-slot`),
  origin: { kind: 'rundown', cue: CueId.parse('any') },
  graphic: GraphicId.parse(graphic),
  params,
  overrides: {},
  step: 0,
  by: OperatorId.parse('alex'),
  ...extra,
});

const frame = (bus: Bus, context = fixtureContext()) =>
  project({ registry: REGISTRY, bus, ref: { kind: 'program' }, revision: Revision.parse(7), context });

describe('project', () => {
  test('each layer carries its slot and every scene value, strings in capitals and colours untouched', () => {
    expect(frame({ lower: slot('lower', 'test/name', { talent: 'rob-brooks', live: true }) })).toEqual({
      bus: { kind: 'program' },
      revision: Revision.parse(7),
      layers: [
        {
          layer: 'lower',
          slot: SlotId.parse('lower-slot'),
          graphic: GraphicId.parse('test/name'),
          step: 0,
          values: { name: 'ROB BROOKS', role: 'PLAY-BY-PLAY', color: '#07294d', headshot: FALLBACK_IMAGES.blank, live: true },
          error: null,
        },
      ],
    });
  });

  test('layers come bottom to top whatever order the bus lists them', () => {
    const layers = frame({ card: slot('card', 'test/table', { rows: 1 }), bug: slot('bug', 'test/bug', {}) }).layers.map((layer) => layer.layer);
    expect(layers).toEqual(['bug', 'card']);
  });

  test('group rows become the scene’s numbered names, and rows the bind left out are blank', () => {
    const [table] = frame({ card: slot('card', 'test/table', { rows: 2 }) }).layers;
    expect(table?.values).toEqual({
      title: 'STANDINGS',
      row1Team: 'TEAM 1', row1Logo: FALLBACK_IMAGES.blank, row1Wins: 10,
      row2Team: 'TEAM 2', row2Logo: FALLBACK_IMAGES.blank, row2Wins: 9,
      row3Team: '', row3Logo: FALLBACK_IMAGES.blank, row3Wins: 0,
    });
  });

  test('overrides replace bound values and are set in capitals too', () => {
    const [name] = frame({ lower: slot('lower', 'test/name', { talent: 'rob-brooks' }, { overrides: { role: 'Tonight' } }) }).layers;
    expect(name?.values.role).toBe('TONIGHT');
  });

  test('a stepped graphic shows the values of its step', () => {
    const [steps] = frame({ lower: slot('lower', 'test/steps', {}, { step: 1 }) }).layers;
    expect(steps?.values).toEqual({ title: 'STARTING FIVE', side: 'HOME' });
  });

  test('binds read the live World, so a corrected name shows on the slot already on air', () => {
    const bus = { lower: slot('lower', 'test/name', { talent: 'rob-brooks' }) };
    const [talent] = fixtureWorld().all('talent');
    const corrected = fixtureWorld({ talent: [{ ...talent!, firstName: 'Robert' }] });
    expect(frame(bus, fixtureContext(corrected)).layers[0]?.values.name).toBe('ROBERT BROOKS');
  });

  test('the graphic’s sponsor reaches its bind', () => {
    const bus = { bug: slot('bug', 'test/bug', {}) };
    const sponsored = fixtureWorld({
      sponsor: [Sponsor.parse({ id: 'acme', name: 'Acme', logoOnDark: '/assets/acme.png' })],
      sponsorship: [Sponsorship.parse({ id: 'test/bug', sponsorId: 'acme' })],
    });
    expect(frame(bus, fixtureContext(sponsored)).layers[0]?.values.logo).toBe('/assets/acme.png');
    expect(frame(bus).layers[0]?.values.logo).toBe(FALLBACK_IMAGES.blank);
  });

  test('a bind that fails carries its error and no values; the other layers still project', () => {
    const result = frame({ bug: slot('bug', 'test/bug', {}), lower: slot('lower', 'test/name', { talent: 'nobody' }) });
    expect(result.layers.map((layer) => [layer.layer, layer.error])).toEqual([
      ['bug', null],
      ['lower', 'Talent nobody is gone'],
    ]);
    expect(result.layers[1]?.values).toEqual({});
  });

  test('a slot for a graphic the registry lacks carries an error', () => {
    expect(frame({ bug: slot('bug', 'test/gone', {}) }).layers[0]?.error).toBe('No graphic test/gone');
  });

  test('the bind reads the active show', () => {
    const other = fixtureContext(fixtureWorld(), ShowId.parse('other'));
    expect(frame({ bug: slot('bug', 'test/bug', {}) }, other).layers[0]?.values.title).toBe('OTHER SHOW');
  });
});

test('each fallback image is a file the server can serve from the repo', () => {
  for (const url of Object.values(FALLBACK_IMAGES)) expect(existsSync(join(import.meta.dir, '../../..', url))).toBe(true);
});

describe('flatten', () => {
  const scene = {
    file: 'x.rml', artboard: 'X', stateMachine: 'X', viewModel: 'X', layers: [], animations: {}, internal: {}, defaults: {},
    props: { isPlaying: 'boolean', title: 'string' },
    groups: { row: { count: 2, fields: { team: 'string' } } },
  } as const satisfies SceneFacts;

  test('refuses more rows than the scene has', () => {
    expect(() => flatten({ title: 'x', row: [{ team: 'a' }, { team: 'b' }, { team: 'c' }] }, scene)).toThrow('row has 3 rows; x.rml has 2');
  });

  test('refuses a property the scene does not bind, isPlaying included', () => {
    expect(() => flatten({ titel: 'x' }, scene)).toThrow('x.rml has no bindable property titel');
    expect(() => flatten({ isPlaying: true }, scene)).toThrow('x.rml has no bindable property isPlaying');
  });
});
