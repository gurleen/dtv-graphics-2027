/**
 * Serves the dev page and the repo's assets. The page reaches the show server's /rpc itself.
 *
 *   bun apps/controller/scripts/data-dev/serve.ts [port]
 */

import { join } from 'node:path';
import page from './index.html';

const ROOT = join(import.meta.dir, '../../../..');

export function serveDataDev(options: { readonly port: number }) {
  const server = Bun.serve({
    port: options.port,
    routes: {
      '/': page,
      '/assets/*': (request) => {
        const path = decodeURIComponent(new URL(request.url).pathname.slice('/assets/'.length));
        if (path.split('/').includes('..')) return new Response('Not found', { status: 404 });
        return new Response(Bun.file(join(ROOT, 'assets', path)));
      },
    },
  });
  return { origin: `http://localhost:${options.port}`, stop: () => server.stop(true) };
}

if (import.meta.main) {
  const dev = serveDataDev({ port: Number(process.argv[2] ?? 8993) });
  console.info(`data page dev on ${dev.origin}`);
}
