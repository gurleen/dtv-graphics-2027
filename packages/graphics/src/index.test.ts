import { expect, test } from 'bun:test';
import { GraphicId } from '@dtv/domain';
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
