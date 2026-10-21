/**
 * The phase 5 gate: a whole game, tip-off to final, run through the controller's UI only,
 * keys and clicks, against the real server on a scratch database, with /renderer drawing
 * program beside it. The API is used only to read what program shows. Partway through the
 * second half the server is killed with SIGKILL while the clock runs and started again on
 * the same file.
 *
 *   bun run riv:build                               once: the signed scenes
 *   bun apps/controller/scripts/game.ts [--port=8994]
 *
 * Writes /renderer screenshots to build/controller/game/ and both pages as videos,
 * build/controller/game/renderer.webm and controller.webm. Exits non-zero when a check fails.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { connect, first, watch } from '@dtv/api';
import { basketball, type GameId } from '@dtv/domain';
import type { LayerId, OutputFrame } from '@dtv/playout';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dir, '../../..');
const MAIN = join(ROOT, 'apps/server/src/main.ts');
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? '8994');
const origin = `http://localhost:${port}`;
const OUT = join(ROOT, 'build/controller/game');
const CONTROLLER_VIEW = { width: 1440, height: 900 };
const RENDERER_VIEW = { width: 1920, height: 1080 };

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

// The server, on a scratch database, started again on the same file for the restart.

const dir = mkdtempSync(join(tmpdir(), 'dtv-game-'));
const DB = join(dir, 'dtv.sqlite');
let server: ReturnType<typeof Bun.spawn> | null = null;

async function startServer(seed: boolean) {
  const child = Bun.spawn(['bun', MAIN, ...(seed ? ['--seed'] : [])], {
    env: { ...process.env, PORT: String(port), DTV_DB: DB },
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

async function killServer() {
  server?.kill('SIGKILL');
  await server?.exited;
  server = null;
}

/** The show commands the server journaled after `seq`, read from the database file itself. */
function journaledShow(after: number): { seq: number; actor: string; id: string; type: string }[] {
  const db = new Database(DB, { readonly: true });
  try {
    return db
      .query<{ seq: number; actor: string; payload: string }, [number]>("SELECT seq, actor, payload FROM journal WHERE kind = 'show' AND seq > ? ORDER BY seq")
      .all(after)
      .map((row) => {
        const payload = JSON.parse(row.payload) as { id: string; command: { type: string } };
        return { seq: row.seq, actor: row.actor, id: payload.id, type: payload.command.type };
      });
  } finally {
    db.close();
  }
}

const lastSeq = () => {
  const db = new Database(DB, { readonly: true });
  try {
    return db.query<{ seq: number }, []>('SELECT coalesce(max(seq), 0) AS seq FROM journal').get()!.seq;
  } finally {
    db.close();
  }
};

// What program shows, read from output.watch, and the game's live state from game.watch.

let program: OutputFrame | null = null;
let live: basketball.BasketballLive | null = null;

const layerOf = (layer: LayerId) => program?.layers.find((each) => each.layer === layer);
const bug = () => layerOf('bug')?.values ?? {};

type Want = Partial<Record<LayerId, string | 'empty'>> & {
  readonly away?: number;
  readonly home?: number;
  readonly period?: string;
  readonly step?: number;
};

const describe = () =>
  program
    ? program.layers.map((layer) => `${layer.layer}=${layer.graphic.split('/')[1]}@${layer.step}`).join(' ') +
      (layerOf('bug')?.graphic === 'basketball-v2/scorebug' ? ` ${String(bug().awayScore)}-${String(bug().homeScore)} ${String(bug().period)} ${String(bug().clock)}` : '')
    : 'nothing';

/** Waits until program shows what `want` names, and checks it. */
async function expectProgram(want: Want, what: string): Promise<boolean> {
  const matches = () => {
    for (const layer of ['bug', 'lower', 'card'] as const) {
      const expected = want[layer];
      if (expected === undefined) continue;
      const frame = layerOf(layer);
      if (expected === 'empty' ? frame !== undefined : frame?.graphic !== expected) return false;
      if (expected !== 'empty' && want.step !== undefined && layer !== 'bug' && frame?.step !== want.step) return false;
    }
    if (want.away !== undefined && bug().awayScore !== want.away) return false;
    if (want.home !== undefined && bug().homeScore !== want.home) return false;
    if (want.period !== undefined && bug().period !== want.period) return false;
    return true;
  };
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (matches()) {
      check(true, `${what} (program: ${describe()})`);
      return true;
    }
    await Bun.sleep(25);
  }
  check(false, `${what} (program: ${describe()})`);
  return false;
}

/** Waits until `ok`, and checks it; `what` is read when it settles, so it can quote what program showed. */
async function until(ok: () => boolean, what: string | (() => string), timeout = 15_000): Promise<boolean> {
  const say = () => (typeof what === 'string' ? what : what());
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (ok()) {
      check(true, say());
      return true;
    }
    await Bun.sleep(25);
  }
  check(false, say());
  return false;
}

/** `13:59` or `0:04.3` to milliseconds. */
const clockMs = (text: unknown) => {
  const match = /^(\d+):(\d{2})(?:\.(\d))?$/.exec(String(text));
  return match ? (Number(match[1]) * 60 + Number(match[2])) * 1000 + Number(match[3] ?? 0) * 100 : Number.NaN;
};

// The two pages: alex's controller and /renderer, each recorded.

let browser: Browser;
let controller: { context: BrowserContext; page: Page };
let renderer: { context: BrowserContext; page: Page };

async function openPage(path: string, view: { width: number; height: number }, name: string, operator?: string) {
  const context = await browser.newContext({ viewport: view, deviceScaleFactor: 1, recordVideo: { dir: join(dir, `video-${name}`), size: { width: 1280, height: Math.round((1280 * view.height) / view.width) } } });
  if (operator) await context.addInitScript((each) => localStorage.setItem('dtv.operator', each), operator);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  page error (${name}): ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebSocket/.test(message.text())) console.log(`  console (${name}): ${message.text()}`);
  });
  await page.goto(`${origin}${path}`);
  return { context, page };
}

type RendererLayers = Record<LayerId, { phase: string; frame?: { graphic: string; slot: string; step: number } }>;
const rendererLayers = (): Promise<RendererLayers> => renderer.page.evaluate('dtvRenderer.layers()') as Promise<RendererLayers>;

/** Waits until /renderer has drawn each named layer (on, with that graphic) or emptied it. */
async function drawn(want: Partial<Record<LayerId, string | 'empty'>>, step?: number) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const layers = await rendererLayers();
    const ok = Object.entries(want).every(([layer, graphic]) => {
      const state = layers[layer as LayerId];
      if (graphic === 'empty') return state.phase === 'empty';
      return state.phase === 'on' && state.frame?.graphic === graphic && (step === undefined || layer === 'bug' || state.frame.step === step);
    });
    if (ok) return true;
    await Bun.sleep(50);
  }
  check(false, `/renderer drew ${JSON.stringify(want)} (saw ${JSON.stringify(await rendererLayers())})`);
  return false;
}

let shot = 0;
/** Screenshots /renderer once it has drawn `want`, after the motion settles. */
async function shootRenderer(name: string, want: Partial<Record<LayerId, string | 'empty'>>, step?: number) {
  await drawn(want, step);
  await Bun.sleep(900);
  const path = join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`);
  await renderer.page.screenshot({ path });
  console.log(`       ${path.slice(ROOT.length + 1)}`);
}

async function shootController(name: string) {
  const path = join(OUT, `${String(++shot).padStart(2, '0')}-controller-${name}.png`);
  await controller.page.screenshot({ path });
  console.log(`       ${path.slice(ROOT.length + 1)}`);
}

// The operator's hands: keys, and clicks on what the page shows.

const G = (id: string) => `basketball-v2/${id}`;
const rows = () => controller.page.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');

async function press(key: string, times = 1) {
  for (let i = 0; i < times; i++) await controller.page.keyboard.press(key);
}

/** Selects the rundown row, cues it with Enter and takes it with Space. */
async function cueAndTake(label: string, graphic: string, layer: LayerId) {
  await rows().filter({ hasText: label }).first().click();
  await press('Enter');
  await inMyPreview(graphic);
  await press('Space');
  await expectProgram({ [layer]: graphic, step: 0 }, `${label}: Space takes it to program`);
}

/** Waits until alex's preview monitor holds `graphic`. */
const inMyPreview = (graphic: string) =>
  controller.page.waitForFunction(`window.dtvMonitors?.preview?.frame?.layers.some((layer) => layer.graphic === '${graphic}')`, null, { timeout: 15_000 });

async function setClock(text: string) {
  await controller.page.getByTestId('game-clock').click();
  await controller.page.getByLabel('Game clock').fill(text);
  await controller.page.getByLabel('Game clock').press('Enter');
}

async function choose(select: 'Period' | 'Phase', option: string) {
  await controller.page.getByRole('button', { name: new RegExp(`${select}$`) }).click();
  await controller.page.getByRole('option', { name: option, exact: true }).click();
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await startServer(true);
  const reader = connect({ url: `ws://localhost:${port}/rpc`, client: 'game-reader' });
  const world = await first((signal) => reader.api.data.watch(undefined, { signal }));
  const gameId = world.entities.show.find((show) => show.id === 'drexel-sju')!.gameId as GameId;
  const stop = new AbortController();
  void watch((signal) => reader.api.output.watch({ bus: { kind: 'program' } }, { signal }), (frame) => (program = frame), { signal: stop.signal });
  void watch((signal) => reader.api.game.watch({ game: gameId }, { signal }), (value) => (live = value.sport === 'basketball' ? value : null), { signal: stop.signal });

  browser = await chromium.launch();
  try {
    renderer = await openPage('/renderer', RENDERER_VIEW, 'renderer');
    // /renderer is transparent for OBS; a dark backdrop makes its screenshots readable.
    await renderer.page.addStyleTag({ content: 'html { background: #2a2d33; }' });
    await renderer.page.waitForFunction("document.body.dataset.status === 'live'");
    controller = await openPage('/', CONTROLLER_VIEW, 'controller', 'alex');
    await controller.page.getByRole('button', { name: 'Activate' }).click();
    await rows().first().waitFor();

    await beforeTipOff();
    await firstHalf();
    await endOfHalf();
    await secondHalf();
    await theFinal();
    await noAnswer();
  } catch (error) {
    if (controller?.page && !controller.page.isClosed()) await controller.page.screenshot({ path: join(OUT, 'failed.png') });
    throw error;
  } finally {
    stop.abort();
    reader.close();
    for (const [name, each] of [
      ['controller', controller],
      ['renderer', renderer],
    ] as const) {
      if (!each) continue;
      const video = each.page.video();
      await each.context.close();
      await video?.saveAs(join(OUT, `${name}.webm`));
    }
    await browser.close();
    await killServer();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function beforeTipOff() {
  console.log('before tip-off');
  // The seed's game is mid-second-half; the operator sets the board for tip-off by hand.
  await press('Shift+KeyQ', live!.score.away);
  await press('Shift+KeyI', live!.score.home);
  await choose('Period', '1st Half');
  await choose('Phase', 'Pregame');
  await setClock('20:00');
  if (live!.timeouts.away < 4) await controller.page.locator('.team.away').getByRole('button', { name: '4 timeouts' }).click();
  if (live!.bonus.home) await controller.page.locator('.team.home').getByRole('button', { name: 'Bonus' }).click();
  if (live!.possession) await controller.page.getByRole('button', { name: /^Possession DREX/ }).click();
  await until(
    () => live?.score.away === 0 && live.score.home === 0 && live.period === 1 && live.phase === 'pregame' && live.clock.remainingMs === 1_200_000 && live.timeouts.away === 4 && !live.bonus.home && live.possession === null,
    () => `Shift+Q and Shift+I take the seed's 68-72 to 0-0, and the period, phase, clock, timeouts, bonus and possession are set by mouse (${JSON.stringify(live && { score: live.score, period: live.period, phase: live.phase, clock: live.clock })})`,
  );

  await press('Shift+Slash');
  await controller.page.getByRole('dialog', { name: 'Keys' }).waitFor();
  check(true, '? lists every key');
  await shootController('keys');
  await press('Escape');
  await controller.page.getByRole('dialog', { name: 'Keys' }).waitFor({ state: 'detached' });

  await press('Digit1');
  await expectProgram({ bug: G('scorebug'), away: 0, home: 0, period: '1ST HALF' }, '1 airs the scorebug at 0-0, 1st half');
  check(bug().clock === '20:00', `the scorebug's clock reads ${String(bug().clock)}`);
  await shootRenderer('pregame-scorebug', { bug: G('scorebug') });

  await cueAndTake('Matchup locator', G('matchup-locator'), 'card');
  await shootRenderer('matchup-locator', { card: G('matchup-locator') });
  await controller.page.locator('.layer-row[data-layer="card"]').getByRole('button', { name: /^Clear/ }).click();
  await expectProgram({ card: 'empty', bug: G('scorebug') }, 'the card Clear takes the locator off, the scorebug stays');

  await cueAndTake('Starting five', G('starting-five'), 'lower');
  await shootRenderer('starting-five-away', { lower: G('starting-five') }, 0);
  await press('KeyN');
  await expectProgram({ lower: G('starting-five'), step: 1 }, 'N moves Starting Five to the home five');
  await shootRenderer('starting-five-home', { lower: G('starting-five') }, 1);
  await press('KeyN');
  await expectProgram({ lower: 'empty' }, 'N past the last step takes Starting Five off');

  await press('Digit2');
  await expectProgram({ lower: G('talent-lower-third-single'), bug: G('scorebug') }, '2 airs the talent lower third beside the scorebug');
  await shootRenderer('talent', { lower: G('talent-lower-third-single') });
  await press('Digit2');
  await expectProgram({ lower: 'empty' }, '2 again clears it');
}

async function firstHalf() {
  console.log('first half');
  await choose('Phase', 'Live');
  await press('KeyC');
  await until(() => live?.clock.running === true, 'C starts the game clock');
  await press('BracketLeft');
  await press('KeyR');
  await until(() => live?.possession === 'away' && live.shotClock?.running === true && live.shotClock.remainingMs === 30_000, '[ gives away the ball and R starts a 30-second shot clock with the game clock');
  await expectProgram({ bug: G('scorebug') }, 'the scorebug shows away possession');
  check(bug().awayPossession === true && bug().homePossession === false, `possession arrow away (${String(bug().awayPossession)}, ${String(bug().homePossession)})`);

  const possessions: [key: string, away: number, home: number, ball: string][] = [
    ['KeyW', 2, 0, 'BracketRight'],
    ['KeyO', 2, 2, 'BracketLeft'],
    ['KeyE', 5, 2, 'BracketRight'],
    ['KeyP', 5, 5, 'BracketLeft'],
  ];
  for (const [key, away, home, ball] of possessions) {
    await press(key);
    await press(ball);
    await press('KeyR');
    await expectProgram({ away, home }, `${key.slice(3)} scores: program reads ${away}-${home}`);
  }
  await until(() => live?.possession === 'away', 'the brackets passed the ball each time');
  await shootRenderer('first-half-5-5', { bug: G('scorebug') });

  await press('KeyI', 2);
  await expectProgram({ home: 7 }, 'I twice: two free throws, 5-7');
  await press('Shift+KeyI');
  await expectProgram({ home: 6 }, 'Shift+I takes one back, 5-6');
  await press('KeyT');
  await until(() => live?.shotClock?.remainingMs === 20_000, 'T resets the shot clock to 20');
  await until(() => bug().shotClock === '20' || bug().shotClock === '19', () => `program's shot clock reads ${String(bug().shotClock)}`);

  await setClock('11:30');
  await until(() => live?.clock.running === true && clockMs(bug().clock) <= 11 * 60_000 + 30_000 && clockMs(bug().clock) > 11 * 60_000, () => `typing 11:30 sets the running clock (program ${String(bug().clock)})`);

  await press('KeyC');
  await until(() => live?.clock.running === false && live.shotClock?.running === false, 'C stops the game clock and the shot clock with it');
  await controller.page.locator('.team.away').getByRole('button', { name: '4 timeouts' }).click();
  await expectProgram({ bug: G('scorebug') }, 'the scorebug is on for the timeout');
  await until(() => bug().awayTimeouts === 3, () => `away's timeout: program shows ${String(bug().awayTimeouts)} left`);

  await controller.page.getByRole('button', { name: 'Foul on home' }).click();
  await controller.page.getByRole('button', { name: 'Foul on home' }).click();
  await controller.page.getByRole('button', { name: 'Foul on away' }).click();
  await until(() => live?.team.home.pf === 2 && live.team.away.pf === 1, () => `fouls by mouse: home ${live?.team.home.pf}, away ${live?.team.away.pf}`);
  await shootController('first-half');

  await cueAndTake('Josh Reed #5 · game', G('player-lower-third'), 'lower');
  const statLine = String(layerOf('lower')?.values.statLine);
  check(/PTS/.test(statLine) && /REB/.test(statLine), `the player lower third shows tonight's line: "${statLine}"`);
  await shootRenderer('player-lower-third', { lower: G('player-lower-third') });
  await press('Shift+Escape');
  await expectProgram({ lower: 'empty' }, 'Shift+Esc clears it');

  await press('KeyC');
  await press('Digit5');
  await expectProgram({ bug: G('score-to-break') }, '5 airs Score to Break on the bug layer');
  await shootRenderer('score-to-break', { bug: G('score-to-break') });
  await press('Digit1');
  await expectProgram({ bug: G('scorebug'), away: 5, home: 6 }, '1 puts the scorebug back');

  await cueAndTake('Burning question', G('burning-question'), 'lower');
  await shootRenderer('burning-question', { lower: G('burning-question') }, 0);
  await press('KeyN');
  await expectProgram({ lower: G('burning-question'), step: 1 }, 'N: the Burning Question answer');
  await shootRenderer('burning-question-answer', { lower: G('burning-question') }, 1);
  await press('KeyN');
  await expectProgram({ lower: 'empty' }, 'N past the answer takes it off');
}

async function endOfHalf() {
  console.log('the end of the half');
  await press('KeyW');
  await expectProgram({ away: 7, home: 6 }, 'a last basket: 7-6');
  await setClock('0:03');
  await until(() => live?.clock.running === true, 'the clock runs from 0:03');
  await until(() => bug().clock === '0:00.0', () => `the clock runs out: program reads ${String(bug().clock)}`, 8_000);
  await press('KeyC');
  await until(() => live?.clock.running === false, 'C stops the expired clock');
  await shootRenderer('end-of-half', { bug: G('scorebug') });
  await choose('Phase', 'Halftime');
  await expectProgram({ bug: G('scorebug'), period: 'HALF' }, 'the halftime phase: the scorebug reads Half');

  await cueAndTake('Halftime stats', G('halftime-statistics'), 'card');
  await shootRenderer('halftime-statistics', { card: G('halftime-statistics') });
  await controller.page.locator('.layer-row[data-layer="card"]').getByRole('button', { name: /^Clear/ }).click();
  await expectProgram({ card: 'empty' }, 'Halftime Statistics cleared');

  await cueAndTake('Halftime adjustments', G('halftime-adjustments'), 'bug');
  await shootRenderer('halftime-adjustments', { bug: G('halftime-adjustments') }, 0);
  await press('KeyN');
  await expectProgram({ bug: G('halftime-adjustments'), step: 1 }, 'N: the second team’s adjustments');
  await until(() => layerOf('bug')?.step === 1, 'Halftime Adjustments is on step 2');
  await shootRenderer('halftime-adjustments-2', { bug: G('halftime-adjustments') });
  await press('KeyN');
  await expectProgram({ bug: 'empty' }, 'N past the last step takes Halftime Adjustments off');
}

async function secondHalf() {
  console.log('second half');
  await choose('Period', '2nd Half');
  await choose('Phase', 'Live');
  await setClock('20:00');
  await press('Digit1');
  await expectProgram({ bug: G('scorebug'), period: '2ND HALF', away: 7, home: 6 }, 'the period change: the scorebug reads 2nd Half');
  await press('KeyC');
  await press('BracketRight');
  await press('KeyR');
  await press('KeyO');
  await press('BracketLeft');
  await press('KeyR');
  await press('KeyE');
  await expectProgram({ away: 10, home: 8 }, 'more scoring in the second half: 10-8');
  await setClock('9:15');
  await until(() => live?.clock.running === true && clockMs(bug().clock) <= 9 * 60_000 + 15_000, () => `the running clock set to 9:15 (program ${String(bug().clock)})`);

  await rows().filter({ hasText: 'Drexel · stats' }).first().click();
  await press('Enter');
  await inMyPreview(G('team-lower-third'));
  check(true, 'the team lower third is in my preview');

  console.log('server restart while the clock runs');
  // The scorebug went on moments ago; its intro finishes first, so any intro seen after this is a replay.
  await drawn({ bug: G('scorebug') });
  for (const page of [controller.page, renderer.page]) await page.evaluate('window.gameMarker = true');
  // Sample /renderer's layers every 20 ms through the outage, in the page, where nothing waits on the server.
  await renderer.page.evaluate(`window.samples = []; window.sampler = setInterval(() => window.samples.push({ at: Date.now(), layers: dtvRenderer.layers() }), 20)`);
  const before = { program: program!, live: live!, clock: String(bug().clock), at: Date.now() };
  const bugBefore = layerOf('bug')!;
  const seqBefore = lastSeq();
  const killedAt = Date.now();
  await killServer();
  console.log(`       killed at ${new Date(killedAt).toISOString()} with the clock at ${before.clock} (remaining ${before.live.clock.remainingMs} ms since ${before.live.clock.running ? before.live.clock.since : '-'})`);
  await controller.page.getByTestId('reconnecting').waitFor({ timeout: 10_000 });
  check(true, 'the controller shows Reconnecting');

  await press('Space');
  await press('KeyI');
  await controller.page.locator('.button.take[data-pending]').waitFor({ timeout: 2_000 });
  check(true, 'Take shows pending while the server is down');
  check((await controller.page.getByTestId('score-home').getAttribute('data-pending')) !== null, 'the home score shows pending');
  check((await controller.page.getByTestId('score-home').textContent()) === '9', 'the pending basket already reads 9 on the score bar');
  await shootController('reconnecting');
  await Bun.sleep(2_000);
  const restartAt = Date.now();
  await startServer(false);
  console.log(`       started again at ${new Date(restartAt).toISOString()}, ${restartAt - killedAt} ms after the kill`);
  await controller.page.getByTestId('reconnecting').waitFor({ state: 'detached', timeout: 15_000 });
  check(true, `Reconnecting clears ${Date.now() - restartAt} ms after the restart`);

  await expectProgram({ lower: G('team-lower-third'), bug: G('scorebug'), home: 9 }, 'the Take and the basket pressed during the outage both landed');
  const takes = journaledShow(seqBefore).filter((row) => row.type === 'take');
  check(takes.length === 1 && takes[0]!.actor === 'alex', `the journal holds exactly one take from the outage (${JSON.stringify(takes)})`);
  await until(() => live?.score.home === 9, 'the game stream is back, with the basket');
  check((await controller.page.locator('.button.take[data-pending]').count()) === 0, 'Take is no longer pending');

  await renderer.page.evaluate('clearInterval(window.sampler)');
  const samples = (await renderer.page.evaluate('window.samples')) as { at: number; layers: RendererLayers }[];
  const bugStates = samples.map((sample) => sample.layers.bug);
  const bugSeen = [...new Set(bugStates.map((state) => `${state.phase} ${state.frame?.slot === bugBefore.slot ? 'same slot' : state.frame?.slot}`))];
  check(
    bugSeen.length === 1 && bugSeen[0] === 'on same slot' && samples.length > 50,
    `/renderer kept the scorebug on, same slot, in all ${samples.length} samples through the outage: no intro replayed (${bugSeen.join(', ')})`,
  );
  const lowerPhases = [...new Set(samples.map((sample) => sample.layers.lower.phase))];
  check(lowerPhases.join(',').startsWith('empty'), `the lower third only entered once the Take landed (${lowerPhases.join(' → ')})`);
  check(layerOf('bug')?.slot === bugBefore.slot, 'program kept the same scorebug slot');
  for (const [name, page] of [
    ['controller', controller.page],
    ['/renderer', renderer.page],
  ] as const) {
    check((await page.evaluate('window.gameMarker === true')) === true, `${name} did not reload`);
  }

  const after = { live: live!, clock: String(bug().clock), at: Date.now() };
  check(JSON.stringify(after.live.clock) === JSON.stringify(before.live.clock), `the live clock state is unchanged across the restart (${JSON.stringify(after.live.clock)})`);
  const expected = basketball.remainingAt(before.live.clock, after.at);
  const shown = clockMs(after.clock);
  check(Math.abs(shown - expected) <= 1_500, `the clock reads ${after.clock} ${after.at - before.at} ms after ${before.clock}; the clock state before the kill says ${basketball.formatGameClock(expected)}`);
  console.log(`       clock ${before.clock} at the kill, ${after.clock} after the restart, ${((after.at - before.at) / 1000).toFixed(1)} s later`);
  await shootRenderer('after-restart', { bug: G('scorebug'), lower: G('team-lower-third') });
  await press('Shift+Escape');
  await expectProgram({ lower: 'empty' }, 'Shift+Esc clears the team lower third');
}

async function theFinal() {
  console.log('the final');
  await press('KeyP');
  await expectProgram({ away: 10, home: 12 }, 'a late three: 10-12');
  await setClock('0:02');
  await until(() => bug().clock === '0:00.0', () => `the clock runs out (program ${String(bug().clock)})`, 8_000);
  await choose('Phase', 'Final');
  await expectProgram({ bug: G('scorebug'), period: 'FINAL', away: 10, home: 12 }, 'the final phase: the scorebug reads Final, 10-12');
  await shootRenderer('final', { bug: G('scorebug') });
  await cueAndTake('Player of the game', G('player-of-the-game'), 'lower');
  await shootRenderer('player-of-the-game', { lower: G('player-of-the-game'), bug: G('scorebug') });

  await controller.page.evaluate('document.activeElement && document.activeElement.blur()');
  await controller.page.keyboard.down('Shift');
  await controller.page.keyboard.down('Backspace');
  await Bun.sleep(750);
  await controller.page.keyboard.up('Backspace');
  await controller.page.keyboard.up('Shift');
  await expectProgram({ bug: 'empty', lower: 'empty', card: 'empty' }, 'Clear All, held, empties program');
  await shootRenderer('clear-all', { bug: 'empty', lower: 'empty', card: 'empty' });
  check((await controller.page.getByTestId('score-home').textContent()) === '12', 'the score bar still reads the final, 10-12');
}

/** A command that cannot land fails plainly after 10 s, beside Take. */
async function noAnswer() {
  console.log('no answer');
  await killServer();
  await controller.page.getByTestId('reconnecting').waitFor({ timeout: 10_000 });
  const pressed = Date.now();
  await press('Digit1');
  await controller.page.locator('.free-button[data-pending]').waitFor({ timeout: 2_000 });
  check(true, 'the free-panel button shows pending');
  const strip = controller.page.locator('.problem-strip');
  await strip.waitFor({ timeout: 14_000 });
  const text = (await strip.textContent()) ?? '';
  check(/Air failed: the server did not answer within 10 s/.test(text), `${((Date.now() - pressed) / 1000).toFixed(1)} s later: "${text.replace('✕', '').trim()}"`);
  check((await controller.page.locator('.free-button[data-pending]').count()) === 0, 'the button is no longer pending');
  await shootController('no-answer');
}

await main();
if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.map((failure) => `  ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('\nthe whole game passed');
