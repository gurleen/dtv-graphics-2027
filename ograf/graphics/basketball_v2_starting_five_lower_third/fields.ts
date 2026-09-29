import type { Field } from '../../shared/schema';

type Player = { number: string; lastName: string; position: string };
type Team = {
  key: 'away' | 'home';
  title: 'Away' | 'Home';
  school: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  players: readonly Player[];
};

// The scene's own defaults: Saint Joseph's at Drexel.
const TEAMS: readonly Team[] = [
  {
    key: 'away', title: 'Away', school: "SAINT JOSEPH'S", logo: "Saint Joseph's",
    primaryColor: '#c2071b', secondaryColor: '#a7a9ac',
    players: [
      { number: '1', lastName: 'CARTER', position: 'G' },
      { number: '4', lastName: 'OKAFOR', position: 'G' },
      { number: '11', lastName: 'DELGADO', position: 'G' },
      { number: '23', lastName: 'WHITFIELD', position: 'F' },
      { number: '34', lastName: 'NOVAK', position: 'C' },
    ],
  },
  {
    key: 'home', title: 'Home', school: 'DREXEL', logo: 'Drexel',
    primaryColor: '#07294d', secondaryColor: '#ffc600',
    players: [
      { number: '12', lastName: 'MITCHELL', position: 'G' },
      { number: '3', lastName: 'BENNETT', position: 'G' },
      { number: '24', lastName: 'ALVAREZ', position: 'F' },
      { number: '0', lastName: 'HOLLOWAY', position: 'F' },
      { number: '15', lastName: 'OKONKWO', position: 'C' },
    ],
  },
];

const teamFields = (team: Team): Field[] => [
  { name: `${team.key}School`, kind: 'string', title: `${team.title} School`, default: team.school },
  {
    name: `${team.key}LogoUrl`, property: `${team.key}Logo`, kind: 'imageUrl', title: `${team.title} Logo`,
    description: `Square transparent team logo; uses the embedded ${team.logo} mark when omitted.`,
  },
  { name: `${team.key}PrimaryColor`, kind: 'color', title: `${team.title} Primary Color`, default: team.primaryColor },
  {
    name: `${team.key}SecondaryColor`, kind: 'color', title: `${team.title} Secondary Color`, default: team.secondaryColor,
    description: 'The marker on the left edge of the header.',
  },
  ...team.players.flatMap((player, index): Field[] => {
    const name = `${team.key}Player${index + 1}`;
    const title = `${team.title} Player ${index + 1}`;
    return [
      { name: `${name}Number`, kind: 'string', title: `${title} Number`, default: player.number },
      { name: `${name}LastName`, kind: 'string', title: `${title} Last Name`, default: player.lastName },
      {
        name: `${name}Position`, kind: 'string', title: `${title} Position`, default: player.position,
        description: 'One or two letters, such as G, F or C.',
      },
      {
        name: `${name}HeadshotUrl`, property: `${name}Headshot`, kind: 'imageUrl', title: `${title} Headshot`,
        description: 'Player headshot, cropped at the top of the frame; uses the embedded placeholder when omitted.',
      },
    ];
  }),
];

export const FIELDS: readonly Field[] = [
  ...TEAMS.flatMap(teamFields),
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Transparent sponsor logo; uses the embedded Independence Blue Cross mark when omitted.',
  },
];
