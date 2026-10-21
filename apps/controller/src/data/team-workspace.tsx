import { basketball, type Player, type SeasonId, type TeamId } from '@dtv/domain';
import { type ReactNode } from 'react';
import { Button, Cell, Column, Row, Select, SelectValue, Label, ListBox, ListBoxItem, Popover, Tab, TabList, TabPanel, Table, TableBody, TableHeader, Tabs } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import { type EditableKind, fieldOf, lockFieldOf, readText } from './fields';
import { ImportButton, RosterImportPanel, useRosterImport } from './roster-import';
import { personName } from './rows';
import { type TableColumn, EditableCell, EditableTable, useCellEditing, useRowDoc } from './table';
import { programLabel } from './teams';
import { NEW_ID } from './session';
import { type RowRef, type Target } from './types';

export const TABS = { roster: 'Roster', staff: 'Staff', stats: 'Season stats', branding: 'Team and branding' } as const;
export type TabId = keyof typeof TABS;

const column = (kind: EditableKind, id: string, extra: Partial<TableColumn> = {}): TableColumn => {
  const field = fieldOf(kind, id)!;
  return { id, label: field.label, field, ...extra };
};

const ROSTER_COLUMNS = [
  column('player', 'jersey', { width: 44 }),
  column('player', 'firstName'),
  column('player', 'lastName'),
  column('player', 'position', { width: 48 }),
  column('player', 'classYear', { label: 'Class', width: 56 }),
  column('player', 'redshirt', { label: 'RS', width: 36 }),
  column('player', 'hometown'),
  column('player', 'headshot', { label: 'Image' }),
];

const STAFF_COLUMNS = [column('staff', 'firstName'), column('staff', 'lastName'), column('staff', 'title'), column('staff', 'detail')];

const PLAYER_STAT_IDS = ['stats.gp', 'stats.totals.min', 'stats.totals.pts', 'stats.totals.fgm', 'stats.totals.fga', 'stats.totals.tpm', 'stats.totals.tpa', 'stats.totals.ftm', 'stats.totals.fta', 'stats.totals.reb', 'stats.totals.ast', 'stats.totals.stl', 'stats.totals.blk', 'stats.totals.to', 'stats.totals.pf'];
const TEAM_SEASON_COLUMNS = ['overall.wins', 'overall.losses', 'conference.wins', 'conference.losses', 'streak', 'rank', 'stats.gp', 'stats.totals.pts', 'stats.totals.reb', 'stats.totals.ast', 'stats.opponentPts'];

function useSeasonLabel(season: SeasonId) {
  return useController().world?.get('season', season)?.name ?? season;
}

function RosterTab({ team, season, selected, onSelect, importer }: { team: TeamId; season: SeasonId; selected: Target | null; onSelect(target: Target): void; importer: ReturnType<typeof useRosterImport> }) {
  const { world } = useController();
  const edits = useEditing();
  if (!world) return null;
  const rows: RowRef[] = world.roster(team, season).map((player) => ({ kind: 'player', id: player.id }));
  return (
    <>
      <div className="tab-bar-actions">
        <ImportButton importer={importer} />
        <Button
          className="button"
          onPress={() => {
            edits.startNew('player', { teamId: team, seasonId: season, firstName: '', lastName: '', jersey: '', position: '' });
            onSelect({ kind: 'player', id: NEW_ID });
          }}
        >
          + Player
        </Button>
      </div>
      <EditableTable label="Roster" columns={ROSTER_COLUMNS} rows={rows} selected={selected} onSelect={onSelect} />
    </>
  );
}

function StaffTab({ team, season, selected, onSelect }: { team: TeamId; season: SeasonId; selected: Target | null; onSelect(target: Target): void }) {
  const { world } = useController();
  const edits = useEditing();
  if (!world) return null;
  const rows: RowRef[] = world.staffOf(team, season).map((member) => ({ kind: 'staff', id: member.id }));
  return (
    <>
      <div className="tab-bar-actions">
        <Button
          className="button"
          onPress={() => {
            edits.startNew('staff', { teamId: team, seasonId: season, firstName: '', lastName: '', title: '', detail: '' });
            onSelect({ kind: 'staff', id: NEW_ID });
          }}
        >
          + Staff
        </Button>
      </div>
      <EditableTable label="Staff" columns={STAFF_COLUMNS} rows={rows} selected={selected} onSelect={onSelect} />
    </>
  );
}

const EMPTY_PLAYER_STATS = basketball.BasketballPlayerSeasonStats.parse({ sport: 'basketball' });

function StatsTab({ team, season, selected, onSelect }: { team: TeamId; season: SeasonId; selected: Target | null; onSelect(target: Target): void }) {
  const { world } = useController();
  if (!world) return null;
  const teamSeason = world.teamSeason(team, season);
  const seasonColumns: TableColumn[] = [
    {
      id: 'conferenceId',
      label: 'Conf',
      render: (_row, doc) => {
        const conference = world.all('conference').find((each) => each.id === doc.conferenceId);
        return conference ? <span>{conference.shortName}</span> : <span className="faint">—</span>;
      },
    },
    ...TEAM_SEASON_COLUMNS.map((id) => column('teamSeason', id, { width: 52 })),
  ];
  const roster = new Map<string, Player>(world.roster(team, season).map((player) => [player.id, player]));
  const playerColumns: TableColumn[] = [
    {
      id: 'player',
      label: 'Player',
      width: 150,
      render: (row) => {
        const player = roster.get(row.id);
        return <span>{player ? `#${player.jersey} ${personName(player)}` : row.id}</span>;
      },
    },
    ...PLAYER_STAT_IDS.map((id) => column('playerStats', id, { width: 44 })),
  ];
  const players: RowRef[] = world.roster(team, season).map((player) => ({ kind: 'playerStats', id: player.id, fallback: { id: player.id, stats: EMPTY_PLAYER_STATS } }));
  return (
    <>
      <h3 className="sub-title">Team season</h3>
      {teamSeason ? (
        <EditableTable label="Team season" columns={seasonColumns} rows={[{ kind: 'teamSeason', id: teamSeason.id }]} selected={selected} onSelect={onSelect} />
      ) : (
        <p className="faint empty">This team has no row for this season.</p>
      )}
      <h3 className="sub-title">Player season stats</h3>
      <EditableTable label="Player season stats" columns={playerColumns} rows={players} selected={selected} onSelect={onSelect} />
    </>
  );
}

const BRANDED = [
  { label: 'Abbreviation', school: 'abbreviation', team: 'branding.abbreviation' },
  { label: 'Primary colour', school: 'primaryColor', team: 'branding.primaryColor' },
  { label: 'Secondary colour', school: 'secondaryColor', team: 'branding.secondaryColor' },
  { label: 'Logo', school: 'logo', team: 'branding.logo' },
] as const;
const SCHOOL_ONLY = ['name', 'shortName', 'mascot', 'website', 'espnId'] as const;

function OnAir({ value, color }: { value: string; color: boolean }) {
  return value ? <span className="cell-static">{color && /^#[0-9a-f]{6}$/i.test(value) && <span className="swatch" style={{ background: value }} />}<span className={color ? 'mono' : undefined}>{value.split('/').pop()}</span></span> : <span className="faint">—</span>;
}

function BrandingTab({ team, selected, onSelect }: { team: TeamId; selected: Target | null; onSelect(target: Target): void }) {
  const { world } = useController();
  const editing = useCellEditing();
  const teamRef: RowRef = { kind: 'team', id: team };
  const teamRow = world?.get('team', team);
  const schoolRef: RowRef = { kind: 'school', id: teamRow?.schoolId ?? '' };
  const schoolDoc = useRowDoc(schoolRef);
  const teamDoc = useRowDoc(teamRef);
  if (!world || !teamRow || !schoolDoc || !teamDoc) return null;
  const isSelected = (target: Target) => selected?.kind === target.kind && selected.id === target.id;

  const row = (key: string, label: string, schoolField: string, teamField: string | null) => {
    const school = fieldOf('school', schoolField)!;
    const override = teamField ? fieldOf('team', teamField) : undefined;
    const shown = (override && readText(teamDoc, override)) || readText(schoolDoc, school);
    return (
      <Row key={key} id={key} className="data-row">
        <Cell>{label}</Cell>
        <Cell><EditableCell target={schoolRef} field={school} cell={`school/${schoolField}`} editing={editing} onSelect={onSelect} /></Cell>
        <Cell>{override ? <EditableCell target={teamRef} field={override} cell={`team/${teamField}`} editing={editing} onSelect={onSelect} /> : <span className="faint">—</span>}</Cell>
        <Cell><OnAir value={shown} color={school.type === 'color'} /></Cell>
      </Row>
    );
  };

  return (
    <>
      <p className="faint note">
        School values apply to every program of {String(schoolDoc.shortName)}. A program's override replaces them for this team's graphics only.
        {(isSelected(schoolRef) || isSelected(teamRef)) && ' The record on the right is the one you last touched.'}
      </p>
      <Table className="data-table branding" aria-label="Team and branding">
        <TableHeader>
          <Column id="field" isRowHeader style={{ width: 130 }}>Field</Column>
          <Column id="school">School</Column>
          <Column id="override">This program's override</Column>
          <Column id="air">On air</Column>
        </TableHeader>
        <TableBody>
          {[
            ...BRANDED.map((each) => row(each.school, each.label, each.school, each.team)),
            ...SCHOOL_ONLY.map((id) => row(id, fieldOf('school', id)!.label, id, null)),
          ]}
        </TableBody>
      </Table>
    </>
  );
}

export function SeasonSelect({ season, onSeason }: { season: SeasonId; onSeason(season: SeasonId): void }) {
  const { world } = useController();
  const seasons = world?.all('season') ?? [];
  if (seasons.length < 2) return null;
  return (
    <Select className="season-select" aria-label="Season" selectedKey={season} onSelectionChange={(key) => onSeason(String(key) as SeasonId)}>
      <Label className="visually-hidden">Season</Label>
      <Button className="button"><SelectValue /> <span aria-hidden="true">▾</span></Button>
      <Popover className="popover select-popover data-portal">
        <ListBox className="list-box">
          {seasons.map((each) => <ListBoxItem key={each.id} id={each.id} textValue={each.name} className="list-item">{each.name}</ListBoxItem>)}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function TeamWorkspace({ team, season, tab, onTab, selected, onSelect, header }: { team: TeamId; season: SeasonId; tab: TabId; onTab(tab: TabId): void; selected: Target | null; onSelect(target: Target): void; header: ReactNode }) {
  const { world } = useController();
  const importer = useRosterImport(team, season);
  const row = world?.get('team', team);
  const school = row && world?.get('school', row.schoolId);
  const seasonName = useSeasonLabel(season);
  if (!row || !school) return <section className="panel workspace"><p className="faint empty">That team no longer exists.</p></section>;
  const title = `${school.shortName} ${programLabel(row.program)} · ${seasonName}`;

  return (
    <div className="workspace-stack">
      <section className="panel workspace" aria-label={title}>
        <Tabs selectedKey={tab} onSelectionChange={(key) => onTab(String(key) as TabId)} className="tabs">
          <div className="tab-bar">
            <TabList className="tab-list" aria-label="Team data">
              {(Object.entries(TABS) as [TabId, string][]).map(([id, name]) => <Tab key={id} id={id} className="tab">{name}</Tab>)}
            </TabList>
            {header}
          </div>
          <h2 className="panel-title">{title} · {TABS[tab]} · click a cell to edit</h2>
          <TabPanel id="roster" className="tab-panel"><RosterTab team={team} season={season} selected={selected} onSelect={onSelect} importer={importer} /></TabPanel>
          <TabPanel id="staff" className="tab-panel"><StaffTab team={team} season={season} selected={selected} onSelect={onSelect} /></TabPanel>
          <TabPanel id="stats" className="tab-panel"><StatsTab team={team} season={season} selected={selected} onSelect={onSelect} /></TabPanel>
          <TabPanel id="branding" className="tab-panel"><BrandingTab team={team} selected={selected} onSelect={onSelect} /></TabPanel>
        </Tabs>
      </section>
      {tab === 'roster' && <RosterImportPanel importer={importer} />}
    </div>
  );
}
