/**
 * Base class for an OGraf graphic backed by a Rive state machine.
 *
 * The contract it implements is GraphicsAPI.Graphic from docs/ograf/Specification.md:
 * the renderer calls load() once, then drives the graphic with playAction(),
 * updateAction() and stopAction(), and finally dispose().
 *
 * The Rive side of the contract is a scene whose state machine sits in a hidden state
 * until one boolean view model property goes true (Intro then Hold), and plays its Outro
 * when it goes false again. Every ported graphic in this repo follows that shape, so
 * playAction/stopAction reduce to flipping that flag and waiting out the animation.
 *
 * A graphic whose definition declares `steps` also writes the target step to a number
 * property on each playAction; the scene animates between steps itself.
 */

import { Rive, type ViewModelInstance } from '@rive-app/canvas-single';
import type { GraphicsAPI, PlayActionReturnPayload, RenderCharacteristics, ReturnPayload } from 'ograf';
import { FieldBinder } from './binder';
import type { RiveGraphicDefinition, RiveGraphicSteps } from './definition';

const DEFAULT_RESOLUTION = { width: 1920, height: 1080 } as const;

const wait = (milliseconds: number) =>
  milliseconds > 0 ? new Promise<void>((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const ok = (statusMessage: string): ReturnPayload => ({ statusCode: 200, statusMessage });

export abstract class RiveGraphicElement extends HTMLElement implements GraphicsAPI.Graphic {
  protected abstract readonly definition: RiveGraphicDefinition;

  private rive: Rive | null = null;
  private instance: ViewModelInstance | null = null;
  private binder: FieldBinder | null = null;
  private canvas: HTMLCanvasElement | null = null;
  /** The step on air, for a multi-step graphic; undefined in the start state. */
  private currentStep: number | undefined = undefined;

  async load(params: {
    data?: unknown;
    renderType: 'realtime' | 'non-realtime';
    renderCharacteristics: RenderCharacteristics;
  }): Promise<ReturnPayload> {
    const { definition } = this;
    const resolution = params.renderCharacteristics?.resolution ?? DEFAULT_RESOLUTION;

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    // The graphic owns a transparent, full-bleed canvas; the renderer keys over it.
    root.innerHTML =
      '<style>:host{display:block;width:100%;height:100%}canvas{display:block;width:100%;height:100%}</style>';
    const canvas = document.createElement('canvas');
    canvas.width = resolution.width;
    canvas.height = resolution.height;
    root.appendChild(canvas);
    this.canvas = canvas;

    this.binder = new FieldBinder(definition.fields);

    // import.meta.url points at the published module, so the .riv resolves wherever
    // the renderer serves the package folder from.
    const src = new URL(definition.riv, import.meta.url).href;

    await new Promise<void>((resolve, reject) => {
      const rive = new Rive({
        src,
        canvas,
        artboard: definition.artboard,
        stateMachine: definition.stateMachine,
        autoplay: true,
        // The scene declares its own view model; binding it by name keeps the property
        // lookups honest if the file ever gains a second one.
        autoBind: false,
        onLoad: () => {
          try {
            rive.resizeDrawingSurfaceToCanvas();
            const instance = rive.viewModelByName(definition.viewModel)?.defaultInstance() ?? null;
            if (!instance) throw new Error(`View model "${definition.viewModel}" has no default instance`);
            rive.bindViewModelInstance(instance);
            this.instance = instance;
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onLoadError: (event: unknown) => reject(new Error(`Rive failed to load ${src}: ${String(event)}`)),
      });
      this.rive = rive;
    });

    // A graphic is not on air until playAction(); load() must leave nothing visible.
    this.setOnAir(false);
    await this.binder.apply(this.instance!, params.data ?? {});
    return ok('Loaded');
  }

  async dispose(): Promise<ReturnPayload> {
    this.binder?.dispose();
    this.binder = null;
    this.rive?.cleanup();
    this.rive = null;
    this.instance = null;
    this.canvas?.remove();
    this.canvas = null;
    return ok('Disposed');
  }

  async updateAction(params: { data: unknown; skipAnimation?: boolean } = { data: {} }): Promise<ReturnPayload> {
    if (!this.instance || !this.binder) return { statusCode: 409, statusMessage: 'Graphic is not loaded' };
    await this.binder.apply(this.instance, params.data);
    return ok('Updated');
  }

  // The specification makes params mandatory, but SPX calls playAction() with none for
  // its Continue button, so every action defaults them rather than reading undefined.
  async playAction(
    params: {
      delta?: number;
      goto?: number;
      skipAnimation?: boolean;
    } = {},
  ): Promise<PlayActionReturnPayload> {
    if (!this.instance) return { statusCode: 409, statusMessage: 'Graphic is not loaded', currentStep: -1 };
    if (this.definition.steps) return this.playStep(this.definition.steps, params);
    // A single-step graphic has exactly one reachable step, 0. Naming any other target
    // is a controller bug worth reporting rather than silently ignoring.
    const target = params.goto ?? 0;
    if (target !== 0) {
      return {
        statusCode: 400,
        statusMessage: `This graphic has one step; cannot go to step ${target}`,
        currentStep: 0,
      };
    }
    this.setOnAir(true);
    await wait(params.skipAnimation ? 0 : this.definition.introDuration);
    return { ...ok('Playing'), currentStep: 0 };
  }

  async stopAction(params: { skipAnimation?: boolean } = {}): Promise<ReturnPayload> {
    if (!this.instance) return { statusCode: 409, statusMessage: 'Graphic is not loaded' };
    this.currentStep = undefined;
    this.setOnAir(false);
    await wait(params.skipAnimation ? 0 : this.definition.outroDuration);
    return ok('Stopped');
  }

  async customAction(): Promise<ReturnPayload> {
    return { statusCode: 400, statusMessage: 'No custom actions supported' };
  }

  /**
   * Non-real-time rendering is not supported; the manifests set
   * supportsNonRealTime: false, so a conforming renderer never calls these.
   */
  async goToTime(): Promise<ReturnPayload> {
    return { statusCode: 501, statusMessage: 'Non-real-time rendering is not supported' };
  }

  async setActionsSchedule(): Promise<ReturnPayload> {
    return { statusCode: 501, statusMessage: 'Non-real-time rendering is not supported' };
  }

  /**
   * playAction for a multi-step graphic, per Specification.md § playAction: goto names
   * the target step, otherwise delta (default 1) is added to the current step, which is
   * -1 before the first play. A target past the last step takes the graphic off air.
   */
  private async playStep(
    steps: RiveGraphicSteps,
    params: { delta?: number; goto?: number; skipAnimation?: boolean },
  ): Promise<PlayActionReturnPayload> {
    const target =
      params.goto !== undefined && params.goto >= 0 ? params.goto : (this.currentStep ?? -1) + (params.delta ?? 1);
    if (target < 0) {
      return {
        statusCode: 400,
        statusMessage: `Cannot go to step ${target}`,
        currentStep: this.currentStep as number,
      };
    }
    if (target >= steps.count) {
      const stopped = await this.stopAction({ skipAnimation: params.skipAnimation });
      // The specification requires currentStep to be undefined at the end; the
      // vendored type declares it as a number.
      return { ...stopped, currentStep: undefined as unknown as number };
    }

    const wasOnAir = this.currentStep !== undefined;
    const previous = this.currentStep;
    this.currentStep = target;
    this.setStep(steps, target);
    if (wasOnAir) {
      if (target !== previous) await wait(params.skipAnimation ? 0 : steps.transitionDuration);
      return { ...ok(`Showing step ${target}`), currentStep: target };
    }
    // Off air, the scene takes the new step without animating, but only once its state
    // machine has advanced; going on air in the same frame would play the step change
    // over the intro. Two frames guarantee one full advance.
    await nextFrame();
    await nextFrame();
    this.setOnAir(true);
    await wait(params.skipAnimation ? 0 : this.definition.introDuration);
    return { ...ok('Playing'), currentStep: target };
  }

  private setStep(steps: RiveGraphicSteps, step: number): void {
    const property = this.instance?.number(steps.property);
    if (property) property.value = step;
  }

  private setOnAir(onAir: boolean): void {
    const flag = this.instance?.boolean(this.definition.onAirProperty);
    if (flag) flag.value = onAir;
  }
}
