/**
 * A minimal stand-in renderer for built OGraf packages. Development only: it is never
 * copied into a package.
 *
 *   bun ograf/harness/serve.ts [port]
 *
 * Serves build/ograf/ at /packages/ and the harness page at /. The page is driven off
 * whatever manifests it finds, so it needs no edit when a graphic is added.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const packages = join(root, 'build', 'ograf');
const port = Number(process.argv[2] ?? 8974);

/** Every built package: its id and the manifest path to fetch. */
const listPackages = async () => {
  const found: { id: string; manifest: string }[] = [];
  let entries: string[];
  try {
    entries = await readdir(packages);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!(await stat(join(packages, entry))).isDirectory()) continue;
    const manifest = (await readdir(join(packages, entry))).find((file) => file.endsWith('.ograf.json'));
    if (manifest) found.push({ id: entry, manifest: `/packages/${entry}/${manifest}` });
  }
  return found;
};

const server = Bun.serve({
  port,
  development: true,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === '/packages.json') {
      return Response.json(await listPackages());
    }
    if (pathname === '/' || pathname === '/index.html') {
      return new Response(Bun.file(join(import.meta.dir, 'index.html')), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (pathname === '/harness.js') {
      const built = await Bun.build({
        entrypoints: [join(import.meta.dir, 'harness.ts')],
        target: 'browser',
        format: 'esm',
      });
      if (!built.success) return new Response(built.logs.join('\n'), { status: 500 });
      return new Response(await built.outputs[0]!.text(), {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      });
    }
    if (pathname.startsWith('/packages/')) {
      const file = Bun.file(join(packages, pathname.slice('/packages/'.length)));
      if (await file.exists()) return new Response(file);
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(`OGraf harness on http://localhost:${server.port}`);
for (const entry of await listPackages()) console.log(`  ${entry.id}`);
