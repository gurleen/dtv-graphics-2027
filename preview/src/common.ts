import { decodeImage } from '@rive-app/canvas';

type DecodedLogo = Awaited<ReturnType<typeof decodeImage>>;

// Each logo decodes once; the engine holds a reference until unref(), so
// re-decoding on every change would leak one image per selection.
const logoCache = new Map<string, Promise<DecodedLogo>>();
export const loadLogo = (url: string) => {
  let pending = logoCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((bytes) => decodeImage(new Uint8Array(bytes)));
    // Do not cache a failure; the next selection should retry the CDN.
    pending.catch(() => logoCache.delete(url));
    logoCache.set(url, pending);
  }
  return pending;
};

/** Releases every decoded logo; only one preview is mounted at a time. */
export const releaseLogos = () => {
  for (const pending of logoCache.values()) pending.then((image) => image.unref(), () => {});
  logoCache.clear();
};

export const hexToRgb = (hex: string) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
] as const;

export const fieldClass = 'w-full rounded-md border border-white/15 bg-[#0c1118] px-2 py-1.5 text-xs outline-none focus:border-sky-400';
