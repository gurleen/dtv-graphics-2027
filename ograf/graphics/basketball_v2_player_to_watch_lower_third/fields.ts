import type { Field } from '../../shared/schema';

const stat = (index: number, value: string, label: string): Field[] => [
  {
    name: `stat${index}Value`, kind: 'string', title: `Stat ${index} Value`, default: value,
    description: 'Leave blank to hide this stat; the remaining stats share the row evenly.',
  },
  { name: `stat${index}Label`, kind: 'string', title: `Stat ${index} Label`, default: label },
];

export const FIELDS: readonly Field[] = [
  {
    name: 'bodyMode', kind: 'select', title: 'Body', options: ['STATS', 'TEXT'], default: 'STATS',
    description: 'STATS shows the stat tiles; TEXT shows the copy.',
  },
  { name: 'firstName', kind: 'string', title: 'First Name', default: 'JOSH' },
  { name: 'lastName', kind: 'string', title: 'Last Name', default: 'REED' },
  { name: 'jerseyNumber', kind: 'string', title: 'Jersey Number', default: '5' },
  { name: 'position', kind: 'string', title: 'Position', default: 'GUARD' },
  { name: 'classYear', kind: 'string', title: 'Class Year', default: 'JUNIOR' },
  {
    name: 'contextLabel', kind: 'string', title: 'Context', default: '2026-27 SEASON',
    description: 'Shown after PLAYER TO WATCH, for example the season the stats cover. Leave blank to hide.',
  },
  ...stat(1, '18.4', 'PPG'),
  ...stat(2, '7.2', 'RPG'),
  ...stat(3, '3.1', 'APG'),
  ...stat(4, '48.2%', 'FG%'),
  {
    name: 'bodyText', kind: 'string', title: 'Copy',
    default: 'LEADS THE CAA IN SCORING AND HAS REACHED 20 POINTS IN FIVE STRAIGHT GAMES, INCLUDING A CAREER-HIGH 31 AT HOFSTRA',
    description: 'Shown in TEXT mode. Two lines hold about 130 characters; longer copy shrinks to fit.',
  },
  {
    name: 'headshotUrl', property: 'headshot', kind: 'imageUrl', title: 'Headshot',
    description: 'Transparent player cutout; the head rises above the block. Uses the embedded placeholder when omitted.',
  },
  {
    name: 'headshotMediaUrl', kind: 'mediaUrl', title: 'Headshot Motion',
    description: 'Optional MP4, WebM or GIF played muted and looping in place of the headshot. Leave blank for the still.',
  },
  {
    name: 'teamLogoUrl', property: 'teamLogo', kind: 'imageUrl', title: 'Team Logo',
    description: 'Square transparent team logo; uses the embedded Drexel mark when omitted.',
  },
  { name: 'teamPrimaryColor', kind: 'color', title: 'Team Primary Color', default: '#07294d' },
  { name: 'teamSecondaryColor', kind: 'color', title: 'Team Secondary Color', default: '#ffc600' },
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Full-colour logo for the white chip, about 3:1; uses the embedded Belfor mark when omitted.',
  },
];
