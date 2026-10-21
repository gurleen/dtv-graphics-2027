import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Cell, Checkbox, Column, Input, Row, Table, TableBody, TableHeader, TextField } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import { type Field, lockFieldOf, readText } from './fields';
import { LockMark } from './lock-mark';
import { locksOf } from './locks';
import type { Doc } from './paths';
import { rowLabel } from './rows';
import { isDirty } from './session';
import { type RowRef, sameTarget, type Target } from './types';

/** Which cell is being edited, by key. One cell at a time across a table. */
export interface CellEditing {
  readonly active: string | null;
  start(key: string): void;
  stop(): void;
}

export function useCellEditing(): CellEditing {
  const [active, setActive] = useState<string | null>(null);
  return { active, start: setActive, stop: () => setActive(null) };
}

/** What a row shows: the editor's draft while they have one, the World's row otherwise. */
export function useRowDoc(ref: RowRef): Doc | undefined {
  const editing = useEditing();
  return editing.docOf(ref.kind, ref.id) ?? ref.fallback;
}

const tail = (url: string) => url.split('/').pop() || url;

function Swatch({ color }: { readonly color: string }) {
  return /^#[0-9a-f]{6}$/i.test(color) ? <span className="swatch" style={{ background: color }} /> : null;
}

function CellInput({ initial, mono, error, onSave, onCancel, label }: { initial: string; mono: boolean; error: string | null; onSave(text: string): void; onCancel(): void; label: string }) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && text !== initial) onSave(text);
    else onCancel();
  };
  return (
    <TextField className="cell-edit" aria-label={label} value={text} onChange={setText} isInvalid={!!error}>
      <Input
        className={mono ? 'cell-input mono' : 'cell-input'}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          // The table's own keys (arrows, Enter on a row) must not act while a cell is being typed in.
          event.stopPropagation();
          if (event.key === 'Enter') finish(true);
          else if (event.key === 'Escape') finish(false);
        }}
        onBlur={() => finish(true)}
      />
      {error && (
        <span className="cell-error" role="alert">
          {error}
        </span>
      )}
    </TextField>
  );
}

/** One editable value: a button that opens an input in place, the lock beside it, and the swatch of a colour. */
export function EditableCell({ target, field, cell, editing, onSelect }: { target: RowRef; field: Field; cell: string; editing: CellEditing; onSelect(target: Target): void }) {
  const edits = useEditing();
  const { world } = useController();
  const doc = useRowDoc(target);
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = editing.active === cell;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!doc) return null;

  const value = readText(doc, field);
  const locked = world ? locksOf(world, target.kind, target.id).some((lock) => lock.field === lockFieldOf(field)) : false;
  const save = async (text: string) => {
    const outcome = await edits.commit(target.kind, doc, field, text);
    if (outcome.status === 'refused') {
      setError(outcome.message);
      return;
    }
    setError(null);
    editing.stop();
    if (outcome.status === 'conflict') onSelect(target);
  };

  if (field.type === 'bool') {
    return (
      <Checkbox
        className="cell-check"
        aria-label={field.label}
        isSelected={value === 'yes'}
        onChange={(selected) => void edits.commit(target.kind, doc, field, selected ? 'yes' : 'no')}
      >
        <span className="check-box" aria-hidden="true">{value === 'yes' ? '✓' : ''}</span>
      </Checkbox>
    );
  }

  if (open) {
    return (
      <CellInput
        initial={value}
        mono={!!field.mono}
        error={error}
        label={field.label}
        onSave={(text) => void save(text)}
        onCancel={() => {
          setError(null);
          editing.stop();
          edits.release(target.kind, target.id);
        }}
      />
    );
  }

  const shown = field.type === 'image' && value ? tail(value) : value;
  return (
    <span className="cell">
      <Button
        ref={button}
        className={field.mono ? 'cell-value mono' : 'cell-value'}
        aria-label={`${field.label} of ${world ? rowLabel(world, target.kind, doc) : target.id}: ${value || 'empty'}. Edit`}
        onPress={() => {
          onSelect(target);
          edits.open(target.kind, doc);
          editing.start(cell);
        }}
      >
        {field.type === 'color' && <Swatch color={value} />}
        {shown || <span className="faint">—</span>}
      </Button>
      {locked && <LockMark kind={target.kind} id={target.id} field={lockFieldOf(field)} label={field.label} />}
    </span>
  );
}

export interface TableColumn {
  readonly id: string;
  readonly label: string;
  readonly width?: number;
  readonly align?: 'end';
  readonly field?: Field;
  readonly render?: (row: RowRef, doc: Doc) => ReactNode;
}

const keyOfRow = (row: Target) => `${row.kind}:${row.id}`;

function LockCount({ row }: { row: RowRef }) {
  const { world } = useController();
  const count = world ? locksOf(world, row.kind, row.id).length : 0;
  return count ? <span className="lock-count">{count} lock{count === 1 ? '' : 's'}</span> : null;
}

function RowCells({ row, columns, editing, onSelect }: { row: RowRef; columns: readonly TableColumn[]; editing: CellEditing; onSelect(target: Target): void }) {
  const doc = useRowDoc(row);
  return (
    <>
      {columns.map((column) => (
        <Cell key={column.id} className={column.align === 'end' ? 'end' : undefined}>
          {doc && column.field && <EditableCell target={row} field={column.field} cell={`${keyOfRow(row)}/${column.id}`} editing={editing} onSelect={onSelect} />}
          {doc && !column.field && column.render?.(row, doc)}
        </Cell>
      ))}
      <Cell>
        <LockCount row={row} />
      </Cell>
    </>
  );
}

/** A dense table of rows of one or more kinds. Enter or a click on a cell edits it; Esc cancels, Enter saves. */
export function EditableTable({
  label, columns, rows, selected, onSelect,
}: {
  readonly label: string;
  readonly columns: readonly TableColumn[];
  readonly rows: readonly RowRef[];
  readonly selected: Target | null;
  readonly onSelect: (target: Target) => void;
}) {
  const editing = useCellEditing();
  const edits = useEditing();
  const firstEditable = columns.find((column) => column.field && column.field.type !== 'bool');
  const byKey = new Map(rows.map((row) => [keyOfRow(row), row]));
  const pick = (key: string | number) => {
    const row = byKey.get(String(key));
    if (row) onSelect(row);
  };

  return (
    <Table
      className="data-table"
      aria-label={label}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={selected ? [keyOfRow(selected)] : []}
      onSelectionChange={(keys) => {
        const [key] = keys === 'all' ? [] : [...keys];
        if (key !== undefined) pick(key);
      }}
      onRowAction={(key) => {
        const row = byKey.get(String(key));
        if (!row || !firstEditable) return;
        onSelect(row);
        const doc = edits.docOf(row.kind, row.id) ?? row.fallback;
        if (doc) edits.open(row.kind, doc);
        editing.start(`${key}/${firstEditable.id}`);
      }}
    >
      <TableHeader>
        {columns.map((column, index) => (
          <Column key={column.id} id={column.id} isRowHeader={index === 0} className={column.align === 'end' ? 'end' : undefined} style={column.width ? { width: column.width } : undefined}>
            {column.label}
          </Column>
        ))}
        <Column id="locks" style={{ width: 64 }}>
          Locks
        </Column>
      </TableHeader>
      <TableBody renderEmptyState={() => <span className="faint empty">Nothing here yet.</span>}>
        {rows.map((row) => {
          const session = edits.session(row.kind, row.id);
          return (
            <Row
              key={keyOfRow(row)}
              id={keyOfRow(row)}
              className="data-row"
              data-dirty={session && session.phase === 'editing' && isDirty(session) ? '' : undefined}
              data-conflict={session?.phase === 'conflict' ? '' : undefined}
              data-selected-target={sameTarget(selected, row) ? '' : undefined}
            >
              <RowCells row={row} columns={columns} editing={editing} onSelect={onSelect} />
            </Row>
          );
        })}
      </TableBody>
    </Table>
  );
}
