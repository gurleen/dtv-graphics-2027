#!/usr/bin/env bun
/**
 * Next on a one-step graphic takes it off air: alex airs the scorebug from the free panel,
 * takes Zach Spiker's staff lower third, and presses N. The lower third leaves program and
 * /renderer; the scorebug, a free-panel graphic, stays, and a second N leaves it on.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/next.ts --port=8998
 */

import { session } from '../scripts/lib';

const STAFF = 'basketball-v2/staff-lower-third';
const SCOREBUG = 'basketball-v2/scorebug';
const s = await session('next');

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();
  const program = await s.renderer('/renderer');

  await alex.locator('body').click({ position: { x: 5, y: 5 } });
  await alex.keyboard.press('Digit1');
  await s.waitRendered(program, { bug: SCOREBUG }, 'key 1 airs the scorebug');

  await rows.filter({ hasText: 'Zach Spiker' }).click();
  await alex.getByRole('button', { name: /^Cue to my preview/ }).click();
  await alex.getByRole('button', { name: /^Take/ }).click();
  await s.waitRendered(program, { bug: SCOREBUG, lower: STAFF }, 'Take puts the staff lower third on program beside the scorebug');
  await s.shoot(program, 'before-next');

  await alex.locator('body').click({ position: { x: 5, y: 5 } });
  await alex.keyboard.press('KeyN');
  await s.waitRendered(program, { bug: SCOREBUG, lower: 'empty' }, 'N takes the one-step lower third off /renderer; the scorebug stays');
  const view = await s.view('alex');
  s.check(!view.program.lower && view.program.bug?.graphic === SCOREBUG, 'the server has the lower layer empty and the scorebug on');
  await s.shoot(program, 'after-next');
  await s.shoot(alex, 'controller-after-next');

  await alex.keyboard.press('KeyN');
  await alex.waitForTimeout(1000);
  s.check((await s.view('alex')).program.bug?.graphic === SCOREBUG, 'a second N with only the free-panel scorebug on air leaves it there');
});
