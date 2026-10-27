#!/usr/bin/env bun
/**
 * The Show rail's StatCrew plays: alex activates the seeded game and the rail says StatCrew is not set up. Alex
 * starts StatCrew on the Tools tab against the LiveStats fixture, and the rail lists the same plays as the feed over
 * the API, newest first, with the jersey beside the name. The Tools tab keeps its full table. Stop leaves the plays.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/rail-plays.ts --port=8998
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { first } from '../../../../packages/api/src';
import { ROOT, session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const dir = mkdtempSync(join(tmpdir(), 'rail-plays-'));
const file = join(dir, 'bball.xml');
copyFileSync(join(ROOT, 'packages/live-statcrew/fixtures/livestats.xml'), file);
const s = await session('rail-plays');

await s.run(async () => {
  const alex = await s.operator('alex');
  const rundown = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  await Promise.race([activate.waitFor(), rundown.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rundown.first().waitFor();

  const rail = alex.getByRole('complementary', { name: 'Monitors' });
  const plays = rail.getByRole('region', { name: 'StatCrew plays' });
  await plays.getByText('StatCrew is not set up').waitFor();
  s.check((await rail.getByText("Others' previews").count()) === 0, "the rail has no Others' previews");
  await s.shoot(alex, 'rail-not-set-up');

  await alex.goto(`${s.origin}/#/tools/statcrew`);
  await alex.getByLabel('File').fill(file);
  await alex.getByRole('button', { name: /Game/ }).click();
  await alex.getByRole('option', { name: /Saint Joseph's at Drexel/ }).click();
  await alex.getByRole('button', { name: /^(Start|Restart)$/ }).click();
  await alex.getByRole('status').filter({ hasText: /Running since/ }).waitFor();
  const toolRows = () => alex.getByRole('region', { name: 'StatCrew plays' }).locator('tbody tr').count();
  await s.until('the Tools tab lists the plays', toolRows, (count) => count > 100);
  s.check((await alex.getByRole('region', { name: 'StatCrew plays' }).locator('th').allInnerTexts()).join(' ') === 'Per Clock Team # Player Play Score', 'the Tools tab keeps its seven columns');
  await s.shoot(alex, 'tools-full-table');

  const feed = await first((signal) => s.api.tools.statcrew.watch(undefined, { signal }));
  s.check(feed.game === GAME && feed.events.length > 100, `the feed over the API reads the game with ${feed.events.length} plays`);

  await alex.getByRole('link', { name: 'Show' }).click();
  const railRows = plays.locator('tbody tr');
  await s.until('the rail lists every play', () => railRows.count(), (count) => count === feed.events.length);
  s.check((await plays.locator('th').allInnerTexts()).join(' ') === 'Per Clock Team Player Play Score', 'the rail drops the # column');
  const newest = feed.events.at(-1)!;
  const top = await railRows.first().innerText();
  s.check(top.includes(newest.time) && top.includes(`#${newest.uni} ${newest.name}`) && top.includes(newest.action), `the newest play is first, jersey beside the name: ${top.replace(/\s+/g, ' ')}`);
  const railBox = await rail.boundingBox();
  const tableBox = await plays.boundingBox();
  s.check(!!railBox && !!tableBox && tableBox.x + tableBox.width <= railBox.x + railBox.width + 1, 'the table fits the rail width');
  s.check(await plays.locator('.tool-plays-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the table needs no sideways scroll');
  await s.shoot(alex, 'rail-plays');
  await rail.screenshot({ path: join(s.out, 'rail-plays-crop.png') });

  await alex.goto(`${s.origin}/#/tools/statcrew`);
  await alex.getByRole('button', { name: 'Stop' }).click();
  await alex.getByRole('status').filter({ hasText: 'Stopped' }).waitFor();
  await alex.getByRole('link', { name: 'Show' }).click();
  await s.until('the plays stay on the rail after Stop', () => railRows.count(), (count) => count === feed.events.length);
  rmSync(dir, { recursive: true, force: true });
});
