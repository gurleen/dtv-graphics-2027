#!/usr/bin/env bun
/**
 * The score bar under the show page, which only shows the game: alex airs the scorebug with
 * free-panel key 1, Drexel's score goes up 3 over `game.apply` (as a live feed will send it),
 * and the score bar and the scorebug on /renderer carry the new score.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/score.ts --port=8998
 */

import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const s = await session('score');

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

  const home = alex.getByTestId('score-home');
  const before = Number(await home.innerText());
  await s.shoot(alex, 'before');
  s.check((await bar.getByRole('button').count()) === 0, 'the score bar has no controls');
  await s.api.game.apply({ sport: 'basketball', gameId: GAME as never, source: 'operator' as never, commands: [{ type: 'score', side: 'home', value: before + 3 }] });
  await s.until(`the score bar reads ${before + 3}`, async () => Number(await home.innerText()), (value) => value === before + 3);
  const live = await s.live(GAME);
  s.check(live.sport === 'basketball' && live.score.home === before + 3, `the live game's home score is ${before + 3} over the API`);
  const homeScore = (page: typeof program) => page.evaluate('String(window.dtvRenderer.layers().bug.frame.values.homeScore)');
  await s.until('program /renderer binds the new home score', () => homeScore(program), (value) => value === String(before + 3));
  await alex.waitForTimeout(500);
  await s.shoot(alex, 'after');
  await s.shoot(program, 'renderer-after');
});
