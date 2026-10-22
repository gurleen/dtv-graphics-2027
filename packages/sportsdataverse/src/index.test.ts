import { expect, test } from 'bun:test';
import { SeasonId } from '@dtv/domain';
import { fetchSportsdataverse } from './index';

const season = SeasonId.parse('2026-27');

test('a dataset not published yet is null, and its URL names the season by its end year', async () => {
  const asked: string[] = [];
  const notFound = (async (url: string) => {
    asked.push(url);
    return new Response('Not Found', { status: 404 });
  }) as unknown as typeof fetch;
  expect(await fetchSportsdataverse(notFound)('wbb', season)).toEqual({
    groups: null, schedule: null, teamBox: null, rosters: null, priorRosters: null, playerBox: null,
  });
  expect(asked).toEqual([
    'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/wbb_groups/wbb_team_group_seasons_2027.parquet',
    'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_womens_college_basketball_schedules/wbb_schedule_2027.parquet',
    'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_womens_college_basketball_team_boxscores/team_box_2027.parquet',
    'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_womens_college_basketball_rosters/rosters_2027.parquet',
    'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_womens_college_basketball_rosters/rosters_2026.parquet',
    'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_womens_college_basketball_player_boxscores/player_box_2027.parquet',
  ]);
});

test('any other failure fails the load', async () => {
  const unavailable = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch;
  await expect(fetchSportsdataverse(unavailable)('mbb', season)).rejects.toThrow('HTTP 503');
});
