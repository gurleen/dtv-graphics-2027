/**
 * The show page (Show A): the free panel, what is on air by layer and the selected cue's
 * inspector on the left, the rundown in the middle, my preview, Take and
 * program on the right rail with StatCrew's plays for the game, and the game along the
 * bottom.
 */

import { type CueId, type GameId, resolveGame, sameJson } from '@dtv/domain';
import { type Bus, LAYERS, type Registry, type ShowCommand, type ShowView } from '@dtv/playout';
import './show.css';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';
import { useStream } from '../app/streams';
import { gameLabel } from '../data/rows';
import { type ShowActions, slotLabel, stepsOf, useShowActions } from './actions';
import { useGame } from './game';
import { AddCueDialog, Inspector } from './inspector';
import { KeyList } from './key-list';
import { type KeyAction, useKeys } from './keys';
import { Monitor } from './monitor';
import { Rundown } from './rundown';
import { cueIdOf } from './rundown-edits';
import { PlayList } from '../tools/plays';
import { ScoreBar } from './scorebar';

export function ShowPage() {
  const { show: view } = useController();
  if (!view) return <p className="loading">Connecting…</p>;
  if (!view.game) return <GamePicker />;
  return <Console view={view} game={view.game.id} />;
}

function GamePicker() {
  const { world } = useController();
  const { send } = useCommands();
  const games = [...(world?.all('game') ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return (
    <section className="panel picker-page show-portal" aria-label="Choose a game">
      <h2>No game is active</h2>
      <p className="muted">Activating a game empties every preview; program stays on air.</p>
      <ul className="show-list">
        {world && games.map((game) => (
          <li key={game.id}>
            <span>{gameLabel(world, game)}</span>
            <Button className="button primary" onPress={() => void send({ type: 'activate', game: game.id })}>
              Activate
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Console(props: { readonly view: ShowView; readonly game: GameId }) {
  const { view } = props;
  const { world } = useController();
  const { clearAll } = useCommands();
  const ids = view.rundown.map((cue) => cueIdOf(cue)!);
  const [chosen, setChosen] = useState<CueId | null>(null);
  const selectedId = chosen && ids.includes(chosen) ? chosen : (ids[0] ?? null);
  const selected = view.rundown.find((cue) => cueIdOf(cue) === selectedId);
  const actions = useShowActions(selected)!;
  // My preview follows the selection; Enter cues the selected row again after a take.
  useEffect(() => {
    if (selected) actions.preview(selected);
  }, [selectedId]);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [listingKeys, setListingKeys] = useState(false);

  const live = useGame(props.game);
  const game = world ? resolveGame(world, props.game) : undefined;

  const run = (action: KeyAction) => {
    switch (action.type) {
      case 'take':
        return actions.take();
      case 'cue':
        return selected && actions.cue(selected);
      case 'move': {
        const at = selectedId ? ids.indexOf(selectedId) : -1;
        const next = ids[Math.min(ids.length - 1, Math.max(0, at + action.by))];
        if (next) setChosen(next);
        return;
      }
      case 'next':
        return actions.next();
      case 'clearPreview':
        return actions.clearPreview();
      case 'clearLower':
        return actions.clearLayer('lower');
      case 'clearAll':
        return clearAll.down();
      case 'free': {
        const cue = view.free[action.index];
        return cue && actions.free(cue);
      }
      case 'keys':
        return setListingKeys(true);
    }
  };
  useKeys({ run, clearAllUp: clearAll.up, paused: adding || dragging || listingKeys });

  return (
    <div className="show-page">
      <FreePanel view={view} actions={actions} onKeys={() => setListingKeys(true)} />
      <OnAir view={view} actions={actions} />
      <Rundown view={view} selected={selectedId} onSelect={setChosen} onCue={actions.cue} onAdd={() => setAdding(true)} onDragging={setDragging} />
      <Inspector cue={selected} live={live} onCue={actions.cue} />
      <Rail view={view} actions={actions} />
      <ScoreBar game={game} live={live} />
      {listingKeys && <KeyList onClose={() => setListingKeys(false)} />}
      {adding && (
        <AddCueDialog
          at={selectedId ? ids.indexOf(selectedId) + 1 : ids.length}
          live={live}
          onClose={(added) => {
            setAdding(false);
            if (added) setChosen(added.id);
          }}
        />
      )}
    </div>
  );
}

function FreePanel(props: { readonly view: ShowView; readonly actions: ShowActions; readonly onKeys: () => void }) {
  const { pending } = useCommands();
  return (
    <section className="panel free" aria-label="Free panel">
      <header className="panel-header">
        <h2>
          Free panel <span className="muted">· air directly</span>
        </h2>
        <Button className="button small" onPress={props.onKeys}>
          Keys <kbd>?</kbd>
        </Button>
      </header>
      <div className="free-grid">
        {props.view.free.map((cue, index) => (
          <Button
            key={cue.graphic}
            className="free-button"
            data-pgm={!!cue.onProgram || undefined}
            data-error={!!cue.error || undefined}
            isPending={pending.some((command) => (command.type === 'air' && sameJson(command.ref, cue.ref)) || (command.type === 'clear' && command.slot === cue.onProgram))}
            onPress={() => props.actions.free(cue)}
          >
            <span className="free-label">{cue.label}</span>
            {cue.onProgram && <span className="tag pgm">PGM</span>}
            {index < 9 && <kbd>{index + 1}</kbd>}
            {cue.error && <span className="cue-error">{cue.error}</span>}
          </Button>
        ))}
      </div>
    </section>
  );
}

const LAYER_NAMES = { bug: 'Bug', lower: 'Lower', card: 'Card' } as const;

function OnAir(props: { readonly view: ShowView; readonly actions: ShowActions }) {
  const { registry } = useController();
  const { pending } = useCommands();
  const { view, actions } = props;
  return (
    <section className="panel on-air" aria-label="On air by layer">
      <h2>On air by layer</h2>
      <ul className="layers">
        {LAYERS.map((layer) => {
          const slot = view.program[layer];
          const steps = slot && stepsOf(registry, slot);
          return (
            <li key={layer} className="layer-row" data-layer={layer} data-pgm={!!slot || undefined}>
              <span className="layer-name">{LAYER_NAMES[layer]}</span>
              <span className="layer-slot">
                {slot ? slotLabel(view, registry, slot) : <span className="muted">empty</span>}
                {steps && (
                  <span className="muted">
                    {' '}
                    (step {steps.step + 1} of {steps.count})
                  </span>
                )}
              </span>
              <Button
                className="button small"
                isDisabled={!slot}
                isPending={pending.some((command) => (command.type === 'clear' && command.layer === layer) || command.type === 'clearAll')}
                onPress={() => actions.clearLayer(layer)}
              >
                Clear{layer === 'lower' && <kbd>⇧Esc</kbd>}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** StatCrew's plays, when its feed reads this show's game: a check on the box score, beside the monitors. */
function RailPlays({ game }: { readonly game: GameId | null }) {
  const { api } = useController();
  const feed = useStream((signal) => api.tools.statcrew.watch(undefined, { signal }), [api]);
  const ours = feed?.game === game;
  return <PlayList compact plays={ours ? feed.events : []} empty={!feed?.game ? 'StatCrew is not set up. Start it on the Tools page.' : ours ? 'No plays yet.' : 'StatCrew is reading another game.'} />;
}

const busLabel = (view: ShowView, registry: Registry, bus: Bus) =>
  LAYERS.flatMap((layer) => (bus[layer] ? [slotLabel(view, registry, bus[layer])] : [])).join(' + ');

function Rail(props: { readonly view: ShowView; readonly actions: ShowActions }) {
  const { operator, registry } = useController();
  const { problem, dismiss, pending } = useCommands();
  const { view, actions } = props;
  const waiting = (type: ShowCommand['type']) => pending.some((command) => command.type === type);
  const previewEmpty = Object.keys(view.preview).length === 0;
  return (
    <aside className="rail" aria-label="Monitors">
      <div className="rail-head">
        My preview <span className="tag pvw">PVW</span>
        <span className="caption">{busLabel(view, registry, view.preview)}</span>
      </div>
      <Monitor name="preview" bus={{ kind: 'preview', operator }} className="pvw" />
      <div className="take-row">
        <Button className="button take" isDisabled={previewEmpty} isPending={waiting('take')} onPress={actions.take}>
          Take <kbd>Space</kbd>
        </Button>
        <Button className="button" isPending={waiting('step')} onPress={actions.next}>
          Next <kbd>N</kbd>
        </Button>
        <Button className="button" isDisabled={previewEmpty} isPending={waiting('uncue')} onPress={actions.clearPreview}>
          Clear PVW <kbd>Esc</kbd>
        </Button>
      </div>
      <div className="problem-slot">
        {problem && (
          <div className="problem-strip" role="alert" key={problem.at}>
            <span>{problem.message}</span>
            <Button className="button small" aria-label="Dismiss" onPress={dismiss}>
              ✕
            </Button>
          </div>
        )}
      </div>
      <div className="rail-head">
        Program <span className="tag pgm">PGM</span>
        <span className="caption">{busLabel(view, registry, view.program)}</span>
      </div>
      <Monitor name="program" bus={{ kind: 'program' }} className="pgm" />
      <RailPlays game={view.game?.id ?? null} />
    </aside>
  );
}

