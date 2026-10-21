/**
 * One registry entry per graphic: the scene it plays, where it goes, what an operator
 * chooses when cueing it, and a pure bind from show state to the scene's values. What the
 * renderer does differently per graphic is declared here as data, so the renderer has no
 * per-graphic code.
 */

import type { EpochMs, GameLive, GameView, Show, Sponsor, Sport, Talent, World } from '@dtv/domain';
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
  /** The active show's game. Undefined for a show without one. */
  readonly game: GameView | undefined;
  readonly live: GameLive | undefined;
  readonly show: Show | undefined;
  /** The show's crew in order, resolved to talent, with the role for the night or the talent's default. */
  readonly crew: readonly { readonly talent: Talent; readonly role: string }[];
  /** The sponsor presenting this graphic. */
  readonly sponsor: Sponsor | undefined;
  readonly now: EpochMs;
}

/** A BindContext before the projector adds each graphic's sponsor. */
export type ShowContext = Omit<BindContext, 'sponsor'>;

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
