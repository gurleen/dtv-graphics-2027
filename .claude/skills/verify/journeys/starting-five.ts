#!/usr/bin/env bun
/**
 * Starting Five with jersey overrides: alex adds a Starting Five cue, its form holds a
 * `Numbers` group with Away and Home rows of five digits-only inputs, a jersey on the roster
 * swaps that slot's player in the bound graphic, and a jersey not on the roster shows the
 * cue's error. Each step is read on alex's preview monitor, /renderer?bus=preview, and the
 * show view over @dtv/api.
 *
 * Precondition set over data.apply, which the show page does not reach: the seed's Drexel
 * roster is exactly its five starters, so the journey adds a bench player, #3 Bench.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/starting-five.ts --port=8998
 */

import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const STARTING_FIVE = 'basketball-v2/starting-five';
const BENCH = 'drexel-mbb@2026-27/bench-verify';
const s = await session('starting-five');

type Row = { number: string; lastName: string };
const homePlayers = (source: string) => `(() => {
  const lower = ${source}.layers().lower;
  if (lower.phase === 'empty') return null;
  const values = lower.frame.values;
  return [1, 2, 3, 4, 5].map((row) => ({ number: values['homePlayer' + row + 'Number'], lastName: values['homePlayer' + row + 'LastName'] }));
})()`;
const names = (rows: Row[] | null) => (rows ?? []).map((row) => `#${row.number} ${row.lastName}`).join(', ');

await s.run(async () => {
  const world = await s.world();
  const tingler = world.entities.player.find((player: { id: string }) => player.id === 'drexel-mbb@2026-27/tingler')!;
  await s.api.data.apply({
    origin: 'manual' as never,
    basis: world.revision,
    edits: [{ op: 'put', kind: 'player', value: { ...tingler, id: BENCH as never, jersey: '3', firstName: 'Verify', lastName: 'Bench', sourceKey: null, headshot: null, motionHeadshot: null } }],
  });
  s.check((await s.world()).entities.player.some((player: { id: string; jersey: string }) => player.id === BENCH && player.jersey === '3'), 'precondition: Drexel has a non-starter, #3 Bench');

  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const grid = alex.getByRole('grid', { name: 'Rundown cues' });
  const rows = grid.getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();
  const beforeIds = (await s.view('alex')).rundown.map((cue) => JSON.stringify(cue.ref));
  const before = beforeIds.length;

  await rows.last().click();
  await alex.getByRole('button', { name: 'Add cue' }).click();
  const dialog = alex.getByRole('dialog', { name: 'Add a cue' });
  await dialog.locator('.select-button').first().click();
  await alex.getByRole('option', { name: 'Starting Five' }).click();

  const rowsOfNumbers = async (scope: typeof dialog, where: string) => {
    const numbers = scope.locator('fieldset.group.numbers');
    s.check((await numbers.count()) === 2, `${where}: two numbers groups (away, home)`);
    s.check((await scope.locator('fieldset.group > legend', { hasText: /^Numbers$/ }).count()) === 1, `${where}: they sit under a Numbers group`);
    for (const side of ['Away', 'Home']) {
      const group = numbers.filter({ has: alex.locator('> legend', { hasText: new RegExp(`^${side}$`) }) });
      const inputs = group.locator('input');
      const boxes = await Promise.all((await inputs.all()).map((input) => input.boundingBox()));
      const tops = new Set(boxes.map((box) => Math.round(box!.y)));
      const widths = boxes.map((box) => Math.round(box!.width));
      const modes = await Promise.all((await inputs.all()).map((input) => input.getAttribute('inputmode')));
      s.check(boxes.length === 5 && tops.size === 1 && widths.every((width) => width <= 64), `${where}: ${side} has 5 inputs on one row, each at most 64px wide (tops ${[...tops]}, widths ${widths})`);
      s.check(modes.every((mode) => mode === 'numeric'), `${where}: ${side} inputs are inputmode=numeric`);
    }
  };
  await rowsOfNumbers(dialog, 'Add cue dialog');
  await s.shoot(alex, 'add-cue-dialog', '[role="dialog"]');
  await dialog.getByRole('button', { name: 'Add to rundown' }).click();
  await s.until('the rundown has one more cue', async () => (await s.view('alex')).rundown.length, (length) => length === before + 1);
  const index = (await s.view('alex')).rundown.findIndex((cue) => !beforeIds.includes(JSON.stringify(cue.ref)));
  const ours = async () => (await s.view('alex')).rundown[index]!;
  const added = await ours();
  const cueId = (added.ref as { cue: string }).cue;
  s.log(`     the new cue ${cueId} landed at rundown row ${index + 1} of ${before + 1}`);
  s.check(added.graphic === STARTING_FIVE && added.error === null, `the new cue is Starting Five with no error (${added.graphic}, ${added.error})`);

  const newRow = alex.locator('.cue-row').nth(index);
  await newRow.click();
  const inspector = alex.getByRole('region', { name: 'Selected cue' });
  await inspector.locator('fieldset.group.numbers').first().waitFor();
  await rowsOfNumbers(inspector, 'inspector');
  await s.shoot(alex, 'inspector-numbers', 'section.inspector');

  const home = inspector.locator('fieldset.group.numbers').filter({ has: alex.locator('> legend', { hasText: /^Home$/ }) }).locator('input');
  await home.nth(1).click();
  await home.nth(1).pressSequentially('a1b');
  s.check((await home.nth(1).inputValue()) === '1', `typing a1b into Home 2 leaves ${JSON.stringify(await home.nth(1).inputValue())}`);
  await home.nth(1).pressSequentially('x7');
  s.check((await home.nth(1).inputValue()) === '17', `typing x7 after it leaves ${JSON.stringify(await home.nth(1).inputValue())} (two digits)`);
  await home.nth(1).pressSequentially('9');
  s.check((await home.nth(1).inputValue()) === '17', `a third digit is refused by maxLength (${JSON.stringify(await home.nth(1).inputValue())})`);
  await s.shoot(alex, 'typed-a1b', 'section.inspector');

  await home.nth(1).fill('');
  await home.nth(1).pressSequentially('3');
  await inspector.getByRole('button', { name: 'Save' }).click();
  await inspector.getByRole('button', { name: /^Cue to my preview/ }).click();
  await s.waitMonitor(alex, 'preview', { lower: STARTING_FIVE }, "alex's preview monitor draws Starting Five");
  const monitorRows = () => alex.evaluate(homePlayers("window.dtvMonitors.preview.renderer")) as Promise<Row[] | null>;
  await s.until('preview monitor binds Home slot 2 to #3 Bench', monitorRows, (rows) => rows?.[1]?.number === '3' && rows?.[1]?.lastName === 'BENCH');
  const monitorHome = await monitorRows();
  s.log(`     preview monitor homePlayer: ${names(monitorHome)}`);
  s.check(names(monitorHome) === '#5 REED, #3 BENCH, #23 TINGLER, #6 EDOMWONYIN, #11 DE LAPORTERIE', 'only slot 2 changed; Hipps #0 is replaced, the rest are the game starters');
  const pvw = await s.renderer('/renderer?bus=preview&operator=alex');
  await s.waitRendered(pvw, { lower: STARTING_FIVE }, '/renderer?bus=preview&operator=alex draws Starting Five');
  const rendererHome = (await pvw.evaluate(homePlayers('window.dtvRenderer'))) as Row[] | null;
  s.check(names(rendererHome) === names(monitorHome), `/renderer preview bus binds the same rows (${names(rendererHome)})`);
  const stored = (await s.world()).entities.show.find((show: { id: string }) => show.id === GAME).rundown.find((cue: { id: string }) => cue.id === cueId);
  s.log(`     stored cue: ${JSON.stringify(stored)}`);
  s.check(JSON.stringify(stored.params.numbers?.home) === JSON.stringify(['', '3', '', '', '']), `the saved cue's params.numbers.home is ${JSON.stringify(stored.params.numbers?.home)}`);
  await s.shoot(alex, 'bench-in-preview');
  await s.shoot(pvw, 'renderer-preview-bench');

  await home.nth(2).fill('');
  await home.nth(2).pressSequentially('99');
  await inspector.getByRole('button', { name: 'Save' }).click();
  const wantError = "Drexel has no #99 on its 2026-27 roster";
  await s.until('the view gives the cue the no-#99 error', async () => (await ours()).error, (error) => error === wantError);
  await s.until('the rundown row shows the error', () => newRow.locator('.cue-error').innerText().catch(() => ''), (text) => text === wantError);
  await s.until('the inspector shows the error', () => inspector.getByRole('alert').innerText().catch(() => ''), (text) => text === wantError);
  s.check(await inspector.getByRole('button', { name: /^Cue to my preview/ }).isEnabled(), 'observation: Cue to my preview stays enabled with the bind error (the form check is schema-only)');
  await s.shoot(alex, 'error-99');
  await s.shoot(alex, 'error-99-inspector', 'section.inspector');

  await home.nth(2).fill('');
  await home.nth(2).pressSequentially('23');
  await home.nth(1).fill('');
  await inspector.getByRole('button', { name: 'Save' }).click();
  await inspector.getByRole('button', { name: /^Cue to my preview/ }).click();
  await s.until('probe: preview rebinds after 23 goes in Home 3 (Tingler is already there)', monitorRows, (rows) => rows !== null && rows[1]?.lastName === 'HIPPS');
  s.log(`     probe, Home 3 = 23: ${names(await monitorRows())}`);
  await home.nth(2).fill('');
  await home.nth(0).pressSequentially('23');
  await inspector.getByRole('button', { name: 'Save' }).click();
  await inspector.getByRole('button', { name: /^Cue to my preview/ }).click();
  await s.until('probe: preview rebinds after 23 goes in Home 1', monitorRows, (rows) => rows?.[0]?.lastName === 'TINGLER');
  const dup = await monitorRows();
  s.log(`     probe, Home 1 = 23: ${names(dup)}; error ${JSON.stringify((await ours()).error)}`);
  await s.shoot(alex, 'probe-duplicate');
});
