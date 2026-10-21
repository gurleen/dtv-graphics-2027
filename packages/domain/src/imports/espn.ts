/** The vendored team list (data/seed/teams.json) as import edits, with the defects it carries reported. */

import { z } from 'zod';
import type { ImportEdit } from '../edits';
import { Conference, School, Team, TeamSeason } from '../entities';
import { type ConferenceId, idFor, type SeasonId } from '../ids';
import { Color, Url } from '../primitives';
import type { ProgramCode } from '../programs';

/** One record of teams.json. Missing values are empty strings there. */
export const EspnTeam = z.object({
  team_id: z.number().int(),
  abbreviation: z.string(),
  short_name: z.string(),
  mascot: z.string(),
  team: z.string(),
  color: z.string().default(''),
  alternate_color: z.string().default(''),
  conference_id: z.number().int(),
  conference_short_name: z.string(),
  conference_name: z.string(),
  logo_name: z.string().default(''),
  website: z.string().default(''),
});
export type EspnTeam = z.infer<typeof EspnTeam>;

/** Something in a source file a person should look at, shown on the data page after an import. */
export interface ImportWarning {
  readonly code: 'conference-id-shared' | 'conference-names' | 'logo-shared' | 'no-color' | 'no-alternate-color' | 'no-logo';
  readonly message: string;
  /** The schools or conferences it concerns, by name. */
  readonly subjects: readonly string[];
}

const LOGO_BASE = 'https://images.dragonstv.io/logos';
const FALLBACK_PRIMARY = Color.parse('#333333');
const FALLBACK_SECONDARY = Color.parse('#ffffff');

const toColor = (value: string): Color | null => (/^[0-9a-fA-F]{6}$/.test(value) ? Color.parse(`#${value.toLowerCase()}`) : null);
const toLogo = (logoName: string): Url | null => (logoName ? Url.parse(`${LOGO_BASE}/${logoName.replace(/\.png$/i, '')}.PNG`) : null);

const recordCount = (n: number) => `${n} record${n === 1 ? '' : 's'}`;

/** Occurrences of each key, most frequent first, so the first entry is the file's majority. */
const tally = <T>(rows: readonly T[], key: (row: T) => string) => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
};

const groupBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
};

/**
 * Conferences, schools, a team per program, and each team's season row with its
 * conference. Ids are slugs of the names (no collisions in the file), so a re-run writes
 * the same rows. A conference is its short name: the file's conference_id is not unique.
 */
export function espnEdits(
  records: readonly EspnTeam[],
  options: { readonly season: SeasonId; readonly programs: readonly ProgramCode[] },
): { readonly edits: ImportEdit[]; readonly warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const edits: ImportEdit[] = [];

  const espnIdOf = new Map<string, string>();
  for (const [espnId, rows] of groupBy(records, (row) => String(row.conference_id))) {
    const shortNames = tally(rows, (row) => row.conference_short_name);
    const owner = shortNames[0]![0];
    espnIdOf.set(owner, espnId);
    if (shortNames.length > 1) {
      warnings.push({
        code: 'conference-id-shared',
        message: `conference_id ${espnId} names ${shortNames.map(([name, n]) => `${name} (${recordCount(n)})`).join(' and ')}; only ${owner} keeps the ESPN id`,
        subjects: shortNames.map(([name]) => name),
      });
    }
  }

  const conferenceIdOf = new Map<string, ConferenceId>();
  for (const [shortName, rows] of groupBy(records, (row) => row.conference_short_name)) {
    const names = tally(rows, (row) => row.conference_name);
    const name = names[0]![0];
    if (names.length > 1) {
      warnings.push({
        code: 'conference-names',
        message: `${shortName} is named ${names.map(([text, n]) => `"${text}" (${recordCount(n)})`).join(' and ')}; using "${name}"`,
        subjects: names.map(([text]) => text),
      });
    }
    const conference = Conference.parse({ id: idFor.conference(shortName), name, shortName, espnId: espnIdOf.get(shortName) ?? null });
    conferenceIdOf.set(shortName, conference.id);
    edits.push({ op: 'put', kind: 'conference', value: conference });
  }

  for (const [file, rows] of groupBy(records.filter((row) => row.logo_name), (row) => row.logo_name)) {
    if (rows.length > 1) {
      const schools = rows.map((row) => row.team);
      warnings.push({ code: 'logo-shared', message: `${file} is the logo of ${rows.length} schools: ${schools.join(', ')}`, subjects: schools });
    }
  }
  const missing = (code: 'no-color' | 'no-alternate-color' | 'no-logo', rows: readonly EspnTeam[], what: string) => {
    if (rows.length) warnings.push({ code, message: `${rows.length} records ${what}`, subjects: rows.map((row) => row.team) });
  };
  missing('no-color', records.filter((row) => !toColor(row.color)), `have no valid color; they get ${FALLBACK_PRIMARY}`);
  missing('no-alternate-color', records.filter((row) => !toColor(row.alternate_color)), `have no valid alternate_color; they get ${FALLBACK_SECONDARY}`);
  missing('no-logo', records.filter((row) => !row.logo_name), 'have no logo_name, so they have no logo');

  for (const row of records) {
    const school = School.parse({
      id: idFor.school(row.team),
      name: row.team,
      shortName: row.short_name,
      mascot: row.mascot,
      abbreviation: row.abbreviation,
      primaryColor: toColor(row.color) ?? FALLBACK_PRIMARY,
      secondaryColor: toColor(row.alternate_color) ?? FALLBACK_SECONDARY,
      logo: toLogo(row.logo_name),
      website: row.website || null,
      espnId: String(row.team_id),
    });
    edits.push({ op: 'put', kind: 'school', value: school });
    for (const program of options.programs) {
      const team = Team.parse({ id: idFor.team(school.id, program), schoolId: school.id, program });
      edits.push({ op: 'put', kind: 'team', value: team });
      edits.push({
        op: 'put',
        kind: 'teamSeason',
        value: TeamSeason.parse({
          id: idFor.teamSeason(team.id, options.season),
          teamId: team.id,
          seasonId: options.season,
          conferenceId: conferenceIdOf.get(row.conference_short_name),
        }),
      });
    }
  }
  return { edits, warnings };
}
