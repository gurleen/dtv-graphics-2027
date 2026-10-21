/**
 * The phase gate's frame comparison: every graphic in the registry, one at a time, through
 * the real server and /renderer, against its phase 0 capture (the Rive CLI's render of the
 * scene's Default instance with `isPlaying` true, after 180 frames).
 *
 *   bun apps/renderer/scripts/compare.ts --baseline=<dir> [--port=8981] [--out=build/renderer/compare]
 *                                        [--runs=1] [--changes] [--data-images] [--only=<graphic id>]
 *
 * Each graphic airs its `demo` cue. Where a bound value still differs from the scene's
 * Default instance (the golden test lists each such drift), the slot is patched to the
 * scene's value, so the comparison measures the renderer and not the data. Images are
 * patched the same way, to the file the scene embeds, because the seed binds logos from
 * images.dragonstv.io; `--data-images` keeps the seed's. `--changes` also renders one small real change per
 * graphic in CHANGES, to show the gate catches it.
 *
 * The captures are opaque, drawn over the CLI's background colour, so the page draws over the
 * same colour (read from the capture's corner) and the browser does the compositing. A
 * pixel's delta is its largest channel difference, with colour premultiplied by alpha.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { first } from '@dtv/api';
import { type Cue, CueId, GraphicId, ShowId } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { type AnyGraphic, boundProps, CueRef, type LayerFrame, OperatorId, type WireValue } from '@dtv/playout';
import { PNG } from 'pngjs';
import { ROOT, type Rig, startRig, waitForLayer } from './harness';

/**
 * The gate: a render passes when no TILE x TILE tile holds more than `maxPixels` pixels over
 * `delta`. Measured on the scorebug and the player lower third: a correct render's densest
 * tile held 59 and 23 such pixels (glyph edges and the sponsor image, resampled differently by
 * the CLI and the browser); the smallest real change, a score one higher, held 229, and a
 * swapped watermark logo 310. 120 sits about halfway between, on a log scale.
 */
const GATE = { delta: 32, maxPixels: 120 } as const;

/** Small real changes, each set over the scene's values, for measuring what the gate must catch. */
const CHANGES: Readonly<Record<string, readonly ((defaults: Readonly<Record<string, WireValue>>) => Record<string, WireValue>)[]>> = {
  'basketball-v2/scorebug': [
    (defaults) => ({ homeScore: Number(defaults.homeScore) + 1 }),
    () => ({ period: '2ND HALF' }),
    // The team logo is a faint watermark behind the row: the lowest-contrast change a scorebug has.
    () => ({ homeLogo: '/assets/images/CAAWhite.png' }),
  ],
  'basketball-v2/player-lower-third': [() => ({ jerseyNumber: '3' }), () => ({ lastName: 'REID' })],
};

const DELTAS = [0, 8, 16, 32, 64, 128] as const;
const TILE = 40;
/** The capture is 180 frames at 60 fps after the scene starts. */
const CAPTURE_MS = 3000;

const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const port = Number(flag('port') ?? '8981');
const out = join(ROOT, flag('out') ?? 'build/renderer/compare');
const baseline = flag('baseline') ?? join(ROOT, 'build/baseline/before');
const runs = Number(flag('runs') ?? '1');
const only = flag('only');
const withChanges = process.argv.includes('--changes');
const dataImages = process.argv.includes('--data-images');
mkdirSync(out, { recursive: true });

const SHOW = ShowId.parse('drexel-sju');
const operator = OperatorId.parse('compare');

interface Measure {
  /** Pixels over each delta. */
  readonly over: Readonly<Record<number, number>>;
  /** For each delta, the most pixels over it in any one TILE x TILE tile: diffuse noise stays low, a changed glyph does not. */
  readonly densest: Readonly<Record<number, number>>;
  readonly max: number;
  /** Bounding box of the pixels over 32, or null. */
  readonly box: readonly [number, number, number, number] | null;
  /** The tiles with the most pixels over 32: `x,y` of the tile's corner and the count. */
  readonly tiles: readonly string[];
}

function measure(rendered: PNG, capture: PNG, diffPath: string): Measure {
  if (rendered.width !== capture.width || rendered.height !== capture.height) {
    throw new Error(`size ${rendered.width}x${rendered.height} against the capture's ${capture.width}x${capture.height}`);
  }
  const over: Record<number, number> = Object.fromEntries(DELTAS.map((delta) => [delta, 0]));
  const tiles = new Map<string, number>();
  const perTile = new Map<number, Map<string, number>>(DELTAS.map((delta) => [delta, new Map()]));
  const diff = new PNG({ width: rendered.width, height: rendered.height });
  let max = 0;
  let box: [number, number, number, number] | null = null;
  for (let y = 0; y < rendered.height; y++) {
    for (let x = 0; x < rendered.width; x++) {
      const i = (y * rendered.width + x) * 4;
      const a1 = rendered.data[i + 3]!;
      const a2 = capture.data[i + 3]!;
      let delta = Math.abs(a1 - a2);
      for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.round(Math.abs((rendered.data[i + c]! * a1 - capture.data[i + c]! * a2) / 255)));
      max = Math.max(max, delta);
      const tile = `${Math.floor(x / TILE) * TILE},${Math.floor(y / TILE) * TILE}`;
      for (const threshold of DELTAS) {
        if (delta <= threshold) continue;
        over[threshold]!++;
        const counts = perTile.get(threshold)!;
        counts.set(tile, (counts.get(tile) ?? 0) + 1);
      }
      // The capture dimmed, with each differing pixel coloured by its band: red over 128, orange over 64, yellow over 16.
      const band = delta > 128 ? [255, 0, 0] : delta > 64 ? [255, 128, 0] : delta > 16 ? [255, 255, 0] : null;
      for (let c = 0; c < 3; c++) diff.data[i + c] = band ? band[c]! : capture.data[i + c]! >> 2;
      diff.data[i + 3] = 255;
      if (delta > 32) {
        tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
      }
    }
  }
  writeFileSync(diffPath, PNG.sync.write(diff));
  const top = [...tiles].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tile, count]) => `${tile}:${count}`);
  const densest = Object.fromEntries(DELTAS.map((delta) => [delta, Math.max(0, ...perTile.get(delta)!.values())]));
  return { over, densest, max, box, tiles: top };
}

const passes = (m: Measure) => m.densest[GATE.delta]! <= GATE.maxPixels;

/** Each embedded image's file as the server serves it: `<ImageAsset name="Scorebug v2 Drexel" file="assets/images/scorebug/drexel.png"/>`. */
function sceneImages(entry: AnyGraphic): ReadonlyMap<string, string> {
  const rml = readFileSync(join(ROOT, 'graphics/basketball-v2', entry.scene.file), 'utf8');
  const files = new Map<string, string>();
  for (const tag of rml.matchAll(/<ImageAsset\b[^>]*>/g)) {
    const name = /\bname="([^"]+)"/.exec(tag[0])?.[1];
    const file = /\bfile="([^"]+)"/.exec(tag[0])?.[1];
    if (name && file) files.set(name, `/${file}`);
  }
  return files;
}

/** Bound values that differ from the scene's Default instance, set back to the scene's. */
function driftToScene(entry: AnyGraphic, frame: LayerFrame): Record<string, WireValue> {
  const kinds = boundProps(entry.scene);
  const images = sceneImages(entry);
  const patch: Record<string, WireValue> = {};
  for (const [name, value] of Object.entries(frame.values)) {
    let scene = entry.scene.defaults[name];
    if (kinds.get(name) === 'image') {
      if (dataImages) continue;
      const asset = String(scene).replace(/^asset:/, '');
      scene = images.get(asset);
      if (!scene) throw new Error(`${entry.scene.file} embeds no file for ${name}'s ${asset}`);
    }
    if (scene === undefined || scene === value) continue;
    patch[name] = scene;
  }
  return patch;
}

async function air(rig: Rig, entry: AnyGraphic, index: number): Promise<LayerFrame> {
  await rig.command({ type: 'clearAll' });
  await rig.settle({});
  const world = await first((signal) => rig.api.data.watch(undefined, { signal }));
  const show = world.entities.show.find((each) => each.id === SHOW)!;
  const cue: Cue = { id: CueId.parse(`compare-${index}`), graphic: GraphicId.parse(entry.id), params: entry.params.parse(entry.demo) as Record<string, unknown>, overrides: {}, note: '' };
  await rig.api.data.apply({ origin: 'manual', basis: world.revision, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown: [cue] } }] });
  await rig.command({ type: 'air', operator, ref: CueRef.parse({ kind: 'rundown', cue: cue.id }) });
  return waitForLayer(rig, entry.layer, (frame) => frame.graphic === entry.id);
}

/** Patches the on-air slot, waits for program to carry it, then for the page to show it as the capture would. */
async function settleAndShoot(rig: Rig, entry: AnyGraphic, frame: LayerFrame, overrides: Record<string, WireValue>, path: string): Promise<PNG> {
  if (Object.keys(overrides).length) {
    await rig.command({ type: 'patch', layer: entry.layer, slot: frame.slot, overrides });
    await waitForLayer(rig, entry.layer, (next) => Object.entries(overrides).every(([name, value]) => next.values[name] === value));
  }
  await rig.settle({ [entry.layer]: 'on' });
  // `on` arrives an Intro's length after isPlaying; the capture is CAPTURE_MS after it.
  await rig.page.waitForTimeout(Math.max(0, CAPTURE_MS - (entry.scene.animations.Intro ?? 0)));
  return rig.screenshot(path);
}

const entries = Object.values(GRAPHICS as Readonly<Record<string, AnyGraphic>>)
  .filter((entry) => !only || entry.id === only)
  .sort((a, b) => a.id.localeCompare(b.id));
const report: Record<string, unknown>[] = [];
const rig = await startRig({ port });
try {
  await rig.command({ type: 'activate', show: SHOW });
  const backgrounds = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const stem = entry.scene.file.replace(/\.rml$/, '');
    const capture = PNG.sync.read(readFileSync(join(baseline, `${stem}.png`)));
    const background = `rgb(${capture.data[0]}, ${capture.data[1]}, ${capture.data[2]})`;
    if (!backgrounds.has(background)) {
      backgrounds.add(background);
      await rig.page.addStyleTag({ content: `html, body { background: ${background} !important; }` });
    }
    const name = entry.id.replace('/', '_');
    for (let run = 1; run <= runs; run++) {
      const frame = await air(rig, entry, index);
      if (frame.error) throw new Error(`${entry.id}: ${frame.error}`);
      const patched = driftToScene(entry, frame);
      const images = Object.fromEntries(Object.entries(frame.values).filter(([key]) => boundProps(entry.scene).get(key) === 'image'));
      const rendered = await settleAndShoot(rig, entry, frame, patched, join(out, `${name}.run${run}.png`));
      const result = measure(rendered, capture, join(out, `${name}.run${run}.diff.png`));
      report.push({ graphic: entry.id, kind: 'correct', run, patched, images, ...result, pass: passes(result) });
      console.log(`${passes(result) ? 'pass' : 'FAIL'} ${entry.id} run ${run}: ${line(result)}${Object.keys(patched).length ? `  (set to the scene's: ${JSON.stringify(patched)})` : ''}`);

      for (const [which, change] of (withChanges ? (CHANGES[entry.id] ?? []) : []).entries()) {
        const changed = change(entry.scene.defaults);
        const live = await waitForLayer(rig, entry.layer, (next) => next.slot === frame.slot);
        const shot = await settleAndShoot(rig, entry, live, { ...patched, ...changed }, join(out, `${name}.change${which + 1}.run${run}.png`));
        const caught = measure(shot, capture, join(out, `${name}.change${which + 1}.run${run}.diff.png`));
        report.push({ graphic: entry.id, kind: 'change', run, change: changed, ...caught, caught: !passes(caught) });
        console.log(`${passes(caught) ? 'MISS' : 'caught'} ${entry.id} change ${JSON.stringify(changed)} run ${run}: ${line(caught)}`);
      }
    }
  }
} finally {
  await rig.close();
}

function line(m: Measure) {
  const over = DELTAS.map((delta) => `>${delta}:${m.over[delta]}`).join(' ');
  const densest = DELTAS.map((delta) => `>${delta}:${m.densest[delta]}`).join(' ');
  return `over ${over} | densest tile ${densest} | max ${m.max} box ${m.box ? m.box.join(',') : '-'} tiles ${m.tiles.join(' ')}`;
}

writeFileSync(join(out, 'report.json'), `${JSON.stringify({ gate: GATE, baseline, report }, null, 2)}\n`);
const failed = report.filter((row) => row.kind === 'correct' && !row.pass).length;
const missed = report.filter((row) => row.kind === 'change' && !row.caught).length;
console.log(`\n${failed} of ${report.filter((row) => row.kind === 'correct').length} renders over the gate (a ${TILE} px tile with more than ${GATE.maxPixels} pixels over delta ${GATE.delta}); ${missed} changes missed. Report: ${join(out, 'report.json')}`);
process.exit(failed || missed ? 1 : 0);
