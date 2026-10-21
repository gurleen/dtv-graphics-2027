/**
 * The show page's key map. Keys run the same actions as the buttons that show them. They
 * are caught before any widget sees them, so Space takes even when a button has focus, and
 * they do nothing while focus is in a text field, a dialog or an open list.
 */

import { useEffect, useRef } from 'react';

export type KeyAction =
  | { readonly type: 'take' }
  | { readonly type: 'cue' }
  | { readonly type: 'move'; readonly by: -1 | 1 }
  | { readonly type: 'next' }
  | { readonly type: 'clearPreview' }
  | { readonly type: 'clearLower' }
  | { readonly type: 'clearAll' }
  | { readonly type: 'free'; readonly index: number };

/** The key map: Space, Enter, Up, Down, N, Esc, Shift+Esc, 1 to 9, and Shift+Backspace held for Clear All. */
export function keyAction(event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): KeyAction | null {
  if (event.code === 'Space') return { type: 'take' };
  if (event.key === 'Enter') return { type: 'cue' };
  if (event.key === 'ArrowUp') return { type: 'move', by: -1 };
  if (event.key === 'ArrowDown') return { type: 'move', by: 1 };
  if (event.key === 'n' || event.key === 'N') return { type: 'next' };
  if (event.key === 'Escape') return event.shiftKey ? { type: 'clearLower' } : { type: 'clearPreview' };
  if (event.key === 'Backspace' && event.shiftKey) return { type: 'clearAll' };
  const digit = /^Digit([1-9])$/.exec(event.code);
  if (digit) return { type: 'free', index: Number(digit[1]) - 1 };
  return null;
}

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
