import { expect, test } from 'bun:test';
import { KEY_MAP, keyAction } from './keys';

const press = (code: string, shiftKey = false) => keyAction({ code, shiftKey });

test('the show keys keep their meanings', () => {
  expect(press('Space')).toEqual({ type: 'take' });
  expect(press('Escape')).toEqual({ type: 'clearPreview' });
  expect(press('Escape', true)).toEqual({ type: 'clearLower' });
  expect(press('Backspace', true)).toEqual({ type: 'clearAll' });
  expect(press('Backspace')).toBeNull();
  expect(press('Digit5')).toEqual({ type: 'free', index: 4 });
  expect(press('KeyN', true)).toEqual({ type: 'next' });
  expect(press('Slash', true)).toEqual({ type: 'keys' });
});

test('the game is not controlled from the keyboard', () => {
  for (const code of ['KeyQ', 'KeyW', 'KeyE', 'KeyI', 'KeyO', 'KeyP', 'KeyC', 'KeyR', 'KeyT', 'BracketLeft', 'BracketRight']) {
    expect(press(code)).toBeNull();
    expect(press(code, true)).toBeNull();
  }
});

test('no two keys collide', () => {
  const bindings = KEY_MAP.flatMap((line) => line.bindings);
  for (const binding of bindings) {
    const shifts = binding.shift === undefined ? [false, true] : [binding.shift];
    for (const shiftKey of shifts) expect(keyAction({ code: binding.code, shiftKey })).toEqual(binding.action);
  }
});
