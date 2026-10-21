/**
 * Saved shows and rundowns, driven the way operators drive them: the real server on a scratch
 * database, two controllers in Chromium at 1440 x 900, and every claim also read back over the
 * API. Hofstra at Drexel is created as a game, given a show, and given the seeded Saint Joseph's
 * rundown; one controller makes it active while the other holds a cue in preview, and the server
 * restarts to show the choice and the rundown survive. Exits 1 if any check fails.
 *
 *   bun apps/controller/scripts/shows-proofs.ts [--port=8996] [--out=build/controller/shows-proofs]
 *
 * It serves the controller itself. The scenes are not built here, so the monitors stay dark;
 * the tally is read from the rundown rows and from the show stream.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Api, connect, first } from '@dtv/api';
import { GraphicId, indexWorld, ShowId, type World } from '@dtv/domain';
import { CommandId, OperatorId, type ShowView } from '@dtv/playout';
import { type Browser, chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dir, '../../..');
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const PORT = Number(flag('port') ?? 8996);
const out = join(ROOT, flag('out') ?? 'build/controller/shows-proofs');
const origin = `http://localhost:${PORT}`;
const MAIN = join(ROOT, 'apps/server/src/main.ts');

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

mkdirSync(out, { recursive: true });
for (const stale of new Bun.Glob('*.png').scanSync(out)) rmSync(join(out, stale));
let shots = 0;
const shoot = async (page: Page, name: string) => {
  const file = join(out, `${String(++shots).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`     ${file.replace(`${ROOT}/`, '')}`);
};

const dir = mkdtempSync(join(tmpdir(), 'dtv-shows-proofs-'));
let server: ReturnType<typeof Bun.spawn> | null = null;

async function startServer(seed: boolean) {
  const child = Bun.spawn(['bun', MAIN, ...(seed ? ['--seed'] : [])], {
    env: { ...process.env, PORT: String(PORT), DTV_DB: join(dir, 'db.sqlite') },
    stdout: 'pipe',
    stderr: 'inherit',
  });
  let started = '';
  for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
    started += new TextDecoder().decode(chunk);
    if (/dtv server on/.test(started)) break;
  }
  if (!/dtv server on/.test(started)) throw new Error(`the server exited before serving:\n${started}`);
  server = child;
}

async function stopServer() {
  server?.kill('SIGTERM');
  await server?.exited;
  server = null;
}

let connection = { api: null as unknown as Api, close: () => {} };
const reconnect = () => {
  connection.close();
  connection = connect({ url: `ws://localhost:${PORT}/rpc`, client: 'shows-proofs' });
};
const api = () => connection.api;
const world = async (): Promise<World> => indexWorld(await first((signal) => api().data.watch(undefined, { signal })));
const viewFor = (operator: string): Promise<ShowView> => first((signal) => api().show.watch({ operator: OperatorId.parse(operator) }, { signal }));
let commandCount = 0;
const send = (command: Parameters<Api['show']['command']>[0]['command']) =>
  api().show.command({ id: CommandId.parse(`proof-${++commandCount}`), command });

const waitFor = async (what: string, test: () => Promise<boolean> | boolean, ms = 8000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await test()) return true;
    await Bun.sleep(50);
  }
  check(false, `timed out waiting for ${what}`);
  return false;
};

let browser: Browser | undefined;
async function openPage(operator: string, route: 'show' | 'data'): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((name) => localStorage.setItem('dtv.operator', name), operator);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  ${operator} page error: ${error.message}`));
  await page.goto(`${origin}/#/${route}`);
  await page.waitForSelector(route === 'data' ? '.data-page' : '.rundown');
  return page;
}

const topBarShow = (page: Page) => page.locator('.topbar .show-name');
const DREXEL_SJU = ShowId.parse('drexel-sju');
const HOFSTRA_GAME = '2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb';

/** A Pick (a Select) inside a dialog, by its label. */
const choose = async (scope: ReturnType<Page['locator']>, page: Page, label: string, option: RegExp | string) => {
  await scope.locator('.dlg-row', { hasText: label }).locator('.pick-button').click();
  await page.locator('.select-popover').getByRole('option', { name: option }).first().click();
};

async function main() {
  await startServer(true);
  reconnect();
  browser = await chromium.launch();

  console.log('\nsetup: Saint Joseph\'s at Drexel is active, sam has a cue in preview, the scorebug is on program');
  await send({ type: 'activate', show: DREXEL_SJU });
  await send({ type: 'air', operator: OperatorId.parse('alex'), ref: { kind: 'free', graphic: GraphicId.parse('basketball-v2/scorebug') } });
  const sam = await openPage('sam', 'show');
  const alex = await openPage('alex', 'data');
  const cueId = (await viewFor('sam')).rundown[0]!;
  await send({ type: 'cue', operator: OperatorId.parse('sam'), ref: cueId.ref });
  await sam.locator('.cue-row[data-pvw]').first().waitFor();
  check((await topBarShow(sam).innerText()) === 'Saint Joseph\'s at Drexel', 'sam\'s console shows the seeded show');
  await shoot(sam, 'sam-before-switch');

  console.log('\ngames: create Hofstra at Drexel');
  await alex.getByRole('option', { name: 'Shows', exact: true }).click();
  await alex.locator('.data-table').waitFor();
  const seeded = alex.locator('.data-row', { hasText: 'Saint Joseph' });
  check((await seeded.locator('.active-mark').count()) === 1, 'the active show is marked in the list');
  check((await alex.locator('.active-mark').count()) === 1, 'only one show carries the mark');
  await shoot(alex, 'shows-list');

  await alex.getByRole('button', { name: '+ Game' }).click();
  const game = alex.getByRole('dialog', { name: 'New game' });
  await game.waitFor();
  await game.getByRole('combobox', { name: 'Away team' }).fill('hofs');
  await shoot(alex, 'new-game-searching');
  await alex.locator('.select-popover').getByRole('option', { name: 'Hofstra · MBB' }).click();
  await game.getByRole('combobox', { name: 'Home team' }).fill('drexel mbb');
  await alex.locator('.select-popover').getByRole('option', { name: 'Drexel · MBB' }).click();
  await choose(game, alex, 'Venue', 'Daskalakis Athletic Center');
  await game.getByLabel('Game day').fill('2026-11-15');
  await game.getByLabel('Start time').fill('14:30');
  await game.getByLabel('Event title').fill('CAA opener');
  await game.getByText('Create its show too').click();
  const conferenceTicked = await game.getByRole('checkbox', { name: 'Conference game' }).isChecked();
  await shoot(alex, 'new-game-filled');
  await game.getByRole('button', { name: 'Create game' }).click();
  await game.waitFor({ state: 'detached' });
  let w = await world();
  const created = w.get('game', HOFSTRA_GAME as never);
  check(!!created, `the game exists under its deterministic id ${HOFSTRA_GAME}`);
  check(created?.awayTeamId === 'hofstra-mbb' && created.homeTeamId === 'drexel-mbb' && created.title === 'CAA opener' && created.venueId === 'daskalakis-athletic-center', 'its teams, venue and title are as typed');
  check(created?.startsAt === `2026-11-15T14:30:00${offsetOf('2026-11-15T14:30')}`, `its start carries the browser's offset (${created?.startsAt})`);
  check(created?.conferenceGame === conferenceTicked, `conference game was ticked for it by the teams' conference (${conferenceTicked})`);
  const live = await first((signal) => api().game.watch({ game: HOFSTRA_GAME as never }, { signal }));
  check(live.sport === 'basketball' && live.score.away === 0 && live.score.home === 0, 'the game came with its live state, 0 to 0');

  await alex.getByRole('button', { name: '+ Game' }).click();
  await game.waitFor();
  await game.getByRole('combobox', { name: 'Away team' }).fill('hofs');
  await alex.locator('.select-popover').getByRole('option', { name: 'Hofstra · MBB' }).click();
  await game.getByRole('combobox', { name: 'Home team' }).fill('drexel mbb');
  await alex.locator('.select-popover').getByRole('option', { name: 'Drexel · MBB' }).click();
  await game.getByLabel('Game day').fill('2026-11-15');
  await game.getByRole('button', { name: 'Create game' }).click();
  const refusal = await game.getByRole('alert').innerText();
  check(/already play that day/.test(refusal), `the same game twice is refused before it is sent (${refusal})`);
  await shoot(alex, 'new-game-duplicate-refused');
  await game.getByRole('button', { name: 'Cancel' }).click();

  console.log('\nshows: create its show, rename it');
  await alex.getByRole('button', { name: '+ Show' }).click();
  await alex.getByRole('textbox', { name: 'Name', exact: true }).fill('Hofstra at Drexel (blank)');
  await alex.locator('.record .field', { hasText: 'Game' }).locator('.pick-button').click();
  await alex.locator('.select-popover').getByRole('option', { name: /Hofstra at Drexel/ }).click();
  await alex.getByRole('button', { name: '+ Add crew' }).click();
  await shoot(alex, 'new-show-record');
  await alex.getByRole('button', { name: 'Create', exact: true }).click();
  await waitFor('the new show', async () => !!(await world()).get('show', 'hofstra-at-drexel-blank' as never));
  w = await world();
  const blank = w.get('show', 'hofstra-at-drexel-blank' as never);
  check(blank?.gameId === HOFSTRA_GAME && blank.crew.length === 1 && blank.rundown.length === 0, 'the show is for the game, with one crew member and no cues');
  await alex.locator('.data-row', { hasText: 'Hofstra at Drexel (blank)' }).waitFor();

  await alex.getByRole('button', { name: /^Name of .*Hofstra at Drexel \(blank\).*\. Edit$/ }).click();
  await alex.locator('.cell-input').fill('Hofstra at Drexel (spare)');
  await alex.keyboard.press('Enter');
  await waitFor('the rename', async () => (await world()).get('show', 'hofstra-at-drexel-blank' as never)?.name === 'Hofstra at Drexel (spare)');
  check((await world()).get('show', 'hofstra-at-drexel-blank' as never)?.name === 'Hofstra at Drexel (spare)', 'renamed in place; the id did not change');
  await shoot(alex, 'show-renamed');

  console.log('\nduplicate: the seeded rundown onto Hofstra at Drexel');
  await seeded.getByRole('gridcell').first().click();
  await alex.getByRole('button', { name: 'Duplicate…' }).click();
  const dialog = alex.getByRole('dialog', { name: 'Duplicate show' });
  await dialog.waitFor();
  await choose(dialog, alex, 'Onto game', /Hofstra at Drexel/);
  await dialog.getByRole('textbox', { name: 'Show name' }).fill('Hofstra at Drexel');
  await dialog.locator('.flagged li').first().waitFor();
  const preview = await dialog.locator('.flagged li').allInnerTexts();
  console.log(`     the dialog flags ${preview.length} cues:\n       ${preview.join('\n       ')}`);
  await shoot(alex, 'duplicate-dialog');
  await dialog.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await waitFor('the duplicate', async () => !!(await world()).get('show', 'hofstra-at-drexel' as never));
  w = await world();
  const source = w.get('show', DREXEL_SJU)!;
  const copy = w.get('show', 'hofstra-at-drexel' as never)!;
  check(copy.gameId === HOFSTRA_GAME, 'the copy is on the new game');
  check(copy.crew.length === source.crew.length && JSON.stringify(copy.crew) === JSON.stringify(source.crew), `the crew was copied (${copy.crew.length} members)`);
  check(copy.rundown.length === source.rundown.length && copy.rundown.every((cue, at) => cue.graphic === source.rundown[at]!.graphic && JSON.stringify(cue.params) === JSON.stringify(source.rundown[at]!.params)), `all ${copy.rundown.length} cues were copied in order with their params`);
  check(copy.rundown.every((cue) => !source.rundown.some((old) => old.id === cue.id)) && new Set(copy.rundown.map((cue) => cue.id)).size === copy.rundown.length, 'every cue has a fresh id, none shared with the source');
  const flagged = copy.rundown.filter((cue) => cue.note.startsWith('CHECK: '));
  console.log(`     flagged cues:\n       ${flagged.map((cue) => `${cue.graphic}: ${cue.note}`).join('\n       ')}`);
  check(flagged.length > 0 && flagged.every((cue) => /Reed|Spiker|Drexel/.test(cue.note)), `${flagged.length} cues that name the old game's players or teams are flagged in their notes`);
  check(copy.rundown.filter((cue) => !cue.note.startsWith('CHECK: ')).every((cue) => !/drexel-mbb|saint-josephs/.test(JSON.stringify(cue.params))), 'no unflagged cue names either team');
  check(source.rundown.every((cue) => !cue.note), 'the source show was not touched');
  await alex.locator('.data-row', { hasText: 'to check' }).waitFor();
  await shoot(alex, 'duplicate-in-list');

  console.log('\nactivate: alex makes it active; sam has a cue in preview and the scorebug is on program');
  const before = await viewFor('sam');
  check(Object.keys(before.preview).length === 1 && !!before.program.bug, 'before, sam has one cue in preview and the scorebug is on program');
  const row = alex.locator('.data-row', { hasText: 'Hofstra at Drexel' }).filter({ hasNotText: 'spare' });
  await row.getByRole('button', { name: /^Make .* active$/ }).click();
  const confirm = alex.getByRole('dialog', { name: /Make .* active/ });
  const sentence = await confirm.innerText();
  check(/previews? empt/i.test(sentence) && /program stays on air/i.test(sentence), `the confirm says what happens (${sentence.split('\n')[0]})`);
  await shoot(alex, 'make-active-confirm');
  await confirm.getByRole('button', { name: 'Make active', exact: true }).click();
  await waitFor('the switch', async () => (await viewFor('sam')).show?.id === 'hofstra-at-drexel');
  await waitFor('sam\'s console', async () => (await topBarShow(sam).innerText()) === 'Hofstra at Drexel');
  await waitFor('alex\'s console', async () => (await topBarShow(alex).innerText()) === 'Hofstra at Drexel');
  const after = await viewFor('sam');
  check(Object.keys(after.preview).length === 0, 'sam\'s preview is empty');
  check(after.program.bug?.id === before.program.bug?.id, 'the scorebug is still on program, the same slot');
  check((await sam.locator('.cue-row[data-pvw]').count()) === 0, 'sam\'s rundown shows no PVW tag');
  check((await sam.locator('.cue-row').count()) === copy.rundown.length, `sam's console now lists the ${copy.rundown.length} cues of the new rundown`);
  check((await alex.locator('.data-row', { hasText: 'Hofstra at Drexel' }).filter({ hasNotText: 'spare' }).locator('.active-mark').count()) === 1 && (await alex.locator('.active-mark').count()) === 1, 'the mark moved to the new show');
  await shoot(alex, 'alex-after-switch');
  await shoot(sam, 'sam-after-switch');

  console.log('\ndelete: the active show cannot go, an inactive one can');
  await alex.locator('.data-row', { hasText: 'Hofstra at Drexel' }).filter({ hasNotText: 'spare' }).getByRole('gridcell').first().click();
  check(await alex.getByRole('button', { name: /^Delete/ }).isDisabled(), 'Delete is disabled on the active show');
  const refused = await api().data.apply({ origin: 'manual', basis: (await world()).revision, edits: [{ op: 'delete', kind: 'show', id: ShowId.parse('hofstra-at-drexel') }] }).then(() => null, (error: { data?: { detail?: string } }) => error.data?.detail ?? 'refused');
  check(!!refused && /is active/.test(refused), `the server refuses it too (${refused})`);
  await alex.locator('.data-row', { hasText: 'spare' }).getByRole('gridcell').first().click();
  await alex.getByRole('button', { name: 'Delete', exact: true }).click();
  await alex.getByRole('dialog', { name: 'Confirm delete' }).getByRole('button', { name: 'Delete' }).click();
  await waitFor('the delete', async () => !(await world()).get('show', 'hofstra-at-drexel-blank' as never));
  check(!!(await world()).get('game', HOFSTRA_GAME as never), 'the show is gone and its game stays');
  await shoot(alex, 'inactive-show-deleted');

  console.log('\nshow page: the rundown of the active show, with the flagged notes');
  await alex.goto(`${origin}/#/show`);
  await alex.locator('.rundown').waitFor();
  await alex.locator('.cue-row').first().click();
  await alex.locator('.cue-row').nth(3).click();
  await shoot(alex, 'show-page-new-rundown');

  console.log('\nrestart: the server comes back with the new show active');
  await alex.close();
  await sam.close();
  await stopServer();
  await startServer(false);
  reconnect();
  const restarted = await viewFor('alex');
  check(restarted.show?.id === 'hofstra-at-drexel' && restarted.rundown.length === copy.rundown.length, `after the restart the active show is ${restarted.show?.name} with ${restarted.rundown.length} cues`);
  check(restarted.program.bug?.id === before.program.bug?.id, 'program came back as it was');
  const again = await openPage('alex', 'show');
  check((await topBarShow(again).innerText()) === 'Hofstra at Drexel' && (await again.locator('.cue-row').count()) === copy.rundown.length, 'a fresh controller shows the new show and its rundown');
  await shoot(again, 'after-restart');
  await again.goto(`${origin}/#/data`);
  await again.getByRole('option', { name: 'Shows', exact: true }).click();
  await again.locator('.data-table').waitFor();
  check((await again.locator('.data-row', { hasText: 'Hofstra at Drexel' }).locator('.active-mark').count()) === 1, 'the list still marks it');
  await shoot(again, 'shows-list-after-restart');
}

/** `-05:00` style offset for a local wall-clock time in the zone this script runs in, which Chromium shares. */
function offsetOf(local: string): string {
  const minutesWest = new Date(local).getTimezoneOffset();
  const abs = Math.abs(minutesWest);
  return `${minutesWest > 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

try {
  await main();
} finally {
  connection.close();
  await browser?.close();
  await stopServer();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall shows checks passed');
process.exit(failures.length ? 1 : 0);
