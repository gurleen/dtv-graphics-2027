import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  { name: 'firstName', kind: 'string', title: 'First Name', default: 'MORGAN' },
  { name: 'lastName', kind: 'string', title: 'Last Name', default: 'HAYES' },
  { name: 'title', kind: 'string', title: 'Title', default: 'HEAD COACH' },
  {
    name: 'detail', kind: 'string', title: 'Detail', default: '8TH SEASON',
    description: 'Muted text after the title, such as tenure or department; leave blank to show the title alone.',
  },
  {
    name: 'teamLogoUrl', property: 'teamLogo', kind: 'imageUrl', title: 'Team Logo',
    description: 'Square transparent team logo; uses the embedded Drexel mark when omitted.',
  },
  { name: 'teamPrimaryColor', kind: 'color', title: 'Team Primary Color', default: '#07294d' },
  { name: 'teamSecondaryColor', kind: 'color', title: 'Team Secondary Color', default: '#ffc600' },
];
