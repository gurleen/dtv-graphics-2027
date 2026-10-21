/**
 * Names are quoted because `ALTER TABLE ... RENAME` writes the name back quoted: a table
 * rebuilt by `migrate` must read back exactly as `tableSql` writes it.
 */

import { ENTITIES, ENTITY_KINDS, type EntityKind } from '@dtv/domain';

export interface TableSql {
  readonly table: string;
  readonly create: string;
  readonly indexes: readonly string[];
}

const column = (field: string) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

type Ref = { readonly to: EntityKind; readonly cascade?: true };

const references = (ref: Ref) =>
  ` REFERENCES "${ENTITIES[ref.to].table}" (id)${ref.cascade ? ' ON DELETE CASCADE' : ''} DEFERRABLE INITIALLY DEFERRED`;

export function tableSql(kind: EntityKind): TableSql {
  const spec = ENTITIES[kind];
  const shape: Readonly<Record<string, { safeParse(value: unknown): { success: boolean } }>> = spec.schema.shape;
  const refs: Readonly<Record<string, Ref | undefined>> = 'refs' in spec ? spec.refs : {};
  const unique: readonly (readonly string[])[] = 'unique' in spec ? spec.unique : [];
  const lifted = Object.keys(shape).filter((field) => field !== 'id' && (refs[field] || unique.some((key) => key.includes(field))));
  const idRef = refs.id;
  const columns = [
    `id TEXT PRIMARY KEY${idRef ? references(idRef) : ''}`,
    'doc TEXT NOT NULL CHECK (json_valid(doc))',
    'seq INTEGER NOT NULL',
    "locked TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(locked))",
    ...lifted.map((field) => {
      const ref = refs[field];
      const nullable = shape[field]!.safeParse(null).success;
      return `${column(field)} TEXT GENERATED ALWAYS AS (doc ->> '$.${field}') STORED${nullable ? '' : ' NOT NULL'}${ref ? references(ref) : ''}`;
    }),
  ];
  return {
    table: spec.table,
    create: `CREATE TABLE "${spec.table}" (${columns.join(', ')}) STRICT`,
    indexes: unique.map((key) => {
      const columns = key.map(column);
      return `CREATE UNIQUE INDEX "${spec.table}_${columns.join('_')}" ON "${spec.table}" (${columns.join(', ')})`;
    }),
  };
}

const SYSTEM_TABLES: readonly TableSql[] = [
  {
    table: 'journal',
    create:
      'CREATE TABLE "journal" (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, ' +
      "kind TEXT NOT NULL CHECK (kind IN ('data', 'live', 'show')), payload TEXT NOT NULL CHECK (json_valid(payload))) STRICT",
    indexes: [],
  },
  {
    table: 'live',
    create:
      'CREATE TABLE "live" (game_id TEXT PRIMARY KEY REFERENCES "games" (id) ON DELETE CASCADE, ' +
      'doc TEXT NOT NULL CHECK (json_valid(doc)), seq INTEGER NOT NULL) STRICT',
    indexes: [],
  },
  {
    table: 'show_state',
    create: 'CREATE TABLE "show_state" (id INTEGER PRIMARY KEY CHECK (id = 1), doc TEXT NOT NULL CHECK (json_valid(doc)), seq INTEGER NOT NULL) STRICT',
    indexes: [],
  },
];

export const TABLES: readonly TableSql[] = [...ENTITY_KINDS.map(tableSql), ...SYSTEM_TABLES];
