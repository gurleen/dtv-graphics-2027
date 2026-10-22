#!/usr/bin/env bun
/**
 * The sportsdataverse load on the data page, against GitHub's ESPN files: alex loads MBB 2025-26,
 * loads it again (which writes nothing), then WBB 2025-26, MBB 2026-27 and WBB 2026-27 (no box
 * scores yet; rosters are last season's copies). Each load's report is screenshotted and its
 * numbers read back from the World.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/load.ts --port=8998
 */

import { join } from 'node:path';
import type { Page } from 'playwright';
import { ROOT, session } from '../scripts/lib';

const s = await session('load');
const fixtures = await Bun.file(join(ROOT, 'data/seed/fixtures.json')).json();

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
  s.log(`  report: ${text.replace(/\n+/g, ' | ').slice(0, 1500)}`);
  await s.shoot(page, `${program.startsWith('Men') ? 'mbb' : 'wbb'}-${season}`, '.modal');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await dialog.waitFor({ state: 'detached' });
  return { text, seconds };
}

type Row = { overall: { wins: number; losses: number }; conference: { wins: number; losses: number }; streak: string | null; rank: number | null };
const standing = (row: Row | undefined) => row && `${row.rank} ${row.overall.wins}-${row.overall.losses} (${row.conference.wins}-${row.conference.losses}) ${row.streak}`;
type World = Awaited<ReturnType<typeof s.world>>;
const homeGames = (world: World, program: string, season: string) =>
  world.entities.game.filter((game) => game.seasonId === season && game.program === program && game.homeTeamId === `drexel-${program}`);

await s.run(async () => {
  const alex = await s.operator('alex', 'data');
  await s.shoot(alex, 'data-page');
  const before = await s.world();
  const schoolsBefore = new Set(before.entities.school.map((school) => school.id));
  const gamesBefore = (program: string, season: string) => homeGames(before, program, season).length;

  const mbb = await load(alex, "Men's Basketball", '2025-26');
  s.check(/rows? inserted/.test(mbb.text) && /Last season's rosters/.test(mbb.text) && /Widener/.test(mbb.text), "the MBB 2025-26 report counts rows, lists last season's rosters and names Widener's unplaced home game");
  let world = await s.world();
  s.check(world.revision > before.revision, `MBB 2025-26 committed (revision ${before.revision} to ${world.revision})`);
  const caa = fixtures.entities.teamSeason.filter((row: { id: string; conferenceId?: string }) => row.id.endsWith('-mbb@2025-26') && row.conferenceId === 'caa');
  const differ = caa.filter((expected: Row & { id: string }) => standing(world.entities.teamSeason.find((row) => row.id === expected.id)) !== standing(expected));
  s.check(caa.length === 13 && differ.length === 0, `the 2025-26 CAA table matches fixtures.json for ${caa.length - differ.length} of ${caa.length} teams`);
  const drexel = world.entities.teamSeason.find((row) => row.id === 'drexel-mbb@2025-26');
  s.log(`  drexel-mbb@2025-26: ${JSON.stringify(drexel)}`);
  s.check(drexel?.stats?.gp === 33 && drexel.stats.totals.pts === 2247 && drexel.stats.opponentPts === 2221, `Drexel's team stats: ${drexel?.stats?.gp} games, ${drexel?.stats?.totals.pts} points for, ${drexel?.stats?.opponentPts} against`);
  const reed = world.entities.player.find((row) => row.id === 'drexel-mbb@2025-26/reed-josh');
  const reedStats = world.entities.playerStats.find((row) => row.id === 'drexel-mbb@2025-26/reed-josh');
  s.log(`  Josh Reed: ${JSON.stringify(reed)} ${JSON.stringify(reedStats)}`);
  s.check(reed?.jersey === '5' && reed.sourceKey === 'espn:5239623' && reedStats?.stats.gp === 33 && reedStats.stats.totals.pts === 262, 'Josh Reed is #5, keyed espn:5239623, with 262 points in 33 games');
  const mbbGames = homeGames(world, 'mbb', '2025-26');
  const campbell = mbbGames.find((game) => game.id === '2025-26/2026-02-26/campbell-mbb.at.drexel-mbb');
  s.check(mbbGames.length === 15 && campbell?.startsAt === '2026-02-26T19:00:00-05:00', `Drexel MBB has ${mbbGames.length} home games in 2025-26; Campbell (00:00Z on Feb 27) starts ${campbell?.startsAt}`);
  s.log(`  World snapshot: ${(JSON.stringify(world).length / 1024).toFixed(0)} KB of JSON`);

  const again = await load(alex, "Men's Basketball", '2025-26');
  const unchanged = await s.world();
  s.check(/0 rows inserted/.test(again.text) && /0 rows updated/.test(again.text) && /Nothing changed/.test(again.text), 'the same load again reports nothing inserted or updated');
  s.check(unchanged.revision === world.revision, `the same load again leaves the revision at ${world.revision}`);

  await load(alex, "Women's Basketball", '2025-26');
  world = await s.world();
  const wbb = world.entities.teamSeason.find((row) => row.id === 'drexel-wbb@2025-26');
  s.log(`  drexel-wbb@2025-26: ${JSON.stringify(wbb)}`);
  s.check(wbb?.stats?.gp !== undefined && wbb.stats.gp > 0 && wbb.rank !== null, `Drexel WBB 2025-26 has a record and stats: ${standing(wbb)}, ${wbb?.stats?.gp} games`);
  s.check(homeGames(world, 'wbb', '2025-26').length === 13, `Drexel WBB has ${homeGames(world, 'wbb', '2025-26').length} home games in 2025-26`);

  const next = await load(alex, "Men's Basketball", '2026-27');
  s.check(/Team box scores not published/.test(next.text) && /rosters are last season's, copied forward/.test(next.text), 'MBB 2026-27 reports the box scores as not published and the copied rosters as stale');
  world = await s.world();
  const delaware = world.entities.teamSeason.find((row) => row.id === 'delaware-mbb@2026-27');
  const drexelNext = world.entities.teamSeason.find((row) => row.id === 'drexel-mbb@2026-27');
  s.check(delaware?.conferenceId === 'c-usa' && drexelNext?.conferenceId === 'caa', `2026-27 conferences: Delaware ${delaware?.conferenceId}, Drexel ${drexelNext?.conferenceId}`);
  const reedNext = world.entities.player.find((row) => row.id === 'drexel-mbb@2026-27/reed-josh');
  s.check(reedNext?.classYear === 'JR' && reedNext.sourceKey === null, `Drexel's stale 2026-27 roster is not loaded: Josh Reed stays the seed's ${reedNext?.classYear}, key ${reedNext?.sourceKey}`);
  s.log(`  Drexel MBB 2026-27 home games: ${gamesBefore('mbb', '2026-27')} seeded, ${homeGames(world, 'mbb', '2026-27').length} after the load`);

  const nextWbb = await load(alex, "Women's Basketball", '2026-27');
  s.check(/rosters are last season's, copied forward/.test(nextWbb.text), 'WBB 2026-27 reports the copied rosters as stale');
  world = await s.world();
  s.log(`  Drexel WBB 2026-27 home games: ${gamesBefore('wbb', '2026-27')} seeded, ${homeGames(world, 'wbb', '2026-27').length} after the load`);

  const added = world.entities.school.filter((school) => !schoolsBefore.has(school.id));
  s.log(`  new schools: ${added.map((school) => `${school.name} (${school.id}, ESPN ${school.espnId}, ${school.abbreviation})`).join('; ')}`);
  s.check(added.length === 8 && added.every((school) => school.espnId && school.logo?.startsWith('https://a.espncdn.com/')), `the loads add ${added.length} Division I schools teams.json lacks, each with its ESPN id and logo`);
  const drexelSchool = world.entities.school.find((school) => school.id === 'drexel');
  s.check(drexelSchool?.logo === before.entities.school.find((school) => school.id === 'drexel')?.logo, `Drexel keeps teams.json's logo: ${drexelSchool?.logo}`);
});
