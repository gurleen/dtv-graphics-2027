/**
 * Derives every scene's facts from its .rml, so no hand-written definition can drift from
 * the timelines or the view model.
 *
 *   bun packages/playout/scripts/scene-codegen.ts graphics/basketball-v2            write scenes.gen.ts
 *   bun packages/playout/scripts/scene-codegen.ts graphics/basketball-v2 --check    exit 1 if it is stale
 *
 * It refuses a scene that breaks the contract the renderer relies on: one artboard, one
 * state machine, one view model with a Default instance, a public boolean `isPlaying`, and
 * Intro and Outro timelines.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type PropKind, parseGroupPropName, type SceneFacts, type SceneGroup, type WireValue } from '../src/scene';

const KIND_BY_ELEMENT: Record<string, PropKind> = {
  ViewModelPropertyString: 'string',
  ViewModelPropertyNumber: 'number',
  ViewModelPropertyBoolean: 'boolean',
  ViewModelPropertyColor: 'color',
  ViewModelPropertyAssetImage: 'image',
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (value: string) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]!);

const attributes = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([A-Za-z_][\w-]*)="([^"]*)"/g)].map(([, key, value]) => [key!, decode(value!)]));

const elements = (source: string, name: string) => [...source.matchAll(new RegExp(`<${name}\\s[^>]*?/?>`, 'g'))].map(([tag]) => attributes(tag));

const one = <T>(items: readonly T[], what: string, file: string): T => {
  if (items.length !== 1) throw new Error(`${file}: expected one ${what}, found ${items.length}`);
  return items[0]!;
};

const colorFromArgb = (argb: string) => `#${argb.slice(2).toLowerCase()}`;

function sceneFacts(file: string, source: string): SceneFacts {
  const artboard = one(elements(source, 'Artboard'), 'Artboard', file);
  const stateMachine = one(elements(source, 'StateMachine'), 'StateMachine', file);
  const viewModel = one(elements(source, 'ViewModel'), 'ViewModel', file);
  if (artboard.viewModelId !== viewModel.id) throw new Error(`${file}: the artboard binds another view model`);

  const animations = Object.fromEntries(
    elements(source, 'LinearAnimation').map((animation) => [animation.name!, Math.round((Number(animation.duration) / Number(animation.fps)) * 1000)]),
  );
  for (const required of ['Intro', 'Outro']) {
    if (!(required in animations)) throw new Error(`${file}: no "${required}" timeline`);
  }

  const viewModelSource = source.slice(source.indexOf('<ViewModel '), source.indexOf('</ViewModel>'));
  const props: Record<string, PropKind> = {};
  const internal: Record<string, PropKind> = {};
  const nameById = new Map<string, string>();
  const kindById = new Map<string, PropKind>();
  for (const [element, kind] of Object.entries(KIND_BY_ELEMENT)) {
    for (const property of elements(viewModelSource, element)) {
      const name = property.name!;
      nameById.set(property.id!, name);
      kindById.set(property.id!, kind);
      if (name.startsWith('_')) internal[name] = kind;
      else if (property.componentProps === '1') props[name] = kind;
      else throw new Error(`${file}: "${name}" is neither public (componentProps) nor internal (_)`);
    }
  }
  if (props.isPlaying !== 'boolean') throw new Error(`${file}: no public boolean isPlaying`);

  const assetNameById = new Map(elements(source, 'ImageAsset').map((asset) => [asset.id!, asset.name!]));
  const instanceStart = viewModelSource.indexOf('<ViewModelInstance name="Default"');
  if (instanceStart < 0) throw new Error(`${file}: no Default view model instance`);
  const defaults: Record<string, WireValue> = {};
  for (const value of elements(viewModelSource.slice(instanceStart), 'ViewModelInstance(?:String|Number|Boolean|Color|AssetImage)')) {
    const name = nameById.get(value.viewModelPropertyId!);
    if (!name || name.startsWith('_')) continue;
    const raw = value.propertyValue ?? '';
    const kind = kindById.get(value.viewModelPropertyId!);
    if (kind === 'number') defaults[name] = Number(raw);
    else if (kind === 'boolean') defaults[name] = raw === 'true';
    else if (kind === 'color') defaults[name] = colorFromArgb(raw);
    else if (kind === 'image') defaults[name] = `asset:${assetNameById.get(raw) ?? raw}`;
    else defaults[name] = raw;
  }

  return {
    file,
    artboard: artboard.name!,
    stateMachine: stateMachine.name!,
    viewModel: viewModel.name!,
    layers: elements(source, 'StateMachineLayer').map((layer) => layer.name!),
    animations,
    ...groupNumbered(file, props),
    internal,
    defaults,
  };
}

/** Numbered properties become groups, so a bind returns rows instead of spelling out every name. A gap is an error, not a guess. */
function groupNumbered(file: string, all: Record<string, PropKind>) {
  const props: Record<string, PropKind> = {};
  const found = new Map<string, Map<string, { kind: PropKind; rows: Set<number> }>>();
  for (const [name, kind] of Object.entries(all)) {
    const parsed = parseGroupPropName(name);
    if (!parsed) {
      props[name] = kind;
      continue;
    }
    const fields = found.get(parsed.group) ?? new Map();
    found.set(parsed.group, fields);
    const field = fields.get(parsed.field) ?? { kind, rows: new Set<number>() };
    if (field.kind !== kind) throw new Error(`${file}: ${parsed.group}N${parsed.field} mixes ${field.kind} and ${kind}`);
    field.rows.add(parsed.row);
    fields.set(parsed.field, field);
  }
  const groups: Record<string, SceneGroup> = {};
  for (const [group, fields] of found) {
    const count = Math.max(...[...fields.values()].flatMap((field) => [...field.rows]));
    for (const [field, { rows }] of fields) {
      for (let row = 1; row <= count; row++) {
        if (!rows.has(row)) throw new Error(`${file}: group "${group}" has no row ${row} ${field}`);
      }
    }
    groups[group] = { count, fields: Object.fromEntries([...fields].map(([field, { kind }]) => [field, kind])) };
  }
  return { props, groups };
}

const [directory, ...flags] = process.argv.slice(2);
if (!directory) throw new Error('usage: scene-codegen.ts <scene directory> [--check]');
const out = join(directory, 'scenes.gen.ts');

const files = (await readdir(directory)).filter((file) => file.endsWith('.rml')).sort();
const scenes = Object.fromEntries(
  await Promise.all(files.map(async (file) => [basename(file, '.rml'), sceneFacts(file, await readFile(join(directory, file), 'utf8'))] as const)),
);

const text = `// Generated by packages/playout/scripts/scene-codegen.ts from the .rml files beside it. Run \`bun run codegen\`; do not edit.
import type { SceneFacts } from '@dtv/playout';

export const SCENES = ${JSON.stringify(scenes, null, 2)} as const satisfies Record<string, SceneFacts>;

export type SceneKey = keyof typeof SCENES;
`;

if (flags.includes('--check')) {
  if ((await readFile(out, 'utf8').catch(() => '')) !== text) {
    console.error(`${out} is stale. Run: bun run codegen`);
    process.exit(1);
  }
  console.log(`${out} is current: ${files.length} scenes`);
} else {
  await writeFile(out, text);
  console.log(`Wrote ${out}: ${files.length} scenes`);
}
