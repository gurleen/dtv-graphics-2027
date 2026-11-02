#!/usr/bin/env bun
/**
 * The period dropdown's breaks: alex airs the scorebug, opens the dropdown and finds a Start of and an End of
 * for each period beside Halftime, then picks End of 1st Half and Start of 2nd Half. The live game over the API
 * and the scorebug's period on program /renderer follow each pick.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/period-breaks.ts --port=8998
 */

import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const s = await session('period-breaks');

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const bar = alex.locator('footer.scorebar[aria-label="Game"]');
  await Promise.race([activate.waitFor(), bar.waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await bar.waitFor();
  const program = await s.renderer('/renderer');

  await alex.evaluate('document.activeElement && document.activeElement.blur()');
  await alex.keyboard.press('Digit1');
  await s.waitRendered(program, { bug: 'basketball-v2/scorebug' }, 'free-panel key 1 puts the scorebug on program /renderer');

  const period = bar.getByTestId('period');
  await period.click();
  const options = await alex.getByRole('option').allInnerTexts();
  s.check(
    ['Start of 1st Half', '1st Half', 'End of 1st Half', 'Halftime', 'Start of 2nd Half', '2nd Half', 'End of 2nd Half', 'Start of OT', 'End of OT'].every((label) => options.includes(label)),
    `the dropdown offers each period's start and end beside Halftime (${options.join(' | ')})`,
  );
  await s.shoot(alex, 'dropdown');
  await alex.keyboard.press('Escape');

  const bugPeriod = () => program.evaluate('String(window.dtvRenderer.layers().bug.frame.values.period)');
  for (const [label, want, bug] of [
    ['End of 1st Half', { phase: 'end', period: 1 }, 'End 1st'],
    ['Start of 2nd Half', { phase: 'start', period: 2 }, '2nd Half'],
  ] as const) {
    await period.click();
    await alex.getByRole('option', { name: label, exact: true }).click();
    await s.until(`the period dropdown reads ${label}`, () => period.innerText(), (text) => text.includes(label));
    const game = await s.live(GAME);
    s.check(game.sport === 'basketball' && game.phase === want.phase && game.period === want.period, `${label} sets phase ${want.phase}, period ${want.period} over the API`);
    await s.until(`program /renderer's scorebug period reads ${bug}`, bugPeriod, (value) => value.toLowerCase() === bug.toLowerCase());
    await program.waitForTimeout(800);
    await s.shoot(alex, label.replaceAll(' ', '-'));
    await s.shoot(program, `renderer-${label.replaceAll(' ', '-')}`);
  }
});
