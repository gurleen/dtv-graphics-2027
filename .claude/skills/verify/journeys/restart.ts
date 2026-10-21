#!/usr/bin/env bun
/**
 * A server restart mid-show: with the scorebug and the staff lower third on program, the
 * server is stopped and started again on the same database by dtv.sh. The controller shows
 * Reconnecting while it is down, nothing reloads, and program comes back as it was on the
 * controller's monitor, on /renderer and over the API.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/restart.ts --port=8998
 */

import { join } from 'node:path';
import { session } from '../scripts/lib';

const STAFF = 'basketball-v2/staff-lower-third';
const SCOREBUG = 'basketball-v2/scorebug';
const s = await session('restart');
const dtv = async (command: 'stop' | 'start') => {
  const child = Bun.spawn([join(import.meta.dir, '../scripts/dtv.sh'), command, `--port=${s.port}`], { stdout: 'pipe', stderr: 'pipe' });
  const output = (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());
  s.log(`  dtv.sh ${command}: ${output.trim()}`);
  return (await child.exited) === 0;
};

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();
  const program = await s.renderer('/renderer');

  await alex.evaluate('document.activeElement && document.activeElement.blur()');
  await alex.keyboard.press('Digit1');
  await rows.filter({ hasText: 'Zach Spiker' }).click();
  await alex.keyboard.press('Enter');
  await s.waitMonitor(alex, 'preview', { lower: STAFF }, 'the staff lower third is cued');
  await alex.keyboard.press('Space');
  await s.waitRendered(program, { bug: SCOREBUG, lower: STAFF }, 'scorebug and staff lower third on program /renderer');
  await s.waitMonitor(alex, 'program', { bug: SCOREBUG, lower: STAFF }, "and on alex's program monitor");
  const monitorBefore = JSON.stringify(await s.monitor(alex, 'program'));
  const renderedBefore = JSON.stringify(await s.rendered(program));
  const viewBefore = await s.view('alex');
  for (const page of [alex, program]) await page.evaluate('window.verifyMarker = true');
  await s.shoot(alex, 'before-restart');

  s.check(await dtv('stop'), 'dtv.sh stop stopped the server and kept its DB');
  await alex.getByTestId('reconnecting').waitFor({ timeout: 10_000 });
  s.check(true, 'the Reconnecting badge shows while the server is down');
  await s.shoot(alex, 'reconnecting');
  s.check(await dtv('start'), 'dtv.sh start served the same DB again');
  await alex.getByTestId('reconnecting').waitFor({ state: 'detached', timeout: 15_000 });
  s.check(true, 'the badge clears once every stream is back');
  await Bun.sleep(3000);

  s.check(JSON.stringify(await s.monitor(alex, 'program')) === monitorBefore, `alex's program monitor holds the same slots and phases (${monitorBefore})`);
  s.check(JSON.stringify(await s.rendered(program)) === renderedBefore, '/renderer holds the same slots and phases');
  const viewAfter = await s.view('alex');
  s.check(
    viewAfter.show?.id === viewBefore.show?.id && viewAfter.program.bug?.id === viewBefore.program.bug?.id && viewAfter.program.lower?.id === viewBefore.program.lower?.id,
    `the server came back with the same show (${viewAfter.show?.id}) and the same program slots`,
  );
  for (const [name, page] of [['alex', alex], ['/renderer', program]] as const) {
    s.check((await page.evaluate('window.verifyMarker === true')) === true, `${name} did not reload across the restart`);
  }
  await s.shoot(alex, 'after-restart');
  await s.shoot(program, 'renderer-after-restart');
});
