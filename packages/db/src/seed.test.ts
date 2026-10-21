import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  basketball, ConferenceId, GameId, indexWorld, parseRosterCsv, planRoster, resolveGame, SeasonId, TeamId,
} from '@dtv/domain';
import { commitEdits, type Db, loadLive, loadSnapshot, migrate, openDb, seed } from './index';

const SEED_DIR = join(import.meta.dir, '../../../data/seed');
const GAME = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dtv-seed-'));
  db = openDb(join(dir, 'dtv.sqlite'));
  migrate(db, { backupDir: join(dir, 'backups') });
});
afterEach(() => {
  db.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const journalRows = () => db.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM journal').get()!.n;
const world = () => indexWorld(loadSnapshot(db));

describe('seed', () => {
  test('fills both programs for every school, the fixtures and the rosters', async () => {
    const report = await seed(db, { dir: SEED_DIR, at: 1 });
    const counts = Object.fromEntries(Object.entries(loadSnapshot(db).entities).map(([kind, rows]) => [kind, rows.length]));
    expect(counts).toEqual({
      conference: 34, school: 361, team: 722, season: 2, teamSeason: 735, player: 10, playerStats: 1, staff: 1, talent: 3,
      sponsor: 5, sponsorship: 10, venue: 1, game: 1, show: 1,
    });
    expect(report).toMatchObject({ inserted: 1887, updated: 0, liveInserted: 1 });
  });

  test('a second run inserts and updates nothing and writes no journal row', async () => {
    await seed(db, { dir: SEED_DIR, at: 1 });
    const journal = journalRows();
    const again = await seed(db, { dir: SEED_DIR, at: 2 });
    expect(again).toMatchObject({ inserted: 0, updated: 0, liveInserted: 0 });
    expect(journalRows()).toBe(journal);
  });

  test('a second run leaves an edit made since alone', async () => {
    await seed(db, { dir: SEED_DIR, at: 1 });
    const drexel = world().all('school').find((school) => school.id === 'drexel')!;
    const edited = commitEdits(db, { actor: 'data-page', at: 2, batch: { origin: 'manual', basis: loadSnapshot(db).revision, edits: [{ op: 'put', kind: 'school', value: { ...drexel, mascot: 'Mario' } }] } });
    expect(edited.ok).toBe(true);
    await seed(db, { dir: SEED_DIR, at: 3 });
    expect(world().get('school', drexel.id)?.mascot).toBe('Mario');
  });

  test('a second run leaves a row a feed updated since alone', async () => {
    await seed(db, { dir: SEED_DIR, at: 1 });
    const drexel = world().teamSeason(TeamId.parse('drexel-mbb'), SeasonId.parse('2026-27'))!;
    const fed = commitEdits(db, { actor: 'statcrew', at: 2, batch: { origin: 'import', edits: [{ op: 'put', kind: 'teamSeason', value: { ...drexel, overall: { wins: 15, losses: 6 } } }] } });
    expect(fed.ok).toBe(true);
    await seed(db, { dir: SEED_DIR, at: 3 });
    expect(world().teamSeason(drexel.teamId, drexel.seasonId)?.overall).toEqual({ wins: 15, losses: 6 });
  });

  test('reports the teams.json defects and the conference the fixtures move Delaware to', async () => {
    const { warnings } = await seed(db, { dir: SEED_DIR, at: 1 });
    const codes = warnings.map((warning) => warning.code);
    expect(new Set(codes)).toEqual(new Set(['conference-id-shared', 'conference-names', 'logo-shared', 'no-alternate-color', 'no-logo', 'conference-changed']));
    expect(warnings.filter((warning) => warning.code === 'conference-changed').map((warning) => warning.subjects)).toEqual([
      ['delaware-mbb@2026-27'], ['delaware-wbb@2026-27'],
    ]);
  });

  test('planning a committed roster CSV again gives an empty plan', async () => {
    await seed(db, { dir: SEED_DIR, at: 1 });
    const files = readdirSync(join(SEED_DIR, 'rosters'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const [team, season] = file.replace(/\.csv$/, '').split('@');
      const parsed = parseRosterCsv(await Bun.file(join(SEED_DIR, 'rosters', file)).text());
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      const plan = planRoster(world(), { team: TeamId.parse(team), season: SeasonId.parse(season), rows: parsed.rows, prune: false });
      expect(plan).toEqual({ add: [], update: [], unchanged: parsed.rows.length, missing: [], edits: [] });
    }
  });

  test('the demo game resolves as the scenes show it', async () => {
    await seed(db, { dir: SEED_DIR, at: 1 });
    const view = resolveGame(world(), GAME);
    expect(view?.venue?.name).toBe('Daskalakis Athletic Center');
    expect([view?.sides.away.brand.abbreviation, view?.sides.home.brand.abbreviation]).toEqual(['SJU', 'DREX']);
    expect([view?.sides.away.conference?.shortName, view?.sides.home.conference?.name]).toEqual(['A10', 'Coastal Athletic Association']);
    expect(view?.sides.home.season).toMatchObject({ overall: { wins: 14, losses: 6 }, conference: { wins: 6, losses: 3 } });

    const live = loadLive(db).get(GAME);
    if (live?.sport !== 'basketball') throw new Error('no live state for the demo game');
    expect(live.score).toEqual({ away: 68, home: 72 });
    expect(basketball.statusLine('mbb', live, 0)).toBe('13:59 2nd Half');
    expect(basketball.formatShotClock(live.shotClock?.remainingMs ?? 0)).toBe('24');
    const roster = world().roster(TeamId.parse('drexel-mbb'), SeasonId.parse('2026-27'));
    expect(roster.map((player) => player.jersey)).toEqual(['0', '5', '6', '11', '23']);
    expect(roster.map((player) => player.id)).toEqual(expect.arrayContaining([...live.starters.home]));
  });

  test('the 2025-26 CAA table is the standings card, and 2026-27 no longer lists Delaware', async () => {
    await seed(db, { dir: SEED_DIR, at: 1 });
    const caa = ConferenceId.parse('caa');
    const table = world().standings(caa, SeasonId.parse('2025-26'), 'mbb');
    expect(table.map((row) => [row.rank, row.teamId, `${row.conference.wins}-${row.conference.losses}`, row.streak])).toEqual([
      [1, 'unc-wilmington-mbb', '15-3', 'L1'], [2, 'charleston-mbb', '14-4', 'L1'], [3, 'hofstra-mbb', '12-6', 'L1'],
      [4, 'monmouth-mbb', '11-7', 'L1'], [5, 'drexel-mbb', '10-8', 'L1'], [6, 'william-mary-mbb', '10-8', 'L1'],
      [7, 'towson-mbb', '9-9', 'L1'], [8, 'stony-brook-mbb', '9-9', 'L4'], [9, 'campbell-mbb', '8-10', 'L1'],
      [10, 'hampton-mbb', '7-11', 'L2'], [11, 'elon-mbb', '6-12', 'L5'], [12, 'north-carolina-a-t-mbb', '4-14', 'L4'],
      [13, 'northeastern-mbb', '2-16', 'L1'],
    ]);
    const current = world().standings(caa, SeasonId.parse('2026-27'), 'mbb').map((row) => row.teamId);
    expect(current).toHaveLength(13);
    expect<string[]>(current).not.toContain('delaware-mbb');
  });

  test('an inconsistent source stops the seed before anything is written', async () => {
    const copy = join(dir, 'seed');
    cpSync(SEED_DIR, copy, { recursive: true });
    const fixtures = await Bun.file(join(copy, 'fixtures.json')).json();
    fixtures.entities.game[0].awayTeamId = 'saint-josephs-wbb';
    await Bun.write(join(copy, 'fixtures.json'), JSON.stringify(fixtures));
    await expect(seed(db, { dir: copy, at: 1 })).rejects.toThrow('plays wbb, not the game');
    expect(journalRows()).toBe(0);
  });
});
