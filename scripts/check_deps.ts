/**
 * The import table in docs/ARCHITECTURE.md section 1, enforced. Bun hoists every dependency
 * into one node_modules, so an import a workspace may not make still resolves and compiles.
 * This fails `bun run check` when a workspace file imports a package its directory may not,
 * reaches into another package's files, or a package exports more than `.`.
 *
 *   bun scripts/check_deps.ts
 */

import { Glob } from 'bun';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

/** Directory prefix to the imports its files may make. The longest matching prefix wins. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  'packages/domain': ['zod'],
  'packages/db': ['@dtv/domain', 'bun:sqlite', 'node:fs', 'node:path'],
  'packages/playout': ['@dtv/domain', 'zod'],
  // The codegen's template writes an import of @dtv/playout into scenes.gen.ts, which this scan also reads.
  'packages/playout/scripts': ['@dtv/playout', 'node:fs', 'node:path'],
  'graphics/basketball-v2': ['@dtv/playout', '@dtv/domain', 'zod'],
  'graphics/basketball-v2/generate_': ['node:path'],
  'packages/graphics': ['@dtv/basketball-v2', '@dtv/playout', '@dtv/domain', 'zod'],
  'packages/renderer': ['@dtv/playout', '@dtv/domain', '@rive-app/canvas-single'],
  'packages/sportsdataverse': ['@dtv/domain', 'hyparquet', 'hyparquet-compressors'],
  'packages/api': ['@dtv/playout', '@dtv/domain', '@orpc/*', 'partysocket', 'zod'],
  'packages/live-': ['@dtv/api', '@dtv/domain'],
  'apps/server': ['@dtv/api', '@dtv/db', '@dtv/controller', '@dtv/graphics', '@dtv/playout', '@dtv/domain', '@dtv/renderer-page', '@dtv/sportsdataverse', '@orpc/server', 'zod', 'node:fs', 'node:path'],
  'apps/controller': ['@dtv/api', '@dtv/renderer', '@dtv/graphics', '@dtv/playout', '@dtv/domain', 'react', 'react-dom', 'react-dom/*', 'react-aria-components', '@fontsource/*'],
  'apps/renderer': ['@dtv/api', '@dtv/renderer', '@dtv/graphics'],
  // The controller's proofs: operators in a real Chromium against the real server, and the data page's dev stand-in.
  // The scripted game reads the scratch database's journal to show a command pressed during an outage landed once.
  'apps/controller/scripts': ['@dtv/api', '@dtv/graphics', '@dtv/playout', '@dtv/domain', 'react', 'react-dom', 'react-dom/*', '@fontsource/*', 'playwright', 'pngjs', 'bun:sqlite', 'node:*'],
  // The page's proofs: they drive a real server and a real Chromium, and decode its screenshots.
  'apps/renderer/scripts': ['@dtv/api', '@dtv/graphics', '@dtv/playout', '@dtv/domain', 'playwright', 'pngjs', 'node:*'],
  // The two-renderer proof page draws with the renderer, as the controller's monitors will.
  'apps/renderer/scripts/monitors': ['@dtv/api', '@dtv/renderer', '@dtv/graphics', 'node:*'],
  'apps/site/scripts': ['@dtv/db', '@dtv/graphics', '@dtv/playout', '@dtv/domain', 'playwright', 'node:*'],
  'apps/site': ['@dtv/renderer', '@dtv/graphics', '@dtv/playout', '@dtv/domain'],
};

const TEST_ALLOWED = ['bun:test', 'node:*'];

/** What a directory's tests may import beyond its own rules: the golden test binds against the seeded database. */
const TEST_EXTRA: Readonly<Record<string, readonly string[]>> = {
  'graphics/basketball-v2': ['@dtv/db'],
};

const IMPORT = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

const packageName = (specifier: string) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;

const permits = (allowed: readonly string[], name: string) =>
  allowed.some((entry) => (entry.endsWith('*') ? name.startsWith(entry.slice(0, -1)) : entry === name));

const rulesFor = (file: string) =>
  Object.entries(ALLOWED)
    .filter(([prefix]) => file.startsWith(prefix))
    .sort(([a], [b]) => b.length - a.length)[0]?.[1];

const rootManifest = await Bun.file(join(ROOT, 'package.json')).json();
const workspaces: string[] = [];
for (const pattern of rootManifest.workspaces as string[]) {
  for await (const manifest of new Glob(`${pattern}/package.json`).scan({ cwd: ROOT })) workspaces.push(dirname(manifest));
}

const problems: string[] = [];
for (const workspace of workspaces.sort()) {
  const manifest = await Bun.file(join(ROOT, workspace, 'package.json')).json();
  const exported = typeof manifest.exports === 'object' && manifest.exports !== null ? Object.keys(manifest.exports) : [];
  if (exported.length !== 1 || exported[0] !== '.') {
    problems.push(`${workspace}/package.json: exports must name only "." (found ${JSON.stringify(manifest.exports)})`);
  }
  for await (const path of new Glob('**/*.{ts,tsx}').scan({ cwd: join(ROOT, workspace) })) {
    if (path.includes('node_modules/')) continue;
    const file = join(workspace, path);
    const rules = rulesFor(file);
    if (!rules) {
      problems.push(`${file}: no rule in scripts/check_deps.ts`);
      continue;
    }
    const testExtra = Object.entries(TEST_EXTRA).flatMap(([prefix, extra]) => (file.startsWith(prefix) ? extra : []));
    const allowed = /\.test\.tsx?$/.test(file) ? [...rules, ...TEST_ALLOWED, ...testExtra] : rules;
    const source = await Bun.file(join(ROOT, file)).text();
    for (const match of source.matchAll(IMPORT)) {
      const specifier = (match[1] ?? match[2] ?? match[3])!;
      if (specifier.startsWith('.')) {
        const target = relative(join(ROOT, workspace), resolve(ROOT, dirname(file), specifier));
        if (target.startsWith('..')) problems.push(`${file}: imports ${specifier}, which is outside ${workspace}; import its package instead`);
        continue;
      }
      const name = packageName(specifier);
      if (name.startsWith('@dtv/') && specifier !== name) {
        problems.push(`${file}: imports ${specifier}; import ${name}, not its files`);
      } else if (!permits(allowed, name)) {
        problems.push(`${file}: may not import ${name} (allowed: ${allowed.join(', ')})`);
      }
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Module boundaries hold in ${workspaces.length} workspaces.`);
