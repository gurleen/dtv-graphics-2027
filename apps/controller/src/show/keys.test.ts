import { expect, test } from 'bun:test';
import { KEY_MAP, keyAction, keyLabel } from './keys';

const press = (code: string, shiftKey = false) => keyAction({ code, shiftKey });

test('the game keys score, run the clocks and give possession', () => {
  expect(press('KeyQ')).toEqual({ type: 'score', side: 'away', by: 1 });
  expect(press('KeyE')).toEqual({ type: 'score', side: 'away', by: 3 });
  expect(press('KeyO')).toEqual({ type: 'score', side: 'home', by: 2 });
  expect(press('KeyQ', true)).toEqual({ type: 'score', side: 'away', by: -1 });
  expect(press('KeyI', true)).toEqual({ type: 'score', side: 'home', by: -1 });
  expect(press('KeyC')).toEqual({ type: 'clock' });
  expect(press('KeyR')).toEqual({ type: 'shotClock', seconds: 30 });
  expect(press('KeyT')).toEqual({ type: 'shotClock', seconds: 20 });
  expect(press('BracketLeft')).toEqual({ type: 'possession', side: 'away' });
  expect(press('BracketRight')).toEqual({ type: 'possession', side: 'home' });
  expect(press('Slash', true)).toEqual({ type: 'keys' });
});

test('the show keys keep their phase 4 meanings', () => {
  expect(press('Space')).toEqual({ type: 'take' });
  expect(press('Escape')).toEqual({ type: 'clearPreview' });
  expect(press('Escape', true)).toEqual({ type: 'clearLower' });
  expect(press('Backspace', true)).toEqual({ type: 'clearAll' });
  expect(press('Backspace')).toBeNull();
  expect(press('Digit5')).toEqual({ type: 'free', index: 4 });
  expect(press('KeyN', true)).toEqual({ type: 'next' });
  expect(press('KeyW', true)).toBeNull();
});

test('no two keys collide, and every action has one key to show on its button', () => {
  const bindings = KEY_MAP.flatMap((line) => line.bindings);
  for (const binding of bindings) {
    const shifts = binding.shift === undefined ? [false, true] : [binding.shift];
    for (const shiftKey of shifts) expect(keyAction({ code: binding.code, shiftKey })).toEqual(binding.action);
  }
  expect(keyLabel({ type: 'score', side: 'home', by: -1 })).toBe('⇧I');
  expect(keyLabel({ type: 'possession', side: 'away' })).toBe('[');
});
