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
      { number: '0', lastName: 'CAREY', position: 'G' },
      { number: '1', lastName: 'JOHNSON', position: 'G' },
      { number: '11', lastName: 'GLOVER-TOSCANO', position: 'G' },
      { number: '15', lastName: 'LOGAN', position: 'F' },
      { number: '23', lastName: 'MARRS', position: 'F' },
    ],
  },
  {
    key: 'home', title: 'Home', school: 'DREXEL', logo: 'Drexel',
    primaryColor: '#07294d', secondaryColor: '#ffc600',
    players: [
      { number: '5', lastName: 'REED', position: 'G' },
      { number: '0', lastName: 'HIPPS', position: 'G' },
      { number: '23', lastName: 'TINGLER', position: 'G' },
      { number: '6', lastName: 'EDOMWONYIN', position: 'F' },
      { number: '11', lastName: 'DE LAPORTERIE', position: 'F' },
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
