/**
 * The selected rundown cue, edited before it goes to preview: its params as a generic
 * form, its overrides (text fixes over what the bind shows), and its note. Edits are a
 * draft until Save, which writes the rundown on the revision the draft began from.
 */

import { type Cue, type GameLive, GraphicId, type Revision, sameJson, type Show, type World } from '@dtv/domain';
import { type AnyGraphic, bindValues, blankGroup, boundProps, checkCue, type CueView, entryOf, type Overrides, paramForm, showContext } from '@dtv/playout';
import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, Heading, Input, Label, ListBox, ListBoxItem, Modal, ModalOverlay, Popover, Select, SelectValue, TextField } from 'react-aria-components';
import { useController } from '../app/context';
import { humanize, ParamsForm } from './form';
import { pickerOptions } from './pickers';
import { newCueId, useRundownEdits } from './rundown-edits';

interface Draft {
  readonly params: Record<string, unknown>;
  readonly overrides: Overrides;
  readonly note: string;
}

const draftOf = (cue: Cue): Draft => ({ params: cue.params, overrides: cue.overrides, note: cue.note });

/** The scene's text as the bind shows it without overrides, for each override's placeholder. */
function useUnedited(entry: AnyGraphic | undefined, params: Record<string, unknown>, live: GameLive | null): Readonly<Record<string, unknown>> {
  const { world, registry, show: view } = useController();
  return useMemo(() => {
    if (!entry || !world || !view?.show) return {};
    const check = checkCue(registry, { graphic: entry.id, params, overrides: {} });
    if (!check.ok) return {};
    const context = showContext({ world, showId: view.show.id, live: (game) => (live?.gameId === game ? live : undefined), now: Date.now() });
    try {
      return bindValues(entry, { graphic: GraphicId.parse(entry.id), params: check.params, step: 0, overrides: {} }, context);
    } catch {
      return {};
    }
  }, [entry, params, live, world, registry, view?.show]);
}

/** Params, overrides and note of one cue, as controls. */
function CueFields(props: { readonly entry: AnyGraphic; readonly draft: Draft; readonly onChange: (draft: Draft) => void; readonly live: GameLive | null; readonly world: World; readonly show: Show }) {
  const { entry, draft, onChange } = props;
  const fields = useMemo(() => paramForm(entry.params), [entry]);
  const unedited = useUnedited(entry, draft.params, props.live);
  const texts = [...boundProps(entry.scene)].filter(([, kind]) => kind === 'string').map(([name]) => name);
  const open = texts.filter((name) => !(name in draft.overrides));
  const setOverride = (name: string, value: string | null) => {
    const { [name]: _old, ...rest } = draft.overrides;
    onChange({ ...draft, overrides: value === null ? rest : { ...rest, [name]: value } });
  };
  return (
    <div className="cue-fields">
      <div className="form-row">
        <ParamsForm fields={fields} value={draft.params} onChange={(params) => onChange({ ...draft, params })} options={(kind, current) => pickerOptions(props.world, props.show, kind, current)} />
        <TextField className="field note" value={draft.note} onChange={(note) => onChange({ ...draft, note })}>
          <Label>Note</Label>
          <Input />
        </TextField>
      </div>
      <div className="form-row overrides">
        {Object.entries(draft.overrides).map(([name, value]) => (
          <div key={name} className="override">
            <TextField className="field" value={String(value)} onChange={(text) => setOverride(name, text)}>
              <Label>Text fix · {humanize(name)}</Label>
              <Input placeholder={String(unedited[name] ?? '')} />
            </TextField>
            <Button className="button small" aria-label={`Remove the ${name} fix`} onPress={() => setOverride(name, null)}>
              ✕
            </Button>
          </div>
        ))}
        {open.length > 0 && (
          <Select className="field select" aria-label="Fix a text on screen" selectedKey={null} onSelectionChange={(key) => key !== null && setOverride(String(key), String(unedited[String(key)] ?? ''))}>
            <Label>Text fix (override)</Label>
            <Button className="select-button">
              <SelectValue>{() => 'Fix a text…'}</SelectValue>
              <span aria-hidden>▾</span>
            </Button>
            <Popover className="popover show-portal">
              <ListBox className="listbox" items={open.map((name) => ({ id: name, label: `${humanize(name)}${unedited[name] ? ` · ${String(unedited[name])}` : ''}` }))}>
                {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
              </ListBox>
            </Popover>
          </Select>
        )}
      </div>
    </div>
  );
}

export function Inspector(props: { readonly cue: CueView | undefined; readonly live: GameLive | null; readonly onCue: (cue: CueView) => void }) {
  const { world, revision, registry, show: view } = useController();
  const edits = useRundownEdits();
  const show = view?.show ?? null;
  const id = props.cue?.ref.kind === 'rundown' ? props.cue.ref.cue : null;
  const stored = id && world && show ? world.get('show', show.id)?.rundown.find((cue) => cue.id === id) : undefined;
  const [draft, setDraft] = useState<(Draft & { readonly basis: Revision }) | null>(null);
  useEffect(() => setDraft(null), [id]);

  if (!props.cue || !stored || !world || !show || revision === null) {
    return (
      <section className="panel inspector" aria-label="Selected cue">
        <h2>Selected cue</h2>
        <p className="empty">Select a rundown cue to edit it here.</p>
      </section>
    );
  }
  const entry = entryOf(registry, stored.graphic);
  const shown = draft ?? draftOf(stored);
  const dirty = draft !== null && !sameJson(draftOf({ ...stored, ...draft }), draftOf(stored));
  const check = entry ? checkCue(registry, { graphic: stored.graphic, params: shown.params, overrides: shown.overrides }) : null;
  const problem = check && !check.ok ? check.error : props.cue.error;
  const save = async () => {
    if (!draft || !edits) return true;
    const saved = await edits.save({ ...stored, ...shown }, draft.basis);
    if (saved) setDraft(null);
    // Refused for a newer basis: the draft stays, and saving again writes over the newer cue.
    else setDraft({ ...draft, basis: revision });
    return saved;
  };
  return (
    <section className="panel inspector" aria-label="Selected cue">
      <header className="panel-header">
        <h2>
          Selected cue · <span className="strong">{props.cue.label}</span> <span className="muted">{props.cue.name}</span>
        </h2>
        <div className="actions">
          {dirty && (
            <Button className="button small" onPress={() => setDraft(null)}>
              Revert
            </Button>
          )}
          <Button className="button small primary" isDisabled={!dirty || !!(check && !check.ok)} onPress={() => void save()}>
            Save
          </Button>
          <Button
            className="button small"
            isDisabled={!!(check && !check.ok)}
            onPress={async () => {
              if (await save()) props.onCue(props.cue!);
            }}
          >
            Cue to my preview <kbd>⏎</kbd>
          </Button>
        </div>
      </header>
      {entry ? (
        <CueFields entry={entry} draft={shown} onChange={(next) => setDraft({ ...next, basis: draft?.basis ?? revision })} live={props.live} world={world} show={show} />
      ) : (
        <p className="empty">This cue names {stored.graphic}, which the registry no longer has.</p>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

/** Pick a graphic, fill its params, and add it after the selected cue. */
export function AddCueDialog(props: { readonly at: number; readonly live: GameLive | null; readonly onClose: (added: Cue | null) => void }) {
  const { world, registry, show: view } = useController();
  const edits = useRundownEdits();
  const entries = useMemo(() => Object.values(registry).sort((a, b) => a.name.localeCompare(b.name)), [registry]);
  const [graphic, setGraphic] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ params: {}, overrides: {}, note: '' });
  const entry = graphic ? entryOf(registry, graphic) : undefined;
  const check = entry ? checkCue(registry, { graphic: entry.id, params: draft.params, overrides: draft.overrides }) : null;
  return (
    <ModalOverlay className="overlay show-portal" isOpen isDismissable onOpenChange={(open) => !open && props.onClose(null)}>
      <Modal className="modal wide">
        <Dialog className="dialog" aria-label="Add a cue">
          <Heading slot="title">Add a cue</Heading>
          <Select
            className="field select"
            selectedKey={graphic}
            onSelectionChange={(key) => {
              const picked = key === null ? undefined : entryOf(registry, String(key));
              setGraphic(picked?.id ?? null);
              setDraft({ params: picked ? blankGroup(paramForm(picked.params)) : {}, overrides: {}, note: '' });
            }}
          >
            <Label>Graphic</Label>
            <Button className="select-button">
              <SelectValue>{({ selectedText }) => selectedText ?? 'Pick a graphic'}</SelectValue>
              <span aria-hidden>▾</span>
            </Button>
            <Popover className="popover show-portal">
              <ListBox className="listbox" items={entries.map((each) => ({ id: each.id, label: each.name }))}>
                {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
              </ListBox>
            </Popover>
          </Select>
          {entry && world && view?.show && <CueFields entry={entry} draft={draft} onChange={setDraft} live={props.live} world={world} show={view.show} />}
          {check && !check.ok && <p className="problem">{check.error}</p>}
          <div className="dialog-actions">
            <Button className="button" onPress={() => props.onClose(null)}>
              Cancel
            </Button>
            <Button
              className="button primary"
              isDisabled={!entry || !check?.ok || !edits}
              onPress={async () => {
                if (!entry || !edits) return;
                const id = GraphicId.parse(entry.id);
                const cue: Cue = { id: newCueId(id), graphic: id, ...draft };
                if (await edits.add(cue, props.at)) props.onClose(cue);
              }}
            >
              Add to rundown
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
