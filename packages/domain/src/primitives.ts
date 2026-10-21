import { z } from 'zod';

/** `#rrggbb`, lower case. teams.json stores `07294D`; its importer normalizes it. */
export const Color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/)
  .brand<'Color'>();
export type Color = z.infer<typeof Color>;

/**
 * An absolute http(s) URL, or a root-relative path the server serves (`/assets/...`).
 * Never an embedded Rive asset, so a scene's baked-in test image cannot reach air.
 */
export const Url = z
  .string()
  .regex(/^(https?:\/\/|\/)/)
  .brand<'Url'>();
export type Url = z.infer<typeof Url>;

export const SIDES = ['away', 'home'] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;
export type Sides<T> = { readonly away: T; readonly home: T };
export const sides = <T extends z.ZodType>(item: T) => z.object({ away: item, home: item });

/** The journal sequence number of a committed write. It only grows, across restarts too. */
export const Revision = z.number().int().nonnegative().brand<'Revision'>();
export type Revision = z.infer<typeof Revision>;

/** Milliseconds since the Unix epoch, on the server's clock. */
export type EpochMs = number;

export const WinLoss = z.object({ wins: z.number().int().nonnegative(), losses: z.number().int().nonnegative() });
export type WinLoss = z.infer<typeof WinLoss>;
