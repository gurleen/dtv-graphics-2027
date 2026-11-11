import { expect, test } from 'bun:test';
import { slateTime } from './bars-slate';

const at = (iso: string) => Date.parse(iso);

test('the greeting turns from afternoon to evening at 17:00 Eastern', () => {
  expect(slateTime(at('2026-11-08T16:59:59-05:00'), 'pre')).toEqual({ clock: '04:59:59', period: 'PM ET', message: 'GOOD AFTERNOON FROM PHILADELPHIA' });
  expect(slateTime(at('2026-11-08T17:00:00-05:00'), 'pre')).toEqual({ clock: '05:00:00', period: 'PM ET', message: 'GOOD EVENING FROM PHILADELPHIA' });
});

test('the post-show greeting is good night at any hour', () => {
  expect(slateTime(at('2026-11-08T16:00:00-05:00'), 'post').message).toBe('GOOD NIGHT FROM PHILADELPHIA');
  expect(slateTime(at('2026-11-08T22:30:00-05:00'), 'post').message).toBe('GOOD NIGHT FROM PHILADELPHIA');
});

test('midnight and noon read as 12 AM and 12 PM', () => {
  expect(slateTime(at('2026-11-08T00:00:00-05:00'), 'pre')).toMatchObject({ clock: '12:00:00', period: 'AM ET' });
  expect(slateTime(at('2026-11-08T12:00:00-05:00'), 'pre')).toMatchObject({ clock: '12:00:00', period: 'PM ET' });
});

test('the clock follows New York across daylight saving, whatever the machine zone', () => {
  // 21:00 UTC is 5 PM in summer (EDT) but 4 PM in winter (EST).
  expect(slateTime(at('2026-07-01T21:00:00Z'), 'pre')).toMatchObject({ clock: '05:00:00', message: 'GOOD EVENING FROM PHILADELPHIA' });
  expect(slateTime(at('2026-12-01T21:00:00Z'), 'pre')).toMatchObject({ clock: '04:00:00', message: 'GOOD AFTERNOON FROM PHILADELPHIA' });
  // The clocks go back at 2 AM on 2026-11-01; the repeated hour is read as 1 AM twice.
  expect(slateTime(at('2026-11-01T05:59:59Z'), 'pre').clock).toBe('01:59:59');
  expect(slateTime(at('2026-11-01T06:00:00Z'), 'pre').clock).toBe('01:00:00');
});
