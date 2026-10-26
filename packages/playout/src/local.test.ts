import { describe, expect, test } from 'bun:test';
import { CueId, GameId } from '@dtv/domain';
import { z } from 'zod';
import { createLocalShow } from './local';
import { blankParams, paramFields, paramForm } from './fields';
import { fixtureWorld, REGISTRY } from './registry.fixture';
import type { CueRef } from './show';

const rundown = (cue: string): CueRef => ({ kind: 'rundown', cue: CueId.parse(cue) });

const local = () => createLocalShow({ registry: REGISTRY, snapshot: fixtureWorld().snapshot, gameId: GameId.parse('demo'), now: 1_000 });

const air = (show: ReturnType<typeof local>, cue: string) => show.command({ type: 'air', operator: show.operator, ref: rundown(cue) });

describe('a local show', () => {
  test('airing a cue puts its values in the frame, and clearing takes it off', () => {
    const show = local();
    expect(show.frame().layers).toEqual([]);
    air(show, 'brooks');
    expect(show.frame().layers.map((layer) => [layer.layer, layer.graphic, layer.values.name])).toEqual([['lower', 'test/name', 'ROB BROOKS']]);
    const slot = show.frame().layers[0]!.slot;
    show.command({ type: 'clear', layer: 'lower', slot });
    expect(show.frame().layers).toEqual([]);
  });

  test('a stepped cue moves with step and leaves the air past its last step', () => {
    const show = local();
    air(show, 'starters');
    const { slot } = show.frame().layers[0]!;
    show.command({ type: 'step', layer: 'lower', slot, to: 1 });
    expect(show.frame().layers[0]).toMatchObject({ step: 1, values: { side: 'HOME' } });
    show.command({ type: 'step', layer: 'lower', slot, to: 2 });
    expect(show.frame().layers).toEqual([]);
  });

  test('editing params on a cue that is on air changes its frame and keeps its slot', () => {
    const show = local();
    air(show, 'starters');
    const before = show.frame().layers[0]!;
    expect(show.edit(CueId.parse('starters'), { params: { title: 'Tonight' } })).toEqual({ ok: true });
    expect(show.frame().layers[0]).toMatchObject({ slot: before.slot, values: { title: 'TONIGHT' } });
  });

  test('an override replaces a value, and clearing it brings the bound value back', () => {
    const show = local();
    air(show, 'brooks');
    show.edit(CueId.parse('brooks'), { overrides: { name: 'Robert Brooks' } });
    expect(show.frame().layers[0]!.values.name).toBe('ROBERT BROOKS');
    expect(show.unedited(CueId.parse('brooks'))).toMatchObject({ name: 'ROB BROOKS' });
    show.edit(CueId.parse('brooks'), { overrides: {} });
    expect(show.frame().layers[0]!.values.name).toBe('ROB BROOKS');
  });

  test('an edit that does not fit the graphic is refused and changes nothing', () => {
    const show = local();
    air(show, 'brooks');
    const result = show.edit(CueId.parse('brooks'), { params: { talent: 'rob-brooks', live: 'yes' } });
    expect(result.ok).toBe(false);
    expect(show.show().rundown.find((cue) => cue.id === 'brooks')?.params).toEqual({ talent: 'rob-brooks' });
  });

  test('an edit to a cue that is off air is kept for its next take, and subscribers hear of each change', () => {
    const show = local();
    let heard = 0;
    show.subscribe(() => heard++);
    show.edit(CueId.parse('starters'), { params: { title: 'Later' } });
    expect(heard).toBe(1);
    air(show, 'starters');
    expect(show.frame().layers[0]!.values.title).toBe('LATER');
    expect(heard).toBe(2);
  });
});

describe('a property the scene holds still while on air', () => {
  const held = { ...REGISTRY, 'test/name': { ...REGISTRY['test/name']!, frozenOnAir: ['role'] } as const } as typeof REGISTRY;
  const withHeldRole = () => createLocalShow({ registry: held, snapshot: fixtureWorld().snapshot, gameId: GameId.parse('demo'), now: 1_000 });

  test('an edit to it takes the graphic again, so the scene plays it out and in', () => {
    const show = withHeldRole();
    air(show, 'brooks');
    const before = show.frame().layers[0]!;
    show.edit(CueId.parse('brooks'), { overrides: { role: 'Host' } });
    expect(show.frame().layers[0]).toMatchObject({ values: { role: 'HOST' } });
    expect(show.frame().layers[0]!.slot).not.toBe(before.slot);
  });

  test('an edit to any other value keeps the slot', () => {
    const show = withHeldRole();
    air(show, 'brooks');
    const before = show.frame().layers[0]!;
    show.edit(CueId.parse('brooks'), { overrides: { name: 'Bob' } });
    expect(show.frame().layers[0]!.slot).toBe(before.slot);
  });
});

describe('paramFields', () => {
  test('finds free text, and leaves ids and numbers to the cue', () => {
    expect(paramFields(REGISTRY['test/steps']!.params)).toEqual([{ name: 'title', kind: 'text' }]);
    expect(paramFields(REGISTRY['test/name']!.params)).toEqual([]);
    expect(paramFields(REGISTRY['test/table']!.params)).toEqual([]);
  });
});

describe('paramForm', () => {
  test('an object of params is a group of fields, blank in its required ones', () => {
    const form = paramForm(z.object({ title: z.string(), side: z.enum(['left', 'right']).default('left') }));
    expect(form.kind === 'group' && form.fields.map((field) => [field.name, field.node.kind, field.optional])).toEqual([
      ['title', 'text', false],
      ['side', 'choice', true],
    ]);
    expect(blankParams(form)).toEqual({ title: '' });
  });

  test('a union of params is a variant picker, blank as its first variant', () => {
    const form = paramForm(
      z.discriminatedUnion('kind', [z.object({ kind: z.literal('venue') }), z.object({ kind: z.literal('custom'), title: z.string(), subtitle: z.string() })]),
    );
    expect(form.kind === 'variants' && [form.key, form.variants.map((variant) => [variant.value, variant.fields.map((field) => field.name)])]).toEqual([
      'kind',
      [
        ['venue', []],
        ['custom', ['title', 'subtitle']],
      ],
    ]);
    expect(blankParams(form)).toEqual({ kind: 'venue' });
  });
});
