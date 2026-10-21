/**
 * What the roster import preview shows, worked out from the server's plan. The plan names
 * adds, updates and missing players, but a row whose only difference is a locked field is
 * "unchanged" to it. To show those, the file is planned once more here against the same
 * World with its locks cleared: whatever that plan would change in a locked field is what
 * the real import skips.
 */

import {
  emptySnapshot, indexWorld, parseRosterCsv, type Player, planRoster, type RosterError, type RosterPlan, type RosterRow, sameJson,
  type SeasonId, type TeamId, type World,
} from '@dtv/domain';
import { fieldOf } from './fields';
import { showValue } from './rows';

interface Span {
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

/** Where each CSV record starts, by the same rules as the importer: quoted fields may hold line breaks. */
function recordSpans(csv: string): readonly Span[] {
  const spans: Span[] = [];
  let [start, line, startLine, quoted] = [0, 1, 1, false];
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') index++;
      else if (char === '"') quoted = false;
      else if (char === '\n') line++;
    } else if (char === '"') quoted = true;
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index++;
      spans.push({ line: startLine, start, end: index + 1 });
      line++;
      [startLine, start] = [line, index + 1];
    }
  }
  if (start < csv.length) spans.push({ line: startLine, start, end: csv.length });
  return spans;
}

/**
 * The file without the records the importer refused, so the good rows can still be planned.
 * Null when the header itself is bad: nothing in the file can be read then.
 */
export function withoutBadRows(csv: string, errors: readonly RosterError[]): string | null {
  const bad = new Set(errors.map((error) => error.line));
  const spans = recordSpans(csv);
  const header = spans.find((span) => csv.slice(span.start, span.end).trim());
  if (!header || bad.has(header.line)) return null;
  return spans.filter((span) => !bad.has(span.line)).map((span) => csv.slice(span.start, span.end)).join('');
}

export interface SkippedField {
  readonly player: Player;
  readonly field: string;
  readonly label: string;
  readonly current: unknown;
  readonly file: unknown;
}

const WITHOUT_LOCKS = emptySnapshot().locks;

export function lockedSkips(world: World, input: { readonly team: TeamId; readonly season: SeasonId; readonly rows: readonly RosterRow[] }): readonly SkippedField[] {
  const unlocked = indexWorld({ ...world.snapshot, locks: WITHOUT_LOCKS });
  const plan = planRoster(unlocked, { ...input, prune: false });
  return plan.update.flatMap(({ before, after }) =>
    world.locked('player', before.id).flatMap((field) => {
      const [current, file] = [(before as Record<string, unknown>)[field], (after as Record<string, unknown>)[field]];
      return sameJson(current, file) ? [] : [{ player: before, field, label: fieldOf('player', field)?.label ?? field, current, file }];
    }),
  );
}

export interface Change {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

export type DiffRow =
  | { readonly kind: 'add'; readonly player: Player }
  | { readonly kind: 'update'; readonly player: Player; readonly changes: readonly Change[]; readonly skipped: readonly SkippedField[] }
  | { readonly kind: 'missing'; readonly player: Player };

const changesOf = (before: Player, after: Player): readonly Change[] =>
  Object.keys(after)
    .filter((key) => key !== 'id' && !sameJson((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key]))
    .map((key) => ({
      label: fieldOf('player', key)?.label ?? key,
      from: showValue((before as Record<string, unknown>)[key]),
      to: showValue((after as Record<string, unknown>)[key]),
    }));

export interface RosterDiff {
  readonly rows: readonly DiffRow[];
  readonly counts: { readonly added: number; readonly updated: number; readonly unchanged: number; readonly skipped: number; readonly missing: number };
  /** Whether applying would write anything. */
  readonly nothingToDo: boolean;
}

export function diffOf(plan: RosterPlan, skips: readonly SkippedField[]): RosterDiff {
  const skipsOf = (id: string) => skips.filter((skip) => skip.player.id === id);
  const updated = plan.update.map(({ before, after }): DiffRow => ({ kind: 'update', player: before, changes: changesOf(before, after), skipped: skipsOf(before.id) }));
  const planned = new Set(plan.update.map(({ before }) => before.id));
  const lockedOnly = [...new Map(skips.filter((skip) => !planned.has(skip.player.id)).map((skip) => [skip.player.id, skip.player])).values()].map(
    (player): DiffRow => ({ kind: 'update', player, changes: [], skipped: skipsOf(player.id) }),
  );
  const byJersey = (a: Player, b: Player) => Number(a.jersey) - Number(b.jersey);
  const rows: DiffRow[] = [
    ...[...plan.add].sort(byJersey).map((player): DiffRow => ({ kind: 'add', player })),
    ...[...updated, ...lockedOnly].sort((a, b) => byJersey(a.player, b.player)),
    ...[...plan.missing].sort(byJersey).map((player): DiffRow => ({ kind: 'missing', player })),
  ];
  return {
    rows,
    counts: {
      added: plan.add.length,
      updated: plan.update.length,
      unchanged: plan.unchanged - lockedOnly.length,
      skipped: skips.length,
      missing: plan.missing.length,
    },
    nothingToDo: plan.edits.length === 0,
  };
}

export type ParsedFile =
  | { readonly ok: true; readonly rows: readonly RosterRow[]; readonly bad: readonly RosterError[]; readonly csv: string }
  | { readonly ok: false; readonly bad: readonly RosterError[] };

/** Reads the file here to find its bad rows; a file with good rows left gets the csv without the bad ones. */
export function readFile(csv: string): ParsedFile {
  const parsed = parseRosterCsv(csv);
  if (parsed.ok) return { ok: true, rows: parsed.rows, bad: [], csv };
  const rest = withoutBadRows(csv, parsed.errors);
  const again = rest === null ? null : parseRosterCsv(rest);
  return again?.ok && rest !== null ? { ok: true, rows: again.rows, bad: parsed.errors, csv: rest } : { ok: false, bad: parsed.errors };
}
