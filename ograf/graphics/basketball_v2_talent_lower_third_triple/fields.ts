import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  { name: 'talent1Name', kind: 'string', title: 'Talent 1 Name (left)', default: 'JORDAN ELLIS' },
  { name: 'talent1Role', kind: 'string', title: 'Talent 1 Role (left)', default: 'PLAY-BY-PLAY' },
  { name: 'talent2Name', kind: 'string', title: 'Talent 2 Name (centre)', default: 'CASEY MORGAN' },
  { name: 'talent2Role', kind: 'string', title: 'Talent 2 Role (centre)', default: 'ANALYST' },
  { name: 'talent3Name', kind: 'string', title: 'Talent 3 Name (right)', default: 'TAYLOR REED' },
  { name: 'talent3Role', kind: 'string', title: 'Talent 3 Role (right)', default: 'SIDELINE REPORTER' },
];
