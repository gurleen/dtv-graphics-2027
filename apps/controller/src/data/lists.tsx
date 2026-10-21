import { Button } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import { fieldOf } from './fields';
import { SHOW_PAGE_HREF } from './links';
import { gameLabel, personName } from './rows';
import { EditableTable, type TableColumn } from './table';
import { NEW_ID } from './session';
import { LISTS, type ListId, type RowRef, type Target } from './types';

const column = (kind: 'talent' | 'sponsor' | 'venue' | 'show', id: string, extra: Partial<TableColumn> = {}): TableColumn => {
  const field = fieldOf(kind, id)!;
  return { id, label: field.label, field, ...extra };
};

const NEW = {
  talent: { kind: 'talent', label: '+ Talent', blank: { firstName: '', lastName: '', role: '' } },
  sponsors: { kind: 'sponsor', label: '+ Sponsor', blank: { name: '' } },
  venues: { kind: 'venue', label: '+ Venue', blank: { name: '', city: '', state: '' } },
} as const;

export function ListView({ list, selected, onSelect }: { list: ListId; selected: Target | null; onSelect(target: Target): void }) {
  const { world } = useController();
  const edits = useEditing();
  if (!world) return null;

  let columns: TableColumn[];
  let rows: RowRef[];
  switch (list) {
    case 'talent':
      columns = [column('talent', 'firstName'), column('talent', 'lastName'), column('talent', 'role')];
      rows = world.all('talent').map((each) => ({ kind: 'talent', id: each.id }));
      break;
    case 'sponsors':
      columns = [column('sponsor', 'name'), column('sponsor', 'logoOnDark'), column('sponsor', 'logoOnLight')];
      rows = world.all('sponsor').map((each) => ({ kind: 'sponsor', id: each.id }));
      break;
    case 'venues':
      columns = [column('venue', 'name'), column('venue', 'city'), column('venue', 'state', { width: 60 })];
      rows = world.all('venue').map((each) => ({ kind: 'venue', id: each.id }));
      break;
    case 'shows':
      columns = [
        column('show', 'name'),
        {
          id: 'game',
          label: 'Game',
          render: (_row, doc) => {
            const game = world.all('game').find((each) => each.id === doc.gameId);
            return game ? <span>{gameLabel(world, game)}</span> : <span className="faint">no game</span>;
          },
        },
        {
          id: 'crew',
          label: 'Crew',
          render: (_row, doc) => {
            const crew = (Array.isArray(doc.crew) ? doc.crew : []) as { talentId: string }[];
            const names = crew.map((member) => world.all('talent').find((each) => each.id === member.talentId)).filter((each) => each !== undefined).map(personName);
            return <span>{names.join(', ') || <span className="faint">none</span>}</span>;
          },
        },
        {
          id: 'rundown',
          label: 'Rundown',
          width: 130,
          render: (_row, doc) => (
            <span>{Array.isArray(doc.rundown) ? doc.rundown.length : 0} cues · <a href={SHOW_PAGE_HREF}>open</a></span>
          ),
        },
      ];
      rows = world.all('show').map((each) => ({ kind: 'show', id: each.id }));
      break;
  }
  const add = list === 'shows' ? null : NEW[list];

  return (
    <section className="panel workspace" aria-label={LISTS[list]}>
      <div className="tab-bar">
        <h2 className="panel-title list-title">{LISTS[list]} · click a cell to edit</h2>
        {add && (
          <div className="tab-bar-actions">
            <Button
              className="button"
              onPress={() => {
                edits.startNew(add.kind, add.blank);
                onSelect({ kind: add.kind, id: NEW_ID });
              }}
            >
              {add.label}
            </Button>
          </div>
        )}
      </div>
      <EditableTable label={LISTS[list]} columns={columns} rows={rows} selected={selected} onSelect={onSelect} />
    </section>
  );
}
