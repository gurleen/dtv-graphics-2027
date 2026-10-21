/**
 * Proves the built site in a real Chromium: every graphic's page after Show settles, one
 * stepped graphic after Next, and one content-form edit. Serve build/site/ first
 * (`bun run site:preview`).
 *
 *   bun apps/site/scripts/screenshots.ts [origin] [out-dir]     defaults: http://localhost:8787 build/screenshots/site
 */

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GRAPHICS } from '@dtv/graphics';
import { type Browser, chromium, type Page } from 'playwright';

const ROOT = resolve(import.meta.dir, '../../..');
const origin = process.argv[2] ?? 'http://localhost:8787';
const out = resolve(ROOT, process.argv[3] ?? 'build/screenshots/site');
await mkdir(out, { recursive: true });

const problems: string[] = [];

const open = async (browser: Browser, id: string): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${id} console ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`${id} page error: ${error.message}`));
  await page.goto(`${origin}/#${id}`);
  return page;
};

/** Every layer is on or empty, and one is on. */
const settled = (page: Page) =>
  page.waitForFunction(
    `(() => { if (!window.dtvRenderer) return false; const phases = Object.values(window.dtvRenderer.layers()).map((state) => state.phase); return phases.includes('on') && phases.every((phase) => phase === 'on' || phase === 'empty'); })()`,
    null,
    { timeout: 20_000, polling: 16 },
  );

const shoot = (page: Page, name: string) => page.screenshot({ path: join(out, `${name}.png`) });
const nameOf = (id: string) => id.replace(/^[^/]+\//, '');

const browser = await chromium.launch();
try {
  for (const entry of Object.values(GRAPHICS)) {
    const page = await open(browser, entry.id);
    await settled(page);
    await shoot(page, nameOf(entry.id));
    console.log(`${nameOf(entry.id)}`);
    await page.close();
  }

  const stepped = Object.values(GRAPHICS).find((entry) => entry.id === 'basketball-v2/burning-question')!;
  const page = await open(browser, stepped.id);
  await settled(page);
  await page.click('#next');
  await page.waitForTimeout(250);
  await settled(page);
  await page.waitForTimeout(1500);
  await shoot(page, `${nameOf(stepped.id)}-next`);

  await page.click('#content summary');
  await page.fill('#fields input[name="answer"]', 'Someone Else');
  await page.waitForTimeout(800);
  await shoot(page, `${nameOf(stepped.id)}-edited`);
  await page.close();

  const edited = await open(browser, 'basketball-v2/score-to-break');
  await settled(edited);
  await edited.click('#content summary');
  await edited.selectOption('#fields select[name="side"]', 'right');
  await edited.waitForTimeout(1500);
  await shoot(edited, 'score-to-break-right');
  await edited.close();

  const filtered = await open(browser, 'basketball-v2/scorebug');
  await settled(filtered);
  await filtered.click('[data-sponsor="belfor"]');
  const visible = await filtered.locator('#list a:visible').allTextContents();
  if (visible.join() !== 'Player To Watch') problems.push(`the Belfor filter lists ${JSON.stringify(visible)}`);
  await filtered.click('#list a:visible');
  await filtered.waitForFunction(`document.title.startsWith('Player To Watch')`, null, { timeout: 5_000 });
  await settled(filtered);
  await shoot(filtered, 'sponsor-filter');
  await filtered.close();
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problems:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nScreenshots in ${out}`);
