import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup, type Db, loadSnapshot, migrate, openDb, renameField, TABLES, tableSql } from './index';

let dir: string;
let db: Db;
const backups = () => join(dir, 'backups');
const backupFiles = () => {
  try {
    return readdirSync(backups()).sort();
  } catch {
    return [];
  }
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dtv-db-'));
  db = openDb(join(dir, 'dtv.sqlite'));
});
afterEach(() => {
  db.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const insert = (table: string, doc: object, seq = 1, locked: unknown[] = []) =>
  db.sqlite.run(`INSERT INTO "${table}" (id, doc, seq, locked) VALUES (?, ?, ?, ?)`, ['id' in doc ? String(doc.id) : '', JSON.stringify(doc), seq, JSON.stringify(locked)]);

const rows = (table: string) => db.sqlite.query(`SELECT id, doc, seq, locked FROM "${table}" ORDER BY id`).all();

const seedRoster = () => {
  insert('seasons', { id: '2026-27', name: '2026-27' });
  insert('schools', { id: 'drexel', name: 'Drexel', shortName: 'Drexel', mascot: 'Dragons', abbreviation: 'DREX', primaryColor: '#07294d', secondaryColor: '#ffc600', logo: null, website: null, espnId: '2182' });
  insert('teams', { id: 'drexel-mbb', schoolId: 'drexel', program: 'mbb', branding: {} });
  insert('players', { id: 'drexel-mbb@2026-27/reed-josh', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'Josh', lastName: 'Reed', jersey: '5', sourceKey: 'a' }, 4, [
    { field: 'hometown', actor: 'alex', at: 1 },
  ]);
  insert('players', { id: 'drexel-mbb@2026-27/hipps', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: '', lastName: 'Hipps', jersey: '0', sourceKey: null }, 7);
};

describe('migrate', () => {
  test('a new file gets every table, with no backup because there is nothing to lose', () => {
    expect(migrate(db, { backupDir: backups() })).toEqual({ created: TABLES.map((table) => table.table), rebuilt: [], docMigrations: [], backup: null });
    const stored = db.sqlite.query<{ name: string; sql: string }, []>(`SELECT name, sql FROM sqlite_schema WHERE type = 'table'`).all();
    for (const table of TABLES) expect(stored.find((row) => row.name === table.table)?.sql).toBe(table.create);
  });

  test('a second run rebuilds nothing and takes no backup', () => {
    migrate(db, { backupDir: backups() });
    seedRoster();
    expect(migrate(db, { backupDir: backups() })).toEqual({ created: [], rebuilt: [], docMigrations: [], backup: null });
    expect(backupFiles()).toEqual([]);
  });

  test('a table made by an older spec is rebuilt with its rows intact, after a backup', () => {
    migrate(db, { backupDir: backups() });
    const current = tableSql('player');
    const older = current.create.replace(", source_key TEXT GENERATED ALWAYS AS (doc ->> '$.sourceKey') STORED", '');
    expect(older).not.toBe(current.create);
    db.sqlite.run('DROP TABLE "players"');
    db.sqlite.run(older);
    seedRoster();
    const before = rows('players');

    const report = migrate(db, { backupDir: backups() });
    expect(report.rebuilt).toEqual(['players']);
    expect(report.backup).toStartWith(backups());
    expect(backupFiles()).toHaveLength(1);
    expect(rows('players')).toEqual(before);
    expect(db.sqlite.query(`SELECT sql FROM sqlite_schema WHERE name = 'players'`).get()).toEqual({ sql: current.create });
    expect(() => insert('players', { id: 'drexel-mbb@2026-27/other', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'X', lastName: 'Other', jersey: '9', sourceKey: 'a' })).toThrow(
      'UNIQUE constraint failed',
    );

    expect(migrate(db, { backupDir: backups() })).toEqual({ created: [], rebuilt: [], docMigrations: [], backup: null });
  });

  test('a document migration runs once, under user_version', () => {
    migrate(db, { backupDir: backups() });
    insert('venues', { id: 'daskalakis-athletic-center', title: 'Daskalakis Athletic Center', city: 'Philadelphia', state: 'PA' });
    const renameTitle = { version: 3, kind: 'venue', up: (doc: unknown) => (doc !== null && typeof doc === 'object' && 'title' in doc ? { ...doc, name: doc.title } : doc) } as const;

    expect(migrate(db, { backupDir: backups(), migrations: [renameTitle] }).docMigrations).toEqual([3]);
    expect(JSON.parse(String(rows('venues').map((row) => (row as { doc: string }).doc)[0]))).toEqual({
      id: 'daskalakis-athletic-center', name: 'Daskalakis Athletic Center', city: 'Philadelphia', state: 'PA',
    });
    expect(db.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 3 });
    expect(migrate(db, { backupDir: backups(), migrations: [renameTitle] })).toEqual({ created: [], rebuilt: [], docMigrations: [], backup: null });
  });

  test('a rename moves the field’s lock with it', () => {
    migrate(db, { backupDir: backups() });
    const lock = (field: string) => ({ field, actor: 'alex', at: 1 });
    insert('venues', { id: 'daskalakis-athletic-center', title: 'The DAC', city: 'Philadelphia', state: 'PA' }, 1, [lock('title'), lock('city')]);
    expect(migrate(db, { backupDir: backups(), migrations: [renameField(3, 'venue', 'title', 'name')] }).docMigrations).toEqual([3]);
    expect(rows('venues')).toEqual([
      {
        id: 'daskalakis-athletic-center',
        doc: JSON.stringify({ id: 'daskalakis-athletic-center', name: 'The DAC', city: 'Philadelphia', state: 'PA' }),
        seq: 1,
        locked: JSON.stringify([lock('name'), lock('city')]),
      },
    ]);
  });

  test('a rename of a lifted field rebuilds the table from the renamed documents', () => {
    migrate(db, { backupDir: backups() });
    const current = tableSql('player').create;
    db.sqlite.run('DROP TABLE "players"');
    db.sqlite.run(current.replace("'$.teamId'", "'$.team'"));
    insert('seasons', { id: '2026-27', name: '2026-27' });
    insert('schools', { id: 'drexel', name: 'Drexel', shortName: 'Drexel', mascot: 'Dragons', abbreviation: 'DREX', primaryColor: '#07294d', secondaryColor: '#ffc600', logo: null, website: null, espnId: '2182' });
    insert('teams', { id: 'drexel-mbb', schoolId: 'drexel', program: 'mbb', branding: {} });
    insert('players', { id: 'drexel-mbb@2026-27/reed-josh', team: 'drexel-mbb', seasonId: '2026-27', firstName: 'Josh', lastName: 'Reed', jersey: '5' }, 4, [
      { field: 'team', actor: 'alex', at: 1 },
    ]);

    const report = migrate(db, { backupDir: backups(), migrations: [renameField(3, 'player', 'team', 'teamId')] });
    expect(report).toMatchObject({ rebuilt: ['players'], docMigrations: [3] });
    expect(db.sqlite.query('SELECT team_id, seq, locked FROM players').all()).toEqual([
      { team_id: 'drexel-mbb', seq: 4, locked: JSON.stringify([{ field: 'teamId', actor: 'alex', at: 1 }]) },
    ]);
    expect(db.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 3 });
    expect(migrate(db, { backupDir: backups(), migrations: [renameField(3, 'player', 'team', 'teamId')] })).toMatchObject({ rebuilt: [], docMigrations: [] });
  });

  test('a document migration that produces an invalid document changes nothing', () => {
    migrate(db, { backupDir: backups() });
    insert('venues', { id: 'daskalakis-athletic-center', name: 'Daskalakis Athletic Center', city: 'Philadelphia', state: 'PA' });
    const before = rows('venues');
    const broken = { version: 3, kind: 'venue', up: () => ({ id: 'daskalakis-athletic-center' }) } as const;
    expect(() => migrate(db, { backupDir: backups(), migrations: [broken] })).toThrow();
    expect(rows('venues')).toEqual(before);
    expect(db.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 2 });
  });

  test('a file from before locks had authors gets each lock rewritten with no author, once', () => {
    migrate(db, { backupDir: backups() });
    seedRoster();
    db.sqlite.run(`UPDATE players SET locked = '["hometown","jersey"]' WHERE id = 'drexel-mbb@2026-27/reed-josh'`);
    db.sqlite.run('PRAGMA user_version = 0');

    expect(migrate(db, { backupDir: backups() })).toMatchObject({ rebuilt: [], docMigrations: [1, 2] });
    expect(loadSnapshot(db).locks.player).toEqual({
      'drexel-mbb@2026-27/reed-josh': [
        { field: 'hometown', actor: null, at: null },
        { field: 'jersey', actor: null, at: null },
      ],
    });
    expect(db.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 2 });
    expect(migrate(db, { backupDir: backups() })).toEqual({ created: [], rebuilt: [], docMigrations: [], backup: null });
  });

  test('a new file starts at the latest document migration without running any', () => {
    const migration = { version: 3, kind: 'venue', up: () => null } as const;
    expect(migrate(db, { backupDir: backups(), migrations: [migration] }).docMigrations).toEqual([]);
    expect(db.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 3 });
  });
});

describe('the show becomes its game’s broadcast', () => {
  const GAME = '2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb';
  const OTHER = '2026-27/2026-11-12/hofstra-mbb.at.drexel-mbb';
  const lock = (field: string) => ({ field, actor: 'gurleen', at: 1 });
  const cue = { id: 'starting-five', graphic: 'basketball-v2/starting-five', params: {}, overrides: {}, note: '' };

  /** A file as version 1 left it: the old shows table, show docs with a name and a game. */
  const versionOne = (shows: readonly { id: string; gameId: string | null }[]) => {
    migrate(db, { backupDir: backups() });
    seedRoster();
    insert('schools', { id: 'saint-josephs', name: "Saint Joseph's", shortName: "Saint Joseph's", mascot: 'Hawks', abbreviation: 'SJU', primaryColor: '#9e1b32', secondaryColor: '#000000', logo: null, website: null, espnId: '2603' });
    insert('teams', { id: 'saint-josephs-mbb', schoolId: 'saint-josephs', program: 'mbb', branding: {} });
    for (const id of [GAME, OTHER]) {
      insert('games', { id, seasonId: '2026-27', program: 'mbb', awayTeamId: 'saint-josephs-mbb', homeTeamId: 'drexel-mbb', startsAt: '2026-11-08T19:00:00-05:00' });
    }
    db.sqlite.run('DROP TABLE "shows"');
    db.sqlite.run(
      'CREATE TABLE "shows" (id TEXT PRIMARY KEY, doc TEXT NOT NULL CHECK (json_valid(doc)), seq INTEGER NOT NULL, ' +
        "locked TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(locked)), game_id TEXT GENERATED ALWAYS AS (doc ->> '$.gameId') STORED " +
        'REFERENCES "games" (id) DEFERRABLE INITIALLY DEFERRED) STRICT',
    );
    for (const show of shows) {
      insert('shows', { ...show, name: show.id, crew: [{ talentId: 'rob-brooks', role: null }], rundown: [cue] }, 9, [lock('name'), lock('gameId'), lock('rundown')]);
    }
    db.sqlite.run('PRAGMA user_version = 1');
  };
  const showState = () => JSON.parse(db.sqlite.query<{ doc: string }, []>('SELECT doc FROM show_state').get()!.doc);
  const writeShowState = (doc: object) => db.sqlite.run('INSERT INTO show_state (id, doc, seq) VALUES (1, ?, 3)', [JSON.stringify(doc)]);

  test('a show is keyed by its game, keeps its crew, rundown and rundown lock, and the active show becomes the active game', () => {
    versionOne([{ id: 'drexel-sju', gameId: GAME }]);
    writeShowState({ showId: 'drexel-sju', program: {}, previews: {} });

    expect(migrate(db, { backupDir: backups() })).toMatchObject({ rebuilt: ['shows'], docMigrations: [2] });
    expect(rows('shows')).toEqual([
      { id: GAME, doc: JSON.stringify({ id: GAME, crew: [{ talentId: 'rob-brooks', role: null }], rundown: [cue] }), seq: 9, locked: JSON.stringify([lock('rundown')]) },
    ]);
    expect(db.sqlite.query('SELECT sql FROM sqlite_schema WHERE name = ?').get('shows')).toEqual({ sql: tableSql('show').create });
    expect(showState()).toEqual({ gameId: GAME, program: {}, previews: {} });

    db.sqlite.run('DELETE FROM games WHERE id = ?', [GAME]);
    expect(rows('shows')).toEqual([]);
  });

  test('a show state with no active show names no game', () => {
    versionOne([{ id: 'drexel-sju', gameId: GAME }]);
    writeShowState({ showId: null, program: {}, previews: {} });
    migrate(db, { backupDir: backups() });
    expect(showState()).toEqual({ gameId: null, program: {}, previews: {} });
  });

  test('a show with no game refuses the migration, names the show, and changes nothing', () => {
    versionOne([{ id: 'drexel-sju', gameId: GAME }, { id: 'scrimmage', gameId: null }]);
    writeShowState({ showId: 'drexel-sju', program: {}, previews: {} });
    const before = rows('shows');
    expect(() => migrate(db, { backupDir: backups() })).toThrow("shows with no game cannot become a game's show: scrimmage");
    expect(rows('shows')).toEqual(before);
    expect(showState()).toEqual({ showId: 'drexel-sju', program: {}, previews: {} });
    expect(db.sqlite.query('PRAGMA user_version').get()).toEqual({ user_version: 1 });
  });

  test('two shows on one game refuse the migration and name both', () => {
    versionOne([{ id: 'drexel-sju', gameId: GAME }, { id: 'drexel-sju-2', gameId: GAME }, { id: 'hofstra', gameId: OTHER }]);
    const before = rows('shows');
    expect(() => migrate(db, { backupDir: backups() })).toThrow(`games with more than one show: ${GAME} (drexel-sju, drexel-sju-2)`);
    expect(rows('shows')).toEqual(before);
  });
});

describe('backup', () => {
  test('writes a readable copy and keeps the newest 30', () => {
    migrate(db, { backupDir: backups() });
    seedRoster();
    const files = Array.from({ length: 32 }, () => backup(db, backups(), 'manual'));
    expect(new Set(files).size).toBe(32);
    const kept = backupFiles();
    expect(kept).toHaveLength(30);
    expect(kept).toEqual(files.slice(2).map((file) => file.slice(backups().length + 1)));

    const copy = openDb(files.at(-1)!);
    expect(copy.sqlite.query('SELECT count(*) AS n FROM players').get()).toEqual({ n: 2 });
    copy.sqlite.close();
  });

  test('keeps the newest of each reason beyond the newest 30', () => {
    migrate(db, { backupDir: backups() });
    const premigrate = backup(db, backups(), 'pre-migrate');
    const shows = Array.from({ length: 31 }, () => backup(db, backups(), 'show'));
    expect(backupFiles()).toEqual([premigrate, ...shows.slice(1)].map((file) => file.slice(backups().length + 1)));
  });
});
