import type { Field } from '../../shared/schema';

const stat = (index: number, value: string, label: string): Field[] => [
  {
    name: `stat${index}Value`, kind: 'string', title: `Stat ${index} Value`, default: value,
    description: 'Leave blank to hide this stat; the remaining stats share the row evenly.',
  },
  { name: `stat${index}Label`, kind: 'string', title: `Stat ${index} Label`, default: label },
];

/** What differs between the player feature lower thirds that share this field table. */
export type FeatureDefaults = {
  title: string;
  context: string;
  stats: readonly (readonly [value: string, label: string])[];
  text: string;
  sponsor: string;
};

/** The fields of a player feature lower third; Player of the Game reuses them. */
export const featureFields = (defaults: FeatureDefaults): Field[] => [
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
    name: 'contextLabel', kind: 'string', title: 'Context', default: defaults.context,
    description: `Shown after ${defaults.title}, for example the season or game the stats cover. Leave blank to hide.`,
  },
  ...defaults.stats.flatMap(([value, label], index) => stat(index + 1, value, label)),
  {
    name: 'bodyText', kind: 'string', title: 'Copy',
    default: defaults.text,
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
    description: `Full-colour logo for the white chip; uses the embedded ${defaults.sponsor} mark when omitted.`,
  },
];

export const FIELDS: readonly Field[] = featureFields({
  title: 'PLAYER TO WATCH',
  context: '2026-27 SEASON',
  stats: [['18.4', 'PPG'], ['7.2', 'RPG'], ['3.1', 'APG'], ['48.2%', 'FG%']],
  text: 'LEADS THE CAA IN SCORING AND HAS REACHED 20 POINTS IN FIVE STRAIGHT GAMES, INCLUDING A CAREER-HIGH 31 AT HOFSTRA',
  sponsor: 'Belfor',
});
