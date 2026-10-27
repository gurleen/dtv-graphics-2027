/**
 * Preview, program, and the commands that move cues between them. A pure reducer: the
 * server runs it for the live show, and the site will run it in the browser.
 *
 * Program is one shared bus because there is one output. Each operator has their own
 * preview, so one operator's take never sends what another operator previewed. Commands
 * that act on a graphic already on air name its slot and change nothing once the slot has
 * changed, so a late Clear cannot take down a graphic its sender never saw.
 */

import { Cue, CueId, GameId, GraphicId, sameJson } from '@dtv/domain';
import { z } from 'zod';
import { type AnyGraphic, entryOf, LAYERS, type LayerId, type Registry, type ShowContext } from './graphic';
import { boundProps, type SceneFacts } from './scene';

export const OperatorId = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand<'OperatorId'>();
export type OperatorId = z.infer<typeof OperatorId>;

/** Unique per cue; a new slot on a layer is what tells the renderer to play out, then in. */
export const SlotId = z.string().min(1).brand<'SlotId'>();
export type SlotId = z.infer<typeof SlotId>;

/** Chosen by the client, so a command resent after a dropped socket applies once. */
export const CommandId = z.string().min(1).max(128).brand<'CommandId'>();
export type CommandId = z.infer<typeof CommandId>;

export const Layer = z.enum(LAYERS);

export const CueRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('free'), graphic: GraphicId }),
  z.object({ kind: z.literal('rundown'), cue: CueId }),
]);
export type CueRef = z.infer<typeof CueRef>;

export const Overrides = Cue.shape.overrides;
export type Overrides = z.output<typeof Overrides>;

/**
 * A cue on a bus, frozen when it was cued, params parsed and pinned. Binds still read the live World
 * and game, so a corrected name or a new score shows at once; an edited rundown cue
 * reaches air only through `refresh`.
 */
export const Slot = z.object({
  id: SlotId,
  origin: CueRef,
  graphic: GraphicId,
  params: z.record(z.string(), z.unknown()),
  overrides: Overrides,
  step: z.number().int().nonnegative(),
  by: OperatorId,
});
export type Slot = z.infer<typeof Slot>;

export const Bus = z.partialRecord(Layer, Slot);
export type Bus = z.infer<typeof Bus>;

/** What `show_state` holds, so a restart brings program back as it was. */
export const ShowState = z.object({
  gameId: GameId.nullable(),
  program: Bus,
  previews: z.record(OperatorId, Bus),
});
export type ShowState = z.infer<typeof ShowState>;

export const EMPTY_SHOW: ShowState = { gameId: null, program: {}, previews: {} };

export const ShowCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('activate'), game: GameId }),
  z.object({ type: z.literal('cue'), operator: OperatorId, ref: CueRef }),
  z.object({ type: z.literal('uncue'), operator: OperatorId, layer: Layer }),
  z.object({ type: z.literal('take'), operator: OperatorId }),
  z.object({ type: z.literal('air'), operator: OperatorId, ref: CueRef }),
  z.object({ type: z.literal('toggle'), operator: OperatorId, ref: CueRef }),
  z.object({ type: z.literal('clear'), layer: Layer, slot: SlotId.optional() }),
  z.object({ type: z.literal('clearAll') }),
  /** `to` is the step the sender wants, computed from the step they saw, so two Next presses move once. */
  z.object({ type: z.literal('step'), layer: Layer, slot: SlotId, to: z.number().int().nonnegative() }),
  z.object({ type: z.literal('refresh'), layer: Layer, slot: SlotId }),
  /** Replaces the slot's overrides, so a resend changes nothing and an override can be removed. */
  z.object({ type: z.literal('patch'), layer: Layer, slot: SlotId, overrides: Overrides }),
]);
export type ShowCommand = z.infer<typeof ShowCommand>;

export interface ShowEnv {
  readonly registry: Registry;
  /** The active show, read by rundown refs and free-panel params. */
  readonly context: ShowContext;
  newSlotId(): SlotId;
}

export type ShowResult = { readonly ok: true; readonly state: ShowState; readonly changed: boolean } | { readonly ok: false; readonly error: string };

const rejected = (error: string): ShowResult => ({ ok: false, error });

export function reduceShow(state: ShowState, command: ShowCommand, env: ShowEnv): ShowResult {
  const unchanged: ShowResult = { ok: true, state, changed: false };
  const next = (patch: Partial<ShowState>): ShowResult => ({ ok: true, state: { ...state, ...patch }, changed: true });
  const { registry } = env;

  const resolved = (ref: CueRef, operator: OperatorId) => {
    const cue = resolveCue(registry, ref, env.context);
    if (!cue.ok) return cue;
    const slot: Slot = { id: env.newSlotId(), origin: ref, graphic: cue.graphic, params: pinned(cue.entry, cue.params, env.context), overrides: cue.overrides, step: 0, by: operator };
    return { ok: true as const, slot, layer: cue.entry.layer };
  };

  /** The slot on `layer` of program if it is still `id`. */
  const onAir = (layer: LayerId, id: SlotId | undefined) => {
    const slot = state.program[layer];
    return slot && (id === undefined || slot.id === id) ? slot : undefined;
  };

  switch (command.type) {
    case 'activate': {
      if (!env.context.world.get('game', command.game)) return rejected(`No game ${command.game}`);
      if (state.gameId === command.game && !Object.keys(state.previews).length) return unchanged;
      return next({ gameId: command.game, previews: {} });
    }
    case 'cue': {
      const cue = resolved(command.ref, command.operator);
      if (!cue.ok) return rejected(cue.error);
      const preview = previewOf(state, command.operator);
      const existing = preview[cue.layer];
      if (existing && sameCue(existing, cue.slot)) return unchanged;
      return next({ previews: withBus(state.previews, command.operator, { ...preview, [cue.layer]: cue.slot }) });
    }
    case 'uncue': {
      const preview = previewOf(state, command.operator);
      if (!preview?.[command.layer]) return unchanged;
      return next({ previews: withBus(state.previews, command.operator, without(preview, command.layer)) });
    }
    case 'take': {
      const preview = previewOf(state, command.operator);
      if (!preview || !Object.keys(preview).length) return unchanged;
      return next({ program: putOnAir(registry, state.program, preview), previews: withBus(state.previews, command.operator, {}) });
    }
    case 'air': {
      const cue = resolved(command.ref, command.operator);
      if (!cue.ok) return rejected(cue.error);
      const existing = state.program[cue.layer];
      if (existing && sameCue(existing, cue.slot)) return unchanged;
      return next({ program: putOnAir(registry, state.program, { [cue.layer]: cue.slot }) });
    }
    case 'toggle': {
      const layer = LAYERS.find((candidate) => sameJson(state.program[candidate]?.origin, command.ref));
      if (layer) return next({ program: without(state.program, layer) });
      return reduceShow(state, { type: 'air', operator: command.operator, ref: command.ref }, env);
    }
    case 'clear': {
      if (!onAir(command.layer, command.slot)) return unchanged;
      return next({ program: without(state.program, command.layer) });
    }
    case 'clearAll':
      return Object.keys(state.program).length ? next({ program: {} }) : unchanged;
    case 'step': {
      const slot = onAir(command.layer, command.slot);
      if (!slot) return unchanged;
      // A graphic without steps has one, so Next takes it off air.
      const count = entryOf(registry, slot.graphic)?.steps?.count ?? 1;
      if (command.to === slot.step) return unchanged;
      if (command.to >= count) return next({ program: without(state.program, command.layer) });
      return next({ program: { ...state.program, [command.layer]: { ...slot, step: command.to } } });
    }
    case 'refresh': {
      const slot = onAir(command.layer, command.slot);
      if (!slot) return unchanged;
      const cue = resolveCue(registry, slot.origin, env.context);
      if (!cue.ok) return rejected(cue.error);
      if (cue.graphic !== slot.graphic) return rejected(`The cue now plays ${cue.entry.name}; take it again`);
      const refreshed = { ...slot, params: pinned(cue.entry, cue.params, env.context), overrides: cue.overrides };
      if (sameCue(slot, refreshed)) return unchanged;
      return next({ program: { ...state.program, [command.layer]: refreshed } });
    }
    case 'patch': {
      const slot = onAir(command.layer, command.slot);
      if (!slot) return unchanged;
      const check = checkCue(registry, { graphic: slot.graphic, params: slot.params, overrides: command.overrides });
      if (!check.ok) return rejected(check.error);
      if (sameJson(slot.overrides, command.overrides)) return unchanged;
      return next({ program: { ...state.program, [command.layer]: { ...slot, overrides: command.overrides } } });
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

/** A slot's params after its entry's `pin`. A pin that throws leaves them as they are, and the bind reports the problem. */
function pinned(entry: AnyGraphic, params: Record<string, unknown>, context: ShowContext): Record<string, unknown> {
  if (!entry.pin) return params;
  try {
    return entry.params.parse(entry.pin(entry.params.parse(params), context)) as Record<string, unknown>;
  } catch {
    return params;
  }
}

const sameCue = (a: Slot, b: Slot) =>
  sameJson(a.origin, b.origin) && a.graphic === b.graphic && sameJson(a.params, b.params) && sameJson(a.overrides, b.overrides);

const without = (bus: Bus, layer: LayerId): Bus => {
  const { [layer]: _removed, ...rest } = bus;
  return rest;
};

/** An operator's preview, set; an empty one is dropped so every empty preview reads the same. */
const withBus = (previews: ShowState['previews'], operator: OperatorId, bus: Bus): ShowState['previews'] => {
  const { [operator]: _old, ...rest } = previews;
  return Object.keys(bus).length ? { ...rest, [operator]: bus } : rest;
};

/** An operator's preview. Operator ids come from clients, so `constructor` must not reach Object.prototype. */
export const previewOf = (state: ShowState, operator: OperatorId): Bus => (Object.hasOwn(state.previews, operator) ? state.previews[operator]! : {});

/**
 * The one placement rule, for take, air and toggle: puts each slot of `incoming` on program,
 * then takes off whatever overlaps it. That is every layer an incoming graphic covers, even
 * one `incoming` also fills, and a graphic already on air that covers a layer `incoming` fills.
 */
function putOnAir(registry: Registry, program: Bus, incoming: Bus): Bus {
  const covers = (slot: Slot) => entryOf(registry, slot.graphic)?.clears ?? [];
  let result: Bus = { ...program, ...incoming };
  for (const slot of Object.values(incoming)) {
    for (const layer of covers(slot)) result = without(result, layer);
  }
  for (const layer of LAYERS) {
    const slot = result[layer];
    if (slot && !incoming[layer] && covers(slot).some((covered) => incoming[covered])) result = without(result, layer);
  }
  return result;
}

export type ResolvedCue =
  | {
      readonly ok: true;
      readonly entry: AnyGraphic;
      readonly graphic: GraphicId;
      readonly params: Record<string, unknown>;
      readonly overrides: Overrides;
    }
  | { readonly ok: false; readonly error: string };

/** A free-panel graphic's params from the show, or a rundown cue, checked against the registry. */
export function resolveCue(registry: Registry, ref: CueRef, context: ShowContext): ResolvedCue {
  const checked = (graphic: GraphicId, params: unknown, overrides: Overrides): ResolvedCue => {
    const check = checkCue(registry, { graphic, params, overrides });
    return check.ok ? { ok: true, entry: check.entry, graphic, params: check.params, overrides } : check;
  };
  if (ref.kind === 'rundown') {
    const cue = context.show?.rundown.find((candidate) => candidate.id === ref.cue);
    if (!cue) return { ok: false, error: `The rundown has no cue ${ref.cue}` };
    return checked(cue.graphic, cue.params, cue.overrides);
  }
  const entry = entryOf(registry, ref.graphic);
  if (!entry) return { ok: false, error: `No graphic ${ref.graphic}` };
  if (!entry.free) return { ok: false, error: `${entry.name} is not on the free panel` };
  const params = entry.free(context);
  if (params === null) return { ok: false, error: `${entry.name} is not available for this show` };
  return checked(ref.graphic, params, {});
}

export type CueCheck =
  | { readonly ok: true; readonly entry: AnyGraphic; readonly params: Record<string, unknown> }
  | { readonly ok: false; readonly error: string };

/** A graphic, its params and overrides, checked against the registry. Params come back with their defaults. */
export function checkCue(registry: Registry, cue: { readonly graphic: string; readonly params: unknown; readonly overrides: Overrides }): CueCheck {
  const entry = entryOf(registry, cue.graphic);
  if (!entry) return { ok: false, error: `No graphic ${cue.graphic}` };
  const params = entry.params.safeParse(cue.params);
  if (!params.success) return { ok: false, error: `${entry.name}: ${z.prettifyError(params.error)}` };
  const overrides = checkOverrides(entry.scene, cue.overrides);
  if (overrides) return { ok: false, error: `${entry.name}: ${overrides}` };
  return { ok: true, entry, params: params.data as Record<string, unknown> };
}

const KIND_OF_VALUE = { string: 'string', color: 'string', image: 'string', number: 'number', boolean: 'boolean' } as const;

function checkOverrides(scene: SceneFacts, overrides: Overrides): string | null {
  const props = boundProps(scene);
  for (const [name, value] of Object.entries(overrides)) {
    const kind = props.get(name);
    if (!kind) return `${scene.file} has no property ${name} to override`;
    if (typeof value !== KIND_OF_VALUE[kind]) return `${name} is a ${kind} property`;
  }
  return null;
}
