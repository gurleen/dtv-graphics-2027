import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  { name: 'awayAcronym', kind: 'string', title: 'Away Acronym', default: 'SJU' },
  { name: 'homeAcronym', kind: 'string', title: 'Home Acronym', default: 'DREX' },
  { name: 'awayScore', kind: 'integer', title: 'Away Score', default: 68 },
  { name: 'homeScore', kind: 'integer', title: 'Home Score', default: 72 },
  {
    name: 'awayLogoUrl', property: 'awayLogo', kind: 'imageUrl', title: 'Away Logo',
    description: 'Square transparent team logo; uses the embedded mark when omitted.',
  },
  {
    name: 'homeLogoUrl', property: 'homeLogo', kind: 'imageUrl', title: 'Home Logo',
    description: 'Square transparent team logo; uses the embedded mark when omitted.',
  },
  { name: 'awayPrimaryColor', kind: 'color', title: 'Away Primary Color', default: '#c2071b' },
  { name: 'homePrimaryColor', kind: 'color', title: 'Home Primary Color', default: '#07294d' },
  { name: 'awaySecondaryColor', kind: 'color', title: 'Away Secondary Color', default: '#101010' },
  { name: 'homeSecondaryColor', kind: 'color', title: 'Home Secondary Color', default: '#ffc600' },
  { name: 'awayTimeouts', kind: 'integer', title: 'Away Timeouts', description: 'Remaining timeouts, from zero to four.', default: 3 },
  { name: 'homeTimeouts', kind: 'integer', title: 'Home Timeouts', description: 'Remaining timeouts, from zero to four.', default: 4 },
  { name: 'awayBonus', kind: 'boolean', title: 'Away Bonus', default: false },
  { name: 'homeBonus', kind: 'boolean', title: 'Home Bonus', default: true },
  { name: 'awayPossession', kind: 'boolean', title: 'Away Possession', default: false },
  { name: 'homePossession', kind: 'boolean', title: 'Home Possession', default: true },
  { name: 'period', kind: 'select', title: 'Period', options: ['1ST PERIOD', '2ND PERIOD', 'OT', '2OT', '3OT', 'HALF', 'FINAL'], default: '2ND PERIOD' },
  { name: 'clock', kind: 'string', title: 'Game Clock', description: 'Pre-formatted, e.g. "13:59" or "0:04.3".', default: '13:59' },
  { name: 'shotClock', kind: 'string', title: 'Shot Clock', description: 'Pre-formatted seconds; send an empty string to blank it.', default: '24' },
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Transparent sponsor logo; uses the embedded Independence Blue Cross mark when omitted.',
  },
];
