#!/usr/bin/env bun
/**
 * The Tools page's StatCrew tab: alex opens #/tools, points the feed at a generated box score for the seeded
 * game, starts it, and sees Running, the log, and the score on the game over the API with statcrew as the
 * authority. A missing file shows NO_FILE inline. Stop shows Stopped and hands authority back to the operator.
 * Screenshots go to build/controller/tools/ as well as the evidence folder.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/tools.ts --port=8998
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexWorld } from '../../../../packages/domain/src';
import { boxScore } from '../../../../packages/live-statcrew/scripts/box-score';
import { ROOT, session } from '../scripts/lib';

const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
const SHOTS = join(ROOT, 'build/controller/tools');
mkdirSync(SHOTS, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'tools-journey-'));
const file = join(dir, 'game.xml');
const s = await session('tools');

await s.run(async () => {
  const world = indexWorld(await s.world());
  const game = world.get('game', GAME as never)!;
  const rosters = { away: world.roster(game.awayTeamId, game.seasonId), home: world.roster(game.homeTeamId, game.seasonId) };
  writeFileSync(file, boxScore(rosters, { away: 61, home: 70 }, 0));

  const alex = await s.operator('alex', 'show');
  const shoot = async (name: string) => {
    await s.shoot(alex, name);
    await alex.screenshot({ path: join(SHOTS, `${name}.png`) });
  };
  const authority = async () => {
    const live = await s.live(GAME);
    return live.sport === 'basketball' ? { score: live.score, authority: live.authority } : null;
  };

  await alex.getByRole('link', { name: 'Tools' }).click();
  await alex.waitForURL(/#\/tools$/);
  const tab = alex.getByRole('tab', { name: 'StatCrew' });
  await tab.waitFor();
  s.check((await tab.getAttribute('aria-selected')) === 'true', 'the StatCrew tab is selected in the sidebar at #/tools');
  s.check((await alex.getByRole('tablist', { name: 'Tools' }).getAttribute('aria-orientation')) === 'vertical', 'the tab list is vertical');
  await alex.goto(`${s.origin}/#/tools/statcrew`);
  s.check((await tab.getAttribute('aria-selected')) === 'true', 'the deep link #/tools/statcrew selects the tab');
  await alex.getByRole('status').filter({ hasText: 'Stopped' }).waitFor();
  await shoot('stopped-initial');

  const start = alex.getByRole('button', { name: /^(Start|Restart)$/ });
  const stop = alex.getByRole('button', { name: 'Stop' });
  await alex.getByLabel('File').fill(join(dir, 'missing.xml'));
  await alex.getByRole('button', { name: /Game/ }).click();
  await alex.getByRole('option', { name: /Saint Joseph's at Drexel/ }).click();
  await start.click();
  await alex.getByRole('alert').filter({ hasText: 'No file at that path' }).waitFor();
  s.check(true, 'a missing file shows the NO_FILE message inline');
  await shoot('error-no-file');

  await alex.getByLabel('File').fill(file);
  s.check((await alex.getByRole('alert').count()) === 0, 'editing the file clears the error');
  await start.click();
  await alex.getByRole('status').filter({ hasText: /Running since \d\d:\d\d:\d\d/ }).waitFor();
  await s.until('the log shows the first push', () => alex.getByRole('log', { name: 'StatCrew log' }).innerText(), (text) => /handed score and stats to statcrew/.test(text));
  await s.until('the game has the file score and statcrew authority', authority, (live) => live?.score.home === 70 && live.authority.score === 'statcrew' && live.authority.stats === 'statcrew');
  s.check((await authority())?.authority.clock === 'operator', 'the clock stays with the operator');
  s.check(await stop.isEnabled(), 'Stop is enabled while running');
  s.check((await start.isDisabled()), 'Start is disabled while running the same values');
  await shoot('running');

  await alex.reload();
  await alex.getByRole('status').filter({ hasText: /Running since/ }).waitFor();
  s.check((await alex.getByLabel('File').inputValue()) === file, 'after a reload the form shows the running file');

  await stop.click();
  await alex.getByRole('status').filter({ hasText: 'Stopped' }).waitFor();
  await s.until('authority is back with the operator', authority, (live) => live?.authority.score === 'operator' && live.authority.stats === 'operator');
  s.check((await authority())?.score.home === 70, 'handing back keeps the score');
  await s.until('the log shows the handback', () => alex.getByRole('log', { name: 'StatCrew log' }).innerText(), (text) => /handed score and stats to operator/.test(text));
  await shoot('stopped');
  rmSync(dir, { recursive: true, force: true });
});
