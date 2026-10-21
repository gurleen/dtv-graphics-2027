/**
 * Serves build/site/ the way Workers static assets do, for a machine where `wrangler dev`
 * cannot run (it needs Node; under Bun its proxy worker never answers).
 *
 *   bun run site:serve [port]     default 8988
 */

import { join, resolve, sep } from 'node:path';

const ROOT = join(resolve(import.meta.dir, '../../..'), 'build/site');
const port = Number(process.argv[2] ?? 8988);

const server = Bun.serve({
  port,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = resolve(ROOT, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    if (!file.startsWith(ROOT + sep) || !(await Bun.file(file).exists())) return new Response('Not found', { status: 404 });
    return new Response(Bun.file(file));
  },
});
console.log(`build/site on http://localhost:${server.port}`);
