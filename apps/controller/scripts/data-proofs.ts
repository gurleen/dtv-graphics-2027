/**
 * The data page, driven the way an operator drives it: the real server on a scratch database,
 * the page in Chromium at 1440 x 900, and a second browser for the conflicts. Every check also
 * reads the World back over the API, so a screenshot is never the only evidence. Exits 1 if any check fails.
 *
 *   bun apps/controller/scripts/data-proofs.ts [--only=lock,conflicts,import,edits] [--out=build/controller/data-proofs] [--port=8992]
 *
 * It serves the controller on port 8992 unless told otherwise; run `bun run riv:build` first so the shell's monitors load.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Api, connect, first } from '@dtv/api';
import { type EntityOf, indexWorld, type PlayerId, ShowId, type World } from '@dtv/domain';
import { CommandId } from '@dtv/playout';
import { type Browser, chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dir, '../../..');
const SERVER_PORT = Number(process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? 8992);
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = join(ROOT, flag('out') ?? 'build/controller/data-proofs');
const only = flag('only')?.split(',');

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

const dir = mkdtempSync(join(tmpdir(), 'dtv-data-proofs-'));
const server = Bun.spawn(['bun', join(ROOT, 'apps/server/src/main.ts'), '--seed'], {
  env: { ...process.env, PORT: String(SERVER_PORT), DTV_DB: join(dir, 'db.sqlite') },
  stdout: 'pipe',
  stderr: 'inherit',
});
let started = '';
for await (const chunk of server.stdout) {
  started += new TextDecoder().decode(chunk);
  if (/dtv server on/.test(started)) break;
}
if (!/dtv server on/.test(started)) throw new Error(`the server exited before serving:\n${started}`);
const connection = connect({ url: `ws://localhost:${SERVER_PORT}/rpc`, client: 'proofs' });
const api: Api = connection.api;
const browser: Browser = await chromium.launch();

const world = async (): Promise<World> => indexWorld(await first((signal) => api.data.watch(undefined, { signal })));
const pageUrl = `http://localhost:${SERVER_PORT}/#/data`;

async function openPage(operator: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript((name) => localStorage.setItem('dtv.operator', name), operator);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') console.log(`  ${operator} ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => console.log(`  ${operator} page error: ${error.message}`));
  await page.goto(pageUrl);
  await page.waitForSelector('.data-page');
  return page;
}

const PLAYER = (team: string, slug: string) => `${team}@2026-27/${slug}` as PlayerId;
const player = (w: World, team: string, slug: string): EntityOf<'player'> => {
  const found = w.get('player', PLAYER(team, slug));
  if (!found) throw new Error(`no player ${team} ${slug}`);
  return found;
};
const DREXEL = 'drexel-mbb';
const SJU = 'saint-josephs-mbb';

const openTeam = async (page: Page, label: string | RegExp) => {
  await page.getByRole('option', { name: label, exact: typeof label === 'string' }).first().click();
  await page.waitForSelector('.data-table');
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A cell's button is named `<field> of <row>: <value>. Edit`. */
const cell = (page: Page, field: string, value: string) => page.getByRole('button', { name: new RegExp(`^${escape(field)} of .*: ${escape(value)}\\. Edit$`) });
/** Moves the mouse in from outside, as a hand does: the tooltips open on movement, not on a jump. */
const hover = async (page: Page, target: ReturnType<Page['locator']>) => {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x - 30, box.y - 30);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
};
/** Picks a file the way a person does: press Import CSV and answer the file chooser. */
const chooseFile = async (page: Page, file: string) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await (await chooser).setFiles(file);
};
const waitFor = async (what: string, test: () => Promise<boolean>, ms = 8000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await test()) return true;
    await Bun.sleep(50);
  }
  check(false, `timed out waiting for ${what}`);
  return false;
};

async function lockProof() {
  console.log('\nlock: edit Reed in place, see the lock, unlock it');
  const page = await openPage('alex');
  await openTeam(page, 'Drexel · MBB');
  await shoot(page, 'roster');

  await cell(page, 'Last', 'Reed').click();
  await page.locator('.cell-input').fill('Nope');
  await page.keyboard.press('Escape');
  check((await cell(page, 'Last', 'Reed').count()) === 1 && (await world()).locked('player', PLAYER(DREXEL, 'reed-josh')).length === 0, 'Esc cancels an edit: nothing written, nothing locked');

  await cell(page, 'Last', 'Reed').click();
  await page.locator('.cell-input').fill('Reid');
  await shoot(page, 'reed-editing-in-place');
  await page.keyboard.press('Enter');
  const row = page.locator('.data-row', { hasText: 'Josh' });
  await row.locator('.lock-mark').first().waitFor();
  let w = await world();
  check(player(w, DREXEL, 'reed-josh').lastName === 'Reid', 'Enter saved Reed as Reid');
  check(w.locked('player', PLAYER(DREXEL, 'reed-josh')).join() === 'lastName', 'the save locked lastName and nothing else');
  check((await row.locator('.lock-count').innerText()) === '1 lock', 'the row shows its lock count');
  check((await page.locator('.record .lock-mark').count()) === 1, 'the record panel shows the lock beside Last');
  await shoot(page, 'reed-locked');

  await hover(page, row.locator('.lock-mark').first());
  const tip = page.getByRole('tooltip');
  await tip.waitFor();
  console.log(`     tooltip: ${await tip.innerText()}`);
  check(/^Locked by \S+, /.test(await tip.innerText()), 'hovering the lock says who locked it and when');
  await shoot(page, 'lock-hover');

  await row.locator('.lock-mark').first().click();
  await page.getByRole('dialog', { name: 'Unlock Last' }).waitFor();
  await shoot(page, 'unlock-confirm');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await waitFor('the lock to go', async () => (await world()).locked('player', PLAYER(DREXEL, 'reed-josh')).length === 0);
  await row.locator('.lock-mark').first().waitFor({ state: 'detached' });
  w = await world();
  check(player(w, DREXEL, 'reed-josh').lastName === 'Reid', 'unlocking keeps the value');
  await shoot(page, 'reed-unlocked');
  await page.close();
}

/** Two editors begin on the same revision; the second save is refused and lands the way the second editor picks. */
async function conflictProof() {
  console.log('\nconflicts: two browsers, one basis');
  const alex = await openPage('alex');
  const sam = await openPage('sam');
  for (const page of [alex, sam]) await openTeam(page, 'Drexel · MBB');

  const beginBoth = async (field: string, value: string) => {
    await cell(sam, field, value).click();
    await cell(alex, field, value).click();
  };

  console.log(' keep theirs');
  await beginBoth('Last', 'Tingler');
  await alex.locator('.cell-input').fill('Tingle');
  await alex.keyboard.press('Enter');
  await waitFor('alex save', async () => player(await world(), DREXEL, 'tingler').lastName === 'Tingle');
  await sam.locator('.cell-input').fill('Tinkler');
  await sam.keyboard.press('Enter');
  await sam.locator('.conflict').waitFor();
  check((await sam.locator('.conflict .panel-title').innerText()).toLowerCase().includes('saved first'), 'the refused editor sees a conflict panel');
  check((await sam.locator('.conflict tr[data-field="lastName"]').innerText()).includes('Tingle'), 'it shows theirs beside yours for the changed field');
  check((await sam.locator('.data-row', { hasText: 'Tinkler' }).count()) === 1, 'the refused editor keeps their typing in the table');
  await shoot(sam, 'conflict-keep-theirs');
  await sam.getByRole('button', { name: 'Keep theirs' }).click();
  await sam.locator('.conflict').waitFor({ state: 'detached' });
  check(player(await world(), DREXEL, 'tingler').lastName === 'Tingle', 'keep theirs: the row stays as they saved it');
  check((await sam.locator('.data-row', { hasText: 'Tingle' }).count()) === 1, 'keep theirs: the editor sees theirs');

  console.log(' use yours');
  await beginBoth('Last', 'Edomwonyin');
  await alex.locator('.cell-input').fill('Edom');
  await alex.keyboard.press('Enter');
  await waitFor('alex save', async () => player(await world(), DREXEL, 'edomwonyin').lastName === 'Edom');
  await sam.locator('.cell-input').fill('Edomwonyin-Mine');
  await sam.keyboard.press('Enter');
  await sam.locator('.conflict').waitFor();
  await shoot(sam, 'conflict-use-yours');
  await sam.getByRole('button', { name: 'Use yours' }).click();
  await sam.locator('.conflict').waitFor({ state: 'detached' });
  const w = await world();
  check(player(w, DREXEL, 'edomwonyin').lastName === 'Edomwonyin-Mine', 'use yours: the second editor\'s value is saved, on the new basis');

  console.log(' pick per field');
  const target = PLAYER(DREXEL, 'de-laporterie');
  const jersey = (page: Page, number: string) => page.locator('.data-row').filter({ has: page.getByRole('button', { name: new RegExp(`^# of #${number} `) }) });
  await jersey(sam, '11').getByRole('button', { name: /^Last of / }).click();
  await sam.keyboard.press('Escape');
  const panel = sam.locator('.record-fields');
  await panel.getByRole('textbox', { name: 'Last' }).fill('Delaporterie-Yours');
  await panel.getByRole('textbox', { name: 'Pos' }).fill('G');
  await jersey(alex, '11').getByRole('button', { name: /^Last of / }).click();
  await alex.locator('.cell-input').fill('Delaporterie-Theirs');
  await alex.keyboard.press('Enter');
  await waitFor('alex last-name save', async () => player(await world(), DREXEL, 'de-laporterie').lastName === 'Delaporterie-Theirs');
  await jersey(alex, '11').getByRole('button', { name: /^Class of / }).click();
  await alex.locator('.cell-input').fill('so');
  await alex.keyboard.press('Enter');
  await waitFor('alex class save', async () => player(await world(), DREXEL, 'de-laporterie').classYear === 'SO');
  await sam.getByRole('button', { name: 'Save', exact: true }).click();
  await sam.locator('.conflict').waitFor();
  const rows = sam.locator('.conflict tbody tr');
  const fields = await Promise.all((await rows.all()).map((each) => each.getAttribute('data-field')));
  check(fields.join() === 'lastName,position,classYear', `the conflict lists each changed field (${fields.join(', ')})`);
  await shoot(sam, 'conflict-fields');
  await sam.getByRole('button', { name: 'Pick per field' }).click();
  await sam.locator('.conflict tr[data-field="lastName"]').locator('.radio', { hasText: 'Yours' }).click();
  await shoot(sam, 'conflict-pick-per-field');
  await sam.getByRole('button', { name: 'Save picks' }).click();
  await sam.locator('.conflict').waitFor({ state: 'detached' });
  const picked = player(await world(), DREXEL, 'de-laporterie');
  check(picked.lastName === 'Delaporterie-Yours' && picked.position === 'G' && picked.classYear === 'SO', `pick per field: yours for last name and position, theirs for class (${picked.lastName}, ${picked.position}, ${picked.classYear})`);
  check(player(await world(), DREXEL, 'de-laporterie').id === target, 'the row kept its id');
  await shoot(sam, 'conflict-resolved');
  await alex.close();
  await sam.close();
}

const IMPORT_FILE = [
  'jersey,first_name,last_name,position,class_year,redshirt,hometown,headshot,motion_headshot,source_key',
  '0,,Carey,G,SR,,,,,',
  '1,,Johnson,F,,,,,,',
  '11,,Glover-Toscano,G,,,,,,',
  '15,Luke,Logan,F,,,,,,',
  '24,Ty,House,G,FR,,,,,',
  '33,Bad,Row,G,XX,,,,,',
].join('\n');

async function importProof() {
  console.log("\nimport: Saint Joseph's roster CSV, diff, apply, plan again");
  const page = await openPage('alex');
  await page.getByRole('searchbox', { name: 'Search teams' }).fill('joseph');
  await shoot(page, 'search');
  await page.getByRole('option', { name: "Saint Joseph's · MBB", exact: true }).click();
  await page.waitForSelector('.data-table');

  await cell(page, 'Pos', 'G').nth(1).click();
  await page.locator('.cell-input').fill('G/F');
  await page.keyboard.press('Enter');
  await waitFor('the locked position', async () => (await world()).locked('player', PLAYER(SJU, 'johnson')).join() === 'position');

  const file = join(dir, 'saint-josephs-mbb-2026-27.csv');
  writeFileSync(file, IMPORT_FILE);
  await chooseFile(page, file);
  await page.locator('.import-summary').waitFor();
  const summary = await page.locator('.import-summary').innerText();
  console.log(`     ${summary.replace(/\n/g, ' ')}`);
  for (const part of ['1 added', '2 updated', '1 unchanged', '1 field skipped (locked)', '1 missing', '1 bad row']) check(summary.includes(part), `the preview says "${part}"`);
  const count = (kind: string) => page.locator(`.diff-row.${kind}`).count();
  check((await count('add')) === 1 && (await count('update')) === 3 && (await count('missing')) === 1 && (await count('bad')) === 1, 'the diff table has an add, three updates (one locked-only), a missing player and a bad row');
  check((await page.locator('.diff-row.bad').innerText()).includes('line 7'), 'the bad row names its line');
  const note = (await page.locator('.lock-note').innerText()).replace(/\s+/g, ' ');
  check(note.includes('stays "G/F" (file says "F")'), `the locked field is shown as skipped, with what the file says (${note})`);
  check((await world()).all('player').filter((each) => each.teamId === SJU).length === 5, 'planning wrote nothing');
  await shoot(page, 'import-preview');

  await page.locator('.prune').click();
  await page.locator('.diff-row.missing', { hasText: 'will be removed' }).waitFor();
  await shoot(page, 'import-remove-opted-in');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.locator('.import [role="status"]').waitFor();
  const w = await world();
  const sju = w.roster('saint-josephs-mbb' as never, '2026-27' as never);
  check(player(w, SJU, 'carey').classYear === 'SR', 'Apply: Carey is now SR');
  check(player(w, SJU, 'logan').firstName === 'Luke', 'Apply: Logan gained a first name');
  check(player(w, SJU, 'johnson').position === 'G/F', 'Apply: the locked position stayed as typed');
  check(!!w.get('player', PLAYER(SJU, 'house-ty')), 'Apply: Ty House was added');
  check(!w.get('player', PLAYER(SJU, 'marrs')), 'Apply: Marrs was removed, because the box was ticked');
  check(sju.length === 5, `the roster has ${sju.length} players`);
  await shoot(page, 'import-applied');
  await page.getByRole('button', { name: 'Close' }).click();

  await chooseFile(page, file);
  await page.locator('.import-summary').waitFor();
  check((await page.locator('.import [role="status"]').innerText()).includes('Nothing to do'), 'the same file planned again has nothing to do');
  check(await page.getByRole('button', { name: 'Apply' }).isDisabled(), 'Apply is disabled when there is nothing to do');
  await shoot(page, 'import-plan-again');
  await page.setViewportSize({ width: 1728, height: 1117 });
  await shoot(page, 'import-plan-again-1728');
  await page.close();
}

async function editsProof() {
  console.log('\nedits: a school colour, a branding override, a show\'s crew');
  const page = await openPage('alex');
  await openTeam(page, 'Drexel · MBB');
  await page.getByRole('tab', { name: 'Team and branding' }).click();
  await page.locator('.data-table.branding').waitFor();
  await shoot(page, 'branding');
  await cell(page, 'Primary colour', '#07294d').click();
  await page.locator('.cell-input').fill('0b2a4a');
  await page.keyboard.press('Enter');
  await waitFor('the school colour', async () => (await world()).get('school', 'drexel' as never)?.primaryColor === '#0b2a4a');
  check((await world()).locked('school', 'drexel').includes('primaryColor'), 'the colour edit locked primaryColor');
  await page.locator('.data-row', { hasText: 'Primary colour' }).locator('.lock-mark').first().waitFor();
  await cell(page, 'Primary colour', 'empty').click();
  await page.locator('.cell-input').fill('#123456');
  await page.keyboard.press('Enter');
  await waitFor('the branding override', async () => (await world()).get('team', DREXEL as never)?.branding.primaryColor === '#123456');
  await page.locator('.data-row', { hasText: 'Primary colour' }).getByRole('button', { name: /^Primary colour of .*: #123456\. Edit$/ }).waitFor();
  await shoot(page, 'branding-edited');

  await cell(page, 'Abbreviation', 'DREX').click();
  await page.locator('.cell-input').fill('TOOLONG');
  await page.keyboard.press('Enter');
  const refusal = await page.locator('.cell-error').innerText();
  check(refusal.length > 0 && (await world()).get('school', 'drexel' as never)?.abbreviation === 'DREX', `a bad value is refused in place (${refusal})`);
  await shoot(page, 'refused-in-place');
  await page.keyboard.press('Escape');

  await page.getByRole('option', { name: 'Shows', exact: true }).click();
  await page.locator('.data-table').waitFor();
  await page.locator('.data-row').first().getByRole('gridcell').first().click();
  await page.locator('.crew-row').first().waitFor();
  await shoot(page, 'show-record');
  const before = (await world()).get('show', 'drexel-sju' as never);
  await page.getByRole('textbox', { name: 'Role for crew member 1' }).fill('Lead analyst');
  await page.getByRole('button', { name: 'Remove crew member 3' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Drexel vs Saint Joseph\'s, Oct 21');
  await shoot(page, 'show-edited');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor('the show to save', async () => (await world()).get('show', 'drexel-sju' as never)?.crew.length === 2);
  const after = (await world()).get('show', 'drexel-sju' as never);
  check(before?.crew.length === 3 && after?.crew[0]?.role === 'Lead analyst' && after.name.endsWith('Oct 21'), 'the show\'s name and crew were saved');
  check([...(await world()).locked('show', 'drexel-sju')].sort().join() === 'crew,name', 'the show edit locked name and crew');
  await shoot(page, 'show-saved');
  await page.close();
}

const proofs = { lock: lockProof, conflicts: conflictProof, import: importProof, edits: editsProof };
try {
  await api.show.command({ id: CommandId.parse('proof-activate'), command: { type: 'activate', show: ShowId.parse('drexel-sju') } });
  for (const [name, run] of Object.entries(proofs)) if (!only || only.includes(name)) await run();
} finally {
  connection.close();
  await browser.close();
  server.kill('SIGTERM');
  await server.exited;
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall data-page checks passed');
process.exit(failures.length ? 1 : 0);
