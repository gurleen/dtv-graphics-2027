import { useMemo, useState } from 'react';
import { Button, Header, Input, ListBox, ListBoxItem, ListBoxSection, SearchField } from 'react-aria-components';
import { useController } from '../app/context';
import { LoadDialog } from './load-dialog';
import { pinnedTeams, readRecent, searchTeams, teamEntries, touchRecent, writeRecent } from './teams';
import { LISTS, type ListId, type View } from './types';

const SEARCH_LIMIT = 40;

const keyOfView = (view: View | null) => (view?.type === 'team' ? `team:${view.team}` : view ? `list:${view.list}` : '');

export function TeamList({ view, onView }: { readonly view: View | null; readonly onView: (view: View) => void }) {
  const { world } = useController();
  const active = useController().show?.game ?? null;
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(() => readRecent(localStorage));
  const [loading, setLoading] = useState(false);
  const entries = useMemo(() => (world ? teamEntries(world) : []), [world]);
  const game = active && world ? world.get('game', active.id) : undefined;
  const pinned = pinnedTeams(entries, game ? [game.homeTeamId, game.awayTeamId] : [], recent);
  const results = useMemo(() => searchTeams(entries, query, SEARCH_LIMIT), [entries, query]);
  const schools = world?.all('school').length ?? 0;

  const open = (key: string) => {
    if (key.startsWith('list:')) {
      onView({ type: 'list', list: key.slice(5) as ListId });
      return;
    }
    const entry = entries.find((each) => `team:${each.team.id}` === key);
    if (!entry) return;
    const next = touchRecent(recent, entry.team.id);
    setRecent(next);
    writeRecent(localStorage, next);
    onView({ type: 'team', team: entry.team.id });
  };

  const teamItem = (entry: (typeof entries)[number]) => (
    <ListBoxItem key={entry.team.id} id={`team:${entry.team.id}`} textValue={entry.label} className="list-item">
      {entry.label}
    </ListBoxItem>
  );

  return (
    <section className="panel team-list" aria-label="Teams">
      <div className="panel-head">
        <h2 className="panel-title">Teams</h2>
        <Button className="button small" onPress={() => setLoading(true)}>Load…</Button>
      </div>
      {loading && <LoadDialog onClose={() => setLoading(false)} />}
      <SearchField className="search" aria-label="Search teams" value={query} onChange={setQuery} onSubmit={() => results[0] && open(`team:${results[0].team.id}`)}>
        <Input placeholder={`Search ${schools} schools…`} />
        <Button className="search-clear" aria-label="Clear search">
          ×
        </Button>
      </SearchField>
      <ListBox
        className="list-box"
        aria-label="Teams and lists"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={view ? [keyOfView(view)] : []}
        onSelectionChange={(keys) => {
          const [key] = keys === 'all' ? [] : [...keys];
          if (key !== undefined) open(String(key));
        }}
      >
        {query.trim() ? (
          <ListBoxSection>
            <Header className="section-title">{results.length ? `Results (${results.length}${results.length === SEARCH_LIMIT ? '+' : ''})` : 'No team matches'}</Header>
            {results.map(teamItem)}
          </ListBoxSection>
        ) : (
          (pinned.game.length > 0 || pinned.recent.length > 0) && (
            <ListBoxSection>
              <Header className="section-title">Pinned</Header>
              {pinned.game.map(teamItem)}
              {pinned.recent.map(teamItem)}
            </ListBoxSection>
          )
        )}
        <ListBoxSection>
          <Header className="section-title">Other</Header>
          {(Object.entries(LISTS) as [ListId, string][]).map(([id, name]) => (
            <ListBoxItem key={id} id={`list:${id}`} textValue={name} className="list-item">
              {name}
            </ListBoxItem>
          ))}
        </ListBoxSection>
      </ListBox>
    </section>
  );
}
