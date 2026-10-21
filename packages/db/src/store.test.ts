import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  basketball, type EditBatch, GameId, type ImportEdit, Player, Revision, School, Season, Staff, Talent, Team, TeamSeason,
} from '@dtv/domain';
import {
  commitEdits, commitLive, commitShowState, type Db, loadJournal, loadLive, loadShowState, loadSnapshot, migrate, openDb,
} from './index';

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dtv-store-'));
  db = openDb(join(dir, 'dtv.sqlite'));
  migrate(db, { backupDir: join(dir, 'backups') });
});
afterEach(() => {
  db.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const sju = School.parse({ id: 'saint-josephs', name: "Saint Joseph's", shortName: "Saint Joseph's", mascot: 'Hawks', abbreviation: 'JOES', primaryColor: '#c2071b', secondaryColor: '#101010', espnId: '2603' });
const drexel = School.parse({ id: 'drexel', name: 'Drexel', shortName: 'Drexel', mascot: 'Dragons', abbreviation: 'DREX', primaryColor: '#07294d', secondaryColor: '#ffc600', espnId: '2182' });
const season = Season.parse({ id: '2026-27', name: '2026-27' });
const drexelMbb = Team.parse({ id: 'drexel-mbb', schoolId: 'drexel', program: 'mbb' });
const reed = Player.parse({ id: 'drexel-mbb@2026-27/reed-josh', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'Josh', lastName: 'Reed', jersey: '5' });
const spiker = Staff.parse({ id: 'drexel-mbb@2026-27/spiker-zach', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'Zach', lastName: 'Spiker', title: 'Head Coach' });
const drexelSeason = TeamSeason.parse({ id: 'drexel-mbb@2026-27', teamId: 'drexel-mbb', seasonId: '2026-27' });

const BASE: ImportEdit[] = [
  { op: 'put', kind: 'season', value: season },
  { op: 'put', kind: 'school', value: drexel },
  { op: 'put', kind: 'school', value: sju },
  { op: 'put', kind: 'team', value: drexelMbb },
  { op: 'put', kind: 'teamSeason', value: drexelSeason },
  { op: 'put', kind: 'player', value: reed },
  { op: 'put', kind: 'staff', value: spiker },
];

const AT = 1_700_000_000_000;
const commit = (batch: EditBatch, by: { readonly actor: string; readonly at: number } = { actor: 'test', at: AT }) => commitEdits(db, { ...by, batch });
const imported = (...edits: ImportEdit[]): EditBatch => ({ origin: 'import', edits });
const revision = () => loadSnapshot(db).revision;
const manual = (edits: Extract<EditBatch, { origin: 'manual' }>['edits'], basis = revision()): EditBatch => ({ origin: 'manual', basis, edits });
const journalRows = () => db.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM journal').get()!.n;
const school = (id: string) => loadSnapshot(db).entities.school.find((row) => row.id === id);
const ok = (result: ReturnType<typeof commit>) => {
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`);
  return result;
};

describe('commitEdits', () => {
  test('a batch is one journal row, and repeating it changes nothing and writes none', () => {
    expect(ok(commit(imported(...BASE)))).toMatchObject({ revision: 1, inserted: 7, updated: 0, deleted: 0, skipped: [] });
    expect(journalRows()).toBe(1);
    expect(ok(commit(imported(...BASE)))).toEqual({ ok: true, revision: Revision.parse(1), inserted: 0, updated: 0, deleted: 0, skipped: [] });
    expect(journalRows()).toBe(1);
  });

  test('loadSnapshot reads every document back, parsed', () => {
    ok(commit(imported(...BASE)));
    const snapshot = loadSnapshot(db);
    expect(snapshot.revision).toBe(Revision.parse(1));
    expect(snapshot.entities.player).toEqual([reed]);
    expect(snapshot.entities.school).toEqual([drexel, sju]);
    expect(snapshot.locks.school).toEqual({});
  });

  test('a batch may put a team before its school, because foreign keys are deferred', () => {
    ok(commit(imported({ op: 'put', kind: 'team', value: drexelMbb }, { op: 'put', kind: 'school', value: drexel })));
    expect(loadSnapshot(db).entities.team).toEqual([drexelMbb]);
  });
});

describe('field locks', () => {
  beforeEach(() => {
    ok(commit(imported(...BASE)));
  });

  test('a manual edit locks the fields it changed, recording who committed it and when', () => {
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, abbreviation: 'SJU' } }]), { actor: 'alex', at: AT }));
    expect(school('saint-josephs')?.abbreviation).toBe('SJU');
    expect(loadSnapshot(db).locks.school).toEqual({ 'saint-josephs': [{ field: 'abbreviation', actor: 'alex', at: AT }] });
  });

  test('a second manual edit by someone else takes the lock over', () => {
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, abbreviation: 'SJU', mascot: 'Hawk' } }]), { actor: 'alex', at: AT }));
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, abbreviation: 'SJ', mascot: 'Hawk' } }]), { actor: 'sam', at: AT + 60_000 }));
    expect(loadSnapshot(db).locks.school).toEqual({
      'saint-josephs': [
        { field: 'abbreviation', actor: 'sam', at: AT + 60_000 },
        { field: 'mascot', actor: 'alex', at: AT },
      ],
    });
  });

  test('a later import skips the locked fields, reports them, and still updates the others', () => {
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, abbreviation: 'SJU' } }])));
    const result = ok(commit(imported({ op: 'put', kind: 'school', value: { ...sju, mascot: 'Hawks!' } })));
    expect(result.skipped).toEqual([{ kind: 'school', id: 'saint-josephs', fields: ['abbreviation'] }]);
    expect(result.updated).toBe(1);
    expect(school('saint-josephs')).toMatchObject({ abbreviation: 'SJU', mascot: 'Hawks!' });
  });

  test('unlocking lets the next import update the field', () => {
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, abbreviation: 'SJU' } }])));
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, abbreviation: 'SJU' }, unlock: ['abbreviation'] }])));
    expect(loadSnapshot(db).locks.school).toEqual({});
    const result = ok(commit(imported({ op: 'put', kind: 'school', value: sju })));
    expect(result).toMatchObject({ updated: 1, skipped: [] });
    expect(school('saint-josephs')?.abbreviation).toBe('JOES');
  });

  test('keep leaves an existing row alone and writes no journal row', () => {
    const before = journalRows();
    const result = ok(commit(imported({ op: 'put', kind: 'school', value: { ...sju, mascot: 'Hawk' }, onExisting: 'keep' })));
    expect(result).toMatchObject({ inserted: 0, updated: 0 });
    expect(school('saint-josephs')?.mascot).toBe('Hawks');
    expect(journalRows()).toBe(before);
  });

  test('keep still inserts a missing row', () => {
    const talent = Talent.parse({ id: 'rob-brooks', firstName: 'Rob', lastName: 'Brooks', role: 'Play-by-Play' });
    expect(ok(commit(imported({ op: 'put', kind: 'talent', value: talent, onExisting: 'keep' }))).inserted).toBe(1);
  });
});

describe('basis', () => {
  beforeEach(() => {
    ok(commit(imported(...BASE)));
  });

  test('a stale basis fails the whole batch with nothing written', () => {
    const read = revision();
    ok(commit(manual([{ op: 'put', kind: 'school', value: { ...sju, mascot: 'Hawk' } }], read)));
    const journal = journalRows();
    const talent = Talent.parse({ id: 'rob-brooks', firstName: 'Rob', lastName: 'Brooks', role: 'Play-by-Play' });
    const result = commit(manual([{ op: 'put', kind: 'talent', value: talent }, { op: 'put', kind: 'school', value: { ...sju, mascot: 'Hawks 2' } }], read));
    expect(result).toMatchObject({ ok: false, reason: 'conflict' });
    expect(loadSnapshot(db).entities.talent).toEqual([]);
    expect(school('saint-josephs')?.mascot).toBe('Hawk');
    expect(journalRows()).toBe(journal);
  });

  test('a delete of a row written after the basis is a conflict too', () => {
    const read = revision();
    ok(commit(manual([{ op: 'put', kind: 'player', value: { ...reed, jersey: '4' } }], read)));
    expect(commit(manual([{ op: 'delete', kind: 'player', id: reed.id }], read))).toMatchObject({ ok: false, reason: 'conflict' });
  });

  test('a put of a row deleted after the basis is a conflict, and does not bring it back', () => {
    const read = revision();
    ok(commit(manual([{ op: 'delete', kind: 'player', id: reed.id }], read)));
    expect(commit(manual([{ op: 'put', kind: 'player', value: { ...reed, firstName: 'Joshua' } }], read))).toMatchObject({
      ok: false,
      reason: 'conflict',
      detail: expect.stringContaining(`player ${reed.id} was deleted at revision`),
    });
    expect(loadSnapshot(db).entities.player).toEqual([]);
    expect(ok(commit(manual([{ op: 'put', kind: 'player', value: reed }]))).inserted).toBe(1);
  });

  test('a batch that deletes a row and puts it again lands', () => {
    expect(ok(commit(manual([{ op: 'delete', kind: 'player', id: reed.id }, { op: 'put', kind: 'player', value: reed }])))).toMatchObject({ inserted: 1, deleted: 1 });
  });

  test('a batch that read the latest revision lands, even when it writes one row twice', () => {
    const result = ok(commit(manual([
      { op: 'put', kind: 'school', value: { ...sju, mascot: 'Hawk' } },
      { op: 'put', kind: 'school', value: { ...sju, mascot: 'Hawks!' } },
    ])));
    expect(result.updated).toBe(2);
    expect(school('saint-josephs')?.mascot).toBe('Hawks!');
  });
});

describe('integrity', () => {
  beforeEach(() => {
    ok(commit(imported(...BASE)));
  });

  test('a dangling reference fails as invalid-reference, naming the row, and writes nothing', () => {
    const journal = journalRows();
    const result = commit(imported({ op: 'put', kind: 'team', value: Team.parse({ id: 'nowhere-mbb', schoolId: 'nowhere', program: 'mbb' }) }));
    expect(result).toEqual({ ok: false, reason: 'invalid-reference', detail: 'teams nowhere-mbb refers to a missing row of schools' });
    expect(loadSnapshot(db).entities.team).toEqual([drexelMbb]);
    expect(journalRows()).toBe(journal);
  });

  test('a repeated natural key fails as duplicate', () => {
    const result = commit(imported({ op: 'put', kind: 'team', value: Team.parse({ id: 'drexel-dragons-mbb', schoolId: 'drexel', program: 'mbb' }) }));
    expect(result).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(loadSnapshot(db).entities.team).toEqual([drexelMbb]);
  });

  test('deleting a team cascades to its players, staff and season rows', () => {
    const result = ok(commit(imported({ op: 'delete', kind: 'team', id: drexelMbb.id })));
    expect(result.deleted).toBe(1);
    const { entities } = loadSnapshot(db);
    expect([entities.team, entities.player, entities.staff, entities.teamSeason]).toEqual([[], [], [], []]);
  });

  test('deleting a school its teams still name is refused', () => {
    expect(commit(imported({ op: 'delete', kind: 'school', id: drexel.id }))).toMatchObject({ ok: false, reason: 'invalid-reference' });
    expect(school('drexel')).toEqual(drexel);
  });

  test('deleting a missing row changes nothing', () => {
    expect(ok(commit(imported({ op: 'delete', kind: 'talent', id: Talent.shape.id.parse('nobody') })))).toMatchObject({ deleted: 0, revision: 1 });
  });

  test('a stored document that fails its schema stops the load and names its kind and id', () => {
    db.sqlite.run(`INSERT INTO venues (id, doc, seq) VALUES ('nowhere', '{"id":"nowhere"}', 1)`);
    expect(() => loadSnapshot(db)).toThrow('venue nowhere does not match its schema');
  });
});

describe('live and show state', () => {
  const gameId = GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
  const live = { ...basketball.initialBasketball(gameId, 'mbb'), score: { away: 68, home: 72 } };

  beforeEach(() => {
    const sjuMbb = Team.parse({ id: 'saint-josephs-mbb', schoolId: 'saint-josephs', program: 'mbb' });
    const game = { id: gameId, seasonId: season.id, program: 'mbb', awayTeamId: sjuMbb.id, homeTeamId: drexelMbb.id, venueId: null, startsAt: '2026-11-08T19:00:00-05:00', conferenceGame: false, title: null } as const;
    ok(commit(imported(...BASE, { op: 'put', kind: 'team', value: sjuMbb }, { op: 'put', kind: 'game', value: game })));
  });

  test('the batch that inserts a game gives it its sport’s initial live state, and deleting the game deletes it', () => {
    expect(loadLive(db).get(gameId)).toEqual(basketball.initialBasketball(gameId, 'mbb'));
    ok(commit(manual([{ op: 'delete', kind: 'game', id: gameId }])));
    expect(loadLive(db).has(gameId)).toBe(false);
  });

  test('live state round-trips and its commits do not move the World revision', () => {
    const before = revision();
    const first = commitLive(db, { actor: 'operator', at: 1, live, payload: { commands: [] } });
    commitLive(db, { actor: 'operator', at: 2, live: { ...live, score: { away: 68, home: 74 } }, payload: {} });
    expect(first).toBeGreaterThan(before);
    expect(loadLive(db).get(gameId)?.score).toEqual({ away: 68, home: 74 });
    expect(revision()).toBe(before);
  });

  test('live state of a missing game is refused', () => {
    expect(() => commitLive(db, { actor: 'operator', at: 1, live: { ...live, gameId: GameId.parse('2026-27/2026-11-09/x.at.y') }, payload: {} })).toThrow('FOREIGN KEY');
  });

  test('show state round-trips and is empty until written', () => {
    expect(loadShowState(db)).toBeNull();
    commitShowState(db, { actor: 'operator', at: 1, state: { program: { bug: null } }, payload: { type: 'clearAll' } });
    expect(loadShowState(db)).toEqual({ program: { bug: null } });
  });

  test('loadJournal returns the newest rows of one kind, oldest first', () => {
    const show = (n: number) => commitShowState(db, { actor: 'alex', at: n, state: {}, payload: { n } });
    const [one, , three, four] = [show(1), show(2), show(3), show(4)];
    commitLive(db, { actor: 'feed', at: 5, live, payload: { live: true } });
    expect(loadJournal(db, { kind: 'show', limit: 2 })).toEqual([
      { seq: three, at: 3, actor: 'alex', payload: { n: 3 } },
      { seq: four, at: 4, actor: 'alex', payload: { n: 4 } },
    ]);
    expect(loadJournal(db, { kind: 'show', limit: 10 }).map((row) => row.seq)[0]).toBe(one);
  });
});
