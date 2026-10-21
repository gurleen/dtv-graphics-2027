/**
 * Forms derived from a graphic's params schema, so no graphic needs form code of its own.
 *
 * `paramFields` is the flat form the stakeholder site offers: free text and a choice from a
 * fixed list. `paramForm` is the controller's: the whole schema as a tree, with each id
 * that names a row (its schema carries `.meta({ ref })`) as a picker for that kind.
 */

import type { EntityKind } from '@dtv/domain';
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

/** One control of a params form. */
export type FormNode =
  | { readonly kind: 'text' }
  | { readonly kind: 'choice'; readonly options: readonly string[] }
  /** An id of a row of `ref`, offered as a picker. */
  | { readonly kind: 'ref'; readonly ref: EntityKind }
  /** Several of a fixed list, in order: the stats a lower third shows. */
  | { readonly kind: 'choices'; readonly options: readonly string[]; readonly max: number | null }
  | { readonly kind: 'list'; readonly item: FormNode; readonly min: number; readonly max: number | null }
  | { readonly kind: 'group'; readonly fields: readonly FormField[] }
  /** A discriminated union: `key` picks the variant, and each variant has its own fields. */
  | { readonly kind: 'variants'; readonly key: string; readonly variants: readonly { readonly value: string; readonly fields: readonly FormField[] }[] }
  /** A schema the form cannot edit; the value stays as it is. */
  | { readonly kind: 'fixed' };

export interface FormField {
  readonly name: string;
  readonly node: FormNode;
  /** Leaving it out is valid: the schema has a default or the field is optional. */
  readonly optional: boolean;
  /** What the schema fills in when the field is left out. */
  readonly fallback: unknown;
}

const lengthChecks = (schema: z.ZodArray) => {
  let min = 0;
  let max: number | null = null;
  for (const check of schema.def.checks ?? []) {
    const def = check._zod.def as { check: string; length?: number; minimum?: number; maximum?: number };
    if (def.check === 'length_equals') min = max = def.length!;
    if (def.check === 'min_length') min = def.minimum!;
    if (def.check === 'max_length') max = def.maximum!;
  }
  return { min, max };
};

const refOf = (schema: z.ZodType): EntityKind | undefined => (schema.meta() as { ref?: EntityKind } | undefined)?.ref;

function fieldsOf(shape: Record<string, z.ZodType>, skip?: string): FormField[] {
  return Object.entries(shape)
    .filter(([name]) => name !== skip)
    .map(([name, schema]) => ({
      name,
      node: nodeOf(innermost(schema)),
      optional: schema instanceof z.ZodDefault || schema instanceof z.ZodOptional,
      fallback: schema instanceof z.ZodDefault ? schema.parse(undefined) : undefined,
    }));
}

function nodeOf(schema: z.ZodType): FormNode {
  const ref = refOf(schema);
  if (ref) return { kind: 'ref', ref };
  if (schema instanceof z.ZodEnum) return { kind: 'choice', options: schema.options.map(String) };
  if (schema instanceof z.ZodString) return { kind: 'text' };
  if (schema instanceof z.ZodObject) return { kind: 'group', fields: fieldsOf(schema.shape as Record<string, z.ZodType>) };
  if (schema instanceof z.ZodArray) {
    const item = nodeOf(innermost(schema.element as z.ZodType));
    const { min, max } = lengthChecks(schema);
    return item.kind === 'choice' ? { kind: 'choices', options: item.options, max } : { kind: 'list', item, min, max };
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const key = schema.def.discriminator;
    const variants = (schema.options as z.ZodObject[]).map((option) => {
      const shape = option.shape as Record<string, z.ZodType>;
      return { value: String((shape[key] as z.ZodLiteral).value), fields: fieldsOf(shape, key) };
    });
    return { kind: 'variants', key, variants };
  }
  return { kind: 'fixed' };
}

/** The form for a params schema: one field per property of its object. */
export function paramForm(params: z.ZodType): readonly FormField[] {
  return params instanceof z.ZodObject ? fieldsOf(params.shape as Record<string, z.ZodType>) : [];
}

/** A value for a node a person has not filled in yet: empty, or the first variant. */
export function blankValue(node: FormNode): unknown {
  switch (node.kind) {
    case 'text':
    case 'ref':
      return '';
    case 'choice':
      return node.options[0];
    case 'choices':
      return [];
    case 'list':
      return Array.from({ length: node.min }, () => blankValue(node.item));
    case 'group':
      return blankGroup(node.fields);
    case 'variants': {
      const first = node.variants[0]!;
      return { [node.key]: first.value, ...blankGroup(first.fields) };
    }
    case 'fixed':
      return undefined;
  }
}

export const blankGroup = (fields: readonly FormField[]): Record<string, unknown> =>
  Object.fromEntries(fields.flatMap((field) => (field.optional ? [] : [[field.name, blankValue(field.node)]])));
