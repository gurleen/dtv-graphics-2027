/**
 * The controller's proofs, in a real Chromium at 1440 x 900 against the real server on a
 * scratch database: two operators at once, every graphic through preview, take and
 * program, a keyboard-only stretch, rundown edits, and a server restart mid-show.
 *
 *   bun run riv:build                               once: the signed scenes
 *   bun apps/controller/scripts/proofs.ts [--port=8990]
 *
 * Writes screenshots to build/controller/proofs/ and alex's run-through to
 * build/controller/runthrough.webm. Exits non-zero when a check fails.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { connect, first } from '@dtv/api';
import type { Cue } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { type AnyGraphic, entryOf, type LayerId } from '@dtv/playout';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dir, '../../..');
const MAIN = join(ROOT, 'apps/server/src/main.ts');
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? '8990');
const origin = `http://localhost:${port}`;
const OUT = join(ROOT, 'build/controller/proofs');
const VIDEO = join(ROOT, 'build/controller/runthrough.webm');
const VIEWPORT = { width: 1440, height: 900 };
/** `--quick` skips the seventeen graphics, to work on the proofs after them. */
const quick = process.argv.includes('--quick');

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// The server: started on a scratch database, and started again on the same file for the restart proof.

const dir = mkdtempSync(join(tmpdir(), 'dtv-controller-'));
let server: ReturnType<typeof Bun.spawn> | null = null;

async function startServer(seed: boolean) {
  const child = Bun.spawn(['bun', MAIN, ...(seed ? ['--seed'] : [])], {
    env: { ...process.env, PORT: String(port), DTV_DB: join(dir, 'dtv.sqlite') },
    stdout: 'pipe',
    stderr: 'inherit',
  });
  let output = '';
  for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
    output += new TextDecoder().decode(chunk);
    if (/dtv server on/.test(output)) break;
  }
  if (!/dtv server on/.test(output)) throw new Error(`the server exited before serving:\n${output}`);
  server = child;
}

async function stopServer() {
  server?.kill('SIGTERM');
  await server?.exited;
  server = null;
}

// What a page's monitors drew, read from the renderers the controller puts on window.

type Drawn = Record<LayerId, { readonly phase: string; readonly graphic?: string; readonly slot?: string; readonly step?: number }>;

/** The controller's monitors as the page holds them; this script's types have no DOM. */
interface PageGlobals {
  readonly dtvMonitors?: Record<
    string,
    { readonly renderer: { layers(): Record<string, { phase: string; frame: { graphic: string; slot: string; step: number } }> }; readonly frame: { layers: { layer: string; values: Record<string, unknown> }[] } | null }
  >;
}

const drawn = (page: Page, monitor: string): Promise<Drawn | null> =>
  page.evaluate((name) => {
    const handle = (globalThis as PageGlobals).dtvMonitors?.[name];
    if (!handle) return null;
    return Object.fromEntries(
      Object.entries(handle.renderer.layers()).map(([layer, state]) => [
        layer,
        state.phase === 'empty' ? { phase: 'empty' } : { phase: state.phase, graphic: state.frame.graphic, slot: state.frame.slot, step: state.frame.step },
      ]),
    ) as Drawn;
  }, monitor);

/** Waits until `monitor` shows each named layer as given (on, with that graphic) and, with `only`, every other layer empty. */
async function waitDrawn(page: Page, monitor: string, want: Partial<Record<LayerId, { graphic: string; step?: number } | 'empty'>>, what: string): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  let last: Drawn | null = null;
  while (Date.now() < deadline) {
    last = await drawn(page, monitor);
    const ok =
      last !== null &&
      Object.entries(want).every(([layer, expected]) => {
        const state = last![layer as LayerId];
        if (expected === 'empty') return state.phase === 'empty';
        return state.phase === 'on' && state.graphic === expected!.graphic && (expected!.step === undefined || state.step === expected!.step);
      });
    if (ok) {
      check(true, what);
      return true;
    }
    await Bun.sleep(50);
  }
  check(false, `${what} (saw ${JSON.stringify(last)})`);
  return false;
}

/** Graphics seen on alex's program monitor after a take or a free-panel press. */
const aired = new Set<string>();

const entry = (graphic: string): AnyGraphic => entryOf(GRAPHICS, graphic)!;
/** The share of a monitor's canvas pixels something is drawn on: proof that it drew, not only that its renderer says so. */
const inked = (page: Page, monitor: string): Promise<number> =>
  page.evaluate(`(() => {
    let drawn = 0, total = 0;
    for (const canvas of document.querySelectorAll('[data-monitor="${monitor}"] canvas')) {
      const context = canvas.getContext('2d');
      if (!context || !canvas.width) continue;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 16) { total++; if (data[i] > 0) drawn++; }
    }
    return total ? drawn / total : 0;
  })()`);

const layerOf = (graphic: string) => entry(graphic).layer;
const short = (graphic: string) => graphic.split('/')[1]!;

async function shoot(page: Page, name: string, monitor?: string) {
  const path = join(OUT, `${name}.png`);
  if (monitor) await page.locator(`[data-monitor="${monitor}"]`).screenshot({ path });
  else await page.screenshot({ path });
}

// Browsers: each operator is a context whose localStorage already names them, except one first visit.

let browser: Browser;

async function operatorPage(operator: string | null, options: { readonly video?: boolean } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    ...(options.video ? { recordVideo: { dir: join(dir, 'video'), size: VIEWPORT } } : {}),
  });
  if (operator) await context.addInitScript((name) => localStorage.setItem('dtv.operator', name), operator);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  page error (${operator}): ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebSocket/.test(message.text())) console.log(`  console (${operator}): ${message.text()}`);
  });
  await page.goto(origin);
  return { context, page };
}

const rows = (page: Page) => page.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
const rundown = async (api: ReturnType<typeof connect>['api']): Promise<readonly Cue[]> =>
  (await first((signal) => api.data.watch(undefined, { signal }))).entities.show.find((show) => show.id === 'drexel-sju')!.rundown;

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await startServer(true);
  const { api, close } = connect({ url: `ws://localhost:${port}/rpc`, client: 'controller-proof' });
  browser = await chromium.launch();
  try {
    await provesTwoOperators();
    await provesRunThrough(api);
    await provesProblems(api);
    await provesRestart();
  } catch (error) {
    if (alex?.page && !alex.page.isClosed()) await alex.page.screenshot({ path: join(OUT, 'failed.png') });
    throw error;
  } finally {
    close();
    await browser.close();
    await stopServer();
    rmSync(dir, { recursive: true, force: true });
  }
}

let alex: { context: BrowserContext; page: Page };
let sam: { context: BrowserContext; page: Page };

async function provesTwoOperators() {
  console.log('two operators');
  alex = await operatorPage('alex');
  await alex.page.getByRole('button', { name: 'Activate' }).click();
  await rows(alex.page).first().waitFor();

  sam = await operatorPage(null);
  await sam.page.getByLabel('Your name').fill('Alex');
  await sam.page.getByRole('alert').waitFor();
  check((await sam.page.getByRole('alert').textContent())?.includes('alex is already connected') ?? false, 'a second browser is warned that alex is connected');
  await shoot(sam.page, '01-name-taken');
  await sam.page.getByLabel('Your name').fill('Sam');
  await sam.page.getByRole('button', { name: 'Start' }).click();
  await rows(sam.page).first().waitFor();
  check((await sam.page.evaluate(() => localStorage.getItem('dtv.operator'))) === 'sam', 'the first visit keeps sam in localStorage');
  await alex.page.locator('.other[data-operator="sam"]').waitFor();
  check(true, 'alex sees sam among the operators');

  const staff = 'basketball-v2/staff-lower-third';
  await rows(alex.page).filter({ hasText: 'Zach Spiker' }).click();
  await alex.page.keyboard.press('Enter');
  await waitDrawn(alex.page, 'preview', { lower: { graphic: staff } }, "alex's cue is in alex's preview");
  await waitDrawn(sam.page, 'other:alex', { lower: { graphic: staff } }, "alex's cue shows in sam's thumbnail of alex");
  await waitDrawn(sam.page, 'preview', { lower: 'empty' }, "sam's own preview stays empty");
  await shoot(sam.page, '02-sam-sees-alex-preview');

  await alex.page.getByRole('button', { name: /^Take/ }).click();
  await waitDrawn(alex.page, 'program', { lower: { graphic: staff } }, "alex's take is on alex's program monitor");
  await waitDrawn(sam.page, 'program', { lower: { graphic: staff } }, "alex's take is on sam's program monitor");
  await shoot(alex.page, '03-alex-took');

  await sam.page.locator('.layer-row[data-layer="lower"]').getByRole('button', { name: /^Clear/ }).click();
  await waitDrawn(sam.page, 'program', { lower: 'empty' }, "sam's clear empties sam's program monitor");
  await waitDrawn(alex.page, 'program', { lower: 'empty' }, "sam's clear empties alex's program monitor");
  await shoot(alex.page, '04-sam-cleared');
  await alex.context.close();
}

/** One graphic from the rundown: cue, take, step through, clear. */
async function rundownGraphic(page: Page, index: number, graphic: string, n: number) {
  const layer = layerOf(graphic);
  await rows(page).nth(index).click();
  await page.getByRole('button', { name: /^Cue to my preview/ }).click();
  await waitDrawn(page, 'preview', { [layer]: { graphic } }, `${short(graphic)}: in my preview`);
  await shoot(page, `${n}-${short(graphic)}-preview`, 'preview');
  await page.getByRole('button', { name: /^Take/ }).click();
  if (await waitDrawn(page, 'program', { [layer]: { graphic, step: 0 } }, `${short(graphic)}: on program after Take`)) aired.add(graphic);
  await waitDrawn(page, 'preview', { [layer]: 'empty' }, `${short(graphic)}: my preview empties`);
  await shoot(page, `${n}-${short(graphic)}-program`, 'program');
  const steps = entry(graphic).steps?.count ?? 1;
  for (let step = 1; step < steps; step++) {
    await page.getByRole('button', { name: /^Next/ }).click();
    await waitDrawn(page, 'program', { [layer]: { graphic, step } }, `${short(graphic)}: Next moves to step ${step + 1}`);
    await Bun.sleep(900);
    await shoot(page, `${n}-${short(graphic)}-program-step${step + 1}`, 'program');
  }
  await page.locator(`.layer-row[data-layer="${layer}"]`).getByRole('button', { name: /^Clear/ }).click();
  await waitDrawn(page, 'program', { [layer]: 'empty' }, `${short(graphic)}: cleared`);
}

/** One graphic from the free panel: it airs directly, then the same button clears it. */
async function freeGraphic(page: Page, graphic: string, n: number) {
  const layer = layerOf(graphic);
  const index = await page.locator('.free-button').evaluateAll(
    (buttons, label) => buttons.findIndex((each) => each.textContent?.startsWith(label)),
    await freeLabel(page, graphic),
  );
  await page.locator('.free-button').nth(index).click();
  if (await waitDrawn(page, 'program', { [layer]: { graphic } }, `${short(graphic)}: on program from the free panel`)) aired.add(graphic);
  await shoot(page, `${n}-${short(graphic)}-program`, 'program');
  await page.locator('.free-button').nth(index).click();
  await waitDrawn(page, 'program', { [layer]: 'empty' }, `${short(graphic)}: the same button clears it`);
}

/** The free-panel label of a graphic, as the server labels it. */
const freeLabels = new Map<string, string>();
async function freeLabel(page: Page, graphic: string) {
  if (!freeLabels.size) {
    const texts = await page.locator('.free-button .free-label').allTextContents();
    const order = Object.values(GRAPHICS).filter((entry) => entry.free).map((entry) => entry.id);
    order.forEach((id, index) => freeLabels.set(id, texts[index]!));
  }
  return freeLabels.get(graphic)!;
}

async function provesRunThrough(api: ReturnType<typeof connect>['api']) {
  console.log('the run-through, recorded from alex');
  alex = await operatorPage('alex', { video: true });
  const { page } = alex;
  await rows(page).first().waitFor();
  const started = Date.now();
  const cues = await rundown(api);

  let n = 10;
  if (!quick) {
    for (const [index, cue] of cues.entries()) await rundownGraphic(page, index, cue.graphic, n++);
    for (const free of Object.values(GRAPHICS).filter((each) => each.free)) await freeGraphic(page, free.id, n++);
  }
  check(Object.keys(GRAPHICS).every((id) => aired.has(id)), `all ${Object.keys(GRAPHICS).length} graphics reached program (${aired.size})`);

  console.log('rundown edits');
  // Add a cue through the dialog: the single talent lower third, with the crew's first member.
  await rows(page).last().click();
  await page.getByRole('button', { name: 'Add cue' }).click();
  await page.getByRole('dialog').locator('.select-button').first().click();
  await page.getByRole('option', { name: 'Talent Lower Third (Single)' }).click();
  await page.getByRole('dialog').getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Rob Brooks/ }).click();
  await shoot(page, '40-add-cue');
  await page.getByRole('button', { name: 'Add to rundown' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  const added = (await rundown(api)).at(-1)!;
  check(added.graphic === 'basketball-v2/talent-lower-third-single' && JSON.stringify(added.params) === '{"talents":["rob-brooks"]}', `the dialog added ${added.graphic} ${JSON.stringify(added.params)}`);
  await rundownGraphic(page, cues.length, added.graphic, 41);

  // Edit the player lower third's stat line in the inspector while it is on air: Save refreshes program.
  const playerRow = cues.findIndex((cue) => cue.graphic === 'basketball-v2/player-lower-third');
  await rows(page).nth(playerRow).click();
  await page.getByRole('button', { name: /^Cue to my preview/ }).click();
  await page.getByRole('button', { name: /^Take/ }).click();
  await waitDrawn(page, 'program', { lower: { graphic: 'basketball-v2/player-lower-third' } }, 'the player lower third is on air to edit');
  const statLine = () => String((globalThis as PageGlobals).dtvMonitors?.program?.frame?.layers.find((layer) => layer.layer === 'lower')?.values.statLine);
  const before = await page.evaluate(statLine);
  await page.getByRole('button', { name: /^3PT/ }).click();
  await page.getByRole('button', { name: /^STL/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => String((globalThis as PageGlobals).dtvMonitors?.program?.frame?.layers.find((layer) => layer.layer === 'lower')?.values.statLine).endsWith('STL'));
  const after = await page.evaluate(statLine);
  const saved = (await rundown(api))[playerRow]!;
  check(JSON.stringify(saved.params.line) === '{"kind":"game","stats":["pts","reb","ast","stl"]}', `Save wrote the stat line ${JSON.stringify(saved.params.line)}`);
  check(before.includes('3PT') && !after.includes('3PT'), `Save refreshed program: "${before}" became "${after}"`);
  await Bun.sleep(600);
  await shoot(page, '42-edited-on-air');
  await page.keyboard.press('Shift+Escape');
  await waitDrawn(page, 'program', { lower: 'empty' }, 'Shift+Esc clears the lower third');

  // Reorder from the keyboard: the last row, Right to its handle, Enter, Up, Enter.
  const order = (await rundown(api)).map((cue) => cue.id);
  await rows(page).last().click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await Bun.sleep(200);
  await page.keyboard.press('ArrowUp');
  await Bun.sleep(200);
  await page.keyboard.press('Enter');
  await Bun.sleep(500);
  const reordered = (await rundown(api)).map((cue) => cue.id);
  const expected = [...order.slice(0, -2), order.at(-1)!, order.at(-2)!];
  check(JSON.stringify(reordered) === JSON.stringify(expected), `a keyboard drag moved ${order.at(-1)} up one (${reordered.slice(-3).join(', ')})`);
  await shoot(page, '43-reordered');
  await rows(page).filter({ hasText: 'Talent · Rob Brooks' }).getByRole('button', { name: /^Remove/ }).click();
  await rows(page).nth(cues.length).waitFor({ state: 'detached' });
  check((await rundown(api)).length === cues.length, 'Remove takes the added cue out of the rundown');

  console.log('keyboard only');
  await page.evaluate('document.activeElement && document.activeElement.blur()');
  await page.keyboard.press('Digit1');
  await waitDrawn(page, 'program', { bug: { graphic: 'basketball-v2/scorebug' } }, '1 airs the first free-panel button');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitDrawn(page, 'preview', { lower: { graphic: 'basketball-v2/starting-five' } }, 'Up, Down and Enter cue the second row (Starting Five)');
  await page.keyboard.press('Escape');
  await waitDrawn(page, 'preview', { lower: 'empty' }, 'Esc clears my preview');
  await page.keyboard.press('Enter');
  await waitDrawn(page, 'preview', { lower: { graphic: 'basketball-v2/starting-five' } }, 'Enter cues it again');
  await page.keyboard.press('Space');
  await waitDrawn(page, 'program', { lower: { graphic: 'basketball-v2/starting-five', step: 0 }, bug: { graphic: 'basketball-v2/scorebug' } }, 'Space takes it beside the scorebug');
  await page.keyboard.press('KeyN');
  await waitDrawn(page, 'program', { lower: { graphic: 'basketball-v2/starting-five', step: 1 } }, 'N moves Starting Five to the home team');
  await Bun.sleep(900);
  await shoot(page, '50-keyboard');
  await page.keyboard.press('KeyN');
  await waitDrawn(page, 'program', { lower: 'empty' }, 'N past the last step takes it off air');
  await page.keyboard.press('Shift+Backspace');
  await Bun.sleep(150);
  check((await drawn(page, 'program'))?.bug.phase === 'on', 'a tap of Shift+Backspace does not clear all');
  await page.keyboard.down('Shift');
  await page.keyboard.down('Backspace');
  await Bun.sleep(750);
  await page.keyboard.up('Backspace');
  await page.keyboard.up('Shift');
  await waitDrawn(page, 'program', { bug: 'empty', lower: 'empty', card: 'empty' }, 'holding Shift+Backspace clears all');

  const seconds = (Date.now() - started) / 1000;
  const video = page.video()!;
  await alex.context.close();
  await video.saveAs(VIDEO);
  console.log(`  run-through ${seconds.toFixed(0)} s, saved to ${VIDEO}`);
}

/** A refused edit and a cue that cannot air both show where the operator is looking. */
async function provesProblems(api: ReturnType<typeof connect>['api']) {
  console.log('problems where the operator looks');
  alex = await operatorPage('alex');
  const { page } = alex;
  await rows(page).first().waitFor();
  for (const each of [page, sam.page]) await rows(each).filter({ hasText: 'Zach Spiker' }).click();
  await page.getByLabel('Note').fill('from alex');
  await sam.page.getByLabel('Note').fill('from sam');
  await sam.page.getByRole('button', { name: 'Save', exact: true }).click();
  await sam.page.getByRole('button', { name: 'Save', exact: true }).and(sam.page.locator('[data-disabled]')).waitFor();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const strip = page.locator('.problem-strip');
  await strip.waitFor();
  check(/Someone changed the rundown/.test((await strip.textContent()) ?? ''), `alex's stale save is refused beside Take: "${await strip.textContent()}"`);
  check((await page.getByLabel('Note').inputValue()) === 'from alex', "alex's typing survives the refusal");
  check((await rundown(api)).find((cue) => cue.id === 'staff-lower-third')?.note === 'from sam', "sam's note stands");
  await shoot(page, '55-conflict');
  await page.getByRole('button', { name: 'Revert' }).click();
  await page.locator('.problem-strip').getByRole('button', { name: 'Dismiss' }).click();

  const world = await first((signal) => api.data.watch(undefined, { signal }));
  await api.data.apply({ origin: 'manual', basis: world.revision, edits: [{ op: 'delete', kind: 'staff', id: 'drexel-mbb@2026-27/spiker-zach' as never }] });
  const row = rows(page).filter({ hasText: 'Spiker' });
  await row.locator('.cue-error').waitFor();
  check(true, `a cue that cannot air says why on its row: "${await row.locator('.cue-error').textContent()}"`);
  await shoot(page, '56-cue-error');
  await alex.context.close();
}

async function provesRestart() {
  console.log('server restart mid-show');
  alex = await operatorPage('alex');
  const { page } = alex;
  await rows(page).first().waitFor();
  await page.keyboard.press('Digit1');
  await rows(page).filter({ hasText: 'Matchup locator' }).first().click();
  await page.keyboard.press('Enter');
  await waitDrawn(page, 'preview', { card: { graphic: 'basketball-v2/matchup-locator' } }, 'matchup locator cued');
  await page.keyboard.press('Space');
  await waitDrawn(page, 'program', { bug: { graphic: 'basketball-v2/scorebug' }, card: { graphic: 'basketball-v2/matchup-locator' } }, 'scorebug and matchup locator on program');
  const before = await drawn(page, 'program');
  await Bun.sleep(500);
  const samInk = await inked(sam.page, 'program');
  check(samInk > 0.01, `sam's program monitor draws the scorebug and the locator (${(samInk * 100).toFixed(1)}% of pixels)`);
  await shoot(sam.page, '59-sam-before-restart');

  // A page that reloads loses its marker; a restart must not reload anyone's controller.
  for (const each of [page, sam.page]) await each.evaluate('window.proofMarker = true');
  await stopServer();
  await page.getByTestId('reconnecting').waitFor({ timeout: 10_000 });
  check(true, 'the Reconnecting badge shows while the server is down');
  await shoot(page, '60-reconnecting');
  await startServer(false);
  await page.getByTestId('reconnecting').waitFor({ state: 'detached', timeout: 15_000 });
  check(true, 'the badge clears once every stream is back');
  await Bun.sleep(500);
  const after = await drawn(page, 'program');
  check(JSON.stringify(after) === JSON.stringify(before), `program is unchanged across the restart (${after?.card.slot} ${after?.card.phase})`);
  await waitDrawn(sam.page, 'program', { bug: { graphic: 'basketball-v2/scorebug' }, card: { graphic: 'basketball-v2/matchup-locator' } }, "sam's program is back too");
  await Bun.sleep(3000);
  for (const [name, each] of [['alex', page], ['sam', sam.page]] as const) {
    check((await each.evaluate('window.proofMarker === true')) === true, `${name}'s page did not reload across the restart`);
  }
  await shoot(page, '61-after-restart');
  const samAfter = await inked(sam.page, 'program');
  check(samAfter > 0.01, `sam's program monitor still draws after the restart (${(samAfter * 100).toFixed(1)}%)`);
  await sam.page.setViewportSize({ width: 1728, height: 1117 });
  await Bun.sleep(500);
  const samLarge = await inked(sam.page, 'program');
  check(samLarge > 0.01, `at 1728 x 1117 sam's program monitor still draws (${(samLarge * 100).toFixed(1)}%)`);
  await shoot(sam.page, '70-sam-at-1728x1117');
  await alex.context.close();
  await sam.context.close();
}

await main();
if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.map((failure) => `  ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('\nevery proof passed');
