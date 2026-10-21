/**
 * Roster CSVs to player edits, in two steps the data page shows separately: parse, which
 * reports every bad row, and plan, which shows what will change before the operator
 * commits the plan's edits as an import batch. Planning a committed file again is empty.
 *
 * Our header, in data/seed/rosters/ and documented in data/seed/README.md:
 *
 *   jersey,first_name,last_name,position,class_year,redshirt,hometown,headshot,motion_headshot,source_key
 *
 * Other exports are read through the aliases in ROSTER_COLUMNS.
 */

import { type ImportEdit, mergePut } from '../edits';
import { ClassYear, parseEntity, Player } from '../entities';
import { idFor, type PlayerId, type SeasonId, type TeamId } from '../ids';
import { Url } from '../primitives';
import type { World } from '../world';

export interface RosterRow {
  readonly jersey: string;
  /** Empty when the file names only the family name. */
  readonly firstName: string;
  readonly lastName: string;
  /** The program's code (`G`, `F`, `C`, `G/F`), empty when the file has none. */
  readonly position: string;
  readonly classYear: ClassYear | null;
  /** Null when the file does not say. */
  readonly redshirt: boolean | null;
  readonly hometown: string | null;
  readonly headshot: Url | null;
  readonly motionHeadshot: Url | null;
  readonly sourceKey: string | null;
}

/**
 * Header names per field, compared lower case with `.`, `_` and runs of spaces folded to
 * one space. The first name of each list is ours. A `name` column is split into first and
 * last names at the first space.
 */
export const ROSTER_COLUMNS = {
  jersey: ['jersey', '#', 'no', 'number', 'jersey number'],
  firstName: ['first name', 'first', 'firstname'],
  lastName: ['last name', 'last', 'lastname'],
  name: ['name', 'full name', 'player'],
  position: ['position', 'pos'],
  classYear: ['class year', 'class', 'cl', 'year', 'yr', 'academic year'],
  redshirt: ['redshirt', 'rs'],
  hometown: ['hometown', 'home town'],
  headshot: ['headshot', 'photo', 'image', 'headshot url'],
  motionHeadshot: ['motion headshot', 'motion'],
  sourceKey: ['source key', 'url', 'profile url', 'bio url'],
} as const satisfies Record<string, readonly string[]>;

type Column = keyof typeof ROSTER_COLUMNS;

export interface RosterError {
  /** 1-based line in the file where the record starts. */
  readonly line: number;
  readonly message: string;
}

export type RosterParse =
  | { readonly ok: true; readonly rows: readonly RosterRow[] }
  | { readonly ok: false; readonly errors: readonly RosterError[] };

/** RFC 4180 records: quoted fields may hold commas, quotes (doubled) and line breaks. */
function csvRecords(text: string): { line: number; fields: string[] }[] {
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      fields.push(field);
      records.push({ line: start, fields });
      fields = [];
      field = '';
      line++;
      start = line;
    } else field += char;
  }
  if (field || fields.length) {
    fields.push(field);
    records.push({ line: start, fields });
  }
  return records.filter((record) => record.fields.some((value) => value.trim()));
}

const headerKey = (header: string) => header.trim().toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

const CLASS_WORDS: Readonly<Record<string, ClassYear>> = {
  fr: 'FR', freshman: 'FR',
  so: 'SO', soph: 'SO', sophomore: 'SO',
  jr: 'JR', junior: 'JR',
  sr: 'SR', senior: 'SR',
  gr: 'GR', grad: 'GR', graduate: 'GR', gs: 'GR', '5th': 'GR', fifth: 'GR',
};

/** `R-Jr.` is a redshirt junior; `Gr.` and `5th` are graduates. */
function parseClass(text: string): { classYear: ClassYear | null; redshirt: boolean } | string {
  const value = text.trim().toLowerCase().replace(/\./g, '');
  if (!value) return { classYear: null, redshirt: false };
  const redshirt = /^(r|rs|redshirt)[-\s]/.test(value);
  const word = value.replace(/^(r|rs|redshirt)[-\s]+/, '').trim();
  const classYear = CLASS_WORDS[word];
  return classYear ? { classYear, redshirt } : `unknown class "${text.trim()}"`;
}

const POSITION_WORDS: Readonly<Record<string, string>> = {
  g: 'G', guard: 'G', pg: 'G', sg: 'G', 'point guard': 'G', 'shooting guard': 'G',
  f: 'F', forward: 'F', sf: 'F', pf: 'F', 'small forward': 'F', 'power forward': 'F',
  c: 'C', center: 'C', centre: 'C',
};

function parsePosition(text: string): string | { error: string } {
  const parts = text.split(/[/,-]/).map((part) => part.trim().toLowerCase().replace(/\./g, '')).filter(Boolean);
  const codes: string[] = [];
  for (const part of parts) {
    const code = POSITION_WORDS[part];
    if (!code) return { error: `unknown position "${text.trim()}"` };
    if (!codes.includes(code)) codes.push(code);
  }
  return codes.join('/');
}

const TRUE = ['true', 'yes', 'y', '1', 'x'];
const FALSE = ['false', 'no', 'n', '0'];

export function parseRosterCsv(text: string): RosterParse {
  const [header, ...records] = csvRecords(text);
  if (!header) return { ok: false, errors: [{ line: 1, message: 'the file is empty' }] };

  const keys = header.fields.map(headerKey);
  const columnOf = (column: Column) => {
    const index = keys.findIndex((key) => ROSTER_COLUMNS[column].some((alias) => alias === key));
    return index === -1 ? null : index;
  };
  const columns: Record<Column, number | null> = {
    jersey: columnOf('jersey'),
    firstName: columnOf('firstName'),
    lastName: columnOf('lastName'),
    name: columnOf('name'),
    position: columnOf('position'),
    classYear: columnOf('classYear'),
    redshirt: columnOf('redshirt'),
    hometown: columnOf('hometown'),
    headshot: columnOf('headshot'),
    motionHeadshot: columnOf('motionHeadshot'),
    sourceKey: columnOf('sourceKey'),
  };
  const missing = [
    columns.jersey === null && 'jersey',
    columns.lastName === null && columns.name === null && 'last_name (or name)',
  ].filter(Boolean);
  if (missing.length) return { ok: false, errors: [{ line: header.line, message: `missing column ${missing.join(' and ')}` }] };

  const rows: RosterRow[] = [];
  const errors: RosterError[] = [];
  for (const { line, fields } of records) {
    const cell = (column: Column) => {
      const index = columns[column];
      return index === null ? '' : (fields[index] ?? '').trim();
    };
    const problems: string[] = [];
    const url = (column: 'headshot' | 'motionHeadshot') => {
      const value = cell(column);
      if (!value) return null;
      const parsed = Url.safeParse(value);
      if (!parsed.success) problems.push(`${column} "${value}" is not an http(s) URL or a /path`);
      return parsed.data ?? null;
    };

    const jersey = cell('jersey').replace(/^#/, '');
    if (!/^\d{1,2}$/.test(jersey)) problems.push(`jersey "${cell('jersey')}" is not one or two digits`);

    let firstName = cell('firstName');
    let lastName = cell('lastName');
    if (columns.lastName === null) {
      const [first = '', ...rest] = cell('name').split(/\s+/);
      [firstName, lastName] = rest.length ? [first, rest.join(' ')] : ['', first];
    }
    if (!lastName) problems.push('no last name');

    const position = parsePosition(cell('position'));
    if (typeof position !== 'string') problems.push(position.error);

    const parsedClass = parseClass(cell('classYear'));
    if (typeof parsedClass === 'string') problems.push(parsedClass);

    // A blank redshirt cell falls back to the class's `R-` prefix; with no class either, the file does not say.
    const redshirtCell = cell('redshirt').toLowerCase();
    let redshirt: boolean | null = null;
    if (TRUE.includes(redshirtCell)) redshirt = true;
    else if (FALSE.includes(redshirtCell)) redshirt = false;
    else if (redshirtCell) problems.push(`redshirt "${cell('redshirt')}" is not yes or no`);
    else if (typeof parsedClass !== 'string' && parsedClass.classYear) redshirt = parsedClass.redshirt;

    const headshot = url('headshot');
    const motionHeadshot = url('motionHeadshot');
    if (problems.length) {
      errors.push({ line, message: problems.join('; ') });
      continue;
    }
    rows.push({
      jersey,
      firstName,
      lastName,
      position: typeof position === 'string' ? position : '',
      classYear: typeof parsedClass === 'string' ? null : parsedClass.classYear,
      redshirt,
      hometown: cell('hometown') || null,
      headshot,
      motionHeadshot,
      sourceKey: cell('sourceKey') || null,
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, rows };
}

export interface RosterPlan {
  readonly add: readonly Player[];
  readonly update: readonly { readonly before: Player; readonly after: Player }[];
  readonly unchanged: number;
  /** On the team-season in the data but absent from the file. Deleted only with `prune`. */
  readonly missing: readonly Player[];
  readonly edits: readonly ImportEdit[];
}

const sameName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) === 0;

/** The row's values over the player's. What the file leaves blank, the player keeps. */
const applyRow = (player: Player, row: RosterRow): Player => ({
  ...player,
  jersey: row.jersey,
  firstName: row.firstName || player.firstName,
  lastName: row.lastName,
  position: row.position || player.position,
  classYear: row.classYear ?? player.classYear,
  redshirt: row.redshirt ?? player.redshirt,
  hometown: row.hometown ?? player.hometown,
  headshot: row.headshot ?? player.headshot,
  motionHeadshot: row.motionHeadshot ?? player.motionHeadshot,
  sourceKey: row.sourceKey ?? player.sourceKey,
});

/**
 * Matches each row to a player of the team-season by `sourceKey`, then by the id the row
 * would be added with, then by jersey and last name, then by full name, each pass over the
 * rows still unmatched. Ids never change, so the id pass finds a player whose name a person
 * corrected since. A match keeps its id; a new row gets `idFor.player`, with its jersey
 * appended when another player has that id. Locked fields are compared as the store will
 * write them, so a difference only in a field a person locked is no change.
 */
export function planRoster(
  world: World,
  input: { readonly team: TeamId; readonly season: SeasonId; readonly rows: readonly RosterRow[]; readonly prune: boolean },
): RosterPlan {
  const unmatched = new Set(world.roster(input.team, input.season));
  const matches = new Map<RosterRow, Player>();
  const idOf = (row: RosterRow): PlayerId => idFor.player(input.team, input.season, row.firstName, row.lastName);
  const passes: ((row: RosterRow, player: Player) => boolean)[] = [
    (row, player) => row.sourceKey !== null && row.sourceKey === player.sourceKey,
    (row, player) => player.id === `${idOf(row)}-${row.jersey}`,
    (row, player) => player.id === idOf(row),
    (row, player) => row.jersey === player.jersey && sameName(row.lastName, player.lastName),
    (row, player) => sameName(row.firstName, player.firstName) && sameName(row.lastName, player.lastName),
  ];
  for (const pass of passes) {
    for (const row of input.rows) {
      if (matches.has(row)) continue;
      const player = [...unmatched].find((candidate) => pass(row, candidate));
      if (!player) continue;
      matches.set(row, player);
      unmatched.delete(player);
    }
  }

  const taken = new Set<string>(world.all('player').map((player) => player.id));
  const add: Player[] = [];
  const update: { before: Player; after: Player }[] = [];
  const edits: ImportEdit[] = [];
  let unchanged = 0;
  for (const row of input.rows) {
    const before = matches.get(row);
    if (!before) {
      const base = idOf(row);
      const id = taken.has(base) ? `${base}-${row.jersey}` : base;
      taken.add(id);
      const player = applyRow(Player.parse({ id, teamId: input.team, seasonId: input.season, firstName: row.firstName, lastName: row.lastName, jersey: row.jersey }), row);
      add.push(player);
      edits.push({ op: 'put', kind: 'player', value: player });
      continue;
    }
    const value = applyRow(before, row);
    const merge = mergePut('import', { doc: before, locked: world.locked('player', before.id) }, { value });
    if (merge.change === 'none') {
      unchanged++;
      continue;
    }
    update.push({ before, after: parseEntity('player', merge.row.doc) });
    edits.push({ op: 'put', kind: 'player', value });
  }

  const missing = [...unmatched];
  if (input.prune) for (const player of missing) edits.push({ op: 'delete', kind: 'player', id: player.id });
  return { add, update, unchanged, missing, edits };
}
