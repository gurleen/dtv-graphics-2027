import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  {
    name: 'question', kind: 'string', title: 'Question',
    default: "WHAT DREXEL WOMEN'S BASKETBALL PLAYER SCORED HER 1000TH POINT IN THE 2013 WNIT CHAMPIONSHIP GAME?",
    description: 'Right-aligned on up to three lines, about 150 characters at full size; longer questions shrink to fit.',
  },
  {
    name: 'answer', kind: 'string', title: 'Answer', default: 'TAYLOR WOOTTON',
    description: 'One line in the team secondary colour; longer answers shrink to fit.',
  },
  {
    name: 'showAnswer', kind: 'boolean', title: 'Show Answer', default: false,
    description: 'Opens the answer strip beneath the question, animated on air. It is not reset when the graphic leaves air: untick it before the next question.',
  },
  {
    name: 'teamLogoUrl', property: 'teamLogo', kind: 'imageUrl', title: 'Team Logo',
    description: 'Square transparent team logo, faded behind the question; uses the embedded Drexel mark when omitted.',
  },
  { name: 'teamPrimaryColor', kind: 'color', title: 'Team Primary Color', default: '#07294d' },
  {
    name: 'teamSecondaryColor', kind: 'color', title: 'Team Secondary Color', default: '#ffc600',
    description: 'The marker on the outer edge and the answer.',
  },
  {
    name: 'sponsorLogoUrl', property: 'sponsorLogo', kind: 'imageUrl', title: 'Sponsor Logo',
    description: 'Sponsor logo, contained within the white chip; uses the embedded Steamfitters Local 420 crest when omitted.',
  },
];
