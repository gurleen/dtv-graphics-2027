/**
 * Records, streaks and conference ranks from a season's results. Pure: the sportsdataverse
 * planner resolves the teams; this file only counts.
 */

import type { WinLoss } from '../primitives';

/** One completed game. A side is null for a team outside Division I: the game counts for the other side only. */
export interface Result<T extends string> {
  readonly contest: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly home: T | null;
  readonly away: T | null;
  readonly homePts: number;
  readonly awayPts: number;
}

export interface Standing {
  readonly overall: WinLoss;
  readonly conference: WinLoss;
  /** `W3`; null before the first game. */
  readonly streak: string | null;
  /** Null for a team whose conference has played no conference game yet. */
  readonly rank: number | null;
}

const pct = (record: WinLoss) => (record.wins + record.losses ? record.wins / (record.wins + record.losses) : 0);

/**
 * The last day of a conference's regular season, or null to count every conference game.
 *
 * The files carry no game type, and conference tournament games are between conference
 * teams, so they would count toward the conference record that standings show without them.
 * The regular season ends at the later of two days: the last day after which every team had
 * played the same number of conference games, and the last game day before any team played
 * its final conference game (a tournament eliminates teams; a regular season does not).
 * Tournaments are in March: with no conference game from `march` on, the season is still
 * running and every game counts.
 */
export function regularSeasonEnd<T extends string>(games: readonly Result<T>[], march: string): string | null {
  const dates = [...new Set(games.map((game) => game.date))].sort();
  if (!dates.length || dates.at(-1)! < march) return null;
  const counts = new Map<T, number>();
  const last = new Map<T, string>();
  let balanced: string | null = null;
  for (const date of dates) {
    for (const game of games) {
      if (game.date !== date) continue;
      for (const team of [game.home, game.away]) {
        if (team === null) continue;
        counts.set(team, (counts.get(team) ?? 0) + 1);
        last.set(team, date);
      }
    }
    if (new Set(counts.values()).size === 1) balanced = date;
  }
  const firstFinal = [...last.values()].sort()[0]!;
  const beforeFinal = dates.filter((date) => date < firstFinal).at(-1) ?? null;
  const end = [balanced, beforeFinal].filter((date) => date !== null).sort().at(-1) ?? null;
  return end;
}

/**
 * Each team's overall and conference record, streak and conference rank.
 *
 * Overall and the streak count every game. The conference record counts games between two
 * teams of the same conference up to that conference's `regularSeasonEnd`. Rank orders a
 * conference by conference win percentage, then conference wins, then, among the teams tied
 * on that record, win percentage in the conference games between them, then overall win
 * percentage, then name.
 */
export function standings<T extends string, C extends string>(input: {
  readonly results: readonly Result<T>[];
  readonly teams: readonly T[];
  readonly conferenceOf: (team: T) => C | null;
  readonly nameOf: (team: T) => string;
  /** `YYYY-03-01` of the season's end year. */
  readonly march: string;
}): Map<T, Standing> {
  const results = [...input.results].sort((a, b) => a.date.localeCompare(b.date) || a.contest.localeCompare(b.contest));
  const conferenceGame = (game: Result<T>) => {
    const conference = game.home && game.away && input.conferenceOf(game.home);
    return conference && conference === input.conferenceOf(game.away!) ? conference : null;
  };
  const byConference = new Map<C, Result<T>[]>();
  for (const game of results) {
    const conference = conferenceGame(game);
    if (conference) byConference.set(conference, [...(byConference.get(conference) ?? []), game]);
  }
  const ends = new Map([...byConference].map(([conference, games]) => [conference, regularSeasonEnd(games, input.march)]));

  const records = new Map(input.teams.map((team) => [team, { overall: { wins: 0, losses: 0 }, conference: { wins: 0, losses: 0 }, outcomes: [] as ('W' | 'L')[], versus: new Map<T, WinLoss>() }]));
  for (const game of results) {
    const conference = conferenceGame(game);
    const end = conference && ends.get(conference);
    // A conference game before March always counts, so a load before March never cuts one.
    const counts = conference !== null && (!end || game.date < input.march || game.date <= end);
    for (const [team, won] of [[game.home, game.homePts > game.awayPts], [game.away, game.awayPts > game.homePts]] as const) {
      const record = team === null ? undefined : records.get(team);
      if (!record) continue;
      record.overall[won ? 'wins' : 'losses']++;
      if (counts) {
        record.conference[won ? 'wins' : 'losses']++;
        const opponent = team === game.home ? game.away! : game.home!;
        const versus = record.versus.get(opponent) ?? { wins: 0, losses: 0 };
        versus[won ? 'wins' : 'losses']++;
        record.versus.set(opponent, versus);
      }
      record.outcomes.push(won ? 'W' : 'L');
    }
  }

  const streak = (outcomes: readonly ('W' | 'L')[]) => {
    const latest = outcomes.at(-1);
    if (!latest) return null;
    let length = 0;
    while (outcomes[outcomes.length - 1 - length] === latest) length++;
    return `${latest}${length}`;
  };

  const ranks = new Map<T, number>();
  const members = new Map<C, T[]>();
  for (const team of input.teams) {
    const conference = input.conferenceOf(team);
    if (conference && byConference.has(conference)) members.set(conference, [...(members.get(conference) ?? []), team]);
  }
  const sameRecord = (a: WinLoss, b: WinLoss) => a.wins === b.wins && a.losses === b.losses;
  for (const teams of members.values()) {
    const order = teams.map((team) => ({ team, ...records.get(team)! }));
    order.sort((a, b) => pct(b.conference) - pct(a.conference) || b.conference.wins - a.conference.wins);
    const placed: typeof order = [];
    for (let start = 0; start < order.length; ) {
      const end = order.findIndex((row, index) => index > start && !sameRecord(row.conference, order[start]!.conference));
      const tied = order.slice(start, end === -1 ? order.length : end);
      const amongTied = (row: (typeof order)[number]) => {
        const games = tied.flatMap((other) => row.versus.get(other.team) ?? []);
        return pct({ wins: games.reduce((n, g) => n + g.wins, 0), losses: games.reduce((n, g) => n + g.losses, 0) });
      };
      const headToHead = new Map(tied.map((row) => [row.team, amongTied(row)]));
      tied.sort(
        (a, b) =>
          headToHead.get(b.team)! - headToHead.get(a.team)! ||
          pct(b.overall) - pct(a.overall) ||
          input.nameOf(a.team).localeCompare(input.nameOf(b.team)),
      );
      placed.push(...tied);
      start += tied.length;
    }
    placed.forEach(({ team }, index) => ranks.set(team, index + 1));
  }

  return new Map(
    [...records].map(([team, record]) => [
      team,
      { overall: record.overall, conference: record.conference, streak: streak(record.outcomes), rank: ranks.get(team) ?? null },
    ]),
  );
}
