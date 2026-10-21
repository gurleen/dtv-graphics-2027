/**
 * The renderer's special cases, each run through the real server and /renderer in Chromium:
 * step transitions, Score to Break's frozen side and exit signal, the motion headshot, a
 * reload past step 0, two renderers on one page, and rapid takes. Screenshots are named with
 * their time after the command they follow; each layer's phase changes print the same way.
 * Exits 1 if any check fails.
 *
 *   bun run riv:build && bun apps/renderer/scripts/proofs.ts [--port=8986] [--only=steps,exit,...]
 *                                                            [--out=build/renderer/proofs]
 */

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { first } from '@dtv/api';
import { type Cue, PlayerId, ShowId, type Url } from '@dtv/domain';
import { cueOf } from '@dtv/graphics';
import { CueRef, type LayerFrame, type LayerId, OperatorId, type SlotId } from '@dtv/playout';
import type { Page } from 'playwright';
import { PNG } from 'pngjs';
import { ROOT, type Rig, startRig, waitForLayer, waitLive } from './harness';
import { serveMonitors } from './monitors/serve';

const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const port = Number(flag('port') ?? '8986');
const out = join(ROOT, flag('out') ?? 'build/renderer/proofs');
const only = flag('only')?.split(',');

const SHOW = ShowId.parse('drexel-sju');
const operator = OperatorId.parse('proof');
const REED = PlayerId.parse('drexel-mbb@2026-27/reed-josh');
const MOTION_CLIP = '/assets/proofs/motion-headshot.webm';

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
const FRAME: Region = { x: 0, y: 0, w: 1920, h: 1080 };
const LOWER: Region = { x: 0, y: 700, w: 1920, h: 380 };
/** The lower band right of the scorebug. */
const BESIDE_BUG: Region = { x: 540, y: 700, w: 1380, h: 380 };
/** Score to Break's block, bottom-left or mirrored bottom-right. */
const STB_LEFT: Region = { x: 96, y: 794, w: 432, h: 228 };
const STB_RIGHT: Region = { x: 1392, y: 794, w: 432, h: 228 };
/** The feature lower thirds' headshot frame, from the entry's overlay. */
const HEADSHOT: Region = { x: 268, y: 718, w: 212, h: 304 };

const AWAY_RED = [0xc2, 0x07, 0x1b] as const;
const HOME_NAVY = [0x07, 0x29, 0x4d] as const;
/** The motion clip's fill. */
const CLIP_GREEN = [0x00, 0xe0, 0x60] as const;

function coverage(png: PNG, region: Region): number {
  let drawn = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) if (png.data[(y * png.width + x) * 4 + 3]! > 0) drawn++;
  }
  return drawn / (region.w * region.h);
}

/** Fraction of the region's pixels, opaque and within `tolerance` of `rgb` on every channel. */
function share(png: PNG, region: Region, rgb: readonly [number, number, number], tolerance = 24): number {
  let near = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3]! < 200) continue;
      if (rgb.every((value, c) => Math.abs(png.data[i + c]! - value) <= tolerance)) near++;
    }
  }
  return near / (region.w * region.h);
}

/** Pixels whose channels differ by more than `delta`, and the largest delta. */
function difference(a: PNG, b: PNG, region: Region, delta = 0) {
  let count = 0;
  let max = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = (y * a.width + x) * 4;
      let d = 0;
      for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a.data[i + c]! - b.data[i + c]!));
      if (d > delta) count++;
      max = Math.max(max, d);
    }
  }
  return { count, max };
}

const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

/**
 * Records every change of a layer's phase, slot, step or animation on the page, each frame,
 * with Date.now() so it lines up with the driver's clock.
 */
const RECORDER = `(() => {
  window.dtvLog = [];
  let last = {};
  const tick = () => {
    for (const [layer, state] of Object.entries(dtvRenderer.layers())) {
      const slot = state.frame ? state.frame.slot.slice(0, 8) : '-';
      const asked = state.frame ? state.frame.step : null;
      const key = [state.phase, slot, state.written ? state.written.step : '', asked, state.animation ?? ''].join(' ');
      if (last[layer] !== key) {
        last[layer] = key;
        dtvLog.push({ t: Date.now(), layer, phase: state.phase, slot, step: state.written ? state.written.step : null, asked, animation: state.animation ?? null });
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
})()`;

interface LogEntry {
  readonly t: number;
  readonly layer: LayerId;
  readonly phase: string;
  readonly slot: string;
  /** The step written to the instance, and the step program's frame asks for. */
  readonly step: number | null;
  readonly asked: number | null;
  readonly animation: string | null;
}

const record = (page: Page) => page.evaluate(RECORDER);
const logSince = async (page: Page, t0: number): Promise<LogEntry[]> =>
  ((await page.evaluate('dtvLog')) as LogEntry[]).filter((entry) => entry.t >= t0);
const printLog = (entries: readonly LogEntry[], t0: number, layer: LayerId) => {
  for (const entry of entries.filter((each) => each.layer === layer)) {
    console.log(`       +${String(entry.t - t0).padStart(5)} ms  ${layer} ${entry.phase}${entry.animation ? ` (${entry.animation})` : ''}${entry.step === null ? '' : ` step ${entry.step}`}${entry.step !== null && entry.asked !== null && entry.asked !== entry.step ? ` (program asks for step ${entry.asked})` : ''}  ${entry.slot}`);
  }
};
/** When the layer first reached `phase` (and `animation`, if named) at or after t0, relative to t0. */
const when = (entries: readonly LogEntry[], t0: number, layer: LayerId, phase: string, animation?: string) => {
  const found = entries.find((entry) => entry.layer === layer && entry.phase === phase && (animation === undefined || entry.animation === animation));
  return found ? found.t - t0 : null;
};

/** Screenshots under one proof's directory, named with their time after the last `mark`. */
function camera(rig: Rig, proof: string) {
  const dir = join(out, proof);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let shots = 0;
  let t0 = Date.now();
  return {
    dir,
    mark() {
      t0 = Date.now();
      return t0;
    },
    /** Waits until `ms` after the mark, if given, then takes the shot. */
    async shot(name: string, ms?: number, page: Page = rig.page) {
      if (ms !== undefined) await Bun.sleep(Math.max(0, t0 + ms - Date.now()));
      const at = Date.now() - t0;
      const file = join(dir, `${String(++shots).padStart(2, '0')}-${name}${ms === undefined ? '' : `+${at}ms`}.png`);
      const png = PNG.sync.read(await page.screenshot({ omitBackground: true, type: 'png', path: file }));
      return { png, at, file };
    },
  };
}

async function world(rig: Rig) {
  return first((signal) => rig.api.data.watch(undefined, { signal }));
}

async function setRundown(rig: Rig, rundown: readonly Cue[]) {
  const snapshot = await world(rig);
  const show = snapshot.entities.show.find((each) => each.id === SHOW)!;
  await rig.api.data.apply({ origin: 'manual', basis: snapshot.revision, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown: [...rundown] } }] });
}

async function setMotionHeadshot(rig: Rig, url: string | null) {
  const snapshot = await world(rig);
  const reed = snapshot.entities.player.find((each) => each.id === REED)!;
  await rig.api.data.apply({ origin: 'manual', basis: snapshot.revision, edits: [{ op: 'put', kind: 'player', value: { ...reed, motionHeadshot: url as Url | null } }] });
}

const rundownRef = (cue: string) => CueRef.parse({ kind: 'rundown', cue });

async function reset(rig: Rig) {
  await rig.command({ type: 'clearAll' });
  await rig.settle({});
}

/** Cue then take a rundown cue; returns the program frame once its slot is on air. */
async function take(rig: Rig, cue: string, layer: LayerId, not?: SlotId): Promise<LayerFrame> {
  await rig.command({ type: 'cue', operator, ref: rundownRef(cue) });
  await rig.command({ type: 'take', operator });
  return waitForLayer(rig, layer, (frame) => frame.slot !== not);
}

const settleWhere = (rig: Rig, condition: string) => rig.page.waitForFunction(condition, null, { timeout: 20_000, polling: 16 });

// ---------------------------------------------------------------------------------------------

/** A stepped graphic: take, step to 1 and watch the transition, step past the end; then a step sent during the intro. */
async function stepped(rig: Rig, name: string, cue: Cue, layer: LayerId, transition: string, ms: { intro: number; transition: number }) {
  const cam = camera(rig, `steps-${name}`);
  await reset(rig);
  await setRundown(rig, [cue]);
  let t0 = cam.mark();
  const frame = await take(rig, cue.id, layer);
  await rig.settle({ [layer]: 'on' });
  const taken = await cam.shot('taken-at-step-0', ms.intro + 400);
  let log = await logSince(rig.page, t0);
  printLog(log, t0, layer);
  const awayAt0 = share(taken.png, LOWER, AWAY_RED);
  const homeAt0 = share(taken.png, LOWER, HOME_NAVY);
  console.log(`     step 0: away red ${pct(awayAt0)}, home navy ${pct(homeAt0)} of the lower band`);

  t0 = cam.mark();
  await rig.command({ type: 'step', layer, slot: frame.slot, to: 1 });
  const during = [await cam.shot('step-1-during', ms.transition * 0.3), await cam.shot('step-1-during', ms.transition * 0.6)];
  await settleWhere(rig, `dtvRenderer.layers().${layer}.phase === 'on' && dtvRenderer.layers().${layer}.written.step === 1`);
  const after = await cam.shot('step-1-after', ms.transition + 300);
  log = await logSince(rig.page, t0);
  printLog(log, t0, layer);
  const entered = when(log, t0, layer, 'entering', transition);
  const landed = log.find((entry) => entry.layer === layer && entry.phase === 'on' && entry.step === 1);
  const length = entered !== null && landed ? landed.t - t0 - entered : null;
  check(entered !== null && length !== null && Math.abs(length - ms.transition) < 120, `${name}: step 1 enters "${transition}" for ${length} ms (the timeline is ${ms.transition} ms)`);
  const awayAt1 = share(after.png, LOWER, AWAY_RED);
  const homeAt1 = share(after.png, LOWER, HOME_NAVY);
  console.log(`     during: ${during.map((shot) => `+${shot.at} ms away ${pct(share(shot.png, LOWER, AWAY_RED))} home ${pct(share(shot.png, LOWER, HOME_NAVY))}`).join(', ')}`);
  console.log(`     step 1: away red ${pct(awayAt1)}, home navy ${pct(homeAt1)} of the lower band`);
  const changed = difference(taken.png, after.png, LOWER, 64).count;
  check(changed > 1000, `${name}: step 1 redraws the graphic (${changed} pixels over delta 64)`);

  t0 = cam.mark();
  await rig.command({ type: 'step', layer, slot: frame.slot, to: 2 });
  await settleWhere(rig, `dtvRenderer.layers().${layer}.phase === 'empty'`);
  const gone = await cam.shot('step-2-off-air', 600);
  log = await logSince(rig.page, t0);
  printLog(log, t0, layer);
  check(coverage(gone.png, FRAME) === 0 && when(log, t0, layer, 'leaving') !== null, `${name}: step 2 plays the outro and leaves nothing drawn`);

  // A step sent during the intro waits for it, then plays.
  t0 = cam.mark();
  const again = await take(rig, cue.id, layer, frame.slot);
  await settleWhere(rig, `dtvRenderer.layers().${layer}.phase === 'entering'`);
  const stepSent = Date.now() - t0;
  await rig.command({ type: 'step', layer, slot: again.slot, to: 1 });
  const midIntro = await cam.shot('retake-step-sent-during-intro', stepSent + 300);
  await settleWhere(rig, `dtvRenderer.layers().${layer}.phase === 'on' && dtvRenderer.layers().${layer}.written.step === 1`);
  const final = await cam.shot('retake-after-held-step', ms.intro + ms.transition + 1200);
  log = await logSince(rig.page, t0);
  printLog(log, t0, layer);
  const introAt = when(log, t0, layer, 'entering', 'Intro');
  const transitionAt = when(log, t0, layer, 'entering', transition);
  console.log(`     step sent +${stepSent} ms; intro from +${introAt} ms; "${transition}" from +${transitionAt} ms`);
  check(
    introAt !== null && transitionAt !== null && stepSent < transitionAt && Math.abs(transitionAt - introAt - ms.intro) < 120,
    `${name}: a step sent during the intro (+${stepSent} ms) waits for the intro to land (+${introAt === null ? '?' : introAt + ms.intro} ms), then plays "${transition}" (+${transitionAt} ms)`,
  );
  check(difference(midIntro.png, taken.png, LOWER).count > 0 && difference(final.png, after.png, LOWER, 64).count < 200, `${name}: after the held step it settles on the same picture as step 1 (${difference(final.png, after.png, LOWER, 64).count} pixels over delta 64)`);
  return { taken, after };
}

async function provesSteps(rig: Rig) {
  await stepped(rig, 'starting-five', cueOf('basketball-v2/starting-five', {}, { id: 'starting-five' }), 'lower', 'Away To Home', { intro: 1400, transition: 1000 });
  await stepped(
    rig,
    'halftime-adjustments',
    cueOf('basketball-v2/halftime-adjustments', { adjustments: { away: ['Push the pace in transition', 'Limit second-chance points'], home: ['Attack the paint early', 'Close out on three-point shooters'] } }, { id: 'halftime' }),
    'bug',
    'Away To Home',
    { intro: 1200, transition: 800 },
  );

  // Burning Question: the question, then Next reveals the answer; a fresh take starts at the question.
  const cam = camera(rig, 'steps-burning-question');
  await reset(rig);
  const cue = cueOf('basketball-v2/burning-question', { question: 'Who scored 1000 points in the 2013 WNIT final?', answer: 'Taylor Wootton', team: 'drexel-wbb' }, { id: 'burning' });
  await setRundown(rig, [cue]);
  let t0 = cam.mark();
  const frame = await take(rig, 'burning', 'lower');
  await rig.settle({ lower: 'on' });
  const question = await cam.shot('question', 1200 + 400);
  t0 = cam.mark();
  await rig.command({ type: 'step', layer: 'lower', slot: frame.slot, to: 1 });
  const during = await cam.shot('answer-reveal-during', 300);
  await settleWhere(rig, `dtvRenderer.layers().lower.phase === 'on' && dtvRenderer.layers().lower.written.step === 1`);
  const answer = await cam.shot('answer', 600 + 400);
  let log = await logSince(rig.page, t0);
  printLog(log, t0, 'lower');
  const reveal = when(log, t0, 'lower', 'entering', 'Answer Reveal');
  const revealed = difference(question.png, answer.png, LOWER, 64).count;
  check(reveal !== null && revealed > 1000, `burning-question: Next plays "Answer Reveal" (+${reveal} ms) and the answer appears (${revealed} pixels over delta 64)`);
  console.log(`     mid-reveal +${during.at} ms differs from the question by ${difference(question.png, during.png, LOWER, 64).count} pixels`);

  await rig.command({ type: 'clear', layer: 'lower' });
  await rig.settle({});
  t0 = cam.mark();
  await take(rig, 'burning', 'lower', frame.slot);
  await rig.settle({ lower: 'on' });
  const fresh = await cam.shot('fresh-take', 1200 + 400);
  log = await logSince(rig.page, t0);
  printLog(log, t0, 'lower');
  const vsQuestion = difference(question.png, fresh.png, LOWER, 64).count;
  check(vsQuestion < 200 && log.every((entry) => entry.layer !== 'lower' || entry.step !== 1), `burning-question: a fresh take starts at the question (${vsQuestion} pixels over delta 64 from the first take)`);
}

/** Score to Break: the side is frozen on air, the exit waits for `_onScreen`, and the next take enters on its new side. */
async function provesScoreToBreak(rig: Rig) {
  const cam = camera(rig, 'score-to-break');
  await reset(rig);
  let t0 = cam.mark();
  const exits: string[] = [];
  const onConsole = (message: { text(): string }) => {
    if (message.text().includes('let go')) exits.push(`+${Date.now() - t0} ms  ${message.text()}`);
  };
  rig.page.on('console', onConsole);
  await setRundown(rig, [cueOf('basketball-v2/score-to-break', { side: 'left' }, { id: 'stb' })]);
  t0 = cam.mark();
  await rig.command({ type: 'air', operator, ref: rundownRef('stb') });
  const left = await waitForLayer(rig, 'bug', (frame) => frame.graphic === 'basketball-v2/score-to-break');
  await rig.settle({ bug: 'on' });
  const aired = await cam.shot('aired-left', 1200 + 400);
  check(coverage(aired.png, STB_LEFT) > 0.3 && coverage(aired.png, STB_RIGHT) === 0, `score-to-break: aired with side left draws bottom-left (${pct(coverage(aired.png, STB_LEFT))}) and nothing bottom-right`);

  await setRundown(rig, [cueOf('basketball-v2/score-to-break', { side: 'right' }, { id: 'stb' })]);
  t0 = cam.mark();
  await rig.command({ type: 'refresh', layer: 'bug', slot: left.slot });
  const refreshed = await waitForLayer(rig, 'bug', (frame) => frame.values.alignRight === true);
  check(refreshed.slot === left.slot, 'score-to-break: refresh keeps the slot and the program frame now says alignRight true');
  const held = await cam.shot('refreshed-to-right-on-air', 1500);
  const written = (await rig.page.evaluate('dtvRenderer.layers().bug.written.values.alignRight')) as boolean;
  check(
    written === false && coverage(held.png, STB_LEFT) > 0.3 && coverage(held.png, STB_RIGHT) === 0 && difference(aired.png, held.png, STB_LEFT, 64).count < 200,
    `score-to-break: on air it stays left (renderer wrote alignRight ${written}; right block ${pct(coverage(held.png, STB_RIGHT))})`,
  );

  await rig.page.evaluate(`window.dtvDrawn = []; (() => {
    const canvas = document.querySelector('[data-layer=bug] canvas');
    const context = canvas.getContext('2d');
    const scale = canvas.width / 1920;
    const tick = () => {
      if (!canvas.isConnected) return dtvDrawn.push({ t: Date.now(), drawn: -1, alpha: 0 });
      let drawn = 0;
      let alpha = 0;
      const data = context.getImageData(96 * scale, 794 * scale, 432 * scale, 228 * scale).data;
      for (let i = 3; i < data.length; i += 4 * 7) {
        if (data[i] > 0) drawn++;
        alpha = Math.max(alpha, data[i]);
      }
      dtvDrawn.push({ t: Date.now(), drawn, alpha });
      requestAnimationFrame(tick);
    };
    tick();
  })()`);
  t0 = cam.mark();
  await rig.command({ type: 'clear', layer: 'bug', slot: left.slot });
  const outro = [await cam.shot('clear-outro', 150), await cam.shot('clear-outro', 300)];
  await rig.settle({});
  const cleared = await cam.shot('cleared', 1600);
  const log = await logSince(rig.page, t0);
  printLog(log, t0, 'bug');
  const drawn = (await rig.page.evaluate('dtvDrawn')) as { t: number; drawn: number; alpha: number }[];
  /** The last frame the canvas showed before the layer removed it. */
  const finalFrame = drawn.filter((sample) => sample.drawn >= 0).at(-1);
  const emptyAt = when(log, t0, 'bug', 'empty');
  console.log(`     the bug canvas, sampled each frame from +250 ms (ms: pixels drawn / most opaque, -1 once removed): ${drawn.filter((sample) => sample.t - t0 >= 250).map((sample) => `${sample.t - t0}: ${sample.drawn}/${sample.alpha}`).join(', ')}`);
  console.log(`     outro shots: ${outro.map((shot) => `+${shot.at} ms left ${pct(coverage(shot.png, STB_LEFT))}`).join(', ')}`);
  for (const line of exits) console.log(`     page: ${line}`);
  check(
    emptyAt !== null && finalFrame !== undefined && finalFrame.alpha <= 8 && exits.length === 1 && exits[0]!.includes('_onScreen reading 0'),
    `score-to-break: the layer let go (+${emptyAt} ms) on _onScreen reading 0, with the outro faded out (its last frame's most opaque pixel ${finalFrame?.alpha} of 255)`,
  );
  check(coverage(cleared.png, FRAME) === 0, 'score-to-break: nothing drawn after the clear');

  t0 = cam.mark();
  await rig.command({ type: 'air', operator, ref: rundownRef('stb') });
  await waitForLayer(rig, 'bug', (frame) => frame.slot !== left.slot);
  await rig.settle({ bug: 'on' });
  const right = await cam.shot('aired-again-right', 1200 + 400);
  check(coverage(right.png, STB_RIGHT) > 0.3 && coverage(right.png, STB_LEFT) === 0, `score-to-break: aired again it enters bottom-right (${pct(coverage(right.png, STB_RIGHT))}) and nothing bottom-left`);
  rig.page.off('console', onConsole);
}

/** Writes a short looping green clip with a moving white bar, recorded from a canvas in Chromium. */
async function ensureMotionClip(rig: Rig) {
  const file = Bun.file(join(ROOT, MOTION_CLIP.slice(1)));
  if (await file.exists()) return;
  const page = await rig.page.context().browser()!.newPage();
  const base64 = (await page.evaluate(`new Promise((resolve) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 424, height: 608 });
    const context = canvas.getContext('2d');
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 400000 });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = async () => {
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      let text = '';
      for (const byte of bytes) text += String.fromCharCode(byte);
      resolve(btoa(text));
    };
    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 2000;
      context.fillStyle = 'rgb(0, 224, 96)';
      context.fillRect(0, 0, 424, 608);
      context.fillStyle = '#fff';
      context.fillRect(0, (t % 1) * 608, 424, 40);
      if (t < 1) requestAnimationFrame(draw);
      else recorder.stop();
    };
    recorder.start();
    draw();
  })`)) as string;
  await page.close();
  const bytes = await Bun.write(file, Buffer.from(base64, 'base64'));
  console.log(`     wrote ${MOTION_CLIP} (${bytes} bytes)`);
}

/** Columns of `region` holding a pixel that passes `test`, as [first, last] relative to the region, or null. */
function extent(png: PNG, region: Region, test: (i: number) => boolean): [number, number] | null {
  let lo = -1;
  let hi = -1;
  for (let x = 0; x < region.w; x++) {
    for (let y = region.y; y < region.y + region.h; y++) {
      if (!test((y * png.width + region.x + x) * 4)) continue;
      if (lo < 0) lo = x;
      hi = x;
      break;
    }
  }
  return lo < 0 ? null : [lo, hi];
}
const opaque = (png: PNG) => (i: number) => png.data[i + 3]! > 128;
const green = (png: PNG) => (i: number) => png.data[i + 3]! > 128 && CLIP_GREEN.every((value, c) => Math.abs(png.data[i + c]! - value) <= 40);
const INTRO_AT = [150, 350, 600] as const;
const OUTRO_AT = [120, 260] as const;

/** Player To Watch with Reed's motion headshot: it shows in the frame with the intro and leaves with the outro; a missing file keeps the still. */
async function provesMotionHeadshot(rig: Rig) {
  const cam = camera(rig, 'motion-headshot');
  await reset(rig);
  await ensureMotionClip(rig);
  await setRundown(rig, [cueOf('basketball-v2/player-to-watch', { player: REED }, { id: 'ptw' })]);
  let slot: SlotId | undefined;

  /** Takes the cue, shoots the intro at INTRO_AT after `entering`, then on air, then clears and shoots the outro. */
  const run = async (label: string, onAir?: () => Promise<void>) => {
    let t0 = cam.mark();
    const frame = await take(rig, 'ptw', 'lower', slot);
    slot = frame.slot;
    await settleWhere(rig, `dtvRenderer.layers().lower.phase === 'entering'`);
    const entering = Date.now() - t0;
    const intro = [];
    for (const ms of INTRO_AT) intro.push(await cam.shot(`${label}-intro`, entering + ms));
    await rig.settle({ lower: 'on' });
    const on = await cam.shot(`${label}-on-air`, entering + 1400 + 400);
    printLog(await logSince(rig.page, t0), t0, 'lower');
    await onAir?.();
    t0 = cam.mark();
    await rig.command({ type: 'clear', layer: 'lower' });
    const outro = [];
    for (const ms of OUTRO_AT) outro.push(await cam.shot(`${label}-outro`, ms));
    await rig.settle({});
    const cleared = await cam.shot(`${label}-cleared`, 900);
    return { frame, entering, intro, on, outro, cleared };
  };

  await setMotionHeadshot(rig, null);
  const still = await run('still');

  await setMotionHeadshot(rig, MOTION_CLIP);
  let media: { readyState: number; paused: boolean; src: string } | null = null;
  let under: Awaited<ReturnType<typeof cam.shot>> | null = null;
  const clip = await run('clip', async () => {
    media = (await rig.page.evaluate(`(() => { const v = document.querySelector('[data-layer=lower] video'); return v && { readyState: v.readyState, paused: v.paused, src: v.getAttribute('src') }; })()`)) as typeof media;
    // What is under the clip: hide it for one shot.
    await rig.page.evaluate(`document.querySelector('[data-layer=lower] video').style.visibility = 'hidden'`);
    under = await cam.shot('clip-on-air-hidden-to-show-what-is-under-it');
    await rig.page.evaluate(`document.querySelector('[data-layer=lower] video').style.visibility = ''`);
  });
  check(clip.frame.media === MOTION_CLIP, `motion-headshot: the program frame carries the media ${clip.frame.media}`);
  const playing = media as { readyState: number; paused: boolean; src: string } | null;
  check(playing !== null && playing.readyState >= 2 && !playing.paused, `motion-headshot: a playing <video> of ${playing?.src} sits in the lower layer`);

  // The clip against the scene's own headshot frame at the same moments: the frame's drawn columns in the still take, the clip's in the clip take.
  const pairs = [...still.intro.map((shot, index) => ['intro', shot, clip.intro[index]!] as const), ['on air', still.on, clip.on] as const, ...still.outro.map((shot, index) => ['outro', shot, clip.outro[index]!] as const)];
  let worst = 0;
  for (const [phase, a, b] of pairs) {
    const scene = extent(a.png, HEADSHOT, opaque(a.png));
    const ours = extent(b.png, HEADSHOT, green(b.png));
    // One side drawing nothing is as far off as the other side is wide.
    const width = (columns: [number, number] | null) => (columns ? columns[1] - columns[0] + 1 : 0);
    const off = scene && ours ? Math.max(Math.abs(scene[0] - ours[0]), Math.abs(scene[1] - ours[1])) : width(scene ?? ours);
    worst = Math.max(worst, off);
    console.log(`     ${phase.padEnd(6)} still take +${a.at} ms frame columns ${scene ? scene.join('-') : 'none'}; clip take +${b.at} ms clip columns ${ours ? ours.join('-') : 'none'}; clip share ${pct(share(b.png, HEADSHOT, CLIP_GREEN, 40))}`);
  }
  check(share(clip.on.png, HEADSHOT, CLIP_GREEN, 40) > 0.6, `motion-headshot: on air the clip fills the headshot frame (${pct(share(clip.on.png, HEADSHOT, CLIP_GREEN, 40))})`);
  check(worst <= 40, `motion-headshot: the clip wipes in and out with the scene's own headshot frame (worst edge ${worst} px apart at the same moment)`);

  const hidden = difference(still.on.png, under!.png, HEADSHOT, 64).count;
  console.log(`     under the clip the headshot frame differs from the still take's by ${hidden} of ${HEADSHOT.w * HEADSHOT.h} pixels over delta 64`);
  check(hidden > HEADSHOT.w * HEADSHOT.h * 0.2, 'motion-headshot: the still is hidden under the clip');
  const videos = (await rig.page.evaluate(`document.querySelectorAll('video').length`)) as number;
  check(coverage(clip.cleared.png, FRAME) === 0 && videos === 0, `motion-headshot: after the clear nothing is drawn and no <video> is left (${videos})`);

  const missing = '/assets/proofs/missing.webm';
  await setMotionHeadshot(rig, missing);
  cam.mark();
  await take(rig, 'ptw', 'lower', slot);
  await rig.settle({ lower: 'on' });
  const fallback = await cam.shot('missing-file-on-air', 1400 + 400);
  const vsStill = difference(still.on.png, fallback.png, HEADSHOT, 64).count;
  const left = (await rig.page.evaluate(`document.querySelectorAll('video').length`)) as number;
  check(vsStill < 100 && left === 0, `motion-headshot: pointed at ${missing}, the still stays (${vsStill} pixels over delta 64 from the still take; ${left} <video>)`);
  await setMotionHeadshot(rig, null);
}

/** Starting Five at step 1 and the scorebug on air survive a reload of /renderer. */
async function provesReload(rig: Rig) {
  const cam = camera(rig, 'reload');
  await reset(rig);
  await setRundown(rig, [cueOf('basketball-v2/starting-five', {}, { id: 'starting-five' })]);
  await rig.command({ type: 'air', operator, ref: CueRef.parse({ kind: 'free', graphic: 'basketball-v2/scorebug' }) });
  const frame = await take(rig, 'starting-five', 'lower');
  await rig.settle({ bug: 'on', lower: 'on' });
  await rig.command({ type: 'step', layer: 'lower', slot: frame.slot, to: 1 });
  await settleWhere(rig, `dtvRenderer.layers().lower.phase === 'on' && dtvRenderer.layers().lower.written.step === 1`);
  await rig.page.waitForTimeout(800);
  const before = await cam.shot('before-reload');
  const stateBefore = await rig.page.evaluate('JSON.stringify(Object.fromEntries(Object.entries(dtvRenderer.layers()).map(([k, s]) => [k, [s.phase, s.frame?.slot, s.written?.step]])))');

  const t0 = cam.mark();
  await rig.page.reload();
  await waitLive(rig.page);
  await record(rig.page);
  await settleWhere(rig, `dtvRenderer.layers().lower.phase === 'entering'`);
  const entering = Date.now() - t0;
  const intro = [await cam.shot('after-reload-intro', entering + 200), await cam.shot('after-reload-intro', entering + 500)];
  await rig.settle({ bug: 'on', lower: 'on' });
  const after = await cam.shot('after-reload', 1400 + 800);
  const stateAfter = await rig.page.evaluate('JSON.stringify(Object.fromEntries(Object.entries(dtvRenderer.layers()).map(([k, s]) => [k, [s.phase, s.frame?.slot, s.written?.step]])))');
  const log = await logSince(rig.page, t0);
  printLog(log, t0, 'lower');
  console.log(`     before: ${stateBefore}\n     after:  ${stateAfter}`);
  const across = difference(before.png, after.png, FRAME, 64);
  console.log(`     across the reload: ${across.count} pixels over delta 64; home navy ${pct(share(before.png, BESIDE_BUG, HOME_NAVY))} -> ${pct(share(after.png, BESIDE_BUG, HOME_NAVY))}, away red ${pct(share(before.png, BESIDE_BUG, AWAY_RED))} -> ${pct(share(after.png, BESIDE_BUG, AWAY_RED))}`);
  check(stateBefore === stateAfter, 'reload: the page holds the same slots, phases and steps after a reload');
  check(across.count < 200, 'reload: Starting Five comes back at step 1 and the scorebug with it, drawn as before');
  check(
    intro.every((shot) => share(shot.png, BESIDE_BUG, AWAY_RED) === 0 && share(shot.png, BESIDE_BUG, HOME_NAVY) > 0),
    `reload: the intro after the reload enters on the home side, the away side never showing (${intro.map((shot) => `+${shot.at} ms away ${pct(share(shot.png, BESIDE_BUG, AWAY_RED))} home ${pct(share(shot.png, BESIDE_BUG, HOME_NAVY))}`).join(', ')})`,
  );
}

/** Two renderers on one page, program at 640 x 360 and a preview at 480 x 270. */
async function provesTwoRenderers(rig: Rig) {
  const cam = camera(rig, 'two-renderers');
  await reset(rig);
  await setRundown(rig, [cueOf('basketball-v2/player-lower-third', { player: REED }, { id: 'reed' })]);
  await rig.command({ type: 'air', operator, ref: CueRef.parse({ kind: 'free', graphic: 'basketball-v2/scorebug' }) });
  await rig.command({ type: 'cue', operator, ref: rundownRef('reed') });
  await rig.settle({ bug: 'on' });
  const full = await cam.shot('program-at-1920');

  const monitors = serveMonitors({ port: port + 1, rpc: `ws://localhost:${port}/rpc` });
  try {
    const page = await rig.page.context().browser()!.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`  monitors page error: ${message.text()}`);
    });
    await page.setViewportSize({ width: 1200, height: 420 });
    await page.goto(monitors.url(operator));
    await page.waitForFunction(`dtvMonitors.every((m) => m.status === 'live') && dtvMonitors[0].renderer.layers().bug.phase === 'on' && dtvMonitors[1].renderer.layers().lower.phase === 'on'`, null, { timeout: 20_000 });
    await page.waitForTimeout(600);
    const shot = await cam.shot('monitors', undefined, page);
    const boxes = (await page.evaluate(`dtvMonitors.map((m) => { const r = m.host.getBoundingClientRect(); const c = m.host.querySelector('canvas'); return { x: r.x, y: r.y, w: r.width, h: r.height, canvas: c && [c.width, c.height], canvases: m.host.querySelectorAll('canvas').length }; })`)) as {
      x: number;
      y: number;
      w: number;
      h: number;
      canvas: [number, number] | null;
      canvases: number;
    }[];
    console.log(`     hosts: ${JSON.stringify(boxes)}`);
    const [program, preview] = boxes as [(typeof boxes)[0], (typeof boxes)[0]];
    const scaled = (box: (typeof boxes)[0], region: Region): Region => ({
      x: Math.round(box.x + (region.x * box.w) / 1920),
      y: Math.round(box.y + (region.y * box.h) / 1080),
      w: Math.round((region.w * box.w) / 1920),
      h: Math.round((region.h * box.h) / 1080),
    });
    const BUG: Region = { x: 0, y: 850, w: 540, h: 230 };
    const LT: Region = { x: 540, y: 850, w: 1380, h: 230 };
    const programBug = coverage(shot.png, scaled(program, BUG));
    const programLower = coverage(shot.png, scaled(program, LT));
    const previewBug = coverage(shot.png, scaled(preview, BUG));
    const previewLower = coverage(shot.png, scaled(preview, LT));
    console.log(`     program: scorebug ${pct(programBug)} lower ${pct(programLower)} (1920 page: ${pct(coverage(full.png, BUG))}); preview: scorebug ${pct(previewBug)} lower ${pct(previewLower)}`);
    check(program.canvas?.[0] === 640 && program.canvas?.[1] === 360 && preview.canvas?.[0] === 480 && preview.canvas?.[1] === 270, 'two-renderers: each canvas draws at its host size, 640 x 360 and 480 x 270');
    check(Math.abs(programBug - coverage(full.png, BUG)) < 0.05 && programLower === 0, 'two-renderers: program draws the scorebug alone, scaled to the same share of its box as at 1920');
    check(previewLower > 0.2 && previewBug === 0, 'two-renderers: the preview draws the cued lower third alone');

    // Take: both monitors follow.
    await rig.command({ type: 'take', operator });
    await page.waitForFunction(`dtvMonitors[0].renderer.layers().lower.phase === 'on' && dtvMonitors[1].renderer.layers().lower.phase === 'empty'`, null, { timeout: 20_000 });
    await page.waitForTimeout(400);
    const taken = await cam.shot('monitors-after-take', undefined, page);
    check(coverage(taken.png, scaled(program, LT)) > 0.2 && coverage(taken.png, scaled(preview, LT)) === 0, 'two-renderers: after the take program draws the lower third and the preview is empty');
    await page.close();
  } finally {
    monitors.stop();
  }
}

/** Three different lower thirds taken within a second, 400 ms apart and back to back: the layer ends on the last, with one instance. */
async function provesRapid(rig: Rig) {
  const cam = camera(rig, 'rapid');
  await reset(rig);
  const players = (await world(rig)).entities.player.filter((each) => each.teamId === 'drexel-mbb' && each.lastName).slice(0, 3);
  await setRundown(rig, players.map((player, index) => cueOf('basketball-v2/player-lower-third', { player: player.id }, { id: `rapid-${index}` })));
  const last = players.at(-1)!.lastName;

  cam.mark();
  await rig.command({ type: 'air', operator, ref: rundownRef('rapid-2') });
  await rig.settle({ lower: 'on' });
  const alone = await cam.shot(`${last}-alone`, 2000);

  for (const gap of [400, 0]) {
    await reset(rig);
    await rig.page.evaluate(`window.dtvCanvases = 0; (() => { const tick = () => { dtvCanvases = Math.max(dtvCanvases, document.querySelectorAll('[data-layer=lower] canvas').length); requestAnimationFrame(tick); }; tick(); })()`);
    const t0 = cam.mark();
    const slots: SlotId[] = [];
    for (const index of players.keys()) {
      await Bun.sleep(Math.max(0, t0 + index * gap - Date.now()));
      await rig.command({ type: 'air', operator, ref: rundownRef(`rapid-${index}`) });
      slots.push((await waitForLayer(rig, 'lower', (frame) => !slots.includes(frame.slot))).slot);
    }
    console.log(`     ${gap} ms apart: three airs sent by +${Date.now() - t0} ms: ${players.map((player) => player.lastName).join(', ')}`);
    await cam.shot(`${gap}ms-apart-mid`, 900);
    await rig.settle({ lower: 'on' });
    const settled = await cam.shot(`${gap}ms-apart-settled`, 4000);
    printLog(await logSince(rig.page, t0), t0, 'lower');
    const state = (await rig.page.evaluate('({ slot: dtvRenderer.layers().lower.frame?.slot, canvases: document.querySelectorAll("canvas").length, most: dtvCanvases })')) as { slot: string; canvases: number; most: number };
    const vsAlone = difference(alone.png, settled.png, LOWER, 64).count;
    check(
      state.slot === slots.at(-1) && state.canvases === 1 && state.most === 1,
      `rapid, ${gap} ms apart: the layer ends on the last take with one canvas on the page, never two at once (most ${state.most})`,
    );
    check(vsAlone < 200, `rapid, ${gap} ms apart: the page shows ${last}, as when aired alone (${vsAlone} pixels over delta 64)`);
  }
}

const PROOFS: Readonly<Record<string, (rig: Rig) => Promise<void>>> = {
  steps: provesSteps,
  'score-to-break': provesScoreToBreak,
  'motion-headshot': provesMotionHeadshot,
  reload: provesReload,
  'two-renderers': provesTwoRenderers,
  rapid: provesRapid,
};

const rig = await startRig({ port });
try {
  await rig.command({ type: 'activate', show: SHOW });
  await record(rig.page);
  for (const [name, proof] of Object.entries(PROOFS)) {
    if (only && !only.includes(name)) continue;
    console.log(`\n== ${name}`);
    try {
      await proof(rig);
    } catch (error) {
      check(false, `${name} threw: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }
} finally {
  await rig.close();
}

console.log(failures.length ? `\n${failures.length} failed:\n${failures.map((each) => `  ${each}`).join('\n')}` : `\nall proofs hold; screenshots in ${out}`);
process.exit(failures.length ? 1 : 0);
