/** The Games list: every game with its crew and rundown, which one is active, and the button to add a game. */

import { type Game, type GameId, showOf } from '@dtv/domain';
import { useState } from 'react';
import { Button } from 'react-aria-components';
import { useController } from '../app/context';
import { fieldOf } from './fields';
import { SHOW_PAGE_HREF } from './links';
import { MakeActive } from './make-active';
import { NewGameDialog } from './new-game';
import { gameLabel, personName } from './rows';
import { EditableTable, type TableColumn } from './table';
import type { Target } from './types';

export function GamesView({ selected, onSelect }: { readonly selected: Target | null; readonly onSelect: (target: Target | null) => void }) {
  const { world, show: active } = useController();
  const [adding, setAdding] = useState(false);
  if (!world) return null;

  const games = [...world.all('game')].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const showOfRow = (id: string) => showOf(world, id as GameId);
  const label = (doc: Readonly<Record<string, unknown>>) => gameLabel(world, doc as Game);
  const columns: TableColumn[] = [
    {
      id: 'game',
      label: 'Game',
      render: (_row, doc) => <span className="clip game">{label(doc)}</span>,
    },
    { id: 'title', label: 'Event title', field: fieldOf('game', 'title')! },
    {
      id: 'crew',
      label: 'Crew',
      render: (row) => {
        const names = showOfRow(row.id).crew.map((member) => world.get('talent', member.talentId)).filter((each) => each !== undefined).map(personName);
        return <span className="clip crew">{names.join(', ') || <span className="faint">none</span>}</span>;
      },
    },
    {
      id: 'rundown',
      label: 'Rundown',
      width: 140,
      render: (row) => (
        <span>
          {showOfRow(row.id).rundown.length} cues
          {active?.game?.id === row.id && <> · <a href={SHOW_PAGE_HREF}>open</a></>}
        </span>
      ),
    },
    { id: 'active', label: 'Console', width: 100, render: (row, doc) => <MakeActive id={row.id} name={label(doc)} /> },
  ];

  return (
    <section className="panel workspace" aria-label="Games">
      <div className="tab-bar">
        <h2 className="panel-title list-title">Games · click a cell to edit</h2>
        <div className="tab-bar-actions">
          <Button className="button" onPress={() => setAdding(true)}>+ Game</Button>
        </div>
      </div>
      <EditableTable label="Games" columns={columns} rows={games.map((each) => ({ kind: 'game', id: each.id }))} selected={selected} onSelect={onSelect} />
      {adding && <NewGameDialog onClose={() => setAdding(false)} onCreated={onSelect} />}
    </section>
  );
}
