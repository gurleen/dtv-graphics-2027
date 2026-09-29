/**
 * Types only: what a graphic declares about itself, and where its Rive scene lives.
 *
 * Kept free of imports from the runtime modules so that both the browser bundle and the
 * package builder can read a graphic's definition.ts.
 */

import type { Field } from './schema';

export interface RiveGraphicDefinition {
  /** The .riv file, relative to the published module. */
  riv: string;
  artboard: string;
  stateMachine: string;
  /** Name of the view model to bind; its default instance is used. */
  viewModel: string;
  /** Boolean view model property that drives the Intro/Hold/Outro state machine. */
  onAirProperty: string;
  /** Milliseconds the Intro animation runs; matches playAction's actionDuration. */
  introDuration: number;
  /** Milliseconds the Outro animation runs; matches stopAction's actionDuration. */
  outroDuration: number;
  /**
   * Present on a graphic with more than one step. The scene reads the current step from
   * a number view model property: set before the intro it selects what the intro shows
   * (the scene switches without animating while off air), and set on air it plays the
   * scene's own transition between steps.
   */
  steps?: RiveGraphicSteps;
  fields: readonly Field[];
}

export interface RiveGraphicSteps {
  /** The manifest's stepCount; playAction past the last step takes the graphic off air. */
  count: number;
  /** Number view model property holding the zero-based current step. */
  property: string;
  /** Milliseconds the scene takes to change step on air; matches the manifest's step durations. */
  transitionDuration: number;
}

/** Where the builder finds the Rive scene to compile into the package. */
export interface GraphicSource {
  /** Directory holding the .rml and its .luau scripts, relative to the repository root. */
  sceneDirectory: string;
  /** Select one scene when the directory contains multiple .rml files. */
  sceneFile?: string;
  /** Bundle entry point, relative to the graphic's own directory. */
  entry: string;
}
