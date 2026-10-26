import { describe, expect, test } from 'bun:test';
import { HEADSHOT_KEY, headshotKey, headshotUrl } from './headshots';

describe('headshots', () => {
  test('the URL is the server route over the bucket key', () => {
    expect(headshotKey('2182', 'mbb', '23')).toBe('2182/mbb/23.png');
    expect(String(headshotUrl('2182', 'mbb', '23'))).toBe('/headshots/2182/mbb/23.png');
  });
  test('jerseys 0 and 00 are different keys, and every key it makes passes the server check', () => {
    expect(headshotKey('2182', 'mbb', '0')).not.toBe(headshotKey('2182', 'mbb', '00'));
    expect(HEADSHOT_KEY.test(headshotKey('213', 'wbb', '00'))).toBe(true);
  });
});
