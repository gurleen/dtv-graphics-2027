import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  {
    name: 'eventTitle', kind: 'string', title: 'Event Title', default: 'COLLEGE BASKETBALL',
    description: 'Shown in a tab above the VS panel; leave blank to hide the tab.',
  },
  { name: 'awaySchool', kind: 'string', title: 'Away School', default: "SAINT JOSEPH'S" },
  {
    name: 'awayMascot', kind: 'string', title: 'Away Mascot', default: 'HAWKS',
    description: 'Set in bold after the school; leave blank to show the school alone.',
  },
  { name: 'homeSchool', kind: 'string', title: 'Home School', default: 'DREXEL' },
  {
    name: 'homeMascot', kind: 'string', title: 'Home Mascot', default: 'DRAGONS',
    description: 'Set in bold after the school; leave blank to show the school alone.',
  },
  { name: 'awayOverallRecord', kind: 'string', title: 'Away Overall Record', default: '15-5' },
  { name: 'homeOverallRecord', kind: 'string', title: 'Home Overall Record', default: '14-6' },
  { name: 'awayConferenceRecord', kind: 'string', title: 'Away Conference Record', default: '7-2 A10' },
  { name: 'homeConferenceRecord', kind: 'string', title: 'Home Conference Record', default: '6-3 CAA' },
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
  { name: 'venueName', kind: 'string', title: 'Venue Name', default: 'DASKALAKIS ATHLETIC CENTER' },
  { name: 'venueLocation', kind: 'string', title: 'Venue Location', default: 'PHILADELPHIA, PA' },
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Transparent sponsor logo; uses the embedded Independence Blue Cross mark when omitted.',
  },
];
