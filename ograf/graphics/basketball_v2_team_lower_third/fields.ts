import type { Field } from '../../shared/schema';

const stat = (index: number, value: string, label: string): Field[] => [
  {
    name: `stat${index}Value`, kind: 'string', title: `Stat ${index} Value`, default: value,
    description: 'Leave blank to hide this stat; the remaining stats share the strip evenly.',
  },
  {
    name: `stat${index}Label`, kind: 'string', title: `Stat ${index} Label`, default: label,
    description: 'Muted text after the value; leave blank to show the value alone.',
  },
];

export const FIELDS: readonly Field[] = [
  {
    name: 'bodyMode', kind: 'select', title: 'Body', options: ['STATS', 'TEXT'], default: 'STATS',
    description: 'STATS shows the stat cells; TEXT shows the copy.',
  },
  { name: 'school', kind: 'string', title: 'School', default: 'DREXEL' },
  { name: 'mascot', kind: 'string', title: 'Mascot', default: 'DRAGONS' },
  ...stat(1, '14-3', 'OVERALL'),
  ...stat(2, '8-1', 'CAA'),
  ...stat(3, '78.4', 'PPG'),
  ...stat(4, '66.9', 'OPP PPG'),
  {
    name: 'bodyText', kind: 'string', title: 'Copy', default: 'PICKED THIRD IN THE CAA PRESEASON POLL',
    description: 'Shown in TEXT mode. One line; longer copy shrinks to fit.',
  },
  {
    name: 'teamLogoUrl', property: 'teamLogo', kind: 'imageUrl', title: 'Team Logo',
    description: 'Square transparent team logo; uses the embedded Drexel mark when omitted.',
  },
  { name: 'teamPrimaryColor', kind: 'color', title: 'Team Primary Color', default: '#07294d' },
  { name: 'teamSecondaryColor', kind: 'color', title: 'Team Secondary Color', default: '#ffc600' },
];
