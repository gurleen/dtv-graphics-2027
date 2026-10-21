/**
 * What a picker offers for an id param, by the kind of row the id names. Where the show's
 * game narrows the choice (its players, its staff, its two teams) the picker offers only
 * those; the crew comes first among talent. Any other kind lists every row.
 */

import { type EntityKind, type GameView, resolveGame, type Show, SIDES, type World } from '@dtv/domain';

export interface PickerOption {
  readonly id: string;
  readonly label: string;
}

type Picker = (world: World, show: Show, game: GameView | undefined) => readonly PickerOption[] | null;

const person = (row: { readonly firstName: string; readonly lastName: string }) => `${row.firstName} ${row.lastName}`.trim();

const PICKERS: { readonly [K in EntityKind]?: Picker } = {
  player: (world, _show, game) =>
    game
      ? SIDES.flatMap((side) => {
          const { team, brand } = game.sides[side];
          return world.roster(team.id, game.season.id).map((player) => ({ id: player.id, label: `#${player.jersey} ${person(player)} · ${brand.abbreviation}` }));
        })
      : null,
  staff: (world, _show, game) =>
    game
      ? SIDES.flatMap((side) => {
          const { team, brand } = game.sides[side];
          return world.staffOf(team.id, game.season.id).map((staff) => ({ id: staff.id, label: `${person(staff)}, ${staff.title} · ${brand.abbreviation}` }));
        })
      : null,
  team: (_world, _show, game) => (game ? SIDES.map((side) => ({ id: game.sides[side].team.id, label: `${game.sides[side].school.name} (${side})` })) : null),
  talent: (world, show) => {
    const crew = new Set(show.crew.map((member) => member.talentId as string));
    const talent = [...world.all('talent')].sort((a, b) => Number(crew.has(b.id)) - Number(crew.has(a.id)));
    return talent.map((row) => ({ id: row.id, label: `${person(row)}${crew.has(row.id) ? ' · crew' : ''}` }));
  },
};

const labelOf = (row: object & { readonly id: string }): string => {
  if ('name' in row && typeof row.name === 'string') return row.name;
  if ('firstName' in row && 'lastName' in row) return person(row as { firstName: string; lastName: string });
  return row.id;
};

/** The options for `kind`, with `current` kept when the narrowing leaves it out, so a cue never shows an empty picker. */
export function pickerOptions(world: World, show: Show, kind: EntityKind, current: string | null): readonly PickerOption[] {
  const game = show.gameId ? resolveGame(world, show.gameId) : undefined;
  const options = PICKERS[kind]?.(world, show, game) ?? world.all(kind).map((row) => ({ id: row.id, label: labelOf(row) }));
  if (!current || options.some((option) => option.id === current)) return options;
  const row = world.all(kind).find((each) => each.id === current);
  return [...options, { id: current, label: row ? labelOf(row) : `${current} (missing)` }];
}
