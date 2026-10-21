/** The new-game dialog: season, program, the two teams, venue, start, conference game and title, and optionally the game's show in the same commit. */

import { type ManualEdit, parseEntity, PROGRAM_CODES, PROGRAMS, type ProgramCode, TeamId } from '@dtv/domain';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Dialog, Form, Heading, Input, Label, Modal, ModalOverlay, TextField } from 'react-aria-components';
import { useController } from '../app/context';
import { describeError } from './editing';
import { Pick } from './pick';
import { matchupLabel } from './rows';
import { buildGame, freeShowId, sameConference } from './shows';
import { teamEntries } from './teams';
import { TeamCombo } from './team-combo';
import type { Target } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function NewGameDialog({ onClose, onCreated }: { readonly onClose: () => void; readonly onCreated: (show: Target | null) => void }) {
  const { world, api, revision } = useController();
  const seasons = useMemo(() => (world?.all('season') ?? []).map((each) => each.id).sort().reverse(), [world]);
  const [seasonId, setSeasonId] = useState(seasons[0] ?? '');
  const [program, setProgram] = useState<ProgramCode>('mbb');
  const [away, setAway] = useState('');
  const [home, setHome] = useState('');
  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('19:00');
  const [conferenceChoice, setConferenceChoice] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [withShow, setWithShow] = useState(true);
  const [showName, setShowName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const entries = useMemo(() => (world ? teamEntries(world).filter((entry) => entry.team.program === program) : []), [world, program]);
  if (!world || revision === null) return null;

  const conferenceGame = conferenceChoice ?? sameConference(world, seasonId, away, home);
  const matchup = away && home ? matchupLabel(world, { awayTeamId: TeamId.parse(away), homeTeamId: TeamId.parse(home) }) : '';
  const nameOfShow = showName ?? matchup;

  const create = async () => {
    const minutesWest = new Date(`${date}T${time || '00:00'}`).getTimezoneOffset();
    const built = buildGame(world, { seasonId, program, awayTeamId: away, homeTeamId: home, venueId, date, time, conferenceGame, title }, minutesWest);
    if (!built.ok) return setError(built.error);
    const edits: ManualEdit[] = [{ op: 'put', kind: 'game', value: built.value }];
    let created: Target | null = null;
    if (withShow) {
      const id = freeShowId(world, nameOfShow);
      if (!id) return setError('Give the show a name');
      edits.push({ op: 'put', kind: 'show', value: parseEntity('show', { id, name: nameOfShow.trim(), gameId: built.value.id, crew: [], rundown: [] }) });
      created = { kind: 'show', id };
    }
    setSaving(true);
    try {
      await api.data.apply({ origin: 'manual', basis: revision, edits });
      onCreated(created);
      onClose();
    } catch (failure) {
      setError(describeError(failure).message);
      setSaving(false);
    }
  };

  return (
    <ModalOverlay className="overlay data-portal" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
      <Modal className="modal dlg-modal">
        <Dialog className="dialog" aria-label="New game">
          <Form onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <Heading slot="title">New game</Heading>
            <div className="dlg-grid">
              <div className="dlg-row">
                <span className="dlg-label">Season</span>
                <Pick label="Season" value={seasonId} options={seasons.map((id) => ({ id, label: id }))} onChange={setSeasonId} />
              </div>
              <div className="dlg-row">
                <span className="dlg-label">Program</span>
                <Pick
                  label="Program"
                  value={program}
                  options={PROGRAM_CODES.map((code) => ({ id: code, label: PROGRAMS[code].name }))}
                  onChange={(code) => { setProgram(code as ProgramCode); setAway(''); setHome(''); }}
                />
              </div>
              <div className="dlg-row">
                <span className="dlg-label">Away team</span>
                <TeamCombo key={`away-${program}`} label="Away team" entries={entries} value={away} onChange={setAway} />
              </div>
              <div className="dlg-row">
                <span className="dlg-label">Home team</span>
                <TeamCombo key={`home-${program}`} label="Home team" entries={entries} value={home} onChange={setHome} />
              </div>
              <div className="dlg-row wide">
                <span className="dlg-label">Venue</span>
                <Pick label="Venue" value={venueId} empty="— none —" options={world.all('venue').map((each) => ({ id: each.id, label: each.name }))} onChange={setVenueId} />
              </div>
              <TextField className="dlg-row" value={date} onChange={setDate} type="date" isRequired>
                <Label className="dlg-label">Game day</Label>
                <Input className="record-input mono" />
              </TextField>
              <TextField className="dlg-row" value={time} onChange={setTime} type="time" isRequired>
                <Label className="dlg-label">Start time</Label>
                <Input className="record-input mono" />
              </TextField>
              <TextField className="dlg-row wide" value={title} onChange={setTitle}>
                <Label className="dlg-label">Event title</Label>
                <Input className="record-input" placeholder="CAA opener" />
              </TextField>
              <Checkbox className="cell-check dlg-check" isSelected={conferenceGame} onChange={setConferenceChoice}>
                <span className="check-box" aria-hidden="true">{conferenceGame ? '✓' : ''}</span>
                Conference game
              </Checkbox>
              <Checkbox className="cell-check dlg-check" isSelected={withShow} onChange={setWithShow}>
                <span className="check-box" aria-hidden="true">{withShow ? '✓' : ''}</span>
                Create its show too
              </Checkbox>
              {withShow && (
                <TextField className="dlg-row wide" value={nameOfShow} onChange={setShowName}>
                  <Label className="dlg-label">Show name</Label>
                  <Input className="record-input" />
                </TextField>
              )}
            </div>
            {error && <p className="problem" role="alert">{error}</p>}
            <div className="dialog-actions">
              <Button className="button" onPress={onClose}>Cancel</Button>
              <Button className="button primary" type="submit" isDisabled={saving}>{saving ? 'Creating…' : 'Create game'}</Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
