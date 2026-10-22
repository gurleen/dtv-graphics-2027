/**
 * One registry entry per graphic: the scene it plays, where it goes, what an operator
 * chooses when cueing it, and a pure bind from show state to the scene's values. What the
 * renderer does differently per graphic is declared here as data, so the renderer has no
 * per-graphic code.
 */

import type { EpochMs, GameLive, GameView, Show, Sponsor, Sport, Talent, Url, World } from '@dtv/domain';
import type { z } from 'zod';
import type { AnimationName, Bound, FlatName, InternalNumberProp, SceneFacts } from './scene';

/**
 * Screen regions, bottom to top. Graphics that share a region share a layer, so a take on
 * a layer replaces what is there and two graphics that would overlap are never on air.
 */
export const LAYERS = ['bug', 'lower', 'card'] as const;
export type LayerId = (typeof LAYERS)[number];

/** Everything a bind may read, resolved once per projection. */
export interface BindContext {
  readonly world: World;
  /** The active game. Undefined when no game is active. */
  readonly game: GameView | undefined;
  readonly live: GameLive | undefined;
  /** The active game's show, empty if it has none stored. Undefined when no game is active. */
  readonly show: Show | undefined;
  /** The show's crew in order, resolved to talent, with the role for the night or the talent's default. */
  readonly crew: readonly { readonly talent: Talent; readonly role: string }[];
  /** The sponsor presenting this graphic. */
  readonly sponsor: Sponsor | undefined;
  readonly now: EpochMs;
}

/** A BindContext before the projector adds each graphic's sponsor. */
export type ShowContext = Omit<BindContext, 'sponsor'>;

/**
 * Media Rive cannot draw: a <video> or animated image the renderer lays over the scene's
 * headshot frame and animates with the scene. Geometry and timings are copied from the
 * scene's generator and timelines.
 */
export interface MotionMediaOverlay<Still extends string, P extends z.ZodType> {
  readonly kind: 'motion-media';
  /** The media frame in artboard units of the 1920 x 1080 canvas. */
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly corner: number };
  /** Units the media rises from as it enters. */
  readonly rise: number;
  /** [start, end] in 60 fps frames of each motion. */
  readonly intro: { readonly wipe: readonly [number, number]; readonly rise: readonly [number, number]; readonly fade: readonly [number, number] };
  readonly outro: { readonly wipe: readonly [number, number]; readonly sink: readonly [number, number]; readonly fade: readonly [number, number] };
  /** Set to 0 while media shows, so the scene hides its still headshot. */
  readonly stillOpacity: Still;
  /** The media to show, or null for the still. */
  source(params: z.output<P>, context: BindContext): Url | null;
}

export interface GraphicEntry<I extends string, F extends SceneFacts, P extends z.ZodType> {
  readonly id: I;
  readonly name: string;
  readonly sport: Sport | null;
  readonly scene: F;
  readonly layer: LayerId;
  /** Layers a take of this graphic also clears: the double talent lower third covers the scorebug. */
  readonly clears?: readonly LayerId[];
  /** What the operator chooses. Parsed wherever a cue enters the system. */
  readonly params: P;
  /** Parameters for the stakeholder site and the golden test, against the seed data. */
  readonly demo: z.input<P>;
  /** Present for free-panel graphics: their parameters, derived from the show. Null hides the button. */
  free?(context: ShowContext): z.input<P> | null;
  /** The rundown and free-panel label, in natural case. */
  label(params: z.output<P>, context: BindContext): string;
  /** Pure. Throws only when a row it reads is gone; the frame then carries the error. */
  bind(params: z.output<P>, context: BindContext): Bound<F>;
  /** A graphic the operator advances with Next. Past the last step it leaves air. */
  readonly steps?: {
    readonly count: number;
    values(step: number): Partial<Bound<F>>;
    /** The scene's step timeline. */
    readonly transition: AnimationName<F>;
  };
  /** Properties written only before the intro. */
  readonly frozenOnAir?: readonly FlatName<F>[];
  /** A number the scene sets to 0 once its outro has really ended; the renderer waits for it. */
  readonly exitSignal?: InternalNumberProp<F>;
  readonly overlay?: MotionMediaOverlay<InternalNumberProp<F>, P>;
  /** Where the stakeholder site shows it. */
  readonly site: 'scorebug' | 'with-scorebug' | 'full-frame';
}

/**
 * Two calls: the first fixes the id, the scene and the params schema, so the second is
 * checked with nothing left to infer and `free: () => ({ side: 'left' })` keeps its literal type.
 */
export const defineGraphic =
  <const I extends string, F extends SceneFacts, P extends z.ZodType>(head: { readonly id: I; readonly scene: F; readonly params: P }) =>
  (rest: Omit<GraphicEntry<I, F, P>, 'id' | 'scene' | 'params'>): GraphicEntry<I, F, P> => ({ ...head, ...rest });

export type AnyGraphic = GraphicEntry<string, SceneFacts, z.ZodType>;
export type Registry = Readonly<Record<string, AnyGraphic>>;

/** Look entries up here, never by indexing: an id from outside such as `constructor` must miss, not find Object.prototype's. */
export const entryOf = (registry: Registry, id: string): AnyGraphic | undefined => (Object.hasOwn(registry, id) ? registry[id] : undefined);
