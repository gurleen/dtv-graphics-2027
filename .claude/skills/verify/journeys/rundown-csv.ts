#!/usr/bin/env bun
/**
 * Rundown CSV: alex exports the seeded rundown with Export CSV, imports the same file back
 * into the same game (the rundown doubles, with the same graphics and notes under fresh ids),
 * then imports a bad CSV and gets the error in the problem strip with nothing written. Each
 * step is read in the rundown rows and in the World over @dtv/api.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/rundown-csv.ts --port=8998
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const s = await session('rundown-csv');

const stored = async () =>
  (await s.world()).entities.show.find((show: { id: string }) => show.id === GAME).rundown as { id: string; graphic: string; note: string; params: unknown }[];

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();

  const before = await stored();
  s.check(before.length > 0, `the seeded rundown holds ${before.length} cues`);
  await s.shoot(alex, 'before', '.panel.rundown');

  const [download] = await Promise.all([alex.waitForEvent('download'), alex.getByRole('button', { name: 'Export CSV' }).click()]);
  const file = join(s.out, 'rundown.csv');
  await download.saveAs(file);
  const text = readFileSync(file, 'utf8');
  s.check(download.suggestedFilename() === 'rundown.csv', `the download is named ${download.suggestedFilename()}`);
  s.check(text.startsWith('graphic,note,params,overrides\n') && text.split('\n').length >= before.length + 1, 'the file has the header and a record per cue');
  s.check(text.split('\n')[0] === 'graphic,note,params,overrides' && before.every((cue) => !text.split(/[,\n]/).includes(cue.id)), 'and holds no cue ids');

  const importInput = alex.locator('input[type="file"]');
  await importInput.setInputFiles(file);
  await s.until('the rundown doubles in the World', async () => (await stored()).length, (length) => length === before.length * 2);
  const after = await stored();
  const pick = (cues: typeof before) => JSON.stringify(cues.map(({ graphic, note, params }) => ({ graphic, note, params })));
  s.check(pick(after.slice(before.length)) === pick(before), 'the appended cues repeat the original graphics, notes and params in order');
  s.check(after.slice(before.length).every((cue) => !before.some((old) => old.id === cue.id)), 'and carry fresh ids');
  s.check((await rows.count()) === before.length * 2, `the grid shows ${await rows.count()} rows`);
  await s.shoot(alex, 'imported', '.panel.rundown');

  const bad = join(s.out, 'bad.csv');
  writeFileSync(bad, 'graphic,note,params,overrides\nbasketball-v2/scorebug,,{},{}\nbasketball-v2/scorebug,,{nope},{}\nbasketball-v2/no-such-graphic,,{},{}\n');
  await importInput.setInputFiles(bad);
  const strip = alex.locator('.problem-strip');
  await strip.waitFor();
  const message = await strip.innerText();
  s.check(/Line 3: .*params is not valid JSON/.test(message), `the problem strip names the bad line (${message.replace(/\n/g, ' ')})`);
  await s.shoot(alex, 'bad-import', '.problem-strip');
  s.check((await stored()).length === before.length * 2, 'the World still holds the same rundown: nothing was written');
});
