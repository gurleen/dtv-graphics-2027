import { expect, test } from 'bun:test';
import { seriesHistoryCarousel } from './series-history-carousel';

const parse = (params: unknown) => seriesHistoryCarousel.params.safeParse(params);

test('a photo is a URL, a /path or blank, so one can be given for a later meeting alone', () => {
  expect(parse({ photos: ['', '', 'https://images.example/2020.jpg', '/assets/2016.jpg'] }).success).toBe(true);
  expect(parse({ photos: ['2020.jpg'] }).success).toBe(false);
});

test('there is a photo for at most each of the five meetings', () => {
  expect(parse({ photos: Array(5).fill('') }).success).toBe(true);
  expect(parse({ photos: Array(6).fill('') }).success).toBe(false);
});
