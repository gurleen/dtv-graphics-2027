/**
 * Games, each its own show, driven the way operators drive them: the real server on a scratch
 * database, two controllers in Chromium at 1440 x 900, and every claim also read back over the
 * API. Hofstra at Drexel is created as a game and given a crew; one controller makes it active
 * while the other holds a cue in preview, and its first cue stores its show. The active game
 * cannot be deleted, another game goes with its show, and the server restarts to show the choice
 * and the rundown survive. Exits 1 if any check fails.
 *
 *   bun apps/controller/scripts/games-proofs.ts [--port=8996] [--out=build/controller/games-proofs]
 *
 * It serves the controller itself. The scenes are not built here, so the monitors stay dark;
 * the tally is read from the rundown rows and from the show stream.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Api, connect, first } from '@dtv/api';
import { GameId, GraphicId, indexWorld, type World } from '@dtv/domain';
import { CommandId, OperatorId, type ShowView } from '@dtv/playout';
import { type Browser, chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dir, '../../..');
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const PORT = Number(flag('port') ?? 8996);
const out = join(ROOT, flag('out') ?? 'build/controller/games-proofs');
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

const dir = mkdtempSync(join(tmpdir(), 'dtv-games-proofs-'));
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
  connection = connect({ url: `ws://localhost:${PORT}/rpc`, client: 'games-proofs' });
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
const SJU_GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const HOFSTRA_GAME = GameId.parse('2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb');
const SPARE_GAME = GameId.parse('2026-27/2026-11-22/saint-josephs-mbb.at.drexel-mbb');

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
  await send({ type: 'activate', game: SJU_GAME });
  await send({ type: 'air', operator: OperatorId.parse('alex'), ref: { kind: 'free', graphic: GraphicId.parse('basketball-v2/scorebug') } });
  const sam = await openPage('sam', 'show');
  const alex = await openPage('alex', 'data');
  const cueId = (await viewFor('sam')).rundown[0]!;
  await send({ type: 'cue', operator: OperatorId.parse('sam'), ref: cueId.ref });
  await sam.locator('.cue-row[data-pvw]').first().waitFor();
  check((await topBarShow(sam).innerText()) === 'Saint Joseph\'s at Drexel', 'sam\'s console names the seeded game');
  await shoot(sam, 'sam-before-switch');

  console.log('\ngames: the list, then create Hofstra at Drexel');
  await alex.getByRole('option', { name: 'Games', exact: true }).click();
  await alex.locator('.data-table').waitFor();
  const seeded = alex.locator('.data-row', { hasText: 'Saint Joseph' });
  check((await seeded.locator('.active-mark').count()) === 1, 'the active game is marked in the list');
  check((await alex.locator('.active-mark').count()) === 1, 'only one game carries the mark');
  check((await alex.getByRole('option', { name: 'Shows', exact: true }).count()) === 0 && (await alex.getByRole('button', { name: '+ Show' }).count()) === 0, 'the data page has no Shows list and no + Show');
  await shoot(alex, 'games-list');

  await alex.getByRole('button', { name: '+ Game' }).click();
  const game = alex.getByRole('dialog', { name: 'New game' });
  await game.waitFor();
  check((await game.getByText(/show/i).count()) === 0, 'the new-game dialog asks nothing about a show');
  await game.getByRole('combobox', { name: 'Away team' }).fill('hofs');
  await shoot(alex, 'new-game-searching');
  await alex.locator('.select-popover').getByRole('option', { name: 'Hofstra · MBB' }).click();
  await game.getByRole('combobox', { name: 'Home team' }).fill('drexel mbb');
  await alex.locator('.select-popover').getByRole('option', { name: 'Drexel · MBB' }).click();
  await choose(game, alex, 'Venue', 'Daskalakis Athletic Center');
  await game.getByLabel('Game day').fill('2026-11-15');
  await game.getByLabel('Start time').fill('14:30');
  await game.getByLabel('Event title').fill('CAA opener');
  const conferenceTicked = await game.getByRole('checkbox', { name: 'Conference game' }).isChecked();
  await shoot(alex, 'new-game-filled');
  await game.getByRole('button', { name: 'Create game' }).click();
  await game.waitFor({ state: 'detached' });
  let w = await world();
  const created = w.get('game', HOFSTRA_GAME);
  check(!!created, `the game exists under its deterministic id ${HOFSTRA_GAME}`);
  check(created?.awayTeamId === 'hofstra-mbb' && created.homeTeamId === 'drexel-mbb' && created.title === 'CAA opener' && created.venueId === 'daskalakis-athletic-center', 'its teams, venue and title are as typed');
  check(created?.startsAt === `2026-11-15T14:30:00${offsetOf('2026-11-15T14:30')}`, `its start carries the browser's offset (${created?.startsAt})`);
  check(created?.conferenceGame === conferenceTicked, `conference game was ticked for it by the teams' conference (${conferenceTicked})`);
  check(!w.get('show', HOFSTRA_GAME), 'creating a game stores no show row');
  const live = await first((signal) => api().game.watch({ game: HOFSTRA_GAME }, { signal }));
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

  console.log('\ncrew: the new game is selected; give it a crew member');
  const record = alex.locator('.record');
  await record.getByText('0 cues').waitFor();
  check((await record.locator('.crew-row').count()) === 0 && (await record.getByRole('button', { name: /^Make .* active$/ }).count()) === 1, 'the record shows the game, an empty crew and Make active');
  await record.getByRole('button', { name: '+ Add crew' }).click();
  await record.getByRole('textbox', { name: 'Role for crew member 1' }).fill('Sideline');
  await shoot(alex, 'game-crew-edited');
  await record.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor('the crew', async () => (await world()).get('show', HOFSTRA_GAME)?.crew.length === 1);
  const stored = (await world()).get('show', HOFSTRA_GAME);
  check(stored?.crew[0]?.role === 'Sideline' && stored.rundown.length === 0, 'the first crew edit stored the game\'s show, keyed by the game, with no cues');
  await alex.locator('.data-row', { hasText: 'Hofstra' }).getByText(/Brooks|Tuberosa|Peloso/).waitFor();
  await shoot(alex, 'game-crew-saved');

  console.log('\nactivate: alex makes it active; sam has a cue in preview and the scorebug is on program');
  const before = await viewFor('sam');
  check(Object.keys(before.preview).length === 1 && !!before.program.bug, 'before, sam has one cue in preview and the scorebug is on program');
  const row = alex.locator('.data-row', { hasText: 'Hofstra' });
  await row.getByRole('button', { name: /^Make .* active$/ }).click();
  const confirm = alex.getByRole('dialog', { name: /Make .* active/ });
  const sentence = await confirm.innerText();
  check(/previews? empt/i.test(sentence) && /program stays on air/i.test(sentence), `the confirm says what happens (${sentence.split('\n')[0]})`);
  await shoot(alex, 'make-active-confirm');
  await confirm.getByRole('button', { name: 'Make active', exact: true }).click();
  await waitFor('the switch', async () => (await viewFor('sam')).game?.id === HOFSTRA_GAME);
  await waitFor('sam\'s console', async () => (await topBarShow(sam).innerText()) === 'Hofstra at Drexel');
  await waitFor('alex\'s console', async () => (await topBarShow(alex).innerText()) === 'Hofstra at Drexel');
  const after = await viewFor('sam');
  check(Object.keys(after.preview).length === 0, 'sam\'s preview is empty');
  check(after.program.bug?.id === before.program.bug?.id, 'the scorebug is still on program, the same slot');
  check(after.rundown.length === 0 && (await sam.locator('.cue-row').count()) === 0, 'sam\'s console lists the new game\'s empty rundown');
  check((await row.locator('.active-mark').count()) === 1 && (await alex.locator('.data-row .active-mark').count()) === 1, 'the mark moved to the new game');
  await shoot(alex, 'alex-after-switch');

  console.log('\nrundown: sam adds the first cue on the show page');
  await sam.getByRole('button', { name: 'Add cue' }).click();
  await sam.getByRole('dialog').locator('.select-button').first().click();
  await sam.getByRole('option', { name: 'Talent Lower Third (Single)' }).click();
  await sam.getByRole('dialog').getByRole('combobox').first().click();
  await sam.getByRole('option', { name: /Rob Brooks/ }).click();
  await sam.getByRole('button', { name: 'Add to rundown' }).click();
  await sam.getByRole('dialog').waitFor({ state: 'detached' });
  await waitFor('the cue', async () => (await world()).get('show', HOFSTRA_GAME)?.rundown.length === 1);
  check((await world()).get('show', HOFSTRA_GAME)?.crew[0]?.role === 'Sideline', 'the rundown edit kept the crew');
  await sam.locator('.cue-row').first().waitFor();
  await shoot(sam, 'sam-first-cue');

  console.log('\ndelete: the active game cannot go; another game goes with its show');
  await api().data.apply({
    origin: 'manual',
    basis: (await world()).revision,
    edits: [
      { op: 'put', kind: 'game', value: { ...(await world()).get('game', SJU_GAME)!, id: SPARE_GAME, startsAt: '2026-11-22T19:00:00-05:00' } },
      { op: 'put', kind: 'show', value: { id: SPARE_GAME, crew: [{ talentId: 'rob-brooks' as never, role: null }], rundown: [] } },
    ],
  });
  await alex.locator('.data-row', { hasText: 'Hofstra' }).getByRole('gridcell').first().click();
  check(await alex.getByRole('button', { name: /^Delete/ }).isDisabled(), 'Delete is disabled on the active game');
  const refused = await api().data.apply({ origin: 'manual', basis: (await world()).revision, edits: [{ op: 'delete', kind: 'game', id: HOFSTRA_GAME }] }).then(() => null, (error: { data?: { detail?: string } }) => error.data?.detail ?? 'refused');
  check(!!refused && /is active/.test(refused), `the server refuses it too (${refused})`);
  const showAlone = await api().data.apply({ origin: 'manual', basis: (await world()).revision, edits: [{ op: 'delete', kind: 'show', id: SPARE_GAME }] }).then(() => null, (error: { data?: { detail?: string } }) => error.data?.detail ?? 'refused');
  check(!!showAlone && /only with its game/.test(showAlone), `a show is not deleted apart from its game (${showAlone})`);
  await alex.locator('.data-row', { hasText: 'Nov 22' }).getByRole('gridcell').first().click();
  await alex.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmDelete = alex.getByRole('dialog', { name: 'Confirm delete' });
  check(/crew, rundown and live score go with it/.test(await confirmDelete.innerText()), 'the confirm says the show goes with the game');
  await confirmDelete.getByRole('button', { name: 'Delete' }).click();
  await waitFor('the delete', async () => !(await world()).get('game', SPARE_GAME));
  check(!(await world()).get('show', SPARE_GAME), 'its show row went with it');
  await shoot(alex, 'spare-game-deleted');

  console.log('\nrestart: the server comes back with the new game active');
  await alex.close();
  await sam.close();
  await stopServer();
  await startServer(false);
  reconnect();
  const restarted = await viewFor('alex');
  check(restarted.game?.id === HOFSTRA_GAME && restarted.rundown.length === 1, `after the restart the active game is ${restarted.game?.label} with ${restarted.rundown.length} cue`);
  check(restarted.program.bug?.id === before.program.bug?.id, 'program came back as it was');
  const again = await openPage('alex', 'show');
  check((await topBarShow(again).innerText()) === 'Hofstra at Drexel' && (await again.locator('.cue-row').count()) === 1, 'a fresh controller shows the new game and its rundown');
  await shoot(again, 'after-restart');
  await again.goto(`${origin}/#/data`);
  await again.getByRole('option', { name: 'Games', exact: true }).click();
  await again.locator('.data-table').waitFor();
  check((await again.locator('.data-row', { hasText: 'Hofstra' }).locator('.active-mark').count()) === 1, 'the list still marks it');
  await shoot(again, 'games-list-after-restart');
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
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall games checks passed');
process.exit(failures.length ? 1 : 0);
