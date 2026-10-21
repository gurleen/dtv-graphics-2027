/**
 * The Shows list's rules, with no UI in them: building a game from the new-game form, a free
 * id for a show, and duplicating a show onto another game with the cues that were written
 * for the old game flagged.
 */

import {
  type Cue, CueId, ENTITIES, type EntityKind, type Game, GameId, idFor, parseEntity, type ProgramCode, type Show, ShowId, slugify, type TeamId, type World,
} from '@dtv/domain';
import { entryOf, type FormField, type FormNode, paramForm, type Registry } from '@dtv/playout';
import { rowLabel, rowOf } from './rows';

export type Built<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const refused = (error: string): Built<never> => ({ ok: false, error });

/** What the new-game dialog holds. Times are wall-clock in the browser's zone; `''` is not chosen yet. */
export interface GameForm {
  readonly seasonId: string;
  readonly program: ProgramCode;
  readonly awayTeamId: string;
  readonly homeTeamId: string;
  readonly venueId: string;
  /** `YYYY-MM-DD`: the local game day, which the game's id carries. */
  readonly date: string;
  /** `HH:mm`. */
  readonly time: string;
  readonly conferenceGame: boolean;
  readonly title: string;
}

/** `-05:00` for the 300 minutes west of UTC that `Date.getTimezoneOffset` reports for New York in winter. */
export function offsetText(minutesWest: number): string {
  const minutes = Math.abs(minutesWest);
  return `${minutesWest > 0 ? '-' : '+'}${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The game the form describes, with its deterministic id, or the first thing wrong with the form. */
export function buildGame(world: World, form: GameForm, minutesWest: number): Built<Game> {
  if (!form.awayTeamId || !form.homeTeamId) return refused('Pick the away and the home team');
  if (form.awayTeamId === form.homeTeamId) return refused('A team cannot play itself');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^\d{2}:\d{2}$/.test(form.time)) return refused('Give the game day and the start time');
  const parsed = ENTITIES.game.schema.safeParse({
    id: 'pending',
    seasonId: form.seasonId,
    program: form.program,
    awayTeamId: form.awayTeamId,
    homeTeamId: form.homeTeamId,
    venueId: form.venueId || null,
    startsAt: `${form.date}T${form.time}:00${offsetText(minutesWest)}`,
    conferenceGame: form.conferenceGame,
    title: form.title.trim() || null,
  });
  if (!parsed.success) return refused(parsed.error.issues[0]?.message ?? 'The game is not valid');
  const game = parsed.data;
  const id = idFor.game(game.seasonId, form.date, game.awayTeamId, game.homeTeamId);
  if (world.get('game', id)) return refused('Those teams already play that day');
  return { ok: true, value: parseEntity('game', { ...game, id }) };
}

/** True when both teams sit in the same conference that season, which is the usual reason to tick "conference game". */
export function sameConference(world: World, season: string, away: string, home: string): boolean {
  const conference = (team: string) => {
    try {
      return world.get('teamSeason', idFor.teamSeason(team as TeamId, season as never))?.conferenceId ?? null;
    } catch {
      return null;
    }
  };
  const [awayConference, homeConference] = [conference(away), conference(home)];
  return awayConference !== null && awayConference === homeConference;
}

/** `name`'s id, or the first of `name-2`, `name-3`, ... that no show has; null for a name with no letters or digits. */
export function freeShowId(world: World, name: string): ShowId | null {
  const base = slugify(name);
  if (!base) return null;
  for (let attempt = 1; ; attempt++) {
    const id = ShowId.parse(attempt === 1 ? base : `${base}-${attempt}`);
    if (!world.get('show', id)) return id;
  }
}

/** A cue's note starts with this when a duplicate copied it from a game it may not fit. */
export const CHECK_PREFIX = 'CHECK: ';
export const isFlagged = (cue: Pick<Cue, 'note'>) => cue.note.startsWith(CHECK_PREFIX);

interface Ref {
  readonly kind: EntityKind;
  readonly id: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function refsOfNode(node: FormNode, value: unknown): Ref[] {
  switch (node.kind) {
    case 'ref':
      return typeof value === 'string' ? [{ kind: node.ref, id: value }] : [];
    case 'list':
      return Array.isArray(value) ? value.flatMap((item) => refsOfNode(node.item, item)) : [];
    case 'group':
      return refsOfFields(node.fields, value);
    case 'variants': {
      const variant = isRecord(value) ? node.variants.find((each) => each.value === value[node.key]) : undefined;
      return variant ? refsOfFields(variant.fields, value) : [];
    }
    default:
      return [];
  }
}

function refsOfFields(fields: readonly FormField[], value: unknown): Ref[] {
  return isRecord(value) ? fields.flatMap((field) => refsOfNode(field.node, value[field.name])) : [];
}

/** Every row a cue's params name, found through the graphic's own params schema. */
const refsOfCue = (registry: Registry, cue: Cue): Ref[] => {
  const entry = entryOf(registry, cue.graphic);
  return entry ? refsOfFields(paramForm(entry.params), cue.params) : [];
};

/** The team a ref belongs to, or the game it is. */
function ownerOf(world: World, ref: Ref): { readonly team: string } | { readonly game: string } | null {
  switch (ref.kind) {
    case 'team':
      return { team: ref.id };
    case 'game':
      return { game: ref.id };
    case 'player':
    case 'staff':
    case 'teamSeason': {
      const team = rowOf(world, ref.kind, ref.id)?.teamId;
      return typeof team === 'string' ? { team } : null;
    }
    default:
      return null;
  }
}

/** What a cue names of the source game: its teams, their players and staff, or the game itself. Empty when nothing. */
export function namesOfGame(world: World, registry: Registry, cue: Cue, source: Game): readonly string[] {
  const teams = new Set<string>([source.awayTeamId, source.homeTeamId]);
  const names: string[] = [];
  for (const ref of refsOfCue(registry, cue)) {
    const owner = ownerOf(world, ref);
    if (!owner) continue;
    const ofGame = 'team' in owner ? teams.has(owner.team) : owner.game === source.id;
    if (!ofGame) continue;
    const doc = rowOf(world, ref.kind, ref.id);
    const name = ref.kind === 'game' ? 'the source game' : doc ? rowLabel(world, ref.kind, doc) : ref.id;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export interface FlaggedCue {
  readonly cue: CueId;
  readonly graphic: Cue['graphic'];
  readonly names: readonly string[];
}

export interface Duplicate {
  readonly show: Show;
  readonly flagged: readonly FlaggedCue[];
}

const randomSuffix = () => crypto.randomUUID().slice(0, 8);

/** `source` copied onto `gameId`: same crew, same rundown with new cue ids, and each cue that names the source game's teams or players flagged in its note. */
export function duplicateShow(
  world: World,
  registry: Registry,
  source: Show,
  onto: { readonly gameId: GameId; readonly name: string },
  random: () => string = randomSuffix,
): Built<Duplicate> {
  const id = freeShowId(world, onto.name);
  if (!id) return refused('Give the show a name');
  const game = source.gameId ? world.get('game', source.gameId) : undefined;
  const taken = new Set<string>();
  const fresh = (cue: Cue): CueId => {
    const stem = slugify(cue.graphic.split('/').pop() ?? 'cue') || 'cue';
    let candidate: string;
    do candidate = `${stem}-${random()}`;
    while (taken.has(candidate));
    taken.add(candidate);
    return CueId.parse(candidate);
  };

  const flagged: FlaggedCue[] = [];
  const rundown = source.rundown.map((cue): Cue => {
    const copy = { ...structuredClone(cue), id: fresh(cue) };
    const names = game ? namesOfGame(world, registry, cue, game) : [];
    if (!names.length) return copy;
    flagged.push({ cue: copy.id, graphic: cue.graphic, names });
    return { ...copy, note: `${CHECK_PREFIX}names ${names.join(', ')}, from ${source.name}.${cue.note ? ` ${cue.note}` : ''}` };
  });
  const show = parseEntity('show', { id, name: onto.name.trim(), gameId: onto.gameId, crew: structuredClone(source.crew), rundown });
  return { ok: true, value: { show, flagged } };
}
