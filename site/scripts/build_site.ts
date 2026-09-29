/**
 * Assembles the stakeholder preview site from the built OGraf packages.
 *
 *   bun site/scripts/build_site.ts
 *
 * Run `bun run ograf:build` first (or use `bun run site:build`, which does both). The
 * output is build/site/, a static directory with no server code:
 *
 *   index.html, app.js, style.css   the viewer
 *   graphics.json                   the catalog the viewer reads
 *   graphics/<id>/                  each package as built: manifest, index.mjs, .riv, thumbnail
 *
 * wrangler.jsonc at the repository root serves build/site/ as Workers static assets;
 * any other static host can serve the directory as it is.
 */

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { COMPANION_IDS, PLACEMENT_ORDER, SCOREBUG_ID, placementOf } from '../catalog';

const root = resolve(import.meta.dir, '../..');
const packagesDirectory = join(root, 'build', 'ograf');
const siteDirectory = join(root, 'build', 'site');
const appDirectory = join(root, 'site', 'app');

// --- 1. read the built packages ----------------------------------------------------

interface CatalogEntry {
  id: string;
  name: string;
  placement: string;
  manifest: string;
  thumbnail?: string;
}

const entries: CatalogEntry[] = [];
const packageIds: string[] = [];
for (const entry of await readdir(packagesDirectory).catch(() => [] as string[])) {
  const directory = join(packagesDirectory, entry);
  if (!(await stat(directory)).isDirectory()) continue;
  const manifestFile = (await readdir(directory)).find((file) => file.endsWith('.ograf.json'));
  if (!manifestFile) continue;
  const manifest = JSON.parse(await readFile(join(directory, manifestFile), 'utf8'));
  packageIds.push(entry);
  entries.push({
    id: entry,
    name: manifest.name,
    placement: placementOf(entry),
    manifest: `graphics/${entry}/${manifestFile}`,
    thumbnail: manifest.thumbnails?.[0]?.file ? `graphics/${entry}/${manifest.thumbnails[0].file}` : undefined,
  });
}
if (!entries.length) {
  console.error('No packages in build/ograf. Run: bun run ograf:build');
  process.exit(1);
}

// A stale or mistyped id in site/catalog.ts would silently drop a graphic's scorebug.
for (const id of [SCOREBUG_ID, ...COMPANION_IDS]) {
  if (!packageIds.includes(id)) console.warn(`site/catalog.ts names "${id}", which is not in build/ograf.`);
}

entries.sort(
  (a, b) =>
    PLACEMENT_ORDER.indexOf(a.placement as never) - PLACEMENT_ORDER.indexOf(b.placement as never) ||
    a.name.localeCompare(b.name),
);

// --- 2. write the site -------------------------------------------------------------

await rm(siteDirectory, { recursive: true, force: true });
await mkdir(join(siteDirectory, 'graphics'), { recursive: true });

// Only each package's own folder: the .zip files beside them are not served.
for (const id of packageIds) {
  await cp(join(packagesDirectory, id), join(siteDirectory, 'graphics', id), { recursive: true });
}

await cp(join(appDirectory, 'index.html'), join(siteDirectory, 'index.html'));
await cp(join(appDirectory, 'style.css'), join(siteDirectory, 'style.css'));

// IBM Plex Sans is served from the site itself rather than a font CDN, so the page
// renders the same on a locked-down network and nothing else has to be reachable.
const fontSource = join(root, 'node_modules', '@fontsource', 'ibm-plex-sans', 'files');
await mkdir(join(siteDirectory, 'fonts'), { recursive: true });
for (const weight of [400, 500, 600]) {
  const file = `ibm-plex-sans-latin-${weight}-normal.woff2`;
  await cp(join(fontSource, file), join(siteDirectory, 'fonts', file));
}
await writeFile(
  join(siteDirectory, 'graphics.json'),
  `${JSON.stringify({ scorebug: packageIds.includes(SCOREBUG_ID) ? SCOREBUG_ID : null, graphics: entries }, null, 2)}\n`,
);

const bundle = await Bun.build({
  entrypoints: [join(appDirectory, 'app.ts')],
  target: 'browser',
  format: 'esm',
  minify: true,
  naming: 'app.js',
  outdir: siteDirectory,
});
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log);
  throw new Error('Bundling the site failed');
}

// --- 3. report ---------------------------------------------------------------------

console.log(`Built ${relative(root, siteDirectory)}/ with ${entries.length} graphics:`);
for (const entry of entries) console.log(`  ${entry.placement.padEnd(14)} ${entry.name}`);
console.log('\nPreview locally: bun run site:preview   Publish: bun run site:deploy');
