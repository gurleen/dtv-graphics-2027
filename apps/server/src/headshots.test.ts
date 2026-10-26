import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { headshotHandler } from './headshots';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function setup(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'headshots-'));
  dirs.push(dir);
  Bun.write(join(dir, 'placeholder.png'), 'PLACEHOLDER');
  const asked: string[] = [];
  let clock = 0;
  const handle = headshotHandler({
    cacheDir: join(dir, 'cache'),
    origin: 'https://r2.test',
    placeholder: Bun.file(join(dir, 'placeholder.png')),
    now: () => clock,
    fetch: (async (url: string) => {
      asked.push(url);
      const body = files[url.replace('https://r2.test/', '')];
      return body === undefined ? new Response('', { status: 404 }) : new Response(body);
    }) as unknown as typeof fetch,
  });
  const get = (path: string) => handle(new Request(`http://localhost/headshots/${path}`));
  return { dir, asked, get, advance: (ms: number) => (clock += ms) };
}

describe('headshots', () => {
  test('a miss is fetched from the bucket once, then served from disk', async () => {
    const { dir, asked, get } = setup({ '2182/mbb/23.png': 'REED' });
    const first = await get('2182/mbb/23.png');
    expect(await first.text()).toBe('REED');
    expect(first.headers.get('x-headshot-source')).toBe('r2');
    expect(readFileSync(join(dir, 'cache/2182/mbb/23.png'), 'utf8')).toBe('REED');
    const second = await get('2182/mbb/23.png');
    expect(await second.text()).toBe('REED');
    expect(second.headers.get('x-headshot-source')).toBe('cache');
    expect(asked).toHaveLength(1);
  });

  test('a headshot the bucket lacks serves the placeholder, caches nothing and asks again after a minute', async () => {
    const { asked, get, advance } = setup({});
    expect(await (await get('2182/mbb/00.png')).text()).toBe('PLACEHOLDER');
    await get('2182/mbb/00.png');
    expect(asked).toHaveLength(1);
    advance(61_000);
    await get('2182/mbb/00.png');
    expect(asked).toHaveLength(2);
  });

  test('a path that is not <espnId>/<program>/<jersey>.png is a 404 and never reaches the bucket', async () => {
    const { asked, get } = setup({});
    for (const path of ['../../secret.png', '2182/mbb/abc.png', '2182/mbb/23.jpg', '2182/23.png']) {
      expect((await get(path)).status).toBe(404);
    }
    expect(asked).toHaveLength(0);
  });
});
