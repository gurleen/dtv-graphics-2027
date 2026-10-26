#!/usr/bin/env bun
/**
 * The Scorebug Slider's params are a union at the root (venue, commentators or custom text):
 * alex selects the seeded commentators cue and its form holds a Kind picker and two talent
 * pickers, switches Kind to Custom, fills a title and subtitle, saves and cues it, then adds
 * a new slider cue, which starts as Venue. Each step is read in the inspector, in the World
 * or show view over @dtv/api, and in the preview monitor's bound values.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/scorebug-slider.ts --port=8998
 */

import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const SLIDER = 'basketball-v2/scorebug-slider';
const s = await session('scorebug-slider');

const storedCue = async (id: string) =>
  (await s.world()).entities.show.find((show: { id: string }) => show.id === GAME).rundown.find((cue: { id: string }) => cue.id === id);

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();

  const commentatorsRow = alex.locator('.cue-row', { hasText: 'Slider · Rob Brooks and Mike Tuberosa' });
  s.check((await alex.locator('.cue-row', { hasText: 'Slider · Venue' }).count()) === 1, 'the rundown lists the seeded Slider · Venue cue');
  s.check((await commentatorsRow.count()) === 1, 'and the seeded Slider · Rob Brooks and Mike Tuberosa cue');
  await commentatorsRow.click();
  const inspector = alex.getByRole('region', { name: 'Selected cue' });
  const kind = inspector.locator('.field.select', { hasText: 'Kind' });
  await kind.waitFor();
  s.check((await kind.locator('.select-button').innerText()).includes('Commentators'), `the Kind picker shows Commentators (${await kind.locator('.select-button').innerText()})`);
  const talents = inspector.locator('[data-ref="talent"] input');
  const picked = await Promise.all((await talents.all()).map((input) => input.inputValue()));
  s.check(picked.length === 2 && picked[0]!.startsWith('Rob Brooks') && picked[1]!.startsWith('Mike Tuberosa'), `two talent pickers hold the cue's talent (${JSON.stringify(picked)})`);
  await s.shoot(alex, 'commentators-form', 'section.inspector');

  await kind.locator('.select-button').click();
  await alex.getByRole('option', { name: 'Custom' }).click();
  const title = inspector.getByRole('textbox', { name: 'Title', exact: true });
  const subtitle = inspector.getByRole('textbox', { name: 'Subtitle' });
  await title.waitFor();
  s.check((await talents.count()) === 0 && (await subtitle.count()) === 1, 'Custom swaps the talent pickers for Title and Subtitle');
  await title.fill('Attendance');
  await subtitle.fill('4,212');
  await s.shoot(alex, 'custom-form', 'section.inspector');
  await inspector.getByRole('button', { name: 'Save' }).click();
  await s.until('the stored cue is the custom text', () => storedCue('slider-commentators'), (cue) => cue?.params?.kind === 'custom');
  const stored = await storedCue('slider-commentators');
  s.check(JSON.stringify(stored.params) === JSON.stringify({ kind: 'custom', title: 'Attendance', subtitle: '4,212' }), `the World holds params ${JSON.stringify(stored.params)}`);
  await s.until('the row relabels', () => commentatorsRow.count(), (count) => count === 0);
  s.check((await alex.locator('.cue-row', { hasText: 'Slider · Attendance' }).count()) === 1, 'the row now reads Slider · Attendance');

  await inspector.getByRole('button', { name: /^Cue to my preview/ }).click();
  await s.until('the server holds the slider in alex’s preview', async () => (await s.view('alex')).preview.lower?.graphic, (graphic) => graphic === SLIDER);
  const bound = () =>
    alex.evaluate(() => {
      const layer = (window as unknown as { dtvMonitors: Record<string, { frame?: { layers: { layer: string; values: Record<string, unknown> }[] } }> }).dtvMonitors.preview.frame?.layers.find((each) => each.layer === 'lower');
      return layer ? [layer.values.title, layer.values.subtitle] : null;
    });
  await s.until('the preview monitor binds the custom text', bound, (values) => values?.[0] === 'ATTENDANCE');
  s.check(JSON.stringify(await bound()) === JSON.stringify(['ATTENDANCE', '4,212']), `the preview frame binds ${JSON.stringify(await bound())}`);

  const before = (await s.view('alex')).rundown.length;
  await rows.last().click();
  await alex.getByRole('button', { name: 'Add cue' }).click();
  const dialog = alex.getByRole('dialog', { name: 'Add a cue' });
  await dialog.locator('.select-button').first().click();
  await alex.getByRole('option', { name: 'Scorebug Slider' }).click();
  const newKind = dialog.locator('.field.select', { hasText: 'Kind' });
  await newKind.waitFor();
  s.check((await newKind.locator('.select-button').innerText()).includes('Venue'), `a new slider cue starts as Venue (${await newKind.locator('.select-button').innerText()})`);
  s.check(await dialog.getByRole('button', { name: 'Add to rundown' }).isEnabled(), 'and Add to rundown is enabled: the blank params parse');
  await s.shoot(alex, 'add-slider', '[role="dialog"]');
  await dialog.getByRole('button', { name: 'Add to rundown' }).click();
  await s.until('the rundown has one more cue', async () => (await s.view('alex')).rundown.length, (length) => length === before + 1);
  const added = (await s.view('alex')).rundown.at(-1)!;
  const addedId = (added.ref as { cue: string }).cue;
  s.check(added.graphic === SLIDER && added.error === null && added.label === 'Slider · Venue', `the new cue is ${added.label} with no error (${added.error})`);
  s.check(JSON.stringify((await storedCue(addedId)).params) === JSON.stringify({ kind: 'venue' }), 'the World stores its params as { kind: venue }');
  await s.shoot(alex, 'added');
});
