/** The sportsdataverse load: pick a program and a season, load, and read what the load wrote and what it could not place. */

import { PROGRAM_CODES, PROGRAMS, type ProgramCode, SDV_DATASET_NAMES, type SdvDataset, type SdvLoadReport, SeasonId } from '@dtv/domain';
import { useMemo, useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useController } from '../app/context';
import { describeError } from './editing';
import { Pick } from './pick';

const DATASET_LABELS: { readonly [D in SdvDataset]: string } = {
  groups: 'Conferences',
  schedule: 'Schedule',
  teamBox: 'Team box scores',
  rosters: 'Rosters',
  priorRosters: "Last season's rosters",
  playerBox: 'Player box scores',
};

/** The seasons in the data, and the one after the newest, which a load can start. */
const seasonChoices = (ids: readonly string[]) => {
  const newest = [...ids].sort().at(-1);
  const start = newest ? Number(newest.slice(0, 4)) + 1 : new Date().getFullYear();
  const next = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  return [...new Set([...ids, next])].sort().reverse();
};

type LoadState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'done'; readonly report: SdvLoadReport }
  | { readonly phase: 'failed'; readonly message: string };

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function Report({ report }: { readonly report: SdvLoadReport }) {
  const skipped = report.skipped.reduce((total, row) => total + row.fields.length, 0);
  const wrote = report.inserted + report.updated + report.deleted > 0;
  return (
    <div className="load-report" data-testid="load-report">
      <p className="import-summary" role="status">
        <span>
          {PROGRAMS[report.program].name} {report.season}
        </span>
        <span className="add">{count(report.inserted, 'row')} inserted</span>
        <span className="warn">{count(report.updated, 'row')} updated</span>
        {report.deleted > 0 && <span className="warn">{count(report.deleted, 'row')} deleted</span>}
        {skipped > 0 && <span className="warn">{count(skipped, 'locked field')} skipped</span>}
        <span className="faint">{(report.ms / 1000).toFixed(1)} s</span>
      </p>
      {!wrote && <p className="faint">Nothing changed: the data already matches these files.</p>}
      <p className="load-datasets faint">
        {SDV_DATASET_NAMES.map((dataset) => {
          const rows = report.summary.rows[dataset];
          return (
            <span key={dataset}>
              {DATASET_LABELS[dataset]} {rows === null ? <span className="warn">not published</span> : count(rows, 'row')}
            </span>
          );
        })}
      </p>
      <p className="faint">
        {count(report.summary.teamSeasons, 'team')} ({count(report.summary.newSchools, 'new school')}), {count(report.summary.players, 'player')},{' '}
        {count(report.summary.playerStats, 'player stat line')}, {count(report.summary.games, 'Drexel home game')} in the files.
      </p>
      {report.summary.rematched + report.summary.removed > 0 && (
        <p className="faint">
          Players from the retired NCAA files: {count(report.summary.rematched, 'player')} rekeyed to ESPN, {count(report.summary.removed, 'player')} on no
          ESPN roster deleted with their stats.
        </p>
      )}
      {report.warnings.length > 0 && (
        <ul className="load-warnings">
          {report.warnings.map((warning) => (
            <li key={warning.code}>
              <details>
                <summary className="warn">{warning.message}</summary>
                <p className="faint">{warning.subjects.join(', ')}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LoadDialog({ onClose }: { readonly onClose: () => void }) {
  const { world, api } = useController();
  const seasons = useMemo(() => seasonChoices((world?.all('season') ?? []).map((each) => each.id)), [world]);
  const [program, setProgram] = useState<ProgramCode>('mbb');
  const [season, setSeason] = useState(() => seasons.find((id) => world?.get('season', id as SeasonId)) ?? seasons[0]!);
  const [state, setState] = useState<LoadState>({ phase: 'idle' });

  const load = async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'done', report: await api.data.load({ program, season: SeasonId.parse(season) }) });
    } catch (error) {
      setState({ phase: 'failed', message: describeError(error).message });
    }
  };
  const loading = state.phase === 'loading';

  return (
    <ModalOverlay className="overlay data-portal" isOpen isDismissable={!loading} onOpenChange={(open) => !open && onClose()}>
      <Modal className="modal dlg-modal">
        <Dialog className="dialog" aria-label="Load from sportsdataverse">
          <Heading slot="title">Load from sportsdataverse</Heading>
          <p className="hint">
            Downloads the season's ESPN files and writes conferences, records, standings, team and player stats, rosters and Drexel's home games.
            Locked fields stay as they are.
          </p>
          <div className="dlg-grid">
            <div className="dlg-row">
              <span className="dlg-label">Program</span>
              <Pick label="Program" value={program} options={PROGRAM_CODES.map((code) => ({ id: code, label: PROGRAMS[code].name }))} onChange={(code) => setProgram(code as ProgramCode)} />
            </div>
            <div className="dlg-row">
              <span className="dlg-label">Season</span>
              <Pick label="Season" value={season} options={seasons.map((id) => ({ id, label: id }))} onChange={setSeason} />
            </div>
          </div>
          {loading && <p className="faint" role="status">Downloading and loading {PROGRAMS[program].name} {season}…</p>}
          {state.phase === 'failed' && <p className="problem" role="alert">{state.message}</p>}
          {state.phase === 'done' && <Report report={state.report} />}
          <div className="dialog-actions">
            <Button className="button" onPress={onClose} isDisabled={loading}>Close</Button>
            <Button className="button primary" onPress={() => void load()} isDisabled={loading}>{loading ? 'Loading…' : 'Load'}</Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
