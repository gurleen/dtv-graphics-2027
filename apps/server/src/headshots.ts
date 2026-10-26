/**
 * `/headshots/<espnId>/<program>/<jersey>.png`, read through a disk cache over the R2 bucket.
 * A hit is served from `cacheDir`. A miss is fetched from `origin` (the bucket's public URL),
 * written to the cache and served. A headshot the bucket lacks, or an origin that is down,
 * serves the placeholder and caches nothing, so the next request asks again after a minute.
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HEADSHOT_KEY, HEADSHOT_ROUTE } from '@dtv/domain';

const MISSING_FOR_MS = 60_000;

export interface HeadshotOptions {
  readonly cacheDir: string;
  readonly origin: string;
  readonly placeholder: ReturnType<typeof Bun.file>;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

export function headshotHandler(options: HeadshotOptions) {
  const { cacheDir, origin, placeholder } = options;
  const get = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const missingUntil = new Map<string, number>();
  const inflight = new Map<string, Promise<Uint8Array | null>>();

  const pull = async (key: string): Promise<Uint8Array | null> => {
    try {
      const response = await get(`${origin}/${key}`);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const file = join(cacheDir, key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.part`, bytes);
      renameSync(`${file}.part`, file);
      return bytes;
    } catch {
      return null;
    }
  };

  const image = (body: Bun.BodyInit, source: string, cache: string) =>
    new Response(body, { headers: { 'content-type': 'image/png', 'cache-control': cache, 'x-headshot-source': source } });

  return async (request: Request): Promise<Response> => {
    let key: string;
    try {
      key = decodeURIComponent(new URL(request.url).pathname.slice(HEADSHOT_ROUTE.length + 1));
    } catch {
      return new Response('Not found', { status: 404 });
    }
    if (!HEADSHOT_KEY.test(key)) return new Response('Not found', { status: 404 });

    const cached = Bun.file(join(cacheDir, key));
    if (await cached.exists()) return image(cached, 'cache', 'no-cache');

    const stillMissing = missingUntil.get(key);
    if (stillMissing !== undefined && stillMissing > now()) return image(placeholder, 'placeholder', 'no-cache');
    let pending = inflight.get(key);
    if (!pending) {
      pending = pull(key).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    const bytes = await pending;
    if (bytes) return image(bytes, 'r2', 'no-cache');
    missingUntil.set(key, now() + MISSING_FOR_MS);
    return image(placeholder, 'placeholder', 'no-cache');
  };
}
