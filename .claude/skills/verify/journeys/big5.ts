#!/usr/bin/env bun
/**
 * The six Big 5 graphics on program: alex cues each from the seeded rundown, takes it, and
 * the /renderer page OBS loads draws it. The format card also steps to its pod standings on
 * Next, and the carousel pages on its own after 8 s. Each take is read on alex's program
 * monitor, on /renderer and in the server's show view.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/big5.ts --port=8998
 */

import { type Layer, session } from '../scripts/lib';

const CUES: readonly { row: RegExp; graphic: string; layer: Layer; name: string }[] = [
  { row: /Big 5 Classic format/, graphic: 'basketball-v2/big5-format', layer: 'card', name: 'format' },
  { row: /Big 5 pod schedule/, graphic: 'basketball-v2/big5-pod-schedule', layer: 'card', name: 'pod-schedule' },
  { row: /Series history carousel/, graphic: 'basketball-v2/series-history-carousel', layer: 'card', name: 'series-carousel' },
  { row: /Series history(?! carousel)/, graphic: 'basketball-v2/series-history', layer: 'lower', name: 'series-history' },
  { row: /Big 5 stakes/, graphic: 'basketball-v2/big5-stakes', layer: 'lower', name: 'stakes' },
  { row: /Big 5 Classic champions/, graphic: 'basketball-v2/big5-champions', layer: 'lower', name: 'champions' },
];

const s = await session('big5');

await s.run(async () => {
  const alex = await s.operator('alex');
  // The six cues are the last rows of a 27-row rundown; at 900 high the last two sit below the grid's fold and a click does not select them.
  await alex.setViewportSize({ width: 1440, height: 1200 });
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();

  const program = await s.renderer('/renderer');
  const failedImages: string[] = [];
  program.on('requestfailed', (request) => failedImages.push(request.url()));
  program.on('response', (response) => {
    if (response.status() >= 400) failedImages.push(`${response.status()} ${response.url()}`);
  });

  for (const cue of CUES) {
    await rows.filter({ hasText: cue.row }).first().click();
    await alex.getByRole('button', { name: /^Cue to my preview/ }).click();
    await s.waitMonitor(alex, 'preview', { [cue.layer]: cue.graphic }, `${cue.name}: alex's preview draws it`);
    await alex.getByRole('button', { name: /^Take/ }).click();
    await s.waitRendered(program, { [cue.layer]: cue.graphic }, `${cue.name}: program /renderer draws it`);
    await s.waitMonitor(alex, 'program', { [cue.layer]: cue.graphic }, `${cue.name}: alex's program monitor draws it`);
    s.check((await s.view('alex')).program[cue.layer]?.graphic === cue.graphic, `${cue.name}: the server has it on program`);
    await Bun.sleep(600);
    await s.shoot(program, `${cue.name}-program`);

    if (cue.name === 'format') {
      await alex.keyboard.press('KeyN');
      await s.waitRendered(program, { card: { graphic: cue.graphic, step: 1 } }, 'format: Next steps /renderer to the pod standings');
      await Bun.sleep(600);
      await s.shoot(program, 'format-pods-program');
    }
    if (cue.name === 'series-carousel') {
      await Bun.sleep(9_000);
      await s.shoot(program, 'series-carousel-second-page');
    }

    await alex.locator(`.layer-row[data-layer="${cue.layer}"]`).getByRole('button', { name: /^Clear/ }).click();
    await s.waitRendered(program, { [cue.layer]: 'empty' }, `${cue.name}: Clear takes it off /renderer`);
  }

  s.check(failedImages.length === 0, `every image and scene /renderer asked for loaded${failedImages.length ? `: ${failedImages.join(', ')}` : ''}`);
});
