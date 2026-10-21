import type { SeasonId } from '@dtv/domain';
import { useEffect, useState } from 'react';
import { useController } from '../app/context';
import './data.css';
import { ConflictPanel } from './conflict-panel';
import { EditingProvider } from './editing';
import { ListView } from './lists';
import { RecordPanel } from './record-panel';
import { TeamList } from './team-list';
import { SeasonSelect, type TabId, TeamWorkspace } from './team-workspace';
import { rowOf } from './rows';
import { NEW_ID } from './session';
import { sameTarget, type Target, type View } from './types';

function Page() {
  const { world } = useController();
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<TabId>('roster');
  const [season, setSeason] = useState<SeasonId | null>(null);
  const [selected, setSelected] = useState<Target | null>(null);

  const seasons = world?.all('season') ?? [];
  const current = season ?? seasons.map((each) => each.id).sort().at(-1) ?? null;

  // A freshly created row selects itself under its real id; a deleted selection clears.
  useEffect(() => {
    if (selected && world && selected.id !== NEW_ID && !selected.fallback && !rowOf(world, selected.kind, selected.id)) setSelected(null);
  }, [world, selected]);

  const select = (target: Target | null) => setSelected((previous) => (sameTarget(previous, target) ? previous : target));

  return (
    <main className="data-page">
      <TeamList
        view={view}
        onView={(next) => {
          setView(next);
          setSelected(null);
        }}
      />
      <div className="middle">
        {view?.type === 'team' && current && (
          <TeamWorkspace
            key={`${view.team}@${current}`}
            team={view.team}
            season={current}
            tab={tab}
            onTab={(next) => setTab(next)}
            selected={selected}
            onSelect={select}
            header={<SeasonSelect season={current} onSeason={setSeason} />}
          />
        )}
        {view?.type === 'list' && <ListView key={view.list} list={view.list} selected={selected} onSelect={select} />}
        {!view && <section className="panel workspace"><p className="faint empty">Pick a team or a list on the left.</p></section>}
      </div>
      <div className="right">
        <RecordPanel target={selected} onSelect={select} />
        <ConflictPanel target={selected} />
      </div>
    </main>
  );
}

/** The Data page: team list, the team's tables, and the selected record, with edit sessions shared across them. */
export function DataPage() {
  return (
    <EditingProvider>
      <Page />
    </EditingProvider>
  );
}
