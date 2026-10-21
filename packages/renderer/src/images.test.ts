import { expect, test } from 'bun:test';
import { createImageCache } from './images';

const rig = () => {
  const decoded: string[] = [];
  const unrefs: string[] = [];
  const cache = createImageCache(async (url: string) => {
    decoded.push(url);
    if (url.includes('missing')) throw new Error(`${url}: 404`);
    return { url, unref: () => unrefs.push(url) };
  });
  return { cache, decoded, unrefs };
};

test('one decode per URL however many users, unref when the last lets go', async () => {
  const { cache, decoded, unrefs } = rig();
  const [a, b] = await Promise.all([cache.acquire('/logo.png'), cache.acquire('/logo.png')]);
  expect(a).toBe(b);
  expect(decoded).toEqual(['/logo.png']);
  cache.release('/logo.png');
  await Bun.sleep(0);
  expect(unrefs).toEqual([]);
  cache.release('/logo.png');
  await Bun.sleep(0);
  expect(unrefs).toEqual(['/logo.png']);
  expect(cache.size).toBe(0);
});

test('a URL acquired again after its release decodes again', async () => {
  const { cache, decoded } = rig();
  await cache.acquire('/logo.png');
  cache.release('/logo.png');
  await cache.acquire('/logo.png');
  expect(decoded).toEqual(['/logo.png', '/logo.png']);
});

test('a failed decode is not cached, so the next acquire tries again', async () => {
  const { cache, decoded } = rig();
  expect(cache.acquire('/missing.png')).rejects.toThrow('404');
  await Bun.sleep(0);
  expect(cache.size).toBe(0);
  expect(cache.acquire('/missing.png')).rejects.toThrow('404');
  await Bun.sleep(0);
  expect(decoded).toEqual(['/missing.png', '/missing.png']);
});

test('a release before the decode lands still unrefs the image', async () => {
  const { cache, unrefs } = rig();
  void cache.acquire('/logo.png');
  cache.release('/logo.png');
  await Bun.sleep(0);
  expect(unrefs).toEqual(['/logo.png']);
});
