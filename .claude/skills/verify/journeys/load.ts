#!/usr/bin/env bun
/**
 * The sportsdataverse load on the data page, against GitHub: alex loads MBB 2025-26, loads it
 * again (which writes nothing), then WBB 2025-26, then MBB 2026-27 (only conferences are
 * published). Each load's report is screenshotted and its numbers read back from the World.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/load.ts --port=8998
 */

import type { Page } from 'playwright';
import { session } from '../scripts/lib';

const s = await session('load');

/** Opens the dialog, picks the program and season, presses Load, and returns the report's text and the wall time. */
async function load(page: Page, program: "Men's Basketball" | "Women's Basketball", season: string) {
  await page.getByRole('button', { name: 'Load…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Load from sportsdataverse' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: /Program/ }).click();
  await page.getByRole('option', { name: program, exact: true }).click();
  await dialog.getByRole('button', { name: /Season/ }).click();
  await page.getByRole('option', { name: season, exact: true }).click();
  const started = Date.now();
  await dialog.getByRole('button', { name: 'Load', exact: true }).click();
  const report = dialog.getByTestId('load-report');
  await report.waitFor({ timeout: 180_000 });
  const seconds = (Date.now() - started) / 1000;
  s.log(`  ${program} ${season}: ${seconds.toFixed(1)} s in the browser`);
  for (const summary of await report.locator('summary').all()) await summary.click();
  const text = await report.innerText();
  s.log(`  report: ${text.replace(/\n+/g, ' | ')}`);
  await s.shoot(page, `${program.startsWith('Men') ? 'mbb' : 'wbb'}-${season}`, '.modal');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await dialog.waitFor({ state: 'detached' });
  return { text, seconds };
}

const record = (row: { overall: { wins: number; losses: number }; conference: { wins: number; losses: number } } | undefined) =>
  row && `${row.overall.wins}-${row.overall.losses} (${row.conference.wins}-${row.conference.losses})`;

await s.run(async () => {
  const alex = await s.operator('alex', 'data');
  await s.shoot(alex, 'data-page');
  const before = await s.world();

  const mbb = await load(alex, "Men's Basketball", '2025-26');
  s.check(/rows? inserted/.test(mbb.text) && /Le Moyne/.test(mbb.text), 'the MBB 2025-26 report counts rows and names the unmatched teams');
  let world = await s.world();
  s.check(world.revision > before.revision, `MBB 2025-26 committed (revision ${before.revision} to ${world.revision})`);
  const drexel = world.entities.teamSeason.find((row) => row.id === 'drexel-mbb@2025-26');
  s.log(`  drexel-mbb@2025-26: ${JSON.stringify(drexel)}`);
  s.check(record(drexel) === '17-16 (10-8)' && drexel?.streak === 'L1' && drexel?.rank === 6, `Drexel MBB 2025-26 is 17-16 (10-8 CAA), L1, 6th: ${record(drexel)}, ${drexel?.streak}, ${drexel?.rank}`);
  s.check(drexel?.stats?.gp === 33 && drexel.stats.totals.pts === 2247 && drexel.stats.opponentPts === 2221, `Drexel's team stats: ${drexel?.stats?.gp} games, ${drexel?.stats?.totals.pts} points for, ${drexel?.stats?.opponentPts} against`);
  const reed = world.entities.player.find((row) => row.id === 'drexel-mbb@2025-26/reed-josh');
  const reedStats = world.entities.playerStats.find((row) => row.id === 'drexel-mbb@2025-26/reed-josh');
  s.log(`  Josh Reed: ${JSON.stringify(reed)} ${JSON.stringify(reedStats)}`);
  s.check(reed?.jersey === '5' && reed.sourceKey === 'ncaa:9335965' && reedStats?.stats.gp === 33 && reedStats.stats.totals.pts === 262, "Josh Reed is #5 with 262 points in 33 games");
  const homeGames = world.entities.game.filter((game) => game.seasonId === '2025-26' && game.program === 'mbb' && game.homeTeamId === 'drexel-mbb');
  s.check(homeGames.length === 16, `Drexel MBB has ${homeGames.length} home games in 2025-26`);
  s.log(`  World snapshot: ${(JSON.stringify(world).length / 1024).toFixed(0)} KB of JSON`);

  const again = await load(alex, "Men's Basketball", '2025-26');
  const unchanged = await s.world();
  s.check(/0 rows inserted/.test(again.text) && /0 rows updated/.test(again.text) && /Nothing changed/.test(again.text), 'the same load again reports nothing inserted or updated');
  s.check(unchanged.revision === world.revision, `the same load again leaves the revision at ${world.revision}`);

  await load(alex, "Women's Basketball", '2025-26');
  world = await s.world();
  const wbb = world.entities.teamSeason.find((row) => row.id === 'drexel-wbb@2025-26');
  s.log(`  drexel-wbb@2025-26: ${JSON.stringify(wbb)}`);
  s.check(wbb?.stats?.gp !== undefined && wbb.stats.gp > 0 && wbb.rank !== null, `Drexel WBB 2025-26 has a record and stats: ${record(wbb)}, rank ${wbb?.rank}`);
  s.log(`  World snapshot: ${(JSON.stringify(world).length / 1024).toFixed(0)} KB of JSON`);

  const next = await load(alex, "Men's Basketball", '2026-27');
  s.check(/Schedule not published/.test(next.text), 'MBB 2026-27 reports the schedule as not published');
  world = await s.world();
  const delaware = world.entities.teamSeason.find((row) => row.id === 'delaware-mbb@2026-27');
  const drexelNext = world.entities.teamSeason.find((row) => row.id === 'drexel-mbb@2026-27');
  s.check(delaware?.conferenceId === 'c-usa' && drexelNext?.conferenceId === 'caa', `2026-27 conferences: Delaware ${delaware?.conferenceId}, Drexel ${drexelNext?.conferenceId}`);
  s.check(record(drexelNext) === '14-6 (6-3)', `Drexel MBB 2026-27 keeps the fixture's record: ${record(drexelNext)}`);
});
