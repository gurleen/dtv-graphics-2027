/**
 * Runs a short show through the real server and screenshots /renderer at each settled state:
 * the scorebug aired, a player lower third taken through preview, the score changed, the page
 * reloaded mid-show, and everything cleared. Exits 1 if any state is not what the page shows.
 *
 *   bun run riv:build && bun apps/renderer/scripts/drive.ts [--port=8981] [--out=build/renderer/drive]
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { first } from '@dtv/api';
import { GameId, PlayerId, ShowId, SourceId } from '@dtv/domain';
import { cueOf } from '@dtv/graphics';
import { CueRef, OperatorId } from '@dtv/playout';
import { PNG } from 'pngjs';
import { pageLayers, ROOT, startRig, waitForLayer, waitLive } from './harness';

const flag = (name: string, fallback: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = Number(flag('port', '8981'));
const out = join(ROOT, flag('out', 'build/renderer/drive'));
mkdirSync(out, { recursive: true });

const SHOW = ShowId.parse('drexel-sju');
const GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const operator = OperatorId.parse('gate');
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

/** Fraction of the region's pixels that draw anything. */
const coverage = (png: { width: number; data: Uint8Array }, region: { x: number; y: number; w: number; h: number }) => {
  let drawn = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) if (png.data[(y * png.width + x) * 4 + 3]! > 0) drawn++;
  }
  return drawn / (region.w * region.h);
};
// Where each graphic draws: the scorebug bottom left, the lower third beside it.
const BUG = { x: 0, y: 850, w: 540, h: 230 };
const LOWER = { x: 540, y: 850, w: 1380, h: 230 };
const ALL = { x: 0, y: 0, w: 1920, h: 1080 };

const rig = await startRig({ port });
try {
  const shot = async (name: string) => {
    const png = await rig.screenshot(join(out, `${name}.png`));
    const bug = coverage(png, BUG);
    const lower = coverage(png, LOWER);
    const all = coverage(png, ALL);
    console.log(`     ${name}.png  drawn: scorebug region ${(bug * 100).toFixed(1)}%, lower third region ${(lower * 100).toFixed(1)}%, frame ${(all * 100).toFixed(1)}%`);
    return { png, bug, lower, all };
  };

  await rig.command({ type: 'activate', show: SHOW });
  const empty = await shot('0-empty');
  check(empty.all === 0, 'an empty program draws nothing');

  await rig.command({ type: 'air', operator, ref: CueRef.parse({ kind: 'free', graphic: 'basketball-v2/scorebug' }) });
  await rig.settle({ bug: 'on' });
  const bug = await shot('1-scorebug');
  check(bug.bug > 0.3 && bug.lower === 0, 'the scorebug draws, and nothing where the lower third goes');

  const world = await first((signal) => rig.api.data.watch(undefined, { signal }));
  const show = world.entities.show.find((each) => each.id === SHOW)!;
  const reed = cueOf('basketball-v2/player-lower-third', { player: PlayerId.parse('drexel-mbb@2026-27/reed-josh') }, { id: 'reed' });
  await rig.api.data.apply({ origin: 'manual', basis: world.revision, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown: [reed] } }] });
  await rig.command({ type: 'cue', operator, ref: CueRef.parse({ kind: 'rundown', cue: 'reed' }) });
  const previewOnly = await shot('2-lower-third-in-preview');
  check(previewOnly.lower === 0, 'a cue in preview does not reach program');
  const previewPage = await rig.open(`/renderer?bus=preview&operator=${operator}`);
  await previewPage.waitForFunction(`dtvRenderer.layers().lower.phase === 'on' && dtvRenderer.layers().bug.phase === 'empty'`);
  const preview = PNG.sync.read(await previewPage.screenshot({ omitBackground: true, path: join(out, '2b-preview-bus.png') }));
  check(coverage(preview, LOWER) > 0.3 && coverage(preview, BUG) === 0, `/renderer?bus=preview&operator=${operator} draws that preview: the lower third alone`);
  await previewPage.close();
  await rig.command({ type: 'take', operator });
  await rig.settle({ bug: 'on', lower: 'on' });
  const both = await shot('3-lower-third-taken');
  check(both.bug === bug.bug && both.lower > 0.3, 'the lower third joins the scorebug');

  const before = (await rig.program()).layers.find((layer) => layer.layer === 'bug')!.values.homeScore;
  await rig.api.game.apply({ sport: 'basketball', gameId: GAME, source: SourceId.parse('operator'), commands: [{ type: 'score', side: 'home', value: Number(before) + 3 }] });
  await waitForLayer(rig, 'bug', (frame) => frame.values.homeScore === Number(before) + 3);
  await rig.page.waitForTimeout(500);
  const scored = await shot('4-score-changed');
  check(difference(both.png, scored.png, BUG).count > 0 && difference(both.png, scored.png, LOWER).count === 0, 'the score change redraws the scorebug only');

  // The page is never perfectly still: measure how much it differs from itself before judging the reload.
  await rig.page.waitForTimeout(1000);
  const still = await shot('4b-score-changed-a-second-later');
  const drift = difference(scored.png, still.png, ALL);
  console.log(`     a second apart, unchanged: ${drift.count} pixels differ, max channel delta ${drift.max}`);
  const layersBefore = await pageLayers(rig.page);
  await rig.page.reload();
  await waitLive(rig.page);
  await rig.settle({ bug: 'on', lower: 'on' });
  const reloaded = await shot('5-reloaded');
  const layersAfter = await pageLayers(rig.page);
  const across = difference(still.png, reloaded.png, ALL);
  console.log(`     before reload: ${layersBefore}\n     after reload:  ${layersAfter}\n     across the reload: ${across.count} pixels differ, max channel delta ${across.max}`);
  check(layersBefore === layersAfter, 'after a reload the page holds the same slots in the same phases');
  check(across.max <= Math.max(drift.max, 0), 'after a reload the page differs from before no more than it differs from itself');

  await rig.command({ type: 'clearAll' });
  await rig.settle({});
  const cleared = await shot('6-cleared');
  check(cleared.all === 0, 'clear all leaves nothing drawn');

} finally {
  await rig.close();
}

/** Pixels in `region` whose channels differ, and the largest channel delta. */
function difference(a: { width: number; data: Uint8Array }, b: { data: Uint8Array }, region: { x: number; y: number; w: number; h: number }) {
  let count = 0;
  let max = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = (y * a.width + x) * 4;
      let delta = 0;
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c]! - b.data[i + c]!));
      if (delta > 0) count++;
      max = Math.max(max, delta);
    }
  }
  return { count, max };
}

console.log(failures.length ? `\n${failures.length} failed` : `\nall states hold; screenshots in ${out}`);
process.exit(failures.length ? 1 : 0);
