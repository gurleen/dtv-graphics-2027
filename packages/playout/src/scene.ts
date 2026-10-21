/**
 * What the renderer and the binds need to know about a Rive scene, generated from its .rml
 * by scripts/scene-codegen.ts. The bind types are mapped from the generated literal, so a
 * renamed property or timeline fails the build of every entry that uses it.
 */

import type { Color, Url } from '@dtv/domain';

export type PropKind = 'string' | 'number' | 'boolean' | 'color' | 'image';
export type WireValue = string | number | boolean;

export interface SceneGroup {
  readonly count: number;
  readonly fields: Readonly<Record<string, PropKind>>;
}

export interface SceneFacts {
  /** The .rml file name; the built .riv shares its stem. */
  readonly file: string;
  readonly artboard: string;
  readonly stateMachine: string;
  readonly viewModel: string;
  readonly layers: readonly string[];
  /** Every timeline's length in milliseconds. `Intro` and `Outro` always exist. */
  readonly animations: Readonly<Record<string, number>>;
  /** Public properties outside a group. Always includes `isPlaying: 'boolean'`. */
  readonly props: Readonly<Record<string, PropKind>>;
  /** Numbered public properties: `row1Team` to `row13Streak` is group `row` of 13 `{ team, ..., streak }`. */
  readonly groups: Readonly<Record<string, SceneGroup>>;
  /** `_`-prefixed properties, written by the scene's Luau or read by the renderer. */
  readonly internal: Readonly<Record<string, PropKind>>;
  /** The Default instance; images as `asset:<name>`. */
  readonly defaults: Readonly<Record<string, WireValue>>;
}

/** A null image binds the blank image; the projector owns that rule. */
interface ValueByKind {
  string: string;
  number: number;
  boolean: boolean;
  color: Color;
  image: Url | null;
}

type Values<K extends Readonly<Record<string, PropKind>>> = { -readonly [P in keyof K]: ValueByKind[K[P]] };

/**
 * What a bind returns: every ungrouped public property except `isPlaying`, which the
 * renderer owns, and each group as rows. A group may have fewer rows than the scene; the
 * projector blanks the rest.
 */
export type Bound<F extends SceneFacts> = string extends keyof F['props']
  ? Readonly<Record<string, unknown>>
  : Omit<Values<F['props']>, 'isPlaying'> & { readonly isPlaying?: never } & {
      -readonly [G in keyof F['groups']]: readonly Values<F['groups'][G]['fields']>[];
    };

/** A bound property by its scene name, for `frozenOnAir`. */
export type FlatName<F extends SceneFacts> = Exclude<keyof F['props'], 'isPlaying'> & string;

export type AnimationName<F extends SceneFacts> = keyof F['animations'] & string;

export type InternalNumberProp<F extends SceneFacts> = string extends keyof F['internal']
  ? string
  : { [P in keyof F['internal']]: F['internal'][P] extends 'number' ? P : never }[keyof F['internal']] & string;

const GROUP_FIELD = /^([a-z][A-Za-z]*?)(\d+)([A-Z][A-Za-z]*)$/;

/** `row`, 3, `team` becomes `row3Team`, the scene's own name. */
export const groupPropName = (group: string, row: number, field: string) => `${group}${row}${field[0]!.toUpperCase()}${field.slice(1)}`;

/** Splits `row3Team` into its group, row and field, as the codegen grouped it. */
export const parseGroupPropName = (name: string): { group: string; row: number; field: string } | null => {
  const match = GROUP_FIELD.exec(name);
  if (!match) return null;
  const [, group, row, field] = match as unknown as [string, string, string, string];
  return { group, row: Number(row), field: field[0]!.toLowerCase() + field.slice(1) };
};

const kindsByScene = new WeakMap<SceneFacts, ReadonlyMap<string, PropKind>>();

/** Every public property the scene binds, by its scene name, grouped ones included and `isPlaying` left out. */
export function boundProps(scene: SceneFacts): ReadonlyMap<string, PropKind> {
  const cached = kindsByScene.get(scene);
  if (cached) return cached;
  const kinds = new Map<string, PropKind>(Object.entries(scene.props).filter(([name]) => name !== 'isPlaying'));
  for (const [group, { count, fields }] of Object.entries(scene.groups)) {
    for (let row = 1; row <= count; row++) {
      for (const [field, kind] of Object.entries(fields)) kinds.set(groupPropName(group, row, field), kind);
    }
  }
  kindsByScene.set(scene, kinds);
  return kinds;
}
