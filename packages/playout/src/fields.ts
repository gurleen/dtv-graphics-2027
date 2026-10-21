/**
 * The params a person may type, found from a graphic's params schema: free text and a
 * choice from a fixed list. An id (a player, a team) is neither, so it stays as cued.
 */

import { z } from 'zod';

export type ParamField =
  | { readonly name: string; readonly kind: 'text' }
  | { readonly name: string; readonly kind: 'choice'; readonly options: readonly string[] };

/** Text with a space, a capital, an apostrophe and a digit. A slug schema refuses it; a free-text one accepts it. */
const SAMPLE_TEXT = "Who's No. 1?";

const innermost = (schema: z.ZodType): z.ZodType => (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional ? innermost(schema.unwrap() as z.ZodType) : schema);

export function paramFields(params: z.ZodType): readonly ParamField[] {
  if (!(params instanceof z.ZodObject)) return [];
  return Object.entries(params.shape as Record<string, z.ZodType>).flatMap(([name, schema]): ParamField[] => {
    const inner = innermost(schema);
    if (inner instanceof z.ZodEnum) return [{ name, kind: 'choice', options: inner.options.map(String) }];
    if (inner instanceof z.ZodString && inner.safeParse(SAMPLE_TEXT).success) return [{ name, kind: 'text' }];
    return [];
  });
}
