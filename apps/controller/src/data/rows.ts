/** Reading rows of a kind chosen at run time, and the names the page shows for them. */

import { type EntityKind, type Game, type World } from '@dtv/domain';
import { type Doc } from './paths';

/** The World's `get` takes a branded id of one kind; a kind and id chosen at run time cannot prove that, so the cast lives here. */
export const rowOf = (world: World, kind: EntityKind, id: string): Doc | undefined => world.get(kind, id as never);

export const personName = (person: { readonly firstName: string; readonly lastName: string }) => [person.firstName, person.lastName].filter(Boolean).join(' ');

const GAME_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** `Drexel at Saint Joseph's · Oct 21`. */
export function gameLabel(world: World, game: Game): string {
  const name = (teamId: Game['homeTeamId']) => {
    const team = world.get('team', teamId);
    return (team && world.get('school', team.schoolId)?.shortName) ?? teamId;
  };
  return `${name(game.awayTeamId)} at ${name(game.homeTeamId)} · ${GAME_DAY.format(new Date(game.startsAt))}`;
}

/** A value as a person reads it in a diff: empty is a dash, a boolean is yes or no. */
export const showValue = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '—' : typeof value === 'boolean' ? (value ? 'yes' : 'no') : typeof value === 'object' ? JSON.stringify(value) : String(value);

const TEAM_LABEL = (world: World, teamId: string): string => {
  const team = world.get('team', teamId as never);
  const school = team && world.get('school', team.schoolId);
  return school && team ? `${school.shortName} ${team.program.toUpperCase()}` : teamId;
};

/** The name the record panel's header shows for a row. */
export function rowLabel(world: World, kind: EntityKind, doc: Doc): string {
  const text = (field: string) => String(doc[field] ?? '');
  switch (kind) {
    case 'player':
      return [text('jersey') && `#${text('jersey')}`, personName({ firstName: text('firstName'), lastName: text('lastName') })].filter(Boolean).join(' ') || 'New player';
    case 'staff':
    case 'talent':
      return personName({ firstName: text('firstName'), lastName: text('lastName') }) || `New ${kind}`;
    case 'playerStats': {
      const player = world.get('player', text('id') as never);
      return `${player ? personName(player) : text('id')} season stats`;
    }
    case 'team':
      return TEAM_LABEL(world, text('id'));
    case 'teamSeason':
      return `${TEAM_LABEL(world, text('teamId'))} ${text('seasonId')} season`;
    case 'school':
    case 'sponsor':
    case 'venue':
    case 'show':
      return text('name') || `New ${kind}`;
    default:
      return text('id');
  }
}
