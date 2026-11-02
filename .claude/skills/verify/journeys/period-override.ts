#!/usr/bin/env bun
/**
 * The period dropdown over a feed: the clock goes to AllSport over `game.apply` (as starting the
 * feed hands it), and the dropdown stays usable. alex picks Halftime, the score bar shows
 * `overridden`, and the feed's own period waits under the override while the feed writes 2nd Half
 * over `game.apply`. Clear returns the game to the feed's period and the tag goes.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/period-override.ts --port=8998
 */

import { session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const ALLSPORT = 'allsport';
const s = await session('period-override');

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const bar = alex.locator('footer.scorebar[aria-label="Game"]');
  await Promise.race([activate.waitFor(), bar.waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await bar.waitFor();

  const feed = (commands: unknown[], source = ALLSPORT) =>
    s.api.game.apply({ sport: 'basketball', gameId: GAME as never, source: source as never, commands: commands as never });
  await feed([{ type: 'authority', group: 'clock', source: ALLSPORT }], 'operator');
  await feed([{ type: 'period', period: 1 }, { type: 'phase', phase: 'live' }]);

  const period = bar.getByTestId('period');
  const tag = bar.getByTestId('period-overridden');
  await s.until('the dropdown reads 1st Half from the feed', () => period.innerText(), (text) => text.includes('1st Half'));
  s.check(await period.isEnabled(), 'the period dropdown is usable while AllSport holds the clock');
  s.check((await tag.count()) === 0, 'no override tag before one is set');
  await s.shoot(alex, 'fed');

  await period.click();
  await alex.getByRole('option', { name: 'Halftime', exact: true }).click();
  await tag.waitFor();
  await s.until('the dropdown reads Halftime', () => period.innerText(), (text) => text.includes('Halftime'));
  let live = await s.live(GAME);
  s.check(
    live.sport === 'basketball' && live.phase === 'halftime' && live.period === 1 && live.overridden?.phase === 'live' && live.overridden.period === 1,
    `Halftime overrides the feed's 1st Half over the API (${JSON.stringify(live.sport === 'basketball' && { phase: live.phase, period: live.period, overridden: live.overridden })})`,
  );
  await s.shoot(alex, 'overridden');

  await feed([{ type: 'period', period: 2 }]);
  await alex.waitForTimeout(500);
  live = await s.live(GAME);
  s.check(
    live.sport === 'basketball' && live.phase === 'halftime' && live.overridden?.period === 2,
    `the feed's 2nd Half waits under the override (${JSON.stringify(live.sport === 'basketball' && { phase: live.phase, period: live.period, overridden: live.overridden })})`,
  );
  s.check((await period.innerText()).includes('Halftime'), 'the dropdown still reads Halftime');

  await bar.getByRole('button', { name: 'Clear the period override' }).click();
  await s.until('the dropdown reads 2nd Half from the feed', () => period.innerText(), (text) => text.includes('2nd Half'));
  await tag.waitFor({ state: 'detached' });
  live = await s.live(GAME);
  s.check(
    live.sport === 'basketball' && live.phase === 'live' && live.period === 2 && live.overridden === null,
    "Clear returns the game to the feed's 2nd Half over the API",
  );
  await s.shoot(alex, 'cleared');
});
