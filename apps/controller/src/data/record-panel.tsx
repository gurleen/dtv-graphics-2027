import { type ReactNode, useState } from 'react';
import { Button, Checkbox, Dialog, DialogTrigger, Input, Label, Popover, TextField } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import { type EditableKind, type Field, fieldsOf, lockFieldOf, readText } from './fields';
import { LockMark } from './lock-mark';
import type { Doc } from './paths';
import { Pick, type Option } from './pick';
import { gameLabel, personName, rowLabel, rowOf } from './rows';
import { isDirty, NEW_ID, problemsOf, type Session, shownProblems } from './session';
import { SHOW_PAGE_HREF } from './links';
import type { Target } from './types';

const DELETABLE: ReadonlySet<EditableKind> = new Set(['player', 'staff', 'talent', 'sponsor', 'venue']);

function useOptions(field: Field): readonly Option[] {
  const { world } = useController();
  if (!world) return [];
  if (field.refTo === 'conference') return world.all('conference').map((each) => ({ id: each.id, label: `${each.shortName} · ${each.name}` }));
  if (field.refTo === 'game') return world.all('game').map((each) => ({ id: each.id, label: gameLabel(world, each) }));
  return [];
}

function Control({ doc, field, session, onType }: { doc: Doc; field: Field; session: Session | undefined; onType(field: Field, text: string): void }) {
  const options = useOptions(field);
  const value = session?.pending[field.id]?.text ?? readText(doc, field);
  const label = field.label;
  if (field.type === 'bool') {
    return (
      <Checkbox className="cell-check" isSelected={value === 'yes'} onChange={(on) => onType(field, on ? 'yes' : 'no')} aria-label={label}>
        <span className="check-box" aria-hidden="true">{value === 'yes' ? '✓' : ''}</span>
      </Checkbox>
    );
  }
  if (field.type === 'choice') {
    return <Pick label={label} value={value} empty="—" options={(field.choices ?? []).map((id) => ({ id, label: id }))} onChange={(id) => onType(field, id)} />;
  }
  if (field.type === 'ref') return <Pick label={label} value={value} empty="— none —" options={options} onChange={(id) => onType(field, id)} />;
  return (
    <span className="control">
      <TextField aria-label={label} value={value} onChange={(text) => onType(field, text)} className="record-text">
        <Input className={field.mono ? 'record-input mono' : 'record-input'} />
      </TextField>
      {field.type === 'color' && /^#[0-9a-f]{6}$/i.test(value) && <span className="swatch" style={{ background: value }} />}
      {field.type === 'image' && /^(https?:\/\/|\/)/.test(value) && <img className="thumb" src={value} alt="" onError={(event) => (event.currentTarget.style.display = 'none')} />}
    </span>
  );
}

function CrewEditor({ doc, onChange }: { doc: Doc; onChange(next: readonly { talentId: string; role: string | null }[]): void }) {
  const { world } = useController();
  const crew = (Array.isArray(doc.crew) ? doc.crew : []) as { talentId: string; role: string | null }[];
  const talent = world?.all('talent') ?? [];
  const options = talent.map((each) => ({ id: each.id, label: personName(each) }));
  const unused = talent.find((each) => !crew.some((member) => member.talentId === each.id));
  return (
    <div className="crew">
      {crew.map((member, index) => (
        <div className="crew-row" key={`${member.talentId}-${index}`}>
          <Pick label={`Crew member ${index + 1}`} value={member.talentId} options={options} onChange={(id) => onChange(crew.map((each, at) => (at === index ? { ...each, talentId: id } : each)))} />
          <TextField aria-label={`Role for crew member ${index + 1}`} value={member.role ?? ''} onChange={(role) => onChange(crew.map((each, at) => (at === index ? { ...each, role: role || null } : each)))} className="record-text">
            <Input className="record-input" placeholder={talent.find((each) => each.id === member.talentId)?.role ?? 'role tonight'} />
          </TextField>
          <Button className="button" aria-label={`Remove crew member ${index + 1}`} onPress={() => onChange(crew.filter((_, at) => at !== index))}>×</Button>
        </div>
      ))}
      <Button className="button" isDisabled={!unused} onPress={() => unused && onChange([...crew, { talentId: unused.id, role: null }])}>+ Add crew</Button>
    </div>
  );
}

export function RecordPanel({ target, onSelect }: { readonly target: Target | null; readonly onSelect: (target: Target | null) => void }) {
  const { world } = useController();
  const editing = useEditing();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  if (!target || !world) {
    return <section className="panel record"><h2 className="panel-title">Record</h2><p className="faint empty">Select a row to see it in full.</p></section>;
  }
  const { kind, id } = target;
  const session = editing.session(kind, id);
  const stored = rowOf(world, kind, id);
  const base = stored ?? session?.original ?? target.fallback ?? session?.draft;
  const doc = session?.draft ?? base;
  if (!doc || !base) return <section className="panel record"><h2 className="panel-title">Record</h2><p className="faint empty">That row no longer exists.</p></section>;

  const isNew = id === NEW_ID;
  const problems = session ? problemsOf(session) : {};
  const shown = session ? shownProblems(session) : {};
  const fields = fieldsOf(kind);
  const statFields = fields.filter((field) => field.id.startsWith('stats.'));
  const plain = fields.filter((field) => !field.id.startsWith('stats.'));
  const row = (field: Field, className = 'field'): ReactNode => (
    <div className={className} key={field.id}>
      <span className="field-label">{field.label}</span>
      <span className="field-body">
        <Control doc={doc} field={field} session={session} onType={(spec, text) => editing.type(kind, base, spec, text)} />
        <LockMark kind={kind} id={id} field={lockFieldOf(field)} label={field.label} />
        {shown[field.id] && <span className="field-error" role="alert">{shown[field.id]}</span>}
      </span>
    </div>
  );
  const dirty = !!session && isDirty(session);
  const saving = session?.phase === 'saving';
  const save = async () => {
    if (isNew) {
      const saved = await editing.saveNew(kind);
      if ('id' in saved) onSelect({ kind, id: saved.id });
    } else await editing.save(kind, id);
  };

  return (
    <section className="panel record" aria-label="Record">
      <h2 className="panel-title">{rowLabel(world, kind, doc)} · record</h2>
      <div className="record-fields">
        {plain.map((field) => row(field))}
        {kind === 'show' && (
          <>
            <div className="field wide">
              <span className="field-label">Crew</span>
              <span className="field-body">
                <CrewEditor doc={doc} onChange={(next) => editing.setValue(kind, base, ['crew'], next)} />
                <LockMark kind={kind} id={id} field="crew" label="Crew" />
              </span>
            </div>
            <div className="field">
              <span className="field-label">Rundown</span>
              <span className="field-body faint">{Array.isArray(doc.rundown) ? doc.rundown.length : 0} cues · <a href={SHOW_PAGE_HREF}>edit it on the show page</a></span>
            </div>
          </>
        )}
        {statFields.length > 0 && <div className="stat-grid">{statFields.map((field) => row(field, 'field stat'))}</div>}
      </div>
      <p className="record-id faint mono">{isNew ? 'new row' : id}</p>
      {isNew && Object.keys(problems).length > 0 && <p className="faint">Still needed: {Object.keys(problems).map((fieldId) => fields.find((each) => each.id === fieldId)?.label ?? fieldId).join(', ')}</p>}
      {session?.error && session.phase !== 'conflict' && <p role="alert" className="remove">{session.error}</p>}
      {deleteError && <p role="alert" className="remove">{deleteError}</p>}
      <div className="actions">
        <Button className="button primary" isDisabled={!dirty || saving || session?.phase === 'conflict' || Object.keys(problems).length > 0} onPress={() => void save()}>{isNew ? 'Create' : 'Save'}</Button>
        <Button className="button" isDisabled={!session || saving} onPress={() => { editing.discard(kind, id); if (isNew) onSelect(null); }}>Discard</Button>
        {!isNew && DELETABLE.has(kind) && (
          <DialogTrigger>
            <Button className="button danger">Delete</Button>
            <Popover className="popover" placement="bottom start">
              <Dialog className="confirm" aria-label="Confirm delete">
                {({ close }) => (
                  <>
                    <span>Delete {rowLabel(world, kind, doc)}? This cannot be undone.</span>
                    <Button className="button danger" onPress={async () => { const failed = await editing.remove(kind, id); setDeleteError(failed); close(); if (!failed) onSelect(null); }}>Delete</Button>
                    <Button className="button" onPress={close}>Cancel</Button>
                  </>
                )}
              </Dialog>
            </Popover>
          </DialogTrigger>
        )}
        {session && <span className="faint basis">{saving ? 'Saving…' : `Editing from revision ${session.basis}`}</span>}
      </div>
    </section>
  );
}
