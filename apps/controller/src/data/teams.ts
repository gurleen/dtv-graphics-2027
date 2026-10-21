/** The team list's model: every school's programs, searched, and the pinned and recent ones. */

import { PROGRAMS, type ProgramCode, type School, type Team, type TeamId, type World } from '@dtv/domain';

export interface TeamEntry {
  readonly team: Team;
  readonly school: School;
  /** `Drexel · MBB`. */
  readonly label: string;
  /** What a search matches against, lower case. */
  readonly haystack: string;
}

export const programLabel = (program: ProgramCode) => program.toUpperCase();

export function teamEntries(world: World): readonly TeamEntry[] {
  const entries: TeamEntry[] = [];
  for (const team of world.all('team')) {
    const school = world.get('school', team.schoolId);
    if (!school) continue;
    entries.push({
      team,
      school,
      label: `${school.shortName} · ${programLabel(team.program)}`,
      haystack: [school.name, school.shortName, school.mascot, school.abbreviation, team.program, PROGRAMS[team.program].name].join(' ').toLowerCase(),
    });
  }
  return entries.sort((a, b) => a.school.name.localeCompare(b.school.name) || a.team.program.localeCompare(b.team.program));
}

/** Entries that contain every word typed, those whose school name starts with the first word first. */
export function searchTeams(entries: readonly TeamEntry[], query: string, limit: number): readonly TeamEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = entries.filter((entry) => words.every((word) => entry.haystack.includes(word)));
  const starts = (entry: TeamEntry) => entry.school.name.toLowerCase().startsWith(words[0]!) || entry.school.shortName.toLowerCase().startsWith(words[0]!);
  return [...hits.filter(starts), ...hits.filter((entry) => !starts(entry))].slice(0, limit);
}

/** The show's two teams first, then the teams opened lately, each once. */
export function pinnedTeams(entries: readonly TeamEntry[], gameTeams: readonly TeamId[], recent: readonly TeamId[]): { readonly game: readonly TeamEntry[]; readonly recent: readonly TeamEntry[] } {
  const byId = new Map(entries.map((entry) => [entry.team.id, entry]));
  const pick = (ids: readonly TeamId[], seen: Set<TeamId>) =>
    ids.flatMap((id) => {
      const entry = byId.get(id);
      if (!entry || seen.has(id)) return [];
      seen.add(id);
      return [entry];
    });
  const seen = new Set<TeamId>();
  return { game: pick(gameTeams, seen), recent: pick(recent, seen) };
}

const RECENT_KEY = 'dtv.data.recent';
const RECENT_MAX = 6;

/** The list with `id` moved to the front, at most RECENT_MAX long. */
export const touchRecent = (recent: readonly TeamId[], id: TeamId): readonly TeamId[] => [id, ...recent.filter((each) => each !== id)].slice(0, RECENT_MAX);

export function readRecent(storage: Pick<Storage, 'getItem'>): readonly TeamId[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is TeamId => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const writeRecent = (storage: Pick<Storage, 'setItem'>, recent: readonly TeamId[]) => storage.setItem(RECENT_KEY, JSON.stringify(recent));
