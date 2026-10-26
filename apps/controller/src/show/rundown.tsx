/**
 * The rundown: the show's cues in order, each with its tally and step dots and why it
 * cannot air. Rows reorder by drag and drop, which React Aria also runs from the keyboard:
 * Right from a row to its handle, Enter, Up or Down to the place, Enter.
 */

import { type CueId, sameJson } from '@dtv/domain';
import type { CueView, ShowView } from '@dtv/playout';
import { Button, GridList, GridListItem, useDragAndDrop } from 'react-aria-components';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';
import { stepsOf } from './actions';
import { cueIdOf, useRundownEdits } from './rundown-edits';
import { RundownCsv } from './rundown-csv';

export function Rundown(props: {
  readonly view: ShowView;
  readonly selected: CueId | null;
  readonly onSelect: (cue: CueId | null) => void;
  readonly onCue: (cue: CueView) => void;
  readonly onAdd: () => void;
  readonly onDragging: (dragging: boolean) => void;
}) {
  const { view } = props;
  const edits = useRundownEdits();
  const ids = view.rundown.map((cue) => cueIdOf(cue)!);
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onDragStart: () => props.onDragging(true),
    onDragEnd: () => props.onDragging(false),
    onReorder(event) {
      const moving = [...event.keys].map(String) as CueId[];
      const rest = ids.filter((id) => !moving.includes(id));
      const target = rest.indexOf(event.target.key as CueId);
      const before = event.target.dropPosition === 'before' ? rest[target]! : (rest[target + 1] ?? null);
      void edits?.move(moving, before);
    },
  });

  return (
    <section className="panel rundown" aria-label="Rundown">
      <header className="panel-header">
        <h2>
          Rundown <span className="muted">· ↑↓ select to preview</span>
        </h2>
        <div className="actions">
          <RundownCsv edits={edits} />
          <Button className="button small" onPress={props.onAdd} isDisabled={!edits}>
            Add cue
          </Button>
        </div>
      </header>
      {view.rundown.length === 0 ? (
        <p className="empty">No cues yet. Add one to build the show.</p>
      ) : (
        <GridList
          className="rundown-list"
          aria-label="Rundown cues"
          items={view.rundown.map((cue) => ({ id: cueIdOf(cue)!, cue }))}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={props.selected ? [props.selected] : []}
          onSelectionChange={(keys) => {
            const [key] = [...keys];
            props.onSelect(key === undefined ? null : (String(key) as CueId));
          }}
          onAction={(key) => {
            const cue = view.rundown.find((each) => cueIdOf(each) === key);
            if (cue) props.onCue(cue);
          }}
          dragAndDropHooks={dragAndDropHooks}
        >
          {({ id, cue }) => <Row id={id} index={ids.indexOf(id)} cue={cue} view={view} onRemove={() => void edits?.remove(id)} />}
        </GridList>
      )}
    </section>
  );
}

function Row(props: { readonly id: CueId; readonly index: number; readonly cue: CueView; readonly view: ShowView; readonly onRemove: () => void }) {
  const { registry } = useController();
  const { pending } = useCommands();
  const { cue, view } = props;
  const slot = cue.onProgram && cue.layer ? view.program[cue.layer] : undefined;
  const steps = slot ? stepsOf(registry, slot) : cue.steps ? { step: -1, count: cue.steps } : null;
  return (
    <GridListItem
      id={props.id}
      textValue={cue.label}
      className="cue-row"
      data-pgm={!!cue.onProgram || undefined}
      data-pvw={cue.inMyPreview || undefined}
      data-error={!!cue.error || undefined}
      data-pending={pending.some((command) => command.type === 'cue' && sameJson(command.ref, cue.ref)) || undefined}
    >
      <Button slot="drag" className="drag" aria-label={`Move ${cue.label}`}>
        ⋮⋮
      </Button>
      <span className="index">{props.index + 1}</span>
      <span className="cue-label">
        {cue.label}
        {cue.error && <span className="cue-error">{cue.error}</span>}
      </span>
      {cue.onProgram && <span className="tag pgm">PGM</span>}
      {cue.inMyPreview && <span className="tag pvw">PVW</span>}
      {steps && (
        <span className="dots" aria-label={steps.step >= 0 ? `Step ${steps.step + 1} of ${steps.count}` : `${steps.count} steps`}>
          {Array.from({ length: steps.count }, (_, step) => (
            <span key={step} className="dot" data-on={step <= steps.step || undefined} />
          ))}
        </span>
      )}
      <Button className="remove" aria-label={`Remove ${cue.label}`} onPress={props.onRemove}>
        ✕
      </Button>
    </GridListItem>
  );
}
