/**
 * A rundown as CSV, for moving cues between games. One record per cue, in rundown order:
 *
 *   graphic,note,params,overrides
 *
 * `params` and `overrides` are JSON objects in a cell. Ids are not in the file, so an
 * import mints new ones. Params are not checked against the graphic here; the registry does
 * that where the cues enter the system.
 */

import { Cue } from '../entities';
import { type CsvError, csvRecords, toCsv } from './csv';

export const RUNDOWN_COLUMNS = ['graphic', 'note', 'params', 'overrides'] as const;

type Column = (typeof RUNDOWN_COLUMNS)[number];

const CueFields = Cue.omit({ id: true });

export type RundownParse =
  | { readonly ok: true; readonly cues: readonly Omit<Cue, 'id'>[] }
  | { readonly ok: false; readonly errors: readonly CsvError[] };

export const rundownCsv = (cues: readonly Cue[]): string =>
  toCsv([[...RUNDOWN_COLUMNS], ...cues.map((cue) => [cue.graphic, cue.note, JSON.stringify(cue.params), JSON.stringify(cue.overrides)])]);

export function parseRundownCsv(text: string): RundownParse {
  const [header, ...records] = csvRecords(text);
  if (!header) return { ok: true, cues: [] };

  const keys = header.fields.map((field) => field.trim().toLowerCase());
  const problems = [
    ...RUNDOWN_COLUMNS.filter((column) => !keys.includes(column)).map((column) => `missing column ${column}`),
    ...keys.filter((key, index) => !RUNDOWN_COLUMNS.includes(key as Column) || keys.indexOf(key) !== index).map((key) => `unexpected column "${key}"`),
  ];
  if (problems.length) return { ok: false, errors: [{ line: header.line, message: `${problems.join('; ')}; the header is ${RUNDOWN_COLUMNS.join(',')}` }] };

  const cues: Omit<Cue, 'id'>[] = [];
  const errors: CsvError[] = [];
  for (const { line, fields } of records) {
    const cell = (column: Column) => fields[keys.indexOf(column)] ?? '';
    const bad: string[] = [];
    const json = (column: 'params' | 'overrides') => {
      const source = cell(column).trim();
      if (!source) return {};
      try {
        return JSON.parse(source) as unknown;
      } catch {
        bad.push(`${column} is not valid JSON`);
        return {};
      }
    };
    const raw = { graphic: cell('graphic').trim(), note: cell('note'), params: json('params'), overrides: json('overrides') };
    if (bad.length === 0) {
      const cue = CueFields.safeParse(raw);
      if (cue.success) cues.push(cue.data);
      else bad.push(...cue.error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`));
    }
    if (bad.length) errors.push({ line, message: bad.join('; ') });
  }
  return errors.length ? { ok: false, errors } : { ok: true, cues };
}
