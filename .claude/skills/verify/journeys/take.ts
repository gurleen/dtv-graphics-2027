#!/usr/bin/env bun
/**
 * Preview, take and program, the way an operator runs them, with OBS's page watching: alex
 * activates the seeded game, cues Zach Spiker's staff lower third into his preview, takes it,
 * and clears it. Each step is read three ways: alex's monitors, a /renderer page (program and
 * alex's preview bus), and the server's show view over @dtv/api.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/take.ts --port=8998
 */

import { session } from '../scripts/lib';

const STAFF = 'basketball-v2/staff-lower-third';
const s = await session('take');

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) {
    await s.shoot(alex, 'show-picker');
    await activate.click();
  }
  await rows.first().waitFor();
  s.check((await alex.locator('.topbar .show-name').innerText()) === "Saint Joseph's at Drexel", "the top bar names the active game, Saint Joseph's at Drexel");

  const program = await s.renderer('/renderer');
  const alexPreview = await s.renderer('/renderer?bus=preview&operator=alex');

  await rows.filter({ hasText: 'Zach Spiker' }).click();
  await alex.getByRole('button', { name: /^Cue to my preview/ }).click();
  await s.waitMonitor(alex, 'preview', { lower: STAFF }, "alex's preview monitor draws the staff lower third");
  await s.waitRendered(alexPreview, { lower: STAFF }, '/renderer?bus=preview&operator=alex draws it too');
  await s.waitRendered(program, { bug: 'empty', lower: 'empty', card: 'empty' }, 'program /renderer stays empty while it is only cued');
  s.check((await s.view('alex')).preview.lower?.graphic === STAFF, "the server holds it in alex's preview");
  s.check((await rows.filter({ hasText: 'Zach Spiker' }).getAttribute('data-pvw')) !== null, 'the rundown row carries the PVW tag');
  await s.shoot(alex, 'cued');

  await alex.getByRole('button', { name: /^Take/ }).click();
  await s.waitMonitor(alex, 'program', { lower: STAFF }, "alex's program monitor draws it after Take");
  await s.waitRendered(program, { lower: STAFF }, 'program /renderer draws it: OBS would show it');
  await s.waitMonitor(alex, 'preview', { lower: 'empty' }, "alex's preview empties after Take");
  const view = await s.view('alex');
  s.check(view.program.lower?.graphic === STAFF && !view.preview.lower, 'the server has it on program and out of preview');
  s.check((await alex.locator('.layer-row[data-layer="lower"]').getAttribute('data-pgm')) !== null, 'On air by layer lists it under Lower');
  await s.shoot(alex, 'taken');
  await s.shoot(program, 'renderer-program-taken');

  await alex.locator('.layer-row[data-layer="lower"]').getByRole('button', { name: /^Clear/ }).click();
  await s.waitRendered(program, { lower: 'empty' }, 'Clear on the Lower row takes it off program /renderer');
  await s.waitMonitor(alex, 'program', { lower: 'empty' }, "and off alex's program monitor");
  s.check(!(await s.view('alex')).program.lower, 'the server has nothing on the lower layer');
  await s.shoot(alex, 'cleared');
});
