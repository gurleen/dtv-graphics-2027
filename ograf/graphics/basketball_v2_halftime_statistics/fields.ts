import type { Field } from '../../shared/schema';

const row = (
  index: number, label: string, awayValue: string, awayDetail: string, homeValue: string, homeDetail: string,
  leadingValue: 'HIGHER' | 'LOWER',
): Field[] => [
  { name: `row${index}Label`, kind: 'string', title: `Row ${index} Label`, default: label },
  { name: `row${index}AwayValue`, kind: 'string', title: `Row ${index} Away Value`, default: awayValue },
  {
    name: `row${index}AwayDetail`, kind: 'string', title: `Row ${index} Away Detail`, default: awayDetail,
    description: 'Muted figure after the value, for example a percentage. Leave blank for none.',
  },
  { name: `row${index}HomeValue`, kind: 'string', title: `Row ${index} Home Value`, default: homeValue },
  {
    name: `row${index}HomeDetail`, kind: 'string', title: `Row ${index} Home Detail`, default: homeDetail,
    description: 'Muted figure after the value, for example a percentage. Leave blank for none.',
  },
  {
    name: `row${index}LeadingValue`, kind: 'select', title: `Row ${index} Leader`,
    options: ['HIGHER', 'LOWER', 'NONE'], default: leadingValue,
    description: 'Which figure marks the leading team in its colour: HIGHER, LOWER (as for turnovers), or NONE. '
      + 'The details are compared when both teams have one, the values otherwise; a tie marks neither team.',
  },
];

export const FIELDS: readonly Field[] = [
  { name: 'title', kind: 'string', title: 'Title', default: 'HALFTIME STATS' },
  { name: 'awaySchool', kind: 'string', title: 'Away School', default: "SAINT JOSEPH'S" },
  { name: 'awayMascot', kind: 'string', title: 'Away Mascot', default: 'HAWKS' },
  { name: 'homeSchool', kind: 'string', title: 'Home School', default: 'DREXEL' },
  { name: 'homeMascot', kind: 'string', title: 'Home Mascot', default: 'DRAGONS' },
  {
    name: 'awayScore', kind: 'string', title: 'Away Score', default: '31',
    description: 'The higher score is marked in its team colour.',
  },
  {
    name: 'homeScore', kind: 'string', title: 'Home Score', default: '34',
    description: 'The higher score is marked in its team colour.',
  },
  ...row(1, 'FG', '12-28', '42.9%', '13-27', '48.1%', 'HIGHER'),
  ...row(2, '3PT', '4-11', '36.4%', '5-12', '41.7%', 'HIGHER'),
  ...row(3, 'FT', '3-4', '75.0%', '3-5', '60.0%', 'HIGHER'),
  ...row(4, 'REB', '17', '', '15', '', 'HIGHER'),
  ...row(5, 'AST', '8', '', '10', '', 'HIGHER'),
  ...row(6, 'TO', '5', '', '7', '', 'LOWER'),
  {
    name: 'awayLogoUrl', property: 'awayLogo', kind: 'imageUrl', title: 'Away Logo',
    description: 'Square transparent team logo; uses the embedded Saint Joseph\'s mark when omitted.',
  },
  {
    name: 'homeLogoUrl', property: 'homeLogo', kind: 'imageUrl', title: 'Home Logo',
    description: 'Square transparent team logo; uses the embedded Drexel mark when omitted.',
  },
  { name: 'awayPrimaryColor', kind: 'color', title: 'Away Primary Color', default: '#c2071b' },
  { name: 'homePrimaryColor', kind: 'color', title: 'Home Primary Color', default: '#07294d' },
  { name: 'awaySecondaryColor', kind: 'color', title: 'Away Secondary Color', default: '#101010' },
  { name: 'homeSecondaryColor', kind: 'color', title: 'Home Secondary Color', default: '#ffc600' },
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Full-colour logo for the white chip, about 3.5:1 (1600 x 447); uses the embedded Drexel Physical Therapy mark when omitted.',
  },
];
