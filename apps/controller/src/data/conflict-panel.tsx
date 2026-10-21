import { useState } from 'react';
import { Button, Radio, RadioGroup } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import { fieldOf } from './fields';
import { locksOf } from './locks';
import { rowOf, showValue } from './rows';
import { type Chosen, defaultSide, disagreements } from './session';
import type { Target } from './types';

/**
 * Shown when the server refused a save because the row changed after the editor's basis.
 * The editor's draft is untouched; each field that differs shows theirs beside yours.
 */
export function ConflictPanel({ target }: { readonly target: Target | null }) {
  const { world } = useController();
  const editing = useEditing();
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Readonly<Record<string, Chosen>>>({});
  const session = target && editing.session(target.kind, target.id);
  if (!target || !world || !session || session.phase !== 'conflict') return null;

  const theirs = rowOf(world, target.kind, target.id);
  const found = theirs ? disagreements(session.original, session.draft, theirs) : [];
  const sideOf = (each: (typeof found)[number]): Chosen | null => chosen[each.id] ?? defaultSide(each);
  const who = theirs
    ? locksOf(world, target.kind, target.id).find((lock) => lock.actor && found.some((each) => each.theyChanged && each.path[0] === lock.field))?.actor
    : null;
  const label = (id: string) => fieldOf(target.kind, id)?.label ?? id;
  const done = () => {
    setPicking(false);
    setChosen({});
  };

  return (
    <section className="panel conflict" aria-label="Edit conflict">
      <h2 className="panel-title">Conflict · {who ? `${who} saved first` : 'someone saved first'}</h2>
      {!theirs ? (
        <p>This row was deleted after you started editing it.</p>
      ) : found.length === 0 ? (
        <p>The row changed after you started, but not in any field you see here. Saving again keeps your edit.</p>
      ) : (
        <table className="conflict-table">
          <thead>
            <tr><th>Field</th><th>Theirs</th><th>Yours</th>{picking && <th className="keep">Keep</th>}</tr>
          </thead>
          <tbody>
            {found.map((each) => (
              <tr key={each.id} data-field={each.id}>
                <td>{label(each.id)}</td>
                <td className="mono">{showValue(each.theirs)}</td>
                <td className="mono">{showValue(each.yours)}</td>
                {picking && (
                  <td className="keep">
                    <RadioGroup aria-label={`Keep for ${label(each.id)}`} orientation="vertical" value={sideOf(each) ?? ''} onChange={(value) => setChosen({ ...chosen, [each.id]: value as Chosen })} className="radios">
                      <Radio value="theirs" className="radio">Theirs</Radio>
                      <Radio value="yours" className="radio">Yours</Radio>
                    </RadioGroup>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {session.error && <p className="faint">{session.error}</p>}
      <div className="actions">
        <Button className="button" onPress={() => editing.discard(target.kind, target.id)}>{theirs ? 'Keep theirs' : 'Keep it deleted'}</Button>
        <Button className="button" onPress={() => void editing.resolve(target.kind, target.id, (each) => (each.youChanged ? 'yours' : 'theirs')).then(done)}>Use yours</Button>
        {theirs && found.length > 0 && !picking && <Button className="button" onPress={() => setPicking(true)}>Pick per field</Button>}
        {picking && (
          <Button className="button primary" isDisabled={found.some((each) => sideOf(each) === null)} onPress={() => void editing.resolve(target.kind, target.id, (each) => sideOf(each) ?? 'theirs').then(done)}>
            Save picks
          </Button>
        )}
      </div>
    </section>
  );
}
