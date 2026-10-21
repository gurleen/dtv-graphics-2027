import type { Revision, RosterError, RosterPlan, RosterRow, SeasonId, TeamId } from '@dtv/domain';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Button, Cell, Checkbox, Column, FileTrigger, Row, Table, TableBody, TableHeader } from 'react-aria-components';
import { useController } from '../app/context';
import { describeError } from './editing';
import { LockIcon } from './lock-mark';
import { diffOf, type DiffRow, lockedSkips, readFile, type RosterDiff } from './roster-diff';
import { showValue } from './rows';

type ImportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'planning'; readonly name: string }
  | { readonly phase: 'unreadable'; readonly name: string; readonly bad: readonly RosterError[] }
  | {
      readonly phase: 'preview';
      readonly name: string;
      readonly csv: string;
      readonly rows: readonly RosterRow[];
      readonly bad: readonly RosterError[];
      readonly diff: RosterDiff;
      readonly plan: RosterPlan;
      readonly prune: boolean;
      /** The revision the plan was made on; Apply sends it as the batch's basis. */
      readonly basis: Revision;
      readonly applying: boolean;
      readonly error: string | null;
    }
  | { readonly phase: 'done'; readonly message: string };

export interface RosterImporter {
  readonly state: ImportState;
  choose(file: File): void;
  setPrune(prune: boolean): void;
  apply(): void;
  /** Plans the same file again, on the newest World. */
  replan(): void;
  close(): void;
}

export function useRosterImport(team: TeamId, season: SeasonId): RosterImporter {
  const controller = useController();
  const latest = useRef(controller);
  latest.current = controller;
  const [state, setState] = useState<ImportState>({ phase: 'idle' });

  const plan = useCallback(
    async (name: string, csv: string, rows: readonly RosterRow[], bad: readonly RosterError[], prune: boolean) => {
      const { api, world, revision } = latest.current;
      if (!world || revision === null) return;
      try {
        const reply = await api.data.planRoster({ team, season, csv, prune });
        if (!reply.ok) {
          setState({ phase: 'unreadable', name, bad: reply.errors });
          return;
        }
        const diff = diffOf(reply.plan, lockedSkips(world, { team, season, rows }));
        setState({ phase: 'preview', name, csv, rows, bad, diff, plan: reply.plan, prune, basis: revision, applying: false, error: null });
      } catch (error) {
        setState({ phase: 'unreadable', name, bad: [{ line: 1, message: describeError(error).message }] });
      }
    },
    [team, season],
  );

  return {
    state,
    choose(file) {
      setState({ phase: 'planning', name: file.name });
      void file.text().then((text) => {
        const parsed = readFile(text);
        if (!parsed.ok) setState({ phase: 'unreadable', name: file.name, bad: parsed.bad });
        else void plan(file.name, parsed.csv, parsed.rows, parsed.bad, false);
      });
    },
    setPrune(prune) {
      if (state.phase === 'preview') void plan(state.name, state.csv, state.rows, state.bad, prune);
    },
    replan() {
      if (state.phase === 'preview') void plan(state.name, state.csv, state.rows, state.bad, state.prune);
    },
    apply() {
      if (state.phase !== 'preview' || state.applying) return;
      const current = state;
      setState({ ...current, applying: true, error: null });
      void (async () => {
        try {
          const result = await latest.current.api.data.apply({ origin: 'import', basis: current.basis, edits: current.plan.edits });
          const { counts } = current.diff;
          const removed = current.prune ? current.plan.missing.length : 0;
          const parts = [`${counts.added} added`, `${counts.updated} updated`, ...(removed ? [`${removed} removed`] : [])];
          const skipped = result.skipped.reduce((total, each) => total + each.fields.length, 0);
          setState({ phase: 'done', message: `Imported ${current.name}: ${parts.join(', ')}${skipped ? `, ${skipped} locked field${skipped === 1 ? '' : 's'} skipped` : ''}.` });
        } catch (error) {
          const { code, message } = describeError(error);
          setState({ ...current, applying: false, error: code === 'CONFLICT' ? `The roster changed while you were looking: ${message}. Plan again.` : message });
        }
      })();
    },
    close: () => setState({ phase: 'idle' }),
  };
}

export function ImportButton({ importer }: { readonly importer: RosterImporter }) {
  return (
    <FileTrigger acceptedFileTypes={['.csv', 'text/csv']} onSelect={(files) => files?.[0] && importer.choose(files[0])}>
      <Button className="button">Import CSV</Button>
    </FileTrigger>
  );
}

const MARK = { add: '+', update: '~', missing: '−' } as const;

function ChangeCell({ row, prune }: { readonly row: DiffRow; readonly prune: boolean }): ReactNode {
  switch (row.kind) {
    case 'add':
      return (
        <>
          <span className="add">new player</span>
          <span className="faint"> · {[row.player.position, row.player.classYear].filter(Boolean).join(' · ') || 'no position or class'}</span>
        </>
      );
    case 'update':
      return (
        <>
          {row.changes.map((change) => (
            <span key={change.label} className="change">
              {change.label.toLowerCase()} <span className="mono">{change.from} → {change.to}</span>
            </span>
          ))}
          {row.skipped.map((skip) => (
            <span key={skip.field} className="lock-note">
              <LockIcon /> {skip.label.toLowerCase()} stays <span className="mono">"{showValue(skip.current)}"</span> (file says <span className="mono">"{showValue(skip.file)}"</span>)
            </span>
          ))}
        </>
      );
    case 'missing':
      return <span className="remove">not in file · {prune ? 'will be removed' : 'kept'}</span>;
  }
}

export function RosterImportPanel({ importer }: { readonly importer: RosterImporter }) {
  const { state } = importer;
  if (state.phase === 'idle') return null;

  if (state.phase === 'planning') {
    return <section className="panel import"><h2 className="panel-title">Import roster CSV</h2><p className="faint">Reading {state.name}…</p></section>;
  }
  if (state.phase === 'done') {
    return (
      <section className="panel import">
        <h2 className="panel-title">Import roster CSV</h2>
        <p role="status" className="add">{state.message}</p>
        <div className="actions"><Button className="button" onPress={importer.close}>Close</Button></div>
      </section>
    );
  }
  if (state.phase === 'unreadable') {
    return (
      <section className="panel import">
        <h2 className="panel-title">Import roster CSV · {state.name}</h2>
        <p className="remove">Nothing can be imported from this file.</p>
        <ul className="bad-rows">{state.bad.map((error) => <li key={error.line}><span className="mono">line {error.line}</span> {error.message}</li>)}</ul>
        <div className="actions"><Button className="button" onPress={importer.close}>Close</Button></div>
      </section>
    );
  }

  const { diff, bad } = state;
  const { counts } = diff;
  return (
    <section className="panel import" aria-label="Roster import preview">
      <h2 className="panel-title">Import roster CSV · preview before apply</h2>
      <p className="import-summary" data-testid="import-summary">
        <span className="mono">{state.name}</span>
        <span className="add">{counts.added} added</span>
        <span className="warn">{counts.updated} updated</span>
        <span>{counts.unchanged} unchanged</span>
        {counts.skipped > 0 && <span className="warn">{counts.skipped} field{counts.skipped === 1 ? '' : 's'} skipped (locked)</span>}
        {counts.missing > 0 && <span className="remove">{counts.missing} missing</span>}
        {bad.length > 0 && <span className="remove">{bad.length} bad row{bad.length === 1 ? '' : 's'}</span>}
      </p>
      {diff.nothingToDo && <p role="status" className="faint">Nothing to do: the roster already matches this file.</p>}
      <Table className="data-table diff" aria-label="Import changes">
        <TableHeader>
          <Column id="mark" isRowHeader style={{ width: 24 }}> </Column>
          <Column id="jersey" style={{ width: 36 }}>#</Column>
          <Column id="player" style={{ width: 180 }}>Player</Column>
          <Column id="change">Change</Column>
        </TableHeader>
        <TableBody>
          {[
            ...diff.rows.map((row) => (
              <Row key={`${row.kind}:${row.player.id}`} id={`${row.kind}:${row.player.id}`} className={`diff-row ${row.kind}`}>
                <Cell className="mono">{row.kind === 'update' && row.changes.length === 0 ? '~' : MARK[row.kind]}</Cell>
                <Cell className="mono">{row.player.jersey}</Cell>
                <Cell>{[row.player.firstName, row.player.lastName].filter(Boolean).join(' ')}</Cell>
                <Cell><ChangeCell row={row} prune={state.prune} /></Cell>
              </Row>
            )),
            ...bad.map((error) => (
              <Row key={`bad:${error.line}`} id={`bad:${error.line}`} className="diff-row bad">
                <Cell className="mono">!</Cell>
                <Cell> </Cell>
                <Cell> </Cell>
                <Cell><span className="remove">line {error.line}: {error.message}</span></Cell>
              </Row>
            )),
          ]}
        </TableBody>
      </Table>
      {counts.missing > 0 && (
        <Checkbox className="prune" isSelected={state.prune} onChange={importer.setPrune} isDisabled={state.applying}>
          <span className="check-box" aria-hidden="true">{state.prune ? '✓' : ''}</span>
          Remove the {counts.missing} player{counts.missing === 1 ? '' : 's'} missing from the file
        </Checkbox>
      )}
      {bad.length > 0 && counts.missing > 0 && <p className="faint">A bad row is left out of the plan, so its player may show as missing.</p>}
      {state.error && <p role="alert" className="remove">{state.error}</p>}
      <div className="actions">
        <Button className="button primary" onPress={importer.apply} isDisabled={diff.nothingToDo || state.applying}>Apply</Button>
        {state.error && <Button className="button" onPress={importer.replan}>Plan again</Button>}
        <Button className="button" onPress={importer.close}>{diff.nothingToDo ? 'Close' : 'Cancel'}</Button>
      </div>
    </section>
  );
}
