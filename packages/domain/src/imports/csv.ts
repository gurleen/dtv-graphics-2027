/** RFC 4180 reading and writing, shared by the roster and rundown imports. */

export interface CsvError {
  /** 1-based line in the file where the record starts. */
  readonly line: number;
  readonly message: string;
}

/** RFC 4180 records: quoted fields may hold commas, quotes (doubled) and line breaks. */
export function csvRecords(text: string): { line: number; fields: string[] }[] {
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

/** Records joined with `\n`; a field holding a comma, quote or line break is quoted. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(field).join(',')).join('\n');
}
