import { expect, test } from 'bun:test';
import { GraphicId } from '@dtv/domain';
import { type FormField, paramForm } from '@dtv/playout';
import { cueOf, GRAPHICS, parseCue } from './index';

test('the list holds every entry under its own id', () => {
  for (const [id, entry] of Object.entries(GRAPHICS)) expect<string>(entry.id).toBe(id);
});

test('parseCue fills a cue’s defaulted params', () => {
  const cue = cueOf('basketball-v2/player-lower-third', { player: 'drexel-mbb@2026-27/reed-josh' }, { id: 'reed' });
  expect(parseCue(cue)).toEqual({
    ok: true,
    cue: { ...cue, params: { player: 'drexel-mbb@2026-27/reed-josh', line: { kind: 'season', stats: ['ppg', 'rpg', 'apg'] } } },
  });
});

test('parseCue refuses an unknown graphic, bad params, and an override the scene lacks', () => {
  const cue = cueOf('basketball-v2/scorebug', {}, { id: 'bug' });
  expect(parseCue({ ...cue, graphic: GraphicId.parse('basketball-v2/scorebugs') })).toEqual({ ok: false, error: 'No graphic basketball-v2/scorebugs' });
  expect(parseCue({ ...cue, graphic: GraphicId.parse('basketball-v2/player-lower-third') })).toMatchObject({ ok: false, error: expect.stringContaining('Player Lower Third: ') });
  expect(parseCue({ ...cue, overrides: { homeAcronymn: 'DRX' } })).toEqual({ ok: false, error: 'Scorebug: basketball_scorebug.rml has no property homeAcronymn to override' });
});

test('every graphic’s params fit the generic form, with a picker for each id', () => {
  const refs = (fields: readonly FormField[]): string[] =>
    fields.flatMap((field) => {
      const node = field.node;
      if (node.kind === 'fixed') return [`${field.name}: fixed`];
      if (node.kind === 'ref') return [`${field.name}: ${node.ref}`];
      if (node.kind === 'list' && node.item.kind === 'ref') return [`${field.name}: ${node.item.ref} x${node.min}`];
      if (node.kind === 'group') return refs(node.fields);
      if (node.kind === 'variants') return node.variants.flatMap((variant) => refs(variant.fields));
      return [];
    });
  const found = Object.fromEntries(Object.values(GRAPHICS).map((entry) => [entry.id, refs(paramForm(entry.params))]));
  expect(found).toEqual({
    'basketball-v2/burning-question': ['team: team'],
    'basketball-v2/conference-standings': ['season: season'],
    'basketball-v2/halftime-adjustments': [],
    'basketball-v2/halftime-statistics': [],
    'basketball-v2/matchup-locator-lower-third': [],
    'basketball-v2/matchup-locator': [],
    'basketball-v2/player-lower-third': ['player: player'],
    'basketball-v2/player-of-the-game': ['player: player'],
    'basketball-v2/player-to-watch': ['player: player'],
    'basketball-v2/score-to-break': [],
    'basketball-v2/scorebug': [],
    'basketball-v2/staff-lower-third': ['staff: staff'],
    'basketball-v2/starting-five': [],
    'basketball-v2/talent-lower-third-double': ['talents: talent x2'],
    'basketball-v2/talent-lower-third-single': ['talents: talent x1'],
    'basketball-v2/talent-lower-third-triple': ['talents: talent x3'],
    'basketball-v2/team-lower-third': ['team: team'],
  });
});

test('the player lower third’s stat line is a union of stat picks and text', () => {
  const line = paramForm(GRAPHICS['basketball-v2/player-lower-third']!.params).find((field) => field.name === 'line')!;
  expect(line.optional).toBe(true);
  expect(line.fallback).toEqual({ kind: 'season', stats: ['ppg', 'rpg', 'apg'] });
  expect(line.node.kind === 'variants' && line.node.variants.map((variant) => [variant.value, variant.fields.map((field) => field.node.kind)])).toEqual([
    ['game', ['choices']],
    ['season', ['choices']],
    ['text', ['text', 'text']],
    ['none', []],
  ]);
  const picks = line.node.kind === 'variants' ? line.node.variants[0]!.fields[0]!.node : null;
  expect(picks?.kind === 'choices' && picks.options.map((option) => picks.labels[option])).toEqual(['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3PT', 'FT']);
});
