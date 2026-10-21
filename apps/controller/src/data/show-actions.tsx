/** What an operator does to a show from the Shows list: make it active, and copy it onto another game. */

import { ShowId } from '@dtv/domain';
import { entryOf } from '@dtv/playout';
import { useMemo, useState } from 'react';
import { Button, Dialog, DialogTrigger, Form, Heading, Input, Label, Modal, ModalOverlay, Popover, TextField } from 'react-aria-components';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';
import { describeError } from './editing';
import { Pick } from './pick';
import { gameLabel, matchupLabel } from './rows';
import { duplicateShow } from './shows';
import type { Target } from './types';

/** The mark on the active show, or the button that makes another show active after a one-line confirm. */
export function MakeActive({ id, name }: { readonly id: string; readonly name: string }) {
  const { show } = useController();
  const { send, problem } = useCommands();
  const [failed, setFailed] = useState(false);
  if (show?.show?.id === id) return <span className="active-mark" data-testid="active-show">Active</span>;
  return (
    <DialogTrigger>
      <Button className="button small" aria-label={`Make ${name} active`}>Make active</Button>
      <Popover className="popover data-portal" placement="bottom end">
        <Dialog className="confirm" aria-label={`Make ${name} active`}>
          {({ close }) => (
            <>
              <span>Make {name} active? Every operator’s preview empties. Program stays on air.</span>
              <Button
                className="button primary"
                onPress={async () => {
                  const done = await send({ type: 'activate', show: ShowId.parse(id) });
                  setFailed(!done);
                  if (done) close();
                }}
              >
                Make active
              </Button>
              <Button className="button" onPress={close}>Cancel</Button>
              {failed && problem && <span className="remove" role="alert">{problem.message}</span>}
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/** Copies a show onto another game: the crew, and the rundown with new cue ids and the cues written for the old game flagged. */
export function DuplicateDialog({ sourceId, onClose, onCreated }: { readonly sourceId: string; readonly onClose: () => void; readonly onCreated: (show: Target) => void }) {
  const { world, api, revision, registry } = useController();
  const source = world?.get('show', ShowId.parse(sourceId));
  const games = useMemo(() => [...(world?.all('game') ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt)), [world]);
  const [gameId, setGameId] = useState(() => (games.find((each) => each.id !== source?.gameId) ?? games[0])?.id ?? '');
  const [typedName, setTypedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!world || !source || revision === null) return null;

  const game = games.find((each) => each.id === gameId);
  const name = typedName ?? (game ? matchupLabel(world, game) : '');
  const copy = game ? duplicateShow(world, registry, source, { game, name }) : null;
  const flagged = copy?.ok ? copy.value.flagged : [];

  const create = async () => {
    if (!copy) return setError('Pick the game it is for');
    if (!copy.ok) return setError(copy.error);
    setSaving(true);
    try {
      await api.data.apply({ origin: 'manual', basis: revision, edits: [{ op: 'put', kind: 'show', value: copy.value.show }] });
      onCreated({ kind: 'show', id: copy.value.show.id });
      onClose();
    } catch (failure) {
      setError(describeError(failure).message);
      setSaving(false);
    }
  };

  return (
    <ModalOverlay className="overlay data-portal" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
      <Modal className="modal dlg-modal">
        <Dialog className="dialog" aria-label="Duplicate show">
          <Form onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <Heading slot="title">Duplicate {source.name}</Heading>
            <div className="dlg-grid">
              <div className="dlg-row wide">
                <span className="dlg-label">Onto game</span>
                <Pick label="Onto game" value={gameId} options={games.map((each) => ({ id: each.id, label: gameLabel(world, each) }))} onChange={setGameId} />
              </div>
              <TextField className="dlg-row wide" value={name} onChange={setTypedName}>
                <Label className="dlg-label">Show name</Label>
                <Input className="record-input" />
              </TextField>
            </div>
            <p className="hint">
              Copies {source.crew.length} crew and {source.rundown.length} cues. Cue ids are new.{' '}
              {flagged.length ? `${flagged.length} of them name the old game’s teams or players and are flagged in their notes.` : 'No cue names the old game’s teams or players.'}
            </p>
            {flagged.length > 0 && (
              <ul className="flagged" aria-label="Cues to check">
                {flagged.map((each) => (
                  <li key={each.cue}>
                    <span className="warn">{entryOf(registry, each.graphic)?.name ?? each.graphic}</span> names {each.names.join(', ')}
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="problem" role="alert">{error}</p>}
            <div className="dialog-actions">
              <Button className="button" onPress={onClose}>Cancel</Button>
              <Button className="button primary" type="submit" isDisabled={saving || !game}>{saving ? 'Duplicating…' : 'Duplicate'}</Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
