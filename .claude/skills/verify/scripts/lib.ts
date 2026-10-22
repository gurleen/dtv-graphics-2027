/**
 * What a verification journey needs against an instance `dtv.sh up` started: operator pages
 * in Chromium, /renderer pages, the layer states each renderer puts on `window`, the real
 * @dtv/api client, and an evidence folder that outlives `dtv.sh down`.
 *
 *   import { session } from '../scripts/lib';
 *   const s = await session('my-journey');      // reads --port=8998 (default)
 *   ...
 *   await s.finish();                           // writes checks.json, exits 1 on a failed check
 *
 * Evidence: build/verify/<UTC stamp>-<journey>/ under the repo root.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type * as DtvApi from '@dtv/api';
import type * as Playwright from 'playwright';

export const ROOT = resolve(import.meta.dir, '../../../..');
// This folder has no node_modules of its own; the controller's proofs resolve the same packages.
const FROM = join(ROOT, 'apps/controller/scripts');
const { chromium } = (await import(Bun.resolveSync('playwright', FROM))) as typeof Playwright;
const { connect, first } = (await import(Bun.resolveSync('@dtv/api', FROM))) as typeof DtvApi;

export type Layer = 'bug' | 'lower' | 'card';
/** A layer as a renderer holds it: `phase` is empty, loading, entering, on or leaving. */
export interface Drawn {
  readonly phase: string;
  readonly graphic?: string;
  readonly slot?: string;
  readonly step?: number;
}
/** What a wait expects of each named layer: on with that graphic id, or empty. */
export type Want = Partial<Record<Layer, string | { graphic: string; step: number } | 'empty'>>;

const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

export async function session(journey: string) {
  const port = Number(flag('port') ?? 8998);
  const origin = `http://localhost:${port}`;
  const out = join(ROOT, 'build/verify', `${new Date().toISOString().replace(/[:.]/g, '-')}-${journey}`);
  mkdirSync(out, { recursive: true });
  const log = (line: string) => {
    console.log(line);
    appendFileSync(join(out, 'log.txt'), `${line}\n`);
  };
  log(`${journey} against ${origin}; evidence in ${out}`);

  const checks: { ok: boolean; what: string }[] = [];
  const check = (ok: boolean, what: string) => {
    checks.push({ ok, what });
    log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    return ok;
  };

  const browser = await chromium.launch();
  const contexts: Playwright.BrowserContext[] = [];
  const connection = connect({ url: `ws://localhost:${port}/rpc`, client: `verify-${journey}` });
  let commands = 0;
  let shots = 0;

  const watchConsole = (page: Playwright.Page, who: string) => {
    page.on('console', (message) => {
      if (message.type() === 'error' && !/WebSocket/.test(message.text())) log(`  console ${who}: ${message.text()}`);
    });
    page.on('pageerror', (error) => log(`  page error ${who}: ${error.message}`));
  };

  const newContext = async (viewport: { width: number; height: number }, name: string) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.tracing.start({ screenshots: true, snapshots: true, title: name });
    contexts.push(context);
    return context;
  };

  /** Polls `read` until `test` passes or 15 s go by; records one check either way. */
  const until = async <T>(what: string, read: () => Promise<T>, test: (value: T) => boolean): Promise<boolean> => {
    const deadline = Date.now() + 15_000;
    let last: T | undefined;
    while (Date.now() < deadline) {
      last = await read();
      if (test(last)) return check(true, what);
      await Bun.sleep(50);
    }
    return check(false, `${what} (last saw ${JSON.stringify(last)})`);
  };

  const matches = (drawn: Record<string, Drawn> | null, want: Want) =>
    drawn !== null &&
    Object.entries(want).every(([layer, expected]) => {
      const state = drawn[layer];
      if (!state) return false;
      if (expected === 'empty') return state.phase === 'empty';
      const graphic = typeof expected === 'string' ? expected : expected!.graphic;
      return state.phase === 'on' && state.graphic === graphic && (typeof expected === 'string' || state.step === expected!.step);
    });

  const s = {
    port,
    origin,
    out,
    api: connection.api,
    check,
    log,
    until,

    /** A controller page as `operator` (stored under localStorage `dtv.operator`), on `#/show` or `#/data`. */
    async operator(operator: string, route: 'show' | 'data' = 'show') {
      const context = await newContext({ width: 1440, height: 900 }, operator);
      await context.addInitScript((name) => localStorage.setItem('dtv.operator', name), operator);
      const page = await context.newPage();
      watchConsole(page, operator);
      await page.goto(`${origin}/#/${route}`);
      await page.locator('.topbar').waitFor();
      return page;
    },

    /** A 1920 x 1080 `/renderer` page, once its output stream is live. `path` may carry `?bus=preview&operator=<id>`. */
    async renderer(path = '/renderer') {
      const context = await newContext({ width: 1920, height: 1080 }, path);
      const page = await context.newPage();
      watchConsole(page, path);
      await page.goto(`${origin}${path}`);
      await page.waitForFunction("document.body.dataset.status === 'live'");
      return page;
    },

    /** Layers of a controller monitor: `preview`, `program`, or `other:<operator>`. Null until it mounts. */
    monitor: (page: Playwright.Page, name: string): Promise<Record<string, Drawn> | null> =>
      page.evaluate(`(() => {
        const handle = window.dtvMonitors && window.dtvMonitors[${JSON.stringify(name)}];
        if (!handle) return null;
        return Object.fromEntries(Object.entries(handle.renderer.layers()).map(([layer, s]) =>
          [layer, s.phase === 'empty' ? { phase: 'empty' } : { phase: s.phase, graphic: s.frame.graphic, slot: s.frame.slot, step: s.frame.step }]));
      })()`),

    /** Layers of a `/renderer` page (or a site page), from `window.dtvRenderer`. */
    rendered: (page: Playwright.Page): Promise<Record<string, Drawn> | null> =>
      page.evaluate(`(() => {
        if (!window.dtvRenderer) return null;
        return Object.fromEntries(Object.entries(window.dtvRenderer.layers()).map(([layer, s]) =>
          [layer, s.phase === 'empty' ? { phase: 'empty' } : { phase: s.phase, graphic: s.frame.graphic, slot: s.frame.slot, step: s.frame.step }]));
      })()`),

    waitMonitor: (page: Playwright.Page, name: string, want: Want, what: string) => until(what, () => s.monitor(page, name), (drawn) => matches(drawn, want)),
    waitRendered: (page: Playwright.Page, want: Want, what: string) => until(what, () => s.rendered(page), (drawn) => matches(drawn, want)),

    /** Numbered screenshot in the evidence folder; with `selector`, only that element. */
    async shoot(page: Playwright.Page, name: string, selector?: string) {
      const path = join(out, `${String(++shots).padStart(2, '0')}-${name}.png`);
      if (selector) await page.locator(selector).screenshot({ path });
      else await page.screenshot({ path, omitBackground: true });
      log(`     ${path.replace(`${ROOT}/`, '')}`);
    },

    /** The server's view for one operator: active game, rundown, my preview, program. */
    view: (operator: string) => first((signal) => connection.api.show.watch({ operator: operator as never }, { signal })),
    world: () => first((signal) => connection.api.data.watch(undefined, { signal })),
    /** A game's live state: score, clock, shot clock, period, possession. */
    live: (game: string) => first((signal) => connection.api.game.watch({ game: game as never }, { signal })),
    /** A show command, with a fresh id so the server never answers it from its repeat cache. */
    command: (command: Parameters<DtvApi.Api['show']['command']>[0]['command']) =>
      connection.api.show.command({ id: `verify-${process.pid}-${++commands}` as never, command }),

    /** Runs the journey; a throw becomes a failed check and a screenshot of every open page, then `finish`. */
    async run(journeyBody: () => Promise<void>): Promise<never> {
      try {
        await journeyBody();
      } catch (error) {
        check(false, `threw: ${error instanceof Error ? error.message : String(error)}`);
        for (const page of contexts.flatMap((context) => context.pages())) await s.shoot(page, 'at-failure').catch(() => {});
      }
      return s.finish();
    },

    /** Saves each context's trace, writes checks.json, closes everything, exits 1 on a failed check. */
    async finish(): Promise<never> {
      for (const [index, context] of contexts.entries()) await context.tracing.stop({ path: join(out, `trace-${index + 1}.zip`) }).catch(() => {});
      await browser.close();
      connection.close();
      const failed = checks.filter((each) => !each.ok);
      writeFileSync(join(out, 'checks.json'), `${JSON.stringify({ journey, origin, at: new Date().toISOString(), failed: failed.length, checks }, null, 2)}\n`);
      log(failed.length ? `\n${failed.length} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
      process.exit(failed.length ? 1 : 0);
    },
  };
  return s;
}
