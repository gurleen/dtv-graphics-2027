/**
 * Decoded images, shared by every instance on the page and released when the last user lets
 * go. The Rive runtime holds a decoded image until `unref()`, so decoding a logo on each
 * update would leak one image per update. A failed fetch is not cached, so the next user
 * tries again.
 */

import { decodeImage } from '@rive-app/canvas-single';

export type DecodedImage = Awaited<ReturnType<typeof decodeImage>>;

export interface ImageCache {
  /** Rejects when the URL cannot be fetched or decoded; a rejected acquire is not released. */
  acquire(url: string): Promise<DecodedImage>;
  release(url: string): void;
  /** How many URLs are held, for tests and a status line. */
  readonly size: number;
}

interface Held<I> {
  readonly decoding: Promise<I>;
  users: number;
}

export function createImageCache<I extends { unref(): void }>(decode: (url: string) => Promise<I>) {
  const held = new Map<string, Held<I>>();
  return {
    acquire(url: string): Promise<I> {
      const existing = held.get(url);
      if (existing) {
        existing.users++;
        return existing.decoding;
      }
      const entry: Held<I> = { decoding: decode(url), users: 1 };
      held.set(url, entry);
      entry.decoding.catch(() => {
        if (held.get(url) === entry) held.delete(url);
      });
      return entry.decoding;
    },
    release(url: string): void {
      const entry = held.get(url);
      if (!entry || --entry.users > 0) return;
      held.delete(url);
      entry.decoding.then(
        (image) => image.unref(),
        () => {},
      );
    },
    get size() {
      return held.size;
    },
  };
}

const fetchAndDecode = async (url: string): Promise<DecodedImage> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return decodeImage(new Uint8Array(await response.arrayBuffer()));
};

/** The page's one image cache, shared by every renderer on it. */
export const IMAGES: ImageCache = createImageCache(fetchAndDecode);
