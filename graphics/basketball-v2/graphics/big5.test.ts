import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadSnapshot, migrate, openDb, seed } from '@dtv/db';
import { indexWorld, resolveTeam, SeasonId } from '@dtv/domain';
import { CHAMPIONS, DREXEL, LA_SALLE, PENN, PODS, podStandings, SAINT_JOSEPHS, SERIES, TEMPLE, VILLANOVA } from './big5';

test('a pod ranks by wins, then losses, and teams level on both share a rank', () => {
  expect(podStandings(PODS[0])).toEqual([
    { team: SAINT_JOSEPHS, rank: 1, wins: 1, losses: 0 },
    { team: DREXEL, rank: 2, wins: 0, losses: 0 },
    { team: PENN, rank: 3, wins: 0, losses: 1 },
  ]);
  expect(podStandings(PODS[1])).toEqual([
    { team: TEMPLE, rank: 1, wins: 1, losses: 0 },
    { team: VILLANOVA, rank: 1, wins: 1, losses: 0 },
    { team: LA_SALLE, rank: 3, wins: 0, losses: 2 },
  ]);
});

test('a result moves the table', () => {
  const [pod] = PODS;
  const played = { ...pod, games: [pod.games[0], { ...pod.games[1], score: { away: 60, home: 70 } }, pod.games[2]] as const };
  expect(podStandings(played).map((row) => [row.team, row.rank, row.wins, row.losses])).toEqual([
    [DREXEL, 1, 1, 0],
    [SAINT_JOSEPHS, 2, 1, 1],
    [PENN, 3, 0, 1],
  ]);
});

test('every team the table names is in the seed for 2026-27', async () => {
  const db = openDb(':memory:');
  migrate(db, { backupDir: '/dev/null' });
  await seed(db, { dir: join(import.meta.dir, '../../../data/seed') });
  const world = indexWorld(loadSnapshot(db));
  db.sqlite.close();
  const named = [...PODS.flatMap((pod) => pod.teams), ...CHAMPIONS.flatMap((row) => [row.champion, row.runnerUp]), SERIES.leader, SERIES.trailer, ...SERIES.meetings.flatMap((row) => [row.host, row.winner])];
  expect([...new Set(named)].filter((id) => !resolveTeam(world, id, SeasonId.parse('2026-27')))).toEqual([]);
});
