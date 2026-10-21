/** Serves the two-renderer page, the signed scenes and the assets; the page reaches the show server's /rpc itself. */

import { join } from 'node:path';
import page from './index.html';

const ROOT = join(import.meta.dir, '../../../..');

const under = (dir: string, prefix: string) => (request: Request) => {
  const path = decodeURIComponent(new URL(request.url).pathname.slice(prefix.length));
  if (path.split('/').includes('..')) return new Response('Not found', { status: 404 });
  return new Response(Bun.file(join(dir, path)));
};

export function serveMonitors(options: { readonly port: number; readonly rpc: string }) {
  const server = Bun.serve({
    port: options.port,
    routes: {
      '/monitors': page,
      '/riv/*': under(join(ROOT, 'build/riv'), '/riv/'),
      '/assets/*': under(join(ROOT, 'assets'), '/assets/'),
    },
  });
  const origin = `http://localhost:${options.port}`;
  return { origin, url: (operator: string) => `${origin}/monitors?operator=${operator}&rpc=${encodeURIComponent(options.rpc)}`, stop: () => server.stop(true) };
}
