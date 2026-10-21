/**
 * Motion media over a scene's still headshot: a <video> or animated image laid exactly on the
 * scene's frame and animated with keyframes copied from the scene's timelines. Rive draws no
 * video, so this is the one thing the renderer draws itself. While media shows, the scene's
 * still is hidden through the entry's `stillOpacity`. Geometry and timings come from the
 * registry entry's `overlay`.
 */

import type { Url } from '@dtv/domain';
import type { AnyGraphic } from '@dtv/playout';

export type MotionMediaSpec = NonNullable<AnyGraphic['overlay']>;

export interface Overlay {
  /** Resolves once the media shows a frame, or has failed and the still is back. */
  setMedia(url: Url | null): Promise<void>;
  setPlaying(playing: boolean): void;
  dispose(): void;
}

const CANVAS = { width: 1920, height: 1080 } as const;
const FRAME_MS = 1000 / 60;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_WIPE = 'cubic-bezier(0.6, 0, 0.1, 1)';
const EASE_IN = 'cubic-bezier(0.7, 0, 0.84, 0)';
/** Formats shown as an image rather than a video. */
const IMAGE = /\.(gif|webp|apng|png|avif)(?:[?#]|$)/i;
const READY_TIMEOUT_MS = 5000;
const HIDDEN_CLIP = 'inset(0 0 0 100%)';
const SHOWN_CLIP = 'inset(0 0 0 0%)';

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * `stage` is the instance's full-size element; positions are percentages of the 1920 x 1080
 * artboard, so the overlay follows the canvas at any size.
 */
export function motionMedia(spec: MotionMediaSpec, stage: HTMLElement, setStillOpacity: (opacity: number) => void): Overlay {
  const { frame } = spec;
  const box = document.createElement('div');
  box.style.cssText = [
    'position:absolute',
    'overflow:hidden',
    'pointer-events:none',
    `left:${percent(frame.x, CANVAS.width)}`,
    `top:${percent(frame.y, CANVAS.height)}`,
    `width:${percent(frame.width, CANVAS.width)}`,
    `height:${percent(frame.height, CANVAS.height)}`,
    `border-bottom-right-radius:${percent(frame.corner, frame.width)} ${percent(frame.corner, frame.height)}`,
    `clip-path:${HIDDEN_CLIP}`,
  ].join(';');
  const rise = document.createElement('div');
  rise.style.cssText = 'position:absolute;inset:0;opacity:0';
  box.append(rise);
  stage.append(box);

  const low = `translateY(${percent(spec.rise, frame.height)})`;
  let media: HTMLVideoElement | HTMLImageElement | null = null;
  let url: Url | null = null;
  let animations: Animation[] = [];

  const animate = (element: Element, keyframes: Keyframe[], [start, end]: readonly [number, number], easing: string) => {
    animations.push(element.animate(keyframes, { delay: start * FRAME_MS, duration: (end - start) * FRAME_MS, easing, fill: 'both' }));
  };
  const cancel = () => {
    for (const animation of animations) animation.cancel();
    animations = [];
  };

  return {
    async setMedia(next) {
      if (next === url) return;
      url = next;
      media?.remove();
      media = null;
      if (!next) return setStillOpacity(1);
      const element = IMAGE.test(next) ? image(next) : video(next);
      element.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0%';
      media = element;
      rise.append(element);
      const ready = await whenReady(element);
      if (media !== element) return;
      if (!ready) {
        console.error(`renderer: could not load the motion media ${next}; showing the still`);
        element.remove();
        media = null;
        return setStillOpacity(1);
      }
      setStillOpacity(0);
      if (element instanceof HTMLVideoElement) void element.play().catch(() => {});
    },
    setPlaying(playing) {
      if (playing) {
        cancel();
        if (media instanceof HTMLVideoElement) {
          media.currentTime = 0;
          void media.play().catch(() => {});
        }
        animate(box, [{ clipPath: HIDDEN_CLIP }, { clipPath: SHOWN_CLIP }], spec.intro.wipe, EASE_WIPE);
        animate(rise, [{ transform: low }, { transform: 'translateY(0)' }], spec.intro.rise, EASE_OUT);
        animate(rise, [{ opacity: 0 }, { opacity: 1 }], spec.intro.fade, EASE_OUT);
        return;
      }
      // From wherever the intro got to, so a take during the intro does not jump.
      const clip = getComputedStyle(box).clipPath;
      const { opacity, transform } = getComputedStyle(rise);
      cancel();
      animate(box, [{ clipPath: clip === 'none' ? SHOWN_CLIP : clip }, { clipPath: HIDDEN_CLIP }], spec.outro.wipe, EASE_IN);
      animate(rise, [{ transform: transform === 'none' ? 'translateY(0)' : transform }, { transform: low }], spec.outro.sink, EASE_IN);
      animate(rise, [{ opacity }, { opacity: 0 }], spec.outro.fade, EASE_IN);
    },
    dispose() {
      cancel();
      media?.remove();
      box.remove();
    },
  };
}

function video(url: string): HTMLVideoElement {
  const element = document.createElement('video');
  element.muted = true;
  element.loop = true;
  element.autoplay = true;
  element.playsInline = true;
  element.preload = 'auto';
  element.crossOrigin = 'anonymous';
  element.src = url;
  return element;
}

function image(url: string): HTMLImageElement {
  const element = document.createElement('img');
  element.alt = '';
  element.decoding = 'async';
  element.src = url;
  return element;
}

/** True once the media can show a frame, false on an error or after the timeout. */
function whenReady(media: HTMLVideoElement | HTMLImageElement): Promise<boolean> {
  if (media instanceof HTMLImageElement && media.complete) return Promise.resolve(media.naturalWidth > 0);
  if (media instanceof HTMLVideoElement && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);
  return new Promise((resolve) => {
    const event = media instanceof HTMLVideoElement ? 'loadeddata' : 'load';
    const settle = (ready: boolean) => {
      clearTimeout(timer);
      media.removeEventListener(event, onReady);
      media.removeEventListener('error', onError);
      resolve(ready);
    };
    const onReady = () => settle(true);
    const onError = () => settle(false);
    const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS);
    media.addEventListener(event, onReady);
    media.addEventListener('error', onError);
  });
}
