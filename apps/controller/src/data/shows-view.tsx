/** The Shows list: every show with its game, crew and rundown, which one is active, and the buttons to add a game or a show. */

import { useState } from 'react';
import { Button } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import { fieldOf } from './fields';
import { SHOW_PAGE_HREF } from './links';
import { NewGameDialog } from './new-game';
import { gameLabel, personName } from './rows';
import { NEW_ID } from './session';
import { MakeActive } from './show-actions';
import { isFlagged } from './shows';
import { EditableTable, type TableColumn } from './table';
import type { Target } from './types';

const BLANK_SHOW = { name: '', gameId: null, crew: [], rundown: [] } as const;

export function ShowsView({ selected, onSelect }: { readonly selected: Target | null; readonly onSelect: (target: Target | null) => void }) {
  const { world, show: active } = useController();
  const edits = useEditing();
  const [addingGame, setAddingGame] = useState(false);
  if (!world) return null;

  const columns: TableColumn[] = [
    { id: 'name', label: 'Name', field: fieldOf('show', 'name')! },
    {
      id: 'game',
      label: 'Game',
      render: (_row, doc) => {
        const game = world.all('game').find((each) => each.id === doc.gameId);
        return game ? <span className="clip game">{gameLabel(world, game)}</span> : <span className="faint">no game</span>;
      },
    },
    {
      id: 'crew',
      label: 'Crew',
      render: (_row, doc) => {
        const crew = (Array.isArray(doc.crew) ? doc.crew : []) as { talentId: string }[];
        const names = crew.map((member) => world.all('talent').find((each) => each.id === member.talentId)).filter((each) => each !== undefined).map(personName);
        return <span className="clip crew">{names.join(', ') || <span className="faint">none</span>}</span>;
      },
    },
    {
      id: 'rundown',
      label: 'Rundown',
      width: 170,
      render: (row, doc) => {
        const cues = (Array.isArray(doc.rundown) ? doc.rundown : []) as { note?: string }[];
        const toCheck = cues.filter((cue) => isFlagged({ note: cue.note ?? '' })).length;
        return (
          <span>
            {cues.length} cues
            {toCheck > 0 && <span className="warn"> · {toCheck} to check</span>}
            {active?.show?.id === row.id && <> · <a href={SHOW_PAGE_HREF}>open</a></>}
          </span>
        );
      },
    },
    { id: 'active', label: 'Console', width: 100, render: (row, doc) => <MakeActive id={row.id} name={String(doc.name ?? row.id)} /> },
  ];

  return (
    <section className="panel workspace" aria-label="Shows">
      <div className="tab-bar">
        <h2 className="panel-title list-title">Shows · click a cell to edit</h2>
        <div className="tab-bar-actions">
          <Button className="button" onPress={() => setAddingGame(true)}>+ Game</Button>
          <Button
            className="button"
            onPress={() => {
              edits.startNew('show', BLANK_SHOW);
              onSelect({ kind: 'show', id: NEW_ID });
            }}
          >
            + Show
          </Button>
        </div>
      </div>
      <EditableTable label="Shows" columns={columns} rows={world.all('show').map((each) => ({ kind: 'show', id: each.id }))} selected={selected} onSelect={onSelect} />
      {addingGame && <NewGameDialog onClose={() => setAddingGame(false)} onCreated={(created) => created && onSelect(created)} />}
    </section>
  );
}
