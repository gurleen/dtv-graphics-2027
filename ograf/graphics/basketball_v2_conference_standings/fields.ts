import { CONFERENCE_TEAMS, NON_CONFERENCE } from '../../../graphics/basketball-v2/conference_teams';
import type { Field } from '../../shared/schema';

// The card lists the conference's own teams; their logos and tints are embedded in the
// scene, so a row names its team and brings nothing else.
const TEAMS = CONFERENCE_TEAMS.map((team) => team.name);

const row = (index: number, team: string, conferenceRecord: string, overallRecord: string, streak: string): Field[] => [
  {
    name: `row${index}Team`, kind: 'select', title: `Row ${index} Team`, options: TEAMS, default: team,
    description: `The team in place ${index}; its logo comes from the embedded conference roster.`,
  },
  { name: `row${index}ConferenceRecord`, kind: 'string', title: `Row ${index} Conference Record`, default: conferenceRecord },
  { name: `row${index}OverallRecord`, kind: 'string', title: `Row ${index} Overall Record`, default: overallRecord },
  { name: `row${index}Streak`, kind: 'string', title: `Row ${index} Streak`, default: streak },
];

// The defaults are the scene's test data: the 2025-26 final regular-season standings.
export const FIELDS: readonly Field[] = [
  {
    name: 'sport', kind: 'select', title: 'Sport', options: ["MEN'S BASKETBALL", "WOMEN'S BASKETBALL"],
    default: "MEN'S BASKETBALL",
  },
  {
    name: 'awayTeam', kind: 'select', title: 'Away Team', options: [...TEAMS, NON_CONFERENCE], default: 'CAMPBELL',
    description: `Tonight's away team; its row takes its tint. ${NON_CONFERENCE} for an opponent outside the conference.`,
  },
  {
    name: 'homeTeam', kind: 'select', title: 'Home Team', options: [...TEAMS, NON_CONFERENCE], default: 'DREXEL',
    description: `Tonight's home team; its row takes its tint. ${NON_CONFERENCE} for a team outside the conference.`,
  },
  ...row(1, 'UNCW', '15-3', '27-7', 'L1'),
  ...row(2, 'CHARLESTON', '14-4', '21-11', 'L1'),
  ...row(3, 'HOFSTRA', '12-6', '24-11', 'L1'),
  ...row(4, 'MONMOUTH', '11-7', '19-15', 'L1'),
  ...row(5, 'DREXEL', '10-8', '17-16', 'L1'),
  ...row(6, 'WILLIAM & MARY', '10-8', '20-12', 'L1'),
  ...row(7, 'TOWSON', '9-9', '19-15', 'L1'),
  ...row(8, 'STONY BROOK', '9-9', '17-15', 'L4'),
  ...row(9, 'CAMPBELL', '8-10', '16-18', 'L1'),
  ...row(10, 'HAMPTON', '7-11', '13-19', 'L2'),
  ...row(11, 'ELON', '6-12', '14-18', 'L5'),
  ...row(12, 'N.C. A&T', '4-14', '11-19', 'L4'),
  ...row(13, 'NORTHEASTERN', '2-16', '7-24', 'L1'),
];
