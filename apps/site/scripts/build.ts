/**
 * Builds the stakeholder site into build/site/, plain static files with no server code.
 *
 *   bun run site:build       signed scenes, then this
 *   bun run site:assemble    this alone, from the scenes already in build/riv
 *
 *   index.html, app.js, style.css   the viewer
 *   world.json                      the demo World, the demo game's live state and a show with one cue per graphic
 *   riv/<scene>.riv                 the signed scenes, from `bun run riv:build`
 *   assets/images/...               the images the graphics bind and the sponsors' logos
 *   fonts/                          IBM Plex Sans, self-hosted
 *
 * wrangler.jsonc at the repository root serves build/site/ as Workers static assets.
 */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { loadLive, loadSnapshot, migrate, openDb, seed } from '@dtv/db';
import { Cue, type CueId, type EntityOf, GameId, type GameLive, GraphicId } from '@dtv/domain';
import { GRAPHICS, parseCue } from '@dtv/graphics';
import { boundProps, createLocalShow, FALLBACK_IMAGES } from '@dtv/playout';
import type { SiteWorld } from '../world';

const ROOT = resolve(import.meta.dir, '../../..');
const OUT = join(ROOT, 'build/site');
const APP = join(ROOT, 'apps/site');

const GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
const NOW = Date.parse('2026-11-08T21:00:00Z');

// --- the demo World ----------------------------------------------------------------

const db = openDb(':memory:');
migrate(db, { backupDir: '/dev/null' });
await seed(db, { dir: join(ROOT, 'data/seed') });
const seeded = loadSnapshot(db);
const lives = loadLive(db);
db.sqlite.close();

const show = seeded.entities.show.find((row) => row.id === GAME);
if (!show) throw new Error(`The seed has no show for ${GAME}`);
const live: GameLive | undefined = lives.get(GAME);
if (!live) throw new Error(`The seed has no live state for ${GAME}`);

const cueFor = (id: string): CueId => Cue.shape.id.parse(id.slice(id.indexOf('/') + 1));
const rundown = Object.values(GRAPHICS).map((entry) => {
  const parsed = parseCue(Cue.parse({ id: cueFor(entry.id), graphic: entry.id, params: entry.demo }));
  if (!parsed.ok) throw new Error(`The demo of ${entry.id} does not fit its params: ${parsed.error}`);
  return parsed.cue;
});
const demoShow: EntityOf<'show'> = { ...show, rundown };
const snapshot = { ...seeded, entities: { ...seeded.entities, show: seeded.entities.show.map((row) => (row.id === GAME ? demoShow : row)) } };
const world: SiteWorld = { snapshot, live, gameId: GAME, now: NOW };

// --- every cue binds, and the files it names exist ---------------------------------

const imageUrls = new Set<string>([FALLBACK_IMAGES.blank, FALLBACK_IMAGES.headshot]);
for (const entry of Object.values(GRAPHICS)) {
  const local = createLocalShow({ registry: GRAPHICS, ...world });
  const cue = rundown.find((candidate) => candidate.graphic === GraphicId.parse(entry.id))!;
  local.command({ type: 'air', operator: local.operator, ref: { kind: 'rundown', cue: cue.id } });
  const [layer] = local.frame().layers;
  if (!layer || layer.error) throw new Error(`${entry.id} does not bind its demo: ${layer?.error ?? 'it did not go to air'}`);
  // A later step can bind images the first does not.
  const frames = [layer];
  for (let to = 1; to < (entry.steps?.count ?? 1); to++) {
    local.command({ type: 'step', layer: layer.layer, slot: layer.slot, to });
    frames.push(local.frame().layers[0]!);
  }
  const kinds = boundProps(entry.scene);
  for (const frame of frames) {
    for (const [name, value] of Object.entries(frame.values)) if (kinds.get(name) === 'image') imageUrls.add(String(value));
    if (frame.media) imageUrls.add(frame.media);
  }
}

// Each sponsor's logo is the filter's chip.
for (const sponsor of snapshot.entities.sponsor) {
  for (const url of [sponsor.logoOnDark, sponsor.logoOnLight]) if (url) imageUrls.add(url);
}

// --- write the site ----------------------------------------------------------------

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const copy = async (from: string, to: string) => {
  if (!(await Bun.file(from).exists())) throw new Error(`${relative(ROOT, from)} is missing`);
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
};

// A remote image (a team's logo) is mirrored, so the site needs no other host and no CORS header.
const mirrored = new Map<string, string>();
for (const url of imageUrls) {
  if (url.startsWith('/assets/')) {
    await copy(join(ROOT, url.slice(1)), join(OUT, url.slice(1)));
    continue;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  const local = `/assets/remote${new URL(url).pathname}`;
  await mkdir(dirname(join(OUT, local)), { recursive: true });
  await writeFile(join(OUT, local), new Uint8Array(await response.arrayBuffer()));
  mirrored.set(url, local);
}

const stems = new Set(Object.values(GRAPHICS).map((entry) => entry.scene.file.replace(/\.rml$/, '')));
for (const stem of stems) {
  await copy(join(ROOT, 'build/riv', `${stem}.riv`), join(OUT, 'riv', `${stem}.riv`)).catch(() => {
    throw new Error(`build/riv/${stem}.riv is missing. Run: bun run riv:build`);
  });
}

// IBM Plex Sans is served from the site itself rather than a font CDN, so the page renders the same on a locked-down network.
const fontSource = join(ROOT, 'node_modules/@fontsource/ibm-plex-sans/files');
for (const weight of [400, 500, 600]) {
  const file = `ibm-plex-sans-latin-${weight}-normal.woff2`;
  await copy(join(fontSource, file), join(OUT, 'fonts', file));
}

await copy(join(APP, 'index.html'), join(OUT, 'index.html'));
await copy(join(APP, 'style.css'), join(OUT, 'style.css'));
await writeFile(join(OUT, 'world.json'), [...mirrored].reduce((json, [url, local]) => json.replaceAll(JSON.stringify(url), JSON.stringify(local)), JSON.stringify(world)));

const bundle = await Bun.build({ entrypoints: [join(APP, 'main.ts')], target: 'browser', format: 'esm', minify: true, naming: 'app.js', outdir: OUT });
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log);
  throw new Error('Bundling the site failed');
}

console.log(`Built ${relative(ROOT, OUT)}/ with ${Object.keys(GRAPHICS).length} graphics, ${stems.size} scenes and ${imageUrls.size} images.`);
console.log('Preview locally: bun run site:preview');
