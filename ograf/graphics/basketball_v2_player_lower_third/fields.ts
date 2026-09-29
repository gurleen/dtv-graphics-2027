import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  { name: 'firstName', kind: 'string', title: 'First Name', default: 'JORDAN' },
  { name: 'lastName', kind: 'string', title: 'Last Name', default: 'MITCHELL' },
  { name: 'jerseyNumber', kind: 'string', title: 'Jersey Number', default: '12' },
  { name: 'position', kind: 'string', title: 'Position', default: 'GUARD' },
  { name: 'classYear', kind: 'string', title: 'Class Year', default: 'JUNIOR' },
  { name: 'statLabel', kind: 'string', title: 'Stat Label', default: 'TONIGHT' },
  { name: 'statLine', kind: 'string', title: 'Stat Line', default: '18 PTS  ·  7 REB  ·  4 AST  ·  3-5 3PT' },
  {
    name: 'headshotUrl', property: 'headshot', kind: 'imageUrl', title: 'Headshot',
    description: 'Transparent or cropped player headshot; uses the embedded placeholder when omitted.',
  },
  {
    name: 'teamLogoUrl', property: 'teamLogo', kind: 'imageUrl', title: 'Team Logo',
    description: 'Square transparent team logo; uses the embedded Drexel mark when omitted.',
  },
  { name: 'teamPrimaryColor', kind: 'color', title: 'Team Primary Color', default: '#07294d' },
  { name: 'teamSecondaryColor', kind: 'color', title: 'Team Secondary Color', default: '#ffc600' },
];
