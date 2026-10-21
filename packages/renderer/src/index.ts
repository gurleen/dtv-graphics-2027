/**
 * Draws output frames. One module serves the /renderer page, the controller's preview and
 * program monitors, and the site. It holds no data and runs no binds: each layer runs the
 * state machine in layer.ts, and this file runs its effects against the Rive runtime.
 *
 *   const renderer = createRenderer({ host, registry: GRAPHICS, rivUrl: (scene) => `/riv/${scene.file.replace(/\.rml$/, '.riv')}`, blankImage });
 *   renderer.render(frame); // as often as frames arrive; a repeated frame changes nothing
 *
 * Several renderers can share a page at different sizes. The host's box sets the scale;
 * only the RiveFile and decoded-image caches are shared.
 */

import { type AnyGraphic, flatten, LAYERS, type LayerFrame, type LayerId, type OutputFrame, type Registry, type SceneFacts } from '@dtv/playout';
import { type Effect, EMPTY, INTRO, type LayerEvent, type LayerRules, type LayerState, transition } from './layer';
import { loadInstance, type SceneInstance } from './instance';
import { motionMedia, type Overlay } from './overlays/motion-media';

export type { LayerState } from './layer';

export interface RendererOptions {
  /** Laid out before the first render, 16:9: every layer fills it. */
  readonly host: HTMLElement;
  readonly registry: Registry;
  /** Where the signed .riv for a scene is served. */
  readonly rivUrl: (scene: SceneFacts) => string;
  /** Bound in place of an image that fails to load, so a scene's embedded test image never shows. */
  readonly blankImage: string;
  /** A layer's problem, such as a failed load, for a status line. */
  readonly onProblem?: (layer: LayerId, message: string) => void;
}

export interface Renderer {
  /** Converge on this frame. A layer missing from it goes off air. */
  render(frame: OutputFrame): void;
  /** Each layer's phase and slot, for tests and a status line. */
  layers(): Readonly<Record<LayerId, LayerState>>;
  dispose(): void;
}

interface LayerRun {
  readonly element: HTMLElement;
  state: LayerState;
  instance: SceneInstance | null;
  overlay: Overlay | null;
}

const NO_RULES: LayerRules = { frozenOnAir: new Set(), stepKeys: new Set(), transition: null };

function rulesFor(entry: AnyGraphic | undefined): LayerRules {
  if (!entry) return NO_RULES;
  const stepKeys = new Set<string>();
  for (let step = 0; step < (entry.steps?.count ?? 0); step++) {
    for (const name of Object.keys(flatten(entry.steps!.values(step), entry.scene))) stepKeys.add(name);
  }
  return { frozenOnAir: new Set(entry.frozenOnAir ?? []), stepKeys, transition: entry.steps?.transition ?? null };
}

export function createRenderer(options: RendererOptions): Renderer {
  const { host, registry } = options;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const rules = new Map<string, LayerRules>();
  const rulesOf = (frame: LayerFrame) => {
    let found = rules.get(frame.graphic);
    if (!found) rules.set(frame.graphic, (found = rulesFor(registry[frame.graphic])));
    return found;
  };

  // Bottom to top, in LAYERS order.
  const runs = new Map<LayerId, LayerRun>(
    LAYERS.map((layer) => {
      const element = document.createElement('div');
      element.dataset.layer = layer;
      element.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      host.append(element);
      return [layer, { element, state: EMPTY, instance: null, overlay: null }];
    }),
  );
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, then: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      then();
    }, ms);
    timers.add(timer);
  };

  const dispatch = (layer: LayerId, event: LayerEvent) => {
    if (disposed) return;
    const run = runs.get(layer)!;
    const { state, effects } = transition(run.state, event, rulesOf);
    run.state = state;
    for (const effect of effects) perform(layer, run, effect);
  };

  const problem = (layer: LayerId, message: string) => {
    console.error(`renderer: ${layer}: ${message}`);
    options.onProblem?.(layer, message);
  };

  /** The frame whose instance the layer holds: every state but empty has one. */
  const frameOf = (run: LayerRun) => (run.state.phase === 'empty' ? null : run.state.frame);

  function perform(layer: LayerId, run: LayerRun, effect: Effect): void {
    const frame = frameOf(run);
    const entry = frame ? registry[frame.graphic] : undefined;
    switch (effect.type) {
      case 'load':
        return void load(layer, run, effect.frame);
      case 'write':
        void run.instance?.write(effect.values);
        return;
      case 'media':
        void run.overlay?.setMedia(effect.url);
        return;
      case 'play': {
        run.instance?.setPlaying(true);
        run.overlay?.setPlaying(true);
        const slot = frame!.slot;
        return after(entry?.scene.animations[INTRO] ?? 0, () => dispatch(layer, { type: 'animated', slot }));
      }
      case 'animate': {
        const slot = frame!.slot;
        return after(entry?.scene.animations[effect.animation] ?? 0, () => dispatch(layer, { type: 'animated', slot }));
      }
      case 'stop': {
        run.instance?.setPlaying(false);
        run.overlay?.setPlaying(false);
        const slot = frame!.slot;
        const outro = entry?.scene.animations.Outro ?? 0;
        if (!run.instance) return after(outro, () => dispatch(layer, { type: 'exited', slot }));
        void run.instance.exited(entry?.exitSignal, outro).then(() => dispatch(layer, { type: 'exited', slot }));
        return;
      }
      case 'dispose':
        run.overlay?.dispose();
        run.instance?.dispose();
        run.overlay = null;
        run.instance = null;
        return;
    }
  }

  async function load(layer: LayerId, run: LayerRun, frame: LayerFrame): Promise<void> {
    const entry = registry[frame.graphic];
    try {
      if (!entry) throw new Error(`No graphic ${frame.graphic} in the registry`);
      const instance = await loadInstance({
        parent: run.element,
        url: options.rivUrl(entry.scene),
        scene: entry.scene,
        values: frame.values,
        blankImage: options.blankImage,
      });
      if (disposed) return instance.dispose();
      run.instance = instance;
      const spec = entry.overlay;
      if (spec) {
        run.overlay = motionMedia(spec, instance.stage, (opacity) => instance.setNumber(spec.stillOpacity, opacity));
        await run.overlay.setMedia(frame.media);
      }
      dispatch(layer, { type: 'loaded', slot: frame.slot });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problem(layer, `${frame.graphic} (${frame.slot}) did not load: ${message}`);
      dispatch(layer, { type: 'loadFailed', slot: frame.slot, error: message });
    }
  }

  return {
    render(frame) {
      for (const layer of LAYERS) dispatch(layer, { type: 'frame', frame: frame.layers.find((each) => each.layer === layer) ?? null });
    },
    layers: () => Object.fromEntries([...runs].map(([layer, run]) => [layer, run.state])) as Record<LayerId, LayerState>,
    dispose() {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      for (const run of runs.values()) {
        run.overlay?.dispose();
        run.instance?.dispose();
        run.element.remove();
      }
    },
  };
}
