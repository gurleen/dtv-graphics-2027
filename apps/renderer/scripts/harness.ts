/**
 * What the page's proofs share: the real server on a scratch database, a headless Chromium
 * on /renderer at 1920 x 1080, and an @dtv/api client that runs the show.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Api, connect, first } from '@dtv/api';
import { CommandId, type LayerFrame, type LayerId, type OutputFrame, type ShowCommand } from '@dtv/playout';
import { type Browser, chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';

export const ROOT = resolve(import.meta.dir, '../../..');
const MAIN = join(ROOT, 'apps/server/src/main.ts');

export interface Rig {
  readonly origin: string;
  readonly api: Api;
  readonly page: Page;
  /** Another 1920 x 1080 page on the same server, once its output stream is live. */
  open(path: string): Promise<Page>;
  command(command: ShowCommand): Promise<{ changed: boolean }>;
  /** The newest program frame. */
  program(): Promise<OutputFrame>;
  /** Waits until each named layer is on, its intro done, and every other layer is empty. */
  settle(on: Partial<Record<LayerId, 'on'>>): Promise<void>;
  /** The page as RGBA, transparent where nothing draws. */
  screenshot(path?: string): Promise<PNG>;
  close(): Promise<void>;
}

let commands = 0;

export async function startRig(options: { readonly port: number }): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), 'dtv-renderer-'));
  const server = Bun.spawn(['bun', MAIN, '--seed'], {
    env: { ...process.env, PORT: String(options.port), DTV_DB: join(dir, 'dtv.sqlite') },
    stdout: 'pipe',
    stderr: 'inherit',
  });
  let output = '';
  for await (const chunk of server.stdout) {
    output += new TextDecoder().decode(chunk);
    if (/dtv server on/.test(output)) break;
  }
  if (!/dtv server on/.test(output)) throw new Error(`the server exited before serving:\n${output}`);
  const origin = `http://localhost:${options.port}`;

  const connection = connect({ url: `ws://localhost:${options.port}/rpc`, client: 'renderer-proof' });
  const browser: Browser = await chromium.launch();
  const open = async (path: string) => {
    const opened = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    opened.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') console.log(`  page ${message.type()}: ${message.text()}`);
    });
    opened.on('pageerror', (error) => console.log(`  page error: ${error.message}`));
    await opened.goto(`${origin}${path}`);
    await waitLive(opened);
    return opened;
  };
  const page = await open('/renderer');

  const { api } = connection;
  return {
    origin,
    api,
    page,
    open,
    command: (command) => api.show.command({ id: CommandId.parse(`proof-${process.pid}-${++commands}`), command }),
    program: () => first((signal) => api.output.watch({ bus: { kind: 'program' } }, { signal })),
    async settle(on) {
      const want = JSON.stringify(on);
      await page.waitForFunction(`Object.entries(dtvRenderer.layers()).every(([layer, state]) => state.phase === (${want}[layer] ?? 'empty'))`, null, {
        timeout: 20_000,
        polling: 16,
      });
    },
    async screenshot(path) {
      const bytes = await page.screenshot({ omitBackground: true, type: 'png', ...(path ? { path } : {}) });
      return PNG.sync.read(bytes);
    },
    async close() {
      connection.close();
      await browser.close();
      server.kill('SIGTERM');
      await server.exited;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Waits for the page's output stream to be live. */
export const waitLive = (page: Page) => page.waitForFunction("document.body.dataset.status === 'live'");

/** Each layer's phase and slot, as the page's renderer holds them. */
export const pageLayers = (page: Page): Promise<string> => page.evaluate('JSON.stringify(dtvRenderer.layers())');

/** The program frame's layer, once it holds a slot other than `not`. */
export async function waitForLayer(rig: Rig, layer: LayerId, ready: (frame: LayerFrame) => boolean): Promise<LayerFrame> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = (await rig.program()).layers.find((each) => each.layer === layer);
    if (found && ready(found)) return found;
    await Bun.sleep(50);
  }
  throw new Error(`program's ${layer} layer never got there`);
}
