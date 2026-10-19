import type { Field } from '../../shared/schema';

export const SIDES = ['left', 'right'] as const;

export const FIELDS: readonly Field[] = [
  {
    name: 'side', kind: 'select', title: 'Side', options: [...SIDES], default: 'left',
    description: 'Bottom-left (on the action-safe margin) or bottom-right, mirrored. Sent on air, it takes effect at the next take, so the block never jumps across the screen.',
  },
  { name: 'awayScore', kind: 'integer', title: 'Away Score', default: 58 },
  { name: 'homeScore', kind: 'integer', title: 'Home Score', default: 61 },
  {
    name: 'status', kind: 'string', title: 'Status', default: '8:42 2ND HALF',
    description: 'One line, in capitals: "8:42 2ND HALF", "HALFTIME", "END OF 1ST HALF". Longer copy shrinks to fit.',
  },
  {
    name: 'awayLogoUrl', property: 'awayLogo', kind: 'imageUrl', title: 'Away Logo',
    description: 'Full-colour transparent team logo, contained in its box; uses the embedded Campbell mark when omitted.',
  },
  {
    name: 'homeLogoUrl', property: 'homeLogo', kind: 'imageUrl', title: 'Home Logo',
    description: 'Full-colour transparent team logo, contained in its box; uses the embedded Drexel mark when omitted.',
  },
  { name: 'awayPrimaryColor', kind: 'color', title: 'Away Primary Color', default: '#f58025' },
  { name: 'homePrimaryColor', kind: 'color', title: 'Home Primary Color', default: '#07294d' },
  { name: 'awaySecondaryColor', kind: 'color', title: 'Away Secondary Color', default: '#000000' },
  { name: 'homeSecondaryColor', kind: 'color', title: 'Home Secondary Color', default: '#ffc600' },
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'White sponsor wordmark for the dark glass, contained along the foot of the clock cell; uses the embedded Independence Blue Cross mark when omitted.',
  },
];
