/** A console's bytes in, its board out: one decoder per serial format. Pure. */

import { readBasketball, type Scoreboard } from './basketball';
import { createCgBoard, createCgFramer } from './cg';
import { createFramer, createRtdBuffer } from './rtd';

/** `rtd` is the RTD output at 19200 baud; `cg` is the whole-board output at 9600 (`src/cg.ts`). */
export const FORMATS = ['rtd', 'cg'] as const;
export type Format = (typeof FORMATS)[number];
export const DEFAULT_BAUD: Readonly<Record<Format, number>> = { rtd: 19200, cg: 9600 };

export interface Decoder {
  /** Takes what the port read; returns how many frames were dropped for a bad checksum or an unknown shape. */
  push(chunk: Uint8Array, now: number): number;
  read(): Scoreboard;
}

export function createDecoder(format: Format): Decoder {
  if (format === 'cg') {
    const framer = createCgFramer();
    const board = createCgBoard();
    return {
      push(chunk, now) {
        let dropped = 0;
        for (const frame of framer.push(chunk)) {
          if (frame.kind === 'rejected') dropped++;
          else board.apply(frame.text, now);
        }
        return dropped;
      },
      read: () => board.read(),
    };
  }
  const framer = createFramer();
  const buffer = createRtdBuffer();
  return {
    push(chunk) {
      let dropped = 0;
      for (const frame of framer.push(chunk)) {
        if (frame.kind === 'rejected') dropped++;
        else buffer.apply(frame);
      }
      return dropped;
    },
    read: () => readBasketball(buffer),
  };
}
