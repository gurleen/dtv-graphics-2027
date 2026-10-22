/** The Games list's rules, with no UI in them: building a game from the new-game form. */

import { ENTITIES, type Game, idFor, parseEntity, type ProgramCode, type TeamId, type World } from '@dtv/domain';

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
