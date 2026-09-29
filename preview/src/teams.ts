import source from './teams.json';

const LOGO_BASE = 'https://images.dragonstv.io/logos';
const FALLBACK_PRIMARY = '#333333';
const FALLBACK_SECONDARY = '#FFFFFF';

export type Team = {
  id: number;
  abbreviation: string;
  name: string;
  conference: string;
  primary: string;
  secondary: string;
  logoUrl: string | null;
};

type SourceTeam = {
  team_id: number;
  abbreviation: string;
  display_name: string;
  color?: string;
  alternate_color?: string;
  conference_short_name: string;
  logo_name?: string;
};

// A handful of entries carry an empty or malformed color, so fall back rather
// than write garbage into the view model.
const toHex = (value: string | undefined, fallback: string) =>
  /^[0-9a-fA-F]{6}$/.test(value ?? '') ? `#${value!.toLowerCase()}` : fallback;

const toLogoUrl = (logoName: string | undefined) =>
  logoName ? `${LOGO_BASE}/${logoName.replace(/\.png$/i, '')}.PNG` : null;

export const TEAMS: Team[] = (source as SourceTeam[])
  .map((team) => ({
    id: team.team_id,
    abbreviation: team.abbreviation,
    name: team.display_name,
    conference: team.conference_short_name,
    primary: toHex(team.color, FALLBACK_PRIMARY),
    secondary: toHex(team.alternate_color, FALLBACK_SECONDARY),
    logoUrl: toLogoUrl(team.logo_name),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const TEAMS_BY_ID = new Map(TEAMS.map((team) => [team.id, team]));

export const TEAMS_WITH_LOGOS = TEAMS.filter((team) => team.logoUrl !== null);

/** Teams grouped into <optgroup>s, conferences in alphabetical order. */
export const groupByConference = (teams: Team[]) => {
  const groups = new Map<string, Team[]>();
  for (const team of teams) {
    const bucket = groups.get(team.conference);
    if (bucket) bucket.push(team);
    else groups.set(team.conference, [team]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export const SAINT_JOSEPHS_ID = 2603;
export const DREXEL_ID = 2182;
