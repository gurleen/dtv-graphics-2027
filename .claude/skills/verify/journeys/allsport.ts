#!/usr/bin/env bun
/**
 * The Tools page's AllSport tab: alex opens #/tools/allsport, points the feed at a pseudo-terminal that plays a
 * Daktronics console, starts it, and sees Running, the log, and the clock, shot clock, period, score and timeouts on
 * the game over the API with allsport as the authority. A missing device shows NO_PORT inline. Turning Score off
 * and restarting leaves the score with the operator. Stop shows Stopped and hands authority back.
 * Screenshots go to build/controller/tools/ as well as the evidence folder.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/allsport.ts --port=8998
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openConsole } from '../../../../packages/live-allsport/scripts/console';
import { ROOT, session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const SHOTS = join(ROOT, 'build/controller/tools');
mkdirSync(SHOTS, { recursive: true });
const s = await session('allsport');
const fake = await openConsole();

await s.run(async () => {
  const alex = await s.operator('alex', 'show');
  const shoot = async (name: string) => {
    await s.shoot(alex, name);
    await alex.screenshot({ path: join(SHOTS, `${name}.png`) });
  };
  const live = async () => {
    const state = await s.live(GAME);
    return state.sport === 'basketball' ? state : null;
  };
  const log = () => alex.getByRole('log', { name: 'AllSport log' }).innerText();
  const clockNow = (state: NonNullable<Awaited<ReturnType<typeof live>>>) => (state.clock.running ? state.clock.remainingMs - (Date.now() - state.clock.since) : state.clock.remainingMs);

  await alex.goto(`${s.origin}/#/tools/allsport`);
  const tab = alex.getByRole('tab', { name: 'AllSport' });
  await tab.waitFor();
  s.check((await tab.getAttribute('aria-selected')) === 'true', 'the deep link #/tools/allsport selects the AllSport tab');
  await alex.getByRole('status').filter({ hasText: 'Stopped' }).waitFor();
  s.check((await alex.getByRole('checkbox', { name: /Score, timeouts, bonus, possession/ }).isChecked()), 'Score is on by default');
  await shoot('allsport-stopped');

  const start = alex.getByRole('button', { name: /^(Start|Restart)$/ });
  const stop = alex.getByRole('button', { name: 'Stop' });
  const port = alex.getByRole('combobox', { name: 'Port' });
  const score = alex.getByRole('checkbox', { name: /Score, timeouts, bonus, possession/ });
  // Typing opens the list of devices on the server; Tab commits the typed path and closes it.
  await port.fill('/dev/not-a-console');
  await alex.keyboard.press('Tab');
  await alex.getByRole('button', { name: /Game/ }).click();
  await alex.getByRole('option', { name: /Saint Joseph's at Drexel/ }).click();
  await start.click();
  await alex.getByRole('alert').filter({ hasText: 'No device at that path' }).waitFor();
  s.check(true, 'a missing device shows the NO_PORT message inline');
  await shoot('allsport-error-no-port');

  await port.fill(fake.path);
  await alex.keyboard.press('Tab');
  s.check((await alex.getByRole('alert').count()) === 0, 'editing the port clears the error');
  await start.click();
  await alex.getByRole('status').filter({ hasText: /Running since \d\d:\d\d:\d\d/ }).waitFor();
  await s.until('the log shows the handover', log, (text) => /handed clock and score to allsport/.test(text) && /reading \/dev\/\S+ at 19200 baud/.test(text));
  await s.until('the game has the feed as clock and score authority', live, (state) => state?.authority.clock === 'allsport' && state.authority.score === 'allsport');
  s.check((await live())?.authority.stats === 'operator', 'stats stay with the operator');

  fake.send({ period: ' 2', clockMain: '14:30', clockTenths: '14:30', clockStopped: 's', scoreHome: '  41', scoreAway: '  38', timeoutsHome: ' 2', timeoutsAway: ' 3', shotClock: ' 24' });
  await s.until('the game shows the console screen', live, (state) => state?.score.home === 41 && state.shotClock?.remainingMs === 24_000);
  const first = (await live())!;
  s.check(first.period === 2 && first.score.away === 38 && first.timeouts.home === 2 && first.timeouts.away === 3, 'period 2, score 38-41 and timeouts 3-2 are on the game');
  s.check(!first.clock.running && first.clock.remainingMs === 870_000, 'the clock reads 14:30, stopped');

  fake.send({ clockStopped: ' ', possessionAwayArrow: '>' });
  await s.until('the clock runs and the phase is live', live, (state) => state?.clock.running === true && state.phase === 'live');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const running = (await live())!;
  s.check(Math.abs(clockNow(running) - 868_500) < 700, `the server runs the clock between writes (${(clockNow(running) / 1000).toFixed(1)} s)`);
  s.check(running.possession === 'away' && running.shotClock?.running === true, 'possession is away and the shot clock runs');
  await s.until('the log has the clock start', log, (text) => /clock started at 14:30/.test(text));
  s.check(await stop.isEnabled(), 'Stop is enabled while running');
  s.check(await start.isDisabled(), 'Start is disabled while running the same values');
  await shoot('allsport-running');

  await alex.reload();
  await alex.getByRole('status').filter({ hasText: /Running since/ }).waitFor();
  s.check((await port.inputValue()) === fake.path, 'after a reload the form shows the running port');

  await alex.getByText('Score, timeouts, bonus, possession').click();
  s.check(!(await score.isChecked()), 'clicking its label turns Score off');
  s.check((await start.innerText()) === 'Restart', 'changing Score offers Restart');
  await start.click();
  await s.until('the log shows only the clock handed over', log, (text) => /handed clock to allsport/.test(text));
  await s.until('the score is back with the operator, the clock with the feed', live, (state) => state?.authority.score === 'operator' && state.authority.clock === 'allsport');
  fake.send({ scoreHome: '  50', clockMain: '13:00', clockTenths: '13:00', clockStopped: 's' });
  await s.until('the clock moves on a new console value', live, (state) => state?.clock.remainingMs === 780_000 && !state.clock.running);
  s.check((await live())?.score.home === 41, 'with Score off a console score change does not reach the game');
  await shoot('allsport-score-off');

  await stop.click();
  await alex.getByRole('status').filter({ hasText: 'Stopped' }).waitFor();
  await s.until('authority is back with the operator', live, (state) => state?.authority.clock === 'operator' && state.authority.score === 'operator');
  s.check((await live())?.clock.remainingMs === 780_000, 'handing back keeps the clock');
  await s.until('the log shows the handback', log, (text) => /handed clock to operator/.test(text));
  await shoot('allsport-stopped-after');
  fake.close();
});
