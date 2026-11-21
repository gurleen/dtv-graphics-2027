#!/usr/bin/env bun
/**
 * The Scorebug page: alex activates the seeded game, opens Scorebug from the top bar, airs the
 * Venue slider straight to program, then a basket for Hipps arrives over `game.apply` (as a feed
 * would) and the Latest scorer button names him. Pressing it picks his non-zero stats in order,
 * points first; Preview then Take puts his lower third on program over the slider. Season picks
 * Reed's season stats, and Clear lower takes the lower layer off. Each step is read on the page,
 * in the show view over @dtv/api, and in the program monitor's bound values.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/scorebug-page.ts --port=8998
 */

import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const SLIDER = 'basketball-v2/scorebug-slider';
const LOWER_THIRD = 'basketball-v2/player-lower-third';
const HIPPS = 'drexel-mbb@2026-27/hipps';
const s = await session('scorebug-page');

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();

  await alex.getByRole('link', { name: 'Scorebug' }).click();
  const sliders = alex.getByRole('region', { name: 'Scorebug sliders' });
  await sliders.waitFor();
  const venue = sliders.locator('.quick-row', { hasText: 'Venue' });
  const venueText = await venue.locator('.quick-value').innerText();
  s.check(venueText.startsWith('VENUE · '), `the Venue row shows what it airs (${venueText})`);
  const commentators = await sliders.locator('.quick-row', { hasText: 'Commentators' }).locator('.quick-value').innerText();
  s.check(commentators.includes('ROB BROOKS'), `the Commentators row names the crew (${commentators})`);
  await s.shoot(alex, 'scorebug-page');

  await venue.getByRole('button', { name: 'Air' }).click();
  await s.until('program holds the slider', async () => (await s.view('alex')).program.lower, (slot) => slot?.graphic === SLIDER);
  const slot = (await s.view('alex')).program.lower!;
  s.check(slot.origin.kind === 'direct' && (slot.origin as { params: { kind: string } }).params.kind === 'venue', `the slot is a direct venue cue (${JSON.stringify(slot.origin)})`);
  await s.until('the Venue row shows PGM', () => venue.getAttribute('data-pgm'), (value) => value !== null);
  const programValues = () =>
    alex.evaluate(() => {
      const layer = (window as unknown as { dtvMonitors: Record<string, { frame?: { layers: { layer: string; values: Record<string, unknown> }[] } }> }).dtvMonitors.program.frame?.layers.find((each) => each.layer === 'lower');
      return layer?.values ?? null;
    });
  await s.until('the program monitor binds the venue', programValues, (values) => values?.title === 'VENUE');
  await s.shoot(alex, 'venue-on-air');
  await venue.getByRole('button', { name: 'Off air' }).click();
  await s.until('Off air clears the slider', async () => (await s.view('alex')).program.lower, (slot) => slot === undefined);
  await venue.getByRole('button', { name: 'Air' }).click();
  await s.until('Air puts it back', async () => (await s.view('alex')).program.lower?.graphic, (graphic) => graphic === SLIDER);

  const lower = alex.getByRole('region', { name: 'Player lower third' });
  const scorer = lower.getByRole('button', { name: /^Latest scorer/ });
  s.check((await scorer.innerText()).includes('no basket yet'), `before a basket the button says so (${await scorer.innerText()})`);
  await s.api.game.apply({ sport: 'basketball', gameId: GAME as never, source: 'operator' as never, commands: [{ type: 'playerLine', player: HIPPS as never, line: { pts: 9, reb: 4, stl: 2, fgm: 3, fga: 7, tpm: 0, tpa: 2, ftm: 3, fta: 4 } }] });
  await s.until('the button names Hipps', () => scorer.innerText(), (text) => text.includes('#0 Hipps · 9 PTS'));
  await s.shoot(alex, 'latest-scorer', 'section.lower-third');
  await scorer.click();

  const chips = lower.locator('.stat-chips');
  await chips.waitFor();
  const picked = await chips.locator('.chip-toggle[data-selected]').allInnerTexts();
  s.check(JSON.stringify(picked.map((text) => text.replace(/\s+/g, ' ').trim())) === JSON.stringify(['9 PTS 1', '4 REB 2', '2 STL 3', '3-7 FG 4']), `auto-picked stats skip zeros, points first (${JSON.stringify(picked)})`);
  const zero = await chips.locator('.chip-toggle', { hasText: 'AST' }).innerText();
  s.check(zero.replace(/\s+/g, ' ').trim() === '0 AST', `an unpicked chip still shows its value (${zero})`);
  const row = lower.locator('.quick-row');
  const lineText = await row.locator('.quick-value').innerText();
  s.check(lineText.replace(/\s+/g, ' ') === '#0 HIPPS · TONIGHT · 9 PTS · 4 REB · 2 STL · 3-7 FG', `the row shows the line it airs (${lineText})`);
  await s.shoot(alex, 'hipps-picked', 'section.lower-third');

  await row.getByRole('button', { name: 'Preview' }).click();
  await s.until('my preview holds the lower third', async () => (await s.view('alex')).preview.lower?.graphic, (graphic) => graphic === LOWER_THIRD);
  await alex.getByRole('button', { name: 'Take' }).click();
  await s.until('program holds the lower third', async () => (await s.view('alex')).program.lower?.graphic, (graphic) => graphic === LOWER_THIRD);
  await s.until('the program monitor binds Hipps', programValues, (values) => values?.lastName === 'HIPPS');
  const bound = await programValues();
  s.check(String(bound?.statLine).includes('9 PTS'), `program binds ${bound?.statLabel} ${bound?.statLine}`);
  await s.shoot(alex, 'hipps-on-air');

  await lower.locator('.roster-player', { hasText: 'Reed' }).click();
  await lower.locator('.chip-toggle', { hasText: 'Season' }).click();
  const season = await chips.locator('.chip-toggle[data-selected]').allInnerTexts();
  s.check(JSON.stringify(season.map((text) => text.replace(/\s+/g, ' ').trim())) === JSON.stringify(['18.4 PPG 1', '7.2 RPG 2', '3.1 APG 3', '48.2% FG% 4']), `Season picks Reed's season stats (${JSON.stringify(season)})`);
  await s.shoot(alex, 'reed-season', 'section.lower-third');

  await alex.getByRole('button', { name: 'Clear lower' }).click();
  await s.until('program lower is empty', async () => (await s.view('alex')).program.lower, (slot) => slot === undefined);
  await s.shoot(alex, 'cleared');
});
