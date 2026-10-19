/**
 * The Score to Break. One thing differs from the shared element: the operator's `side` is
 * latched, so the block never jumps across the screen while it is visible.
 *
 * The scene mirrors the moment `alignRight` changes. The package therefore holds the side
 * the operator asked for apart from the side the scene shows, and writes it only while the
 * block is off screen and not being taken: off air once the outro has ended, or at
 * playAction before the intro. The scene reports the end of the outro itself, through
 * `_onScreen`, because its clock can run behind stopAction's wait.
 */

import type { PlayActionReturnPayload, ReturnPayload } from 'ograf';
import type { RiveGraphicDefinition } from '../../shared/definition';
import { RiveGraphicElement } from '../../shared/rive-graphic-element';
import { DEFINITION } from './definition';
import { SIDES } from './fields';

type Side = (typeof SIDES)[number];

const parseSide = (value: unknown): Side | undefined => SIDES.find((side) => side === value);

interface SideLatch {
  /** The operator's latest side. */
  requested: Side;
  /** The side the scene shows. */
  applied: Side;
  /** Between playAction and stopAction. */
  onAir: boolean;
  /** The scene's own report: from the intro until the outro's last frame. */
  onScreen: boolean;
}

export class BasketballV2ScoreToBreak extends RiveGraphicElement {
  protected readonly definition: RiveGraphicDefinition = DEFINITION;

  // The scene's default instance stands on the left, off screen.
  private latch: SideLatch = { requested: 'left', applied: 'left', onAir: false, onScreen: false };
  private readonly onScreenChanged = () => {
    this.latch.onScreen = (this.viewModelInstance?.number('_onScreen')?.value ?? 0) > 0;
    // Taken again during the outro, the scene builds the intro straight after it, so the
    // change waits for the block to leave air.
    if (!this.latch.onAir) this.applySide();
  };

  override async load(params: Parameters<RiveGraphicElement['load']>[0]): Promise<ReturnPayload> {
    const result = await super.load(params);
    this.viewModelInstance?.number('_onScreen')?.on(this.onScreenChanged);
    return result;
  }

  protected override onDispose(): void {
    this.viewModelInstance?.number('_onScreen')?.off(this.onScreenChanged);
  }

  protected override async onDataApplied(data: unknown): Promise<void> {
    const side = parseSide((data as { side?: unknown } | null)?.side);
    if (side) this.latch.requested = side;
    if (!this.latch.onAir) this.applySide();
  }

  override async playAction(
    params: { delta?: number; goto?: number; skipAnimation?: boolean } = {},
  ): Promise<PlayActionReturnPayload> {
    this.applySide();
    this.latch.onAir = true;
    return super.playAction(params);
  }

  override async stopAction(params: { skipAnimation?: boolean } = {}): Promise<ReturnPayload> {
    this.latch.onAir = false;
    return super.stopAction(params);
  }

  /** Writes the requested side, if the block is off screen. */
  private applySide(): void {
    const { requested, applied, onScreen } = this.latch;
    if (onScreen || requested === applied) return;
    const alignRight = this.viewModelInstance?.boolean('alignRight');
    if (!alignRight) return;
    alignRight.value = requested === 'right';
    this.latch.applied = requested;
  }
}

export default BasketballV2ScoreToBreak;
