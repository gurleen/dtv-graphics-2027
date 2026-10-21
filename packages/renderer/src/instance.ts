/**
 * One scene on one canvas: the only module that touches the Rive runtime. It writes values
 * by the kinds in the scene facts and knows nothing about any graphic.
 */

import { boundProps, type SceneFacts, type WireValue } from '@dtv/playout';
import { Rive, RiveFile, type ViewModelInstance } from '@rive-app/canvas-single';
import { type DecodedImage, IMAGES } from './images';

export interface SceneInstance {
  /** The element overlays draw into, above the canvas and the same size. */
  readonly stage: HTMLElement;
  /** Writes each value by its kind. Resolves once its images are bound; a failed image binds the blank image. */
  write(values: Readonly<Record<string, WireValue>>): Promise<void>;
  setNumber(name: string, value: number): void;
  setPlaying(playing: boolean): void;
  /** Resolves once `signal` reads 0, or on a timer: `fallbackMs` with no signal, a second more with one that never reads 0. */
  exited(signal: string | undefined, fallbackMs: number): Promise<ExitedBy>;
  dispose(): void;
}

export type ExitedBy = 'signal' | 'timer';

/** One RiveFile per .riv on the page, fetched once and shared by every instance that plays it. */
const files = new Map<string, Promise<RiveFile>>();

function riveFile(url: string): Promise<RiveFile> {
  let loading = files.get(url);
  if (!loading) {
    loading = new Promise<RiveFile>((resolve, reject) => {
      const file = new RiveFile({
        src: url,
        onLoad: () => {
          // The cache's own reference. The last instance's cleanup() would otherwise destroy the file.
          file.getInstance();
          resolve(file);
        },
        onLoadError: () => reject(new Error(`Could not load ${url}`)),
      });
      void file.init().catch(reject);
    });
    loading.catch(() => files.delete(url));
    files.set(url, loading);
  }
  return loading;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const rgb = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];

/**
 * Lays a full-size canvas into `parent`, loads the scene on it with every value written and
 * `isPlaying` false, and waits two frames so the state machine has advanced on those values
 * before anything sets `isPlaying`. Cleans up after itself when it fails.
 */
export async function loadInstance(options: {
  readonly parent: HTMLElement;
  readonly url: string;
  readonly scene: SceneFacts;
  readonly values: Readonly<Record<string, WireValue>>;
  readonly blankImage: string;
}): Promise<SceneInstance> {
  const { scene, blankImage } = options;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  stage.append(canvas);
  // Laid out before the load: the runtime sizes the drawing surface from the canvas's box.
  options.parent.append(stage);

  let rive: Rive | undefined;
  let resize: ResizeObserver | undefined;
  /** URL each image property holds, so a replaced image is released. */
  const images = new Map<string, string>();
  /** The newest write of each image property, so a slow decode never lands over a newer one. */
  const latestImage = new Map<string, string>();
  let disposed = false;

  const dispose = () => {
    disposed = true;
    resize?.disconnect();
    rive?.cleanup();
    for (const url of images.values()) IMAGES.release(url);
    images.clear();
    stage.remove();
  };

  try {
    const file = await riveFile(options.url);
    const loaded = await new Promise<{ rive: Rive; instance: ViewModelInstance }>((resolve, reject) => {
      const created: Rive = new Rive({
        riveFile: file,
        canvas,
        artboard: scene.artboard,
        stateMachine: scene.stateMachine,
        autoplay: true,
        autoBind: false,
        onLoad: () => {
          created.resizeDrawingSurfaceToCanvas();
          const instance = created.viewModelByName(scene.viewModel)?.defaultInstance();
          if (!instance) return reject(new Error(`${scene.file} has no Default instance of ${scene.viewModel}`));
          created.bindViewModelInstance(instance);
          resolve({ rive: created, instance });
        },
        onLoadError: () => reject(new Error(`Rive could not load ${scene.artboard} from ${options.url}`)),
      });
      rive = created;
    });
    const { instance } = loaded;
    resize = new ResizeObserver(() => loaded.rive.resizeDrawingSurfaceToCanvas());
    resize.observe(canvas);

    const bindImage = async (name: string, url: string): Promise<void> => {
      latestImage.set(name, url);
      let image: DecodedImage;
      let bound = url;
      try {
        image = await IMAGES.acquire(url);
      } catch (error) {
        console.error(`renderer: ${name} could not load ${url}; binding the blank image`, error);
        try {
          image = await IMAGES.acquire(blankImage);
          bound = blankImage;
        } catch {
          return;
        }
      }
      if (disposed || latestImage.get(name) !== url) {
        IMAGES.release(bound);
        return;
      }
      const previous = images.get(name);
      images.set(name, bound);
      const property = instance.image(name);
      // The setter reads the wrapper's `nativeImage`; its declared type names the native image instead.
      if (property) property.value = image as never;
      if (previous) IMAGES.release(previous);
    };

    const kinds = boundProps(scene);
    const write = async (values: Readonly<Record<string, WireValue>>) => {
      if (disposed) return;
      const decoding: Promise<void>[] = [];
      for (const [name, value] of Object.entries(values)) {
        const kind = kinds.get(name);
        if (kind === 'string') setValue(instance.string(name), String(value));
        else if (kind === 'number') setValue(instance.number(name), Number(value));
        else if (kind === 'boolean') setValue(instance.boolean(name), Boolean(value));
        else if (kind === 'color') instance.color(name)?.rgb(...rgb(String(value)));
        else if (kind === 'image') decoding.push(bindImage(name, String(value)));
      }
      await Promise.all(decoding);
    };

    instance.boolean('isPlaying')!.value = false;
    await write(options.values);
    await nextFrame();
    await nextFrame();

    return {
      stage,
      write,
      setNumber: (name, value) => setValue(instance.number(name), value),
      setPlaying: (playing) => {
        instance.boolean('isPlaying')!.value = playing;
      },
      exited: (signal, fallbackMs) =>
        new Promise<ExitedBy>((resolve) => {
          const property = signal ? instance.number(signal) : null;
          const done = (by: ExitedBy) => {
            clearTimeout(timer);
            property?.off(check);
            resolve(by);
          };
          const check = () => {
            if (property && property.value <= 0) done('signal');
          };
          // With a signal, a ceiling a second past the Outro, so a scene that never reports cannot hold the layer.
          const timer = setTimeout(() => done('timer'), property ? fallbackMs + 1000 : fallbackMs);
          property?.on(check);
          check();
        }),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

const setValue = <T>(property: { value: T } | null | undefined, value: T) => {
  if (property) property.value = value;
};
