#!/usr/bin/env bun
/**
 * The Halftime Slate on program, the way an operator runs it with OBS's page watching: alex
 * cues the slate from the rundown and takes it over the scorebug, the stat column pages on
 * its own, a second take starts on page 1 again, and a take with the highlights window
 * chosen in the inspector leaves a transparent 16:9 hole in /renderer.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/halftime-slate.ts --port=8998
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT, session } from '../scripts/lib';

const { PNG } = createRequire(join(ROOT, 'apps/renderer/package.json'))('pngjs') as typeof import('pngjs');

const SLATE = 'basketball-v2/halftime-slate';
const SCOREBUG = 'basketball-v2/scorebug';
const COLUMN = { x: 1352, y: 280, width: 520, height: 720 };
const WINDOW = { x: 48, y: 280, width: 1280, height: 720 };
const TICKER = { x: 0, y: 1024, width: 1920, height: 56 };
const PAGE_MS = 8000;

const s = await session('halftime-slate');

type Page = Awaited<ReturnType<typeof s.renderer>>;
const pixels = async (page: Page) => PNG.sync.read(await page.screenshot({ omitBackground: true }));
const differing = (a: InstanceType<typeof PNG>, b: InstanceType<typeof PNG>, box: typeof COLUMN) => {
  let count = 0;
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const at = (y * a.width + x) * 4;
      if (Math.abs(a.data[at]! - b.data[at]!) + Math.abs(a.data[at + 1]! - b.data[at + 1]!) + Math.abs(a.data[at + 2]! - b.data[at + 2]!) > 24) count++;
    }
  return count / (box.width * box.height);
};
const alphaAt = (image: InstanceType<typeof PNG>, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]!;
const boundValue = (page: Page, name: string) => page.evaluate(`window.dtvRenderer.layers().card.frame?.values[${JSON.stringify(name)}]`);

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();
  const program = await s.renderer('/renderer');
  const slateRow = rows.filter({ hasText: /halftime slate/i });
  const take = alex.getByRole('button', { name: /^Take/ });
  const cue = alex.getByRole('button', { name: /^Cue to my preview/ });
  const clearCard = alex.locator('.layer-row[data-layer="card"]').getByRole('button', { name: /^Clear/ });

  await alex.keyboard.press('1');
  await s.waitRendered(program, { bug: SCOREBUG }, 'key 1 puts the scorebug on program');

  await slateRow.click();
  await cue.click();
  await s.waitMonitor(alex, 'preview', { card: SLATE }, "alex's preview monitor draws the slate");
  await take.click();
  const firstTake = Date.now();
  await s.waitRendered(program, { card: SLATE, bug: 'empty', lower: 'empty' }, 'Take puts the slate on program /renderer and clears the scorebug');
  await s.waitMonitor(alex, 'program', { card: SLATE, bug: 'empty' }, "alex's program monitor agrees");
  const view = await s.view('alex');
  s.check(view.program.card?.graphic === SLATE && !view.program.bug, 'the server has the slate on card and nothing on bug');
  s.check((await boundValue(program, 'showWindow')) === false, 'the slate is bound with showWindow false');
  s.check((await boundValue(program, 'clock')) === '13:59', 'the slate binds the game clock, 13:59');

  await Bun.sleep(Math.max(0, firstTake + 4000 - Date.now()));
  const pageOne = await pixels(program);
  s.check(alphaAt(pageOne, 688, 672) === 255, 'with the window closed, the window area is opaque');
  await s.shoot(program, 'page-1');
  await s.shoot(alex, 'controller-slate-on-air');

  await Bun.sleep(Math.max(0, firstTake + PAGE_MS + 4000 - Date.now()));
  const pageTwo = await pixels(program);
  await s.shoot(program, 'page-2');
  const changed = differing(pageOne, pageTwo, COLUMN);
  s.check(changed > 0.02, `8 s later the stat column shows another page (${(changed * 100).toFixed(1)}% of its pixels differ)`);
  s.check(differing(pageOne, pageTwo, WINDOW) < 0.001, 'while the hero beside it does not change');
  s.check(alphaAt(pageTwo, 960, 1052) === 255 && differing(pageOne, pageTwo, TICKER) > 0.02, 'and the ticker along the foot has moved');

  await clearCard.click();
  await s.waitRendered(program, { card: 'empty' }, 'Clear takes the slate off program /renderer');
  const cleared = await pixels(program);
  s.check(alphaAt(cleared, 960, 100) === 0 && alphaAt(cleared, 1600, 700) === 0, 'and the frame is fully transparent again');

  await slateRow.click();
  await cue.click();
  await take.click();
  const secondTake = Date.now();
  await s.waitRendered(program, { card: SLATE }, 'a second take puts it back');
  await Bun.sleep(Math.max(0, secondTake + 4000 - Date.now()));
  const again = await pixels(program);
  await s.shoot(program, 'second-take');
  const drift = differing(pageOne, again, COLUMN);
  s.check(drift < 0.005, `the second take starts on page 1 again (${(drift * 100).toFixed(2)}% of the column differs from the first take)`);
  await clearCard.click();
  await s.waitRendered(program, { card: 'empty' }, 'cleared again');

  await slateRow.click();
  await alex.getByRole('button', { name: /window/i }).click();
  await alex.getByRole('option', { name: 'Highlights window', exact: true }).click();
  await s.shoot(alex, 'inspector-window-chosen');
  await alex.getByRole('button', { name: 'Save', exact: true }).click();
  await cue.click();
  await take.click();
  const windowTake = Date.now();
  await s.waitRendered(program, { card: SLATE }, 'a take with the highlights window chosen reaches program');
  s.check((await boundValue(program, 'showWindow')) === true, 'bound with showWindow true');
  await Bun.sleep(Math.max(0, windowTake + 4000 - Date.now()));
  const open = await pixels(program);
  await s.shoot(program, 'window-open');
  const hole = [
    [WINDOW.x + 40, WINDOW.y + 40],
    [WINDOW.x + 640, WINDOW.y + 360],
    [WINDOW.x + WINDOW.width - 40, WINDOW.y + WINDOW.height - 40],
  ] as const;
  s.check(hole.every(([x, y]) => alphaAt(open, x, y) === 0), 'the 16:9 window is fully transparent: OBS would show the source under it');
  s.check(alphaAt(open, 960, 150) === 255 && alphaAt(open, 1600, 700) === 255 && alphaAt(open, 20, 20) === 255, 'and the header, stat column and backdrop round it stay opaque');
  s.check(differing(pageOne, open, COLUMN) < 0.005, 'with the stat column on page 1');
});
