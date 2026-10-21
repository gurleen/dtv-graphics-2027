/**
 * The show page's key map, as one table: `keyAction` reads it, each button's hint reads it,
 * and the `?` list prints it, so the three cannot disagree. Keys run the same actions as the
 * buttons that show them. They are caught before any widget sees them, so Space takes even
 * when a button has focus, and they do nothing while focus is in a text field, a dialog or
 * an open list.
 */

import { sameJson, type Side } from '@dtv/domain';
import { useEffect, useRef } from 'react';

export type KeyAction =
  | { readonly type: 'take' }
  | { readonly type: 'cue' }
  | { readonly type: 'move'; readonly by: -1 | 1 }
  | { readonly type: 'next' }
  | { readonly type: 'clearPreview' }
  | { readonly type: 'clearLower' }
  | { readonly type: 'clearAll' }
  | { readonly type: 'free'; readonly index: number }
  | { readonly type: 'score'; readonly side: Side; readonly by: 1 | 2 | 3 | -1 }
  | { readonly type: 'clock' }
  | { readonly type: 'shotClock'; readonly seconds: 30 | 20 }
  | { readonly type: 'possession'; readonly side: Side }
  | { readonly type: 'keys' };

/** One key. `shift` absent matches with or without Shift. */
interface Binding {
  readonly code: string;
  readonly shift?: boolean;
  readonly label: string;
  readonly action: KeyAction;
}

/** One line of the key list: a key, or a run of keys that do one kind of thing. */
export interface KeyLine {
  readonly section: 'Show' | 'Game';
  readonly what: string;
  readonly bindings: readonly Binding[];
}

const letter = (code: string, action: KeyAction, shift = false): Binding => ({ code: `Key${code}`, shift, label: shift ? `⇧${code}` : code, action });

export const KEY_MAP: readonly KeyLine[] = [
  { section: 'Show', what: 'Take my preview', bindings: [{ code: 'Space', label: 'Space', action: { type: 'take' } }] },
  { section: 'Show', what: 'Cue the selected row to my preview', bindings: [{ code: 'Enter', label: '⏎', action: { type: 'cue' } }] },
  {
    section: 'Show',
    what: 'Move the rundown selection',
    bindings: [
      { code: 'ArrowUp', label: '↑', action: { type: 'move', by: -1 } },
      { code: 'ArrowDown', label: '↓', action: { type: 'move', by: 1 } },
    ],
  },
  { section: 'Show', what: 'Next on the stepped graphic on program', bindings: [{ code: 'KeyN', label: 'N', action: { type: 'next' } }] },
  { section: 'Show', what: 'Clear my preview', bindings: [{ code: 'Escape', shift: false, label: 'Esc', action: { type: 'clearPreview' } }] },
  { section: 'Show', what: 'Clear the program lower third', bindings: [{ code: 'Escape', shift: true, label: '⇧Esc', action: { type: 'clearLower' } }] },
  { section: 'Show', what: 'Clear All, held for 600 ms or pressed twice', bindings: [{ code: 'Backspace', shift: true, label: '⇧⌫', action: { type: 'clearAll' } }] },
  {
    section: 'Show',
    what: 'Air or clear the free-panel buttons, in order',
    bindings: Array.from({ length: 9 }, (_, index) => ({ code: `Digit${index + 1}`, label: String(index + 1), action: { type: 'free', index } as const })),
  },
  {
    section: 'Game',
    what: 'Away +1, +2, +3',
    bindings: [letter('Q', { type: 'score', side: 'away', by: 1 }), letter('W', { type: 'score', side: 'away', by: 2 }), letter('E', { type: 'score', side: 'away', by: 3 })],
  },
  {
    section: 'Game',
    what: 'Home +1, +2, +3',
    bindings: [letter('I', { type: 'score', side: 'home', by: 1 }), letter('O', { type: 'score', side: 'home', by: 2 }), letter('P', { type: 'score', side: 'home', by: 3 })],
  },
  { section: 'Game', what: 'Away −1, home −1', bindings: [letter('Q', { type: 'score', side: 'away', by: -1 }, true), letter('I', { type: 'score', side: 'home', by: -1 }, true)] },
  { section: 'Game', what: 'Start or stop the game clock', bindings: [letter('C', { type: 'clock' })] },
  { section: 'Game', what: 'Shot clock to 30, to 20', bindings: [letter('R', { type: 'shotClock', seconds: 30 }), letter('T', { type: 'shotClock', seconds: 20 })] },
  {
    section: 'Game',
    what: 'Possession to away, to home',
    bindings: [
      { code: 'BracketLeft', label: '[', action: { type: 'possession', side: 'away' } },
      { code: 'BracketRight', label: ']', action: { type: 'possession', side: 'home' } },
    ],
  },
  { section: 'Show', what: 'This list of keys', bindings: [{ code: 'Slash', shift: true, label: '?', action: { type: 'keys' } }] },
];

const BINDINGS = KEY_MAP.flatMap((line) => line.bindings);

export function keyAction(event: Pick<KeyboardEvent, 'code' | 'shiftKey'>): KeyAction | null {
  return BINDINGS.find((binding) => binding.code === event.code && (binding.shift === undefined || binding.shift === event.shiftKey))?.action ?? null;
}

/** The key that runs `action`, for its button's hint. */
export const keyLabel = (action: KeyAction): string | undefined => BINDINGS.find((binding) => sameJson(binding.action, action))?.label;

const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, [contenteditable="true"]';
const OVERLAY = '[role="dialog"], [role="listbox"], [role="menu"], .drag';

const ignored = (target: EventTarget | null) => target instanceof Element && (target.matches(TEXT_ENTRY) || target.closest(OVERLAY) !== null);

/** Runs `run` for each mapped key press, and `clearAllUp` when Clear All's keys are let go. */
export function useKeys(handlers: { readonly run: (action: KeyAction) => void; readonly clearAllUp: () => void; readonly paused: boolean }) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (latest.current.paused || event.metaKey || event.ctrlKey || event.altKey || ignored(event.target)) return;
      const action = keyAction(event);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat && action.type !== 'move') return;
      latest.current.run(action);
    };
    const up = (event: KeyboardEvent) => {
      // Letting go of either key of Shift+Backspace ends the hold, in whichever order they come up.
      if (event.key === 'Backspace' || event.key === 'Shift') latest.current.clearAllUp();
    };
    window.addEventListener('keydown', down, { capture: true });
    window.addEventListener('keyup', up, { capture: true });
    return () => {
      window.removeEventListener('keydown', down, { capture: true });
      window.removeEventListener('keyup', up, { capture: true });
    };
  }, []);
}
