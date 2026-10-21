/**
 * What a person can edit on each kind, as one list of fields per kind. The tables, the
 * record panel and the conflict view all read these lists, so a field is described once:
 * where it lives in the document, how its text becomes a value, and which lock covers it.
 *
 * A field's text is parsed here and the whole document is then validated against the
 * domain's own schema, so a rule is never restated in the UI.
 */

import { ClassYear, ENTITIES, type EntityKind, parseEntity } from '@dtv/domain';
import { type Doc, getPath, type Path, setPath } from './paths';

export type FieldType = 'text' | 'int' | 'bool' | 'choice' | 'color' | 'image' | 'ref';

export interface Field {
  /** The dotted path, `branding.primaryColor`; unique within a kind. */
  readonly id: string;
  readonly label: string;
  readonly path: Path;
  readonly type: FieldType;
  /** What an empty cell becomes: `null`, no key at all, or (by default) an empty string or 0. */
  readonly empty?: 'null' | 'omit';
  readonly choices?: readonly string[];
  /** The kind a `ref` points at; the record panel lists its rows. */
  readonly refTo?: EntityKind;
  /** The message for a value the schema refuses, where the schema's own is unhelpful. */
  readonly hint?: string;
  readonly mono?: boolean;
  /** Makes the parent object when the row has none, such as a team season without stats yet. */
  readonly ensure?: (doc: Doc) => Doc;
}

/** The lock that covers a field: locks name top-level fields. */
export const lockFieldOf = (field: Field): string => field.path[0]!;

const field = (id: string, label: string, type: FieldType, rest: Partial<Field> = {}): Field => ({
  id,
  label,
  type,
  path: id.split('.'),
  ...rest,
});

const text = (id: string, label: string, rest?: Partial<Field>) => field(id, label, 'text', rest);
const int = (id: string, label: string, rest?: Partial<Field>) => field(id, label, 'int', { mono: true, ...rest });
const color = (id: string, label: string, rest?: Partial<Field>) => field(id, label, 'color', { mono: true, hint: 'a colour like #07294d', ...rest });
const image = (id: string, label: string, rest?: Partial<Field>) => field(id, label, 'image', { hint: 'an https:// URL or a /path', ...rest });

const STAT_COLUMNS = ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'to', 'pf'] as const;
export const STAT_LABELS: Readonly<Record<(typeof STAT_COLUMNS)[number], string>> = {
  min: 'MIN', pts: 'PTS', fgm: 'FGM', fga: 'FGA', tpm: '3PM', tpa: '3PA', ftm: 'FTM', fta: 'FTA', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO', pf: 'PF',
};

const statFields = (root: 'stats'): Field[] => [
  int(`${root}.gp`, 'GP'),
  ...STAT_COLUMNS.map((stat) => int(`${root}.totals.${stat}`, STAT_LABELS[stat])),
];

/** A team season with no stats yet gets the sport's empty line the first time one is typed. */
const withTeamStats = (doc: Doc): Doc => (doc.stats ? doc : setPath(doc, ['stats'], { sport: 'basketball', gp: 0, totals: parseTotals(), opponentPts: 0 }));
const parseTotals = () => Object.fromEntries(['min', ...STAT_COLUMNS].map((stat) => [stat, 0]));

export const FIELDS = {
  player: [
    text('jersey', '#', { mono: true, hint: 'one or two digits' }),
    text('firstName', 'First'),
    text('lastName', 'Last'),
    text('position', 'Pos', { mono: true }),
    field('classYear', 'Class', 'choice', { empty: 'null', choices: ClassYear.options, mono: true }),
    field('redshirt', 'Redshirt', 'bool'),
    text('hometown', 'Hometown', { empty: 'null' }),
    image('headshot', 'Headshot', { empty: 'null' }),
    image('motionHeadshot', 'Motion headshot', { empty: 'null' }),
    text('sourceKey', 'Source key', { empty: 'null', mono: true }),
  ],
  staff: [text('firstName', 'First'), text('lastName', 'Last'), text('title', 'Title'), text('detail', 'Detail')],
  playerStats: statFields('stats'),
  teamSeason: [
    field('conferenceId', 'Conference', 'ref', { empty: 'null', refTo: 'conference' }),
    int('overall.wins', 'W'),
    int('overall.losses', 'L'),
    int('conference.wins', 'Conf W'),
    int('conference.losses', 'Conf L'),
    text('streak', 'Streak', { empty: 'null', mono: true, hint: 'W3 or L1' }),
    int('rank', 'Rank', { empty: 'null' }),
    ...statFields('stats').map((each) => ({ ...each, ensure: withTeamStats })),
    int('stats.opponentPts', 'OPP PTS', { ensure: withTeamStats }),
  ],
  school: [
    text('name', 'Name'),
    text('shortName', 'Short name'),
    text('mascot', 'Mascot'),
    text('abbreviation', 'Abbreviation', { mono: true, hint: '1 to 5 characters' }),
    color('primaryColor', 'Primary colour'),
    color('secondaryColor', 'Secondary colour'),
    image('logo', 'Logo', { empty: 'null' }),
    text('website', 'Website', { empty: 'null' }),
    text('espnId', 'ESPN id', { empty: 'null', mono: true }),
  ],
  team: [
    text('branding.abbreviation', 'Abbreviation', { empty: 'omit', mono: true, hint: '1 to 5 characters' }),
    color('branding.primaryColor', 'Primary colour', { empty: 'omit' }),
    color('branding.secondaryColor', 'Secondary colour', { empty: 'omit' }),
    image('branding.logo', 'Logo', { empty: 'omit' }),
  ],
  talent: [text('firstName', 'First'), text('lastName', 'Last'), text('role', 'Role')],
  sponsor: [text('name', 'Name'), image('logoOnDark', 'Logo on dark', { empty: 'null' }), image('logoOnLight', 'Logo on light', { empty: 'null' })],
  venue: [text('name', 'Name'), text('city', 'City'), text('state', 'State', { mono: true })],
  show: [text('name', 'Name'), field('gameId', 'Game', 'ref', { empty: 'null', refTo: 'game' })],
} as const satisfies Partial<Record<EntityKind, readonly Field[]>>;

export type EditableKind = keyof typeof FIELDS;
export const isEditable = (kind: EntityKind): kind is EditableKind => kind in FIELDS;

export const fieldsOf = (kind: EditableKind): readonly Field[] => FIELDS[kind];
export const fieldOf = (kind: EditableKind, id: string): Field | undefined => fieldsOf(kind).find((each) => each.id === id);

/** The text a person sees and edits for a field. */
export function readText(doc: Doc, spec: Field): string {
  const value = getPath(doc, spec.path);
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

export type Written = { readonly ok: true; readonly doc: Doc } | { readonly ok: false; readonly error: string };

const refuse = (error: string): Written => ({ ok: false, error });

/** The document with `value` at the field's path, or why the text is not a value of the field's type. */
export function writeField(doc: Doc, spec: Field, input: string): Written {
  const base = spec.ensure ? spec.ensure(doc) : doc;
  const put = (value: unknown): Written => ({ ok: true, doc: setPath(base, spec.path, value) });
  const trimmed = input.trim();
  const empty = (): Written => {
    if (spec.empty === 'null') return put(null);
    if (spec.empty === 'omit') return put(undefined);
    return put(spec.type === 'int' ? 0 : '');
  };

  switch (spec.type) {
    case 'bool':
      return put(['yes', 'true', 'y', 'x'].includes(trimmed.toLowerCase()));
    case 'int':
      if (!trimmed) return empty();
      return /^\d+$/.test(trimmed) ? put(Number(trimmed)) : refuse(spec.hint ?? 'a whole number');
    case 'choice': {
      if (!trimmed) return empty();
      const match = spec.choices?.find((choice) => choice.toLowerCase() === trimmed.toLowerCase());
      return match ? put(match) : refuse(`one of ${spec.choices?.join(', ')}`);
    }
    case 'color': {
      if (!trimmed) return empty();
      const lower = trimmed.toLowerCase();
      return put(/^[0-9a-f]{6}$/.test(lower) ? `#${lower}` : lower);
    }
    default:
      return trimmed ? put(trimmed) : empty();
  }
}

export type Validated =
  | { readonly ok: true; readonly doc: Doc }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>>; readonly general: string | null };

/**
 * Checks a whole document against its kind's schema. Each issue lands on the field whose
 * path it names, with the field's hint in place of the schema's regex message.
 */
export function validate(kind: EditableKind, doc: Doc): Validated {
  const parsed = ENTITIES[kind].schema.safeParse(doc);
  if (parsed.success) return { ok: true, doc: parseEntity(kind, doc) };
  const errors: Record<string, string> = {};
  let general: string | null = null;
  for (const issue of parsed.error.issues) {
    const id = issue.path.join('.');
    const spec = fieldOf(kind, id);
    if (spec) errors[id] ??= spec.hint ?? issue.message;
    else general ??= `${id || 'record'}: ${issue.message}`;
  }
  return { ok: false, errors, general };
}
