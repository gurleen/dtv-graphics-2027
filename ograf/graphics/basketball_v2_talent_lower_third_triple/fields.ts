import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  { name: 'talent1Name', kind: 'string', title: 'Talent 1 Name (left)', default: 'ROB BROOKS' },
  { name: 'talent1Role', kind: 'string', title: 'Talent 1 Role (left)', default: 'PLAY-BY-PLAY' },
  { name: 'talent2Name', kind: 'string', title: 'Talent 2 Name (centre)', default: 'MIKE TUBEROSA' },
  { name: 'talent2Role', kind: 'string', title: 'Talent 2 Role (centre)', default: 'COLOR ANALYST' },
  { name: 'talent3Name', kind: 'string', title: 'Talent 3 Name (right)', default: 'TESSA PELOSO' },
  { name: 'talent3Role', kind: 'string', title: 'Talent 3 Role (right)', default: 'SIDELINE REPORTER' },
];
