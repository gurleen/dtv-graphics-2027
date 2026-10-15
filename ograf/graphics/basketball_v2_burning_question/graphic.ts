/**
 * The Burning Question lower third. One thing differs from the shared element: going on
 * air waits for the scene's state machine to advance first.
 *
 * Off air, a `showAnswer` change snaps (the scene's Answer layer animates only while
 * `isPlaying` is true), so an answer ticked before play is built by the intro. But a
 * renderer may apply data and call playAction() in the same frame, and the scene would
 * then see both flags at once and play the answer's reveal over the intro. Two frames
 * guarantee one full advance, as the shared element waits before a multi-step graphic's
 * first step.
 */

import type { PlayActionReturnPayload } from 'ograf';
import type { RiveGraphicDefinition } from '../../shared/definition';
import { RiveGraphicElement } from '../../shared/rive-graphic-element';
import { DEFINITION } from './definition';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export class BasketballV2BurningQuestion extends RiveGraphicElement {
  protected readonly definition: RiveGraphicDefinition = DEFINITION;

  override async playAction(
    params: { delta?: number; goto?: number; skipAnimation?: boolean } = {},
  ): Promise<PlayActionReturnPayload> {
    await nextFrame();
    await nextFrame();
    return super.playAction(params);
  }
}

export default BasketballV2BurningQuestion;
