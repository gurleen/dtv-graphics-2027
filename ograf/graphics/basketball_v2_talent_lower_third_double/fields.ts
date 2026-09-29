import type { Field } from '../../shared/schema';

export const FIELDS: readonly Field[] = [
  { name: 'talent1Name', kind: 'string', title: 'Talent 1 Name (left)', default: 'JORDAN ELLIS' },
  { name: 'talent1Role', kind: 'string', title: 'Talent 1 Role (left)', default: 'PLAY-BY-PLAY' },
  { name: 'talent2Name', kind: 'string', title: 'Talent 2 Name (right)', default: 'CASEY MORGAN' },
  { name: 'talent2Role', kind: 'string', title: 'Talent 2 Role (right)', default: 'ANALYST' },
];
