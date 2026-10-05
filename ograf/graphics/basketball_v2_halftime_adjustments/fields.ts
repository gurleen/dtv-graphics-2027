import type { Field } from '../../shared/schema';

type Team = {
  key: 'away' | 'home';
  title: 'Away' | 'Home';
  school: string;
  mascot: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  lines: readonly [string, string];
};

// The scene's own defaults: Saint Joseph's at Drexel.
const TEAMS: readonly Team[] = [
  {
    key: 'away', title: 'Away', school: "SAINT JOSEPH'S", mascot: 'HAWKS', logo: "Saint Joseph's",
    primaryColor: '#c2071b', secondaryColor: '#a7a9ac',
    lines: ['PUSH THE PACE IN TRANSITION', 'LIMIT SECOND-CHANCE POINTS'],
  },
  {
    key: 'home', title: 'Home', school: 'DREXEL', mascot: 'DRAGONS', logo: 'Drexel',
    primaryColor: '#07294d', secondaryColor: '#ffc600',
    lines: ['ATTACK THE PAINT EARLY', 'CLOSE OUT ON THREE-POINT SHOOTERS'],
  },
];

const teamFields = (team: Team): Field[] => [
  { name: `${team.key}School`, kind: 'string', title: `${team.title} School`, default: team.school },
  { name: `${team.key}Mascot`, kind: 'string', title: `${team.title} Mascot`, default: team.mascot, description: 'Shown beneath the school name.' },
  ...team.lines.map((line, index): Field => ({
    name: `${team.key}Line${index + 1}`, kind: 'string', title: `${team.title} Adjustment ${index + 1}`, default: line,
    description: 'About 30 characters; longer text shrinks to fit.',
  })),
  {
    name: `${team.key}LogoUrl`, property: `${team.key}Logo`, kind: 'imageUrl', title: `${team.title} Logo`,
    description: `Square transparent team logo; uses the embedded ${team.logo} mark when omitted.`,
  },
  { name: `${team.key}PrimaryColor`, kind: 'color', title: `${team.title} Primary Color`, default: team.primaryColor },
  {
    name: `${team.key}SecondaryColor`, kind: 'color', title: `${team.title} Secondary Color`, default: team.secondaryColor,
    description: 'The marker on the left edge and the bullets before each adjustment.',
  },
];

export const FIELDS: readonly Field[] = [
  ...TEAMS.flatMap(teamFields),
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Sponsor logo, contained within the light chip; uses the embedded Rothman Orthopaedics mark when omitted.',
  },
];
