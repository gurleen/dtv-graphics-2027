/**
 * The Player to Watch lower third, plus one thing the Rive scene cannot do: play a
 * video or animated GIF in place of the headshot.
 *
 * The runtime draws no video, so the motion media is an element laid over the canvas,
 * exactly on the scene's headshot frame, and animated in step with the scene's intro
 * and outro. While it is shown the scene hides its still headshot (`_headshotOpacity`).
 * Rive screenshots and the package thumbnail therefore never include it.
 */

import type { RiveGraphicDefinition } from '../../shared/definition';
import { RiveGraphicElement } from '../../shared/rive-graphic-element';
import { DEFINITION } from './definition';

// The headshot frame in canvas units, from generate_player_feature_lower_thirds.ts:
// block origin (260, 802), frame at (8, -84) within it, 212 x 304. The overlay is
// placed in percentages of the 1920 x 1080 canvas, so it follows the canvas's scaling.
const CANVAS = { width: 1920, height: 1080 } as const;
const FRAME = { x: 260 + 8, y: 802 - 84, width: 212, height: 304 } as const;
const FRAME_CORNER = 3;
// The scene's headshot rises from 16 units low.
const RISE = 16;

// Timings from the scene's timelines, in 60 fps frames.
const FRAME_MS = 1000 / 60;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_WIPE = 'cubic-bezier(0.6, 0, 0.1, 1)';
const EASE_IN = 'cubic-bezier(0.7, 0, 0.84, 0)';

/** Formats rendered as an image rather than a video. */
const IMAGE_PATTERN = /\.(gif|webp|apng|png|avif)(?:[?#]|$)/i;
/** How long load() and updateAction() wait for the first frame of new media. */
const MEDIA_READY_TIMEOUT = 5000;

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

const STYLE = `
.media-stage { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.media-frame {
  position: absolute;
  left: ${percent(FRAME.x, CANVAS.width)}; top: ${percent(FRAME.y, CANVAS.height)};
  width: ${percent(FRAME.width, CANVAS.width)}; height: ${percent(FRAME.height, CANVAS.height)};
  overflow: hidden;
  border-bottom-right-radius: ${percent(FRAME_CORNER, FRAME.width)} ${percent(FRAME_CORNER, FRAME.height)};
  clip-path: inset(0 0 0 100%);
}
.media-rise { position: absolute; inset: 0; opacity: 0; }
.media-rise > * { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0%; }
`;

export class BasketballV2PlayerToWatchLowerThird extends RiveGraphicElement {
  protected readonly definition: RiveGraphicDefinition = DEFINITION;

  private frame: HTMLDivElement | null = null;
  private rise: HTMLDivElement | null = null;
  private media: HTMLVideoElement | HTMLImageElement | null = null;
  private mediaUrl = '';
  private onAir = false;
  private animations: Animation[] = [];

  protected override async onDataApplied(data: unknown): Promise<void> {
    this.mountOverlay();
    if (!data || typeof data !== 'object' || !('headshotMediaUrl' in data)) return;
    const url = String((data as { headshotMediaUrl: unknown }).headshotMediaUrl ?? '').trim();
    if (url === this.mediaUrl) return;
    this.mediaUrl = url;
    await this.showMedia(url);
  }

  protected override onAirChanged(onAir: boolean): void {
    if (onAir === this.onAir) return;
    this.onAir = onAir;
    if (onAir) this.playIntro();
    else this.playOutro();
  }

  protected override onDispose(): void {
    this.cancelAnimations();
    this.media?.remove();
    this.media = null;
    this.frame?.parentElement?.remove();
    this.frame = null;
    this.rise = null;
    this.mediaUrl = '';
    this.onAir = false;
  }

  private mountOverlay(): void {
    const stage = this.stage;
    if (this.frame || !stage) return;
    const style = document.createElement('style');
    style.textContent = STYLE;
    const container = document.createElement('div');
    container.className = 'media-stage';
    const frame = document.createElement('div');
    frame.className = 'media-frame';
    const rise = document.createElement('div');
    rise.className = 'media-rise';
    frame.appendChild(rise);
    container.append(style, frame);
    stage.appendChild(container);
    this.frame = frame;
    this.rise = rise;
  }

  /** Replaces the media element; an empty URL, or media that fails, restores the still. */
  private async showMedia(url: string): Promise<void> {
    this.media?.remove();
    this.media = null;
    if (!url || !this.rise) {
      this.setStillVisible(true);
      return;
    }

    const media = IMAGE_PATTERN.test(url) ? this.createImage(url) : this.createVideo(url);
    this.media = media;
    this.rise.appendChild(media);
    const ready = await this.whenReady(media);
    if (this.media !== media) return;
    if (!ready) {
      console.error(`OGraf: could not load the headshot media from ${url}; showing the still headshot`);
      media.remove();
      this.media = null;
      this.setStillVisible(true);
      return;
    }
    this.setStillVisible(false);
    if (media instanceof HTMLVideoElement) void media.play().catch(() => {});
  }

  private createVideo(url: string): HTMLVideoElement {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = url;
    return video;
  }

  private createImage(url: string): HTMLImageElement {
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.src = url;
    return image;
  }

  /** Resolves true once the media can show a frame, false on error or timeout. */
  private whenReady(media: HTMLVideoElement | HTMLImageElement): Promise<boolean> {
    if (media instanceof HTMLImageElement && media.complete) return Promise.resolve(media.naturalWidth > 0);
    if (media instanceof HTMLVideoElement && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const readyEvent = media instanceof HTMLVideoElement ? 'loadeddata' : 'load';
      const settle = (ready: boolean) => {
        clearTimeout(timer);
        media.removeEventListener(readyEvent, onReady);
        media.removeEventListener('error', onError);
        resolve(ready);
      };
      const onReady = () => settle(true);
      const onError = () => settle(false);
      const timer = setTimeout(() => settle(false), MEDIA_READY_TIMEOUT);
      media.addEventListener(readyEvent, onReady);
      media.addEventListener('error', onError);
    });
  }

  private setStillVisible(visible: boolean): void {
    const opacity = this.viewModelInstance?.number('_headshotOpacity');
    if (opacity) opacity.value = visible ? 1 : 0;
  }

  private cancelAnimations(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }

  private startAnimation(element: Element, keyframes: Keyframe[], startFrame: number, endFrame: number, easing: string): void {
    this.animations.push(element.animate(keyframes, {
      delay: startFrame * FRAME_MS,
      duration: (endFrame - startFrame) * FRAME_MS,
      easing,
      fill: 'both',
    }));
  }

  /**
   * The scene's intro for the headshot: the wipe uncovers it right to left over frames
   * 6-34, and it rises 16 units and fades in over frames 8-44 and 8-30.
   */
  private playIntro(): void {
    const { frame, rise } = this;
    if (!frame || !rise) return;
    this.cancelAnimations();
    if (this.media instanceof HTMLVideoElement) {
      this.media.currentTime = 0;
      void this.media.play().catch(() => {});
    }
    const low = `translateY(${percent(RISE, FRAME.height)})`;
    this.startAnimation(frame, [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)' }], 6, 34, EASE_WIPE);
    this.startAnimation(rise, [{ transform: low }, { transform: 'translateY(0)' }], 8, 44, EASE_OUT);
    this.startAnimation(rise, [{ opacity: 0 }, { opacity: 1 }], 8, 30, EASE_OUT);
  }

  /** The scene's outro: the wipe closes over frames 4-24 while the headshot sinks and fades. */
  private playOutro(): void {
    const { frame, rise } = this;
    if (!frame || !rise) return;
    const shownClip = getComputedStyle(frame).clipPath;
    const shownOpacity = getComputedStyle(rise).opacity;
    const shownTransform = getComputedStyle(rise).transform;
    this.cancelAnimations();
    const low = `translateY(${percent(RISE, FRAME.height)})`;
    this.startAnimation(frame, [{ clipPath: shownClip === 'none' ? 'inset(0 0 0 0%)' : shownClip }, { clipPath: 'inset(0 0 0 100%)' }], 4, 24, EASE_IN);
    this.startAnimation(rise, [{ transform: shownTransform === 'none' ? 'translateY(0)' : shownTransform }, { transform: low }], 0, 24, EASE_IN);
    this.startAnimation(rise, [{ opacity: shownOpacity }, { opacity: 0 }], 4, 20, EASE_IN);
  }
}

export default BasketballV2PlayerToWatchLowerThird;
