import { describe, expect, test } from 'bun:test';
import {
  emptySnapshot, indexWorld, parseRosterCsv, type Player, planRoster, putValues, type RosterRow, SeasonId, TeamId,
} from '../index';

const team = TeamId.parse('drexel-mbb');
const season = SeasonId.parse('2026-27');
const HEADER = 'jersey,first_name,last_name,position,class_year,redshirt,hometown,headshot,motion_headshot,source_key';

const parsed = (text: string): readonly RosterRow[] => {
  const result = parseRosterCsv(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.rows;
};

const worldOf = (players: readonly Player[], locks: Record<string, string[]> = {}) => {
  const empty = emptySnapshot();
  return indexWorld({ ...empty, entities: { ...empty.entities, player: players }, locks: { ...empty.locks, player: locks } });
};

const plan = (players: readonly Player[], csv: string, options: { prune?: boolean; locks?: Record<string, string[]> } = {}) =>
  planRoster(worldOf(players, options.locks), { team, season, rows: parsed(csv), prune: options.prune ?? false });

/** The world after committing a plan's puts, as the store would with no locks. */
const committed = (players: readonly Player[], edits: Parameters<typeof putValues>[0]) => {
  const byId = new Map(players.map((player) => [player.id, player]));
  for (const player of putValues(edits, 'player')) byId.set(player.id, player);
  return [...byId.values()];
};

const ROSTER = [
  HEADER,
  '5,Josh,Reed,G,JR,no,"Philadelphia, PA",,,',
  '0,,Hipps,G,,,,,,',
  '11,,De Laporterie,F,,,,,,',
].join('\n');

describe('parseRosterCsv', () => {
  test('reads our header, with quoted commas and unknown first names', () => {
    expect(parsed(ROSTER)).toEqual([
      { jersey: '5', firstName: 'Josh', lastName: 'Reed', position: 'G', classYear: 'JR', redshirt: false, hometown: 'Philadelphia, PA', headshot: null, motionHeadshot: null, sourceKey: null },
      { jersey: '0', firstName: '', lastName: 'Hipps', position: 'G', classYear: null, redshirt: null, hometown: null, headshot: null, motionHeadshot: null, sourceKey: null },
      { jersey: '11', firstName: '', lastName: 'De Laporterie', position: 'F', classYear: null, redshirt: null, hometown: null, headshot: null, motionHeadshot: null, sourceKey: null },
    ]);
  });

  test('reads a Sidearm-style header through the aliases', () => {
    const rows = parsed(
      '﻿No.,Name,Pos.,Cl.,Hometown,URL\r\n"#23","Luke De Laporterie",Guard/Forward,R-Jr.,"Toronto, Ont.",https://drexeldragons.com/roster/23\r\n00,Ron Smith Jr.,C,Gr.,,\r\n',
    );
    expect(rows.map((row) => [row.jersey, row.firstName, row.lastName, row.position, row.classYear, row.redshirt, row.hometown, row.sourceKey])).toEqual([
      ['23', 'Luke', 'De Laporterie', 'G/F', 'JR', true, 'Toronto, Ont.', 'https://drexeldragons.com/roster/23'],
      ['00', 'Ron', 'Smith Jr.', 'C', 'GR', false, null, null],
    ]);
  });

  test('a blank redshirt cell falls back to the class prefix, and to unknown with no class', () => {
    const rows = parsed('jersey,last_name,class_year,redshirt\n1,A,R-JR,\n2,B,JR,\n3,C,,\n4,D,SO,yes');
    expect(rows.map((row) => [row.classYear, row.redshirt])).toEqual([['JR', true], ['JR', false], [null, null], ['SO', true]]);
  });

  test('reports every bad row with its line, not only the first', () => {
    const result = parseRosterCsv([HEADER, '5,Josh,Reed,G,JR,,,,,', '5a,,Hipps,G,,,,,,', '3,Ed,,Wing,Senior Plus,maybe,,headshot.png,,', '"7","Multi', 'line",Name,F,FR,,,,,'].join('\n'));
    expect(result).toEqual({
      ok: false,
      errors: [
        { line: 3, message: 'jersey "5a" is not one or two digits' },
        {
          line: 4,
          message: 'no last name; unknown position "Wing"; unknown class "Senior Plus"; redshirt "maybe" is not yes or no; headshot "headshot.png" is not an http(s) URL or a /path',
        },
      ],
    });
  });

  test('a header without a jersey or a name column is refused at line 1', () => {
    expect(parseRosterCsv('first,pos\nJosh,G')).toEqual({ ok: false, errors: [{ line: 1, message: 'missing column jersey and last_name (or name)' }] });
  });
});

describe('planRoster', () => {
  test('a new file adds every row with deterministic ids', () => {
    const result = plan([], ROSTER);
    expect<string[]>(result.add.map((player) => player.id)).toEqual([
      'drexel-mbb@2026-27/reed-josh', 'drexel-mbb@2026-27/hipps', 'drexel-mbb@2026-27/de-laporterie',
    ]);
    expect(result.edits).toHaveLength(3);
    expect(result.add[0]).toMatchObject({ teamId: team, seasonId: season, jersey: '5', classYear: 'JR', redshirt: false, hometown: 'Philadelphia, PA' });
  });

  test('planning the same file again after a commit is empty', () => {
    const players = committed([], plan([], ROSTER).edits);
    expect(plan(players, ROSTER)).toEqual({ add: [], update: [], unchanged: 3, missing: [], edits: [] });
  });

  test('a row matches by jersey and last name, so a new first name updates the same player', () => {
    const players = committed([], plan([], ROSTER).edits);
    const result = plan(players, ROSTER.replace('0,,Hipps', '0,Kobe,Hipps'));
    expect(result.add).toEqual([]);
    expect(result.update.map(({ before, after }) => [before.id, before.firstName, after.firstName])).toEqual([['drexel-mbb@2026-27/hipps', '', 'Kobe']]);
  });

  test('a row matches by full name when the jersey changes, and by sourceKey before either', () => {
    const keyed = `${HEADER}\n5,Josh,Reed,G,JR,,,,,https://example.com/reed\n0,,Hipps,G,,,,,,`;
    const players = committed([], plan([], keyed).edits);
    const renumbered = plan(players, keyed.replace('0,,Hipps', '1,,Hipps'));
    expect(renumbered.update.map(({ after }) => [after.id, after.jersey])).toEqual([['drexel-mbb@2026-27/hipps', '1']]);
    const renamed = plan(players, keyed.replace('5,Josh,Reed', '9,Joshua,Reed-Smith'));
    expect(renamed.update.map(({ after }) => [after.id, after.firstName, after.jersey])).toEqual([['drexel-mbb@2026-27/reed-josh', 'Joshua', '9']]);
  });

  test('a row matches the player whose id it would get, so a file that still has a corrected name updates nothing', () => {
    const players = committed([], plan([], ROSTER).edits).map((player) => (player.lastName === 'Hipps' ? { ...player, lastName: 'Hipp' } : player));
    const result = plan(players, ROSTER, { locks: { 'drexel-mbb@2026-27/hipps': ['lastName'] } });
    expect(result).toEqual({ add: [], update: [], unchanged: 3, missing: [], edits: [] });
  });

  test('two players with one name match their own rows by id, in either file order', () => {
    const csv = `${HEADER}\n3,Chris,Lee,G,FR,,,,,\n4,Chris,Lee,F,SO,,,,,`;
    const players = committed([], plan([], csv).edits).map((player) => ({ ...player, lastName: 'Li' }));
    const swapped = [HEADER, ...csv.split('\n').slice(1).reverse()].join('\n');
    const locks = Object.fromEntries(players.map((player) => [player.id, ['lastName']]));
    expect(plan(players, swapped, { locks })).toMatchObject({ add: [], update: [], unchanged: 2 });
  });

  test('fields the file leaves blank keep their values', () => {
    const players = committed([], plan([], ROSTER).edits).map((player) =>
      player.lastName === 'Reed' ? { ...player, motionHeadshot: '/assets/motion/reed.mp4' as Player['motionHeadshot'], hometown: 'Philadelphia, PA' } : player,
    );
    expect(plan(players, ROSTER.replace('"Philadelphia, PA"', '')).update).toEqual([]);
  });

  test('a difference only in a field a person locked is no change', () => {
    const players = committed([], plan([], ROSTER).edits).map((player) => (player.lastName === 'Reed' ? { ...player, hometown: 'Phila.' } : player));
    expect(plan(players, ROSTER, { locks: { 'drexel-mbb@2026-27/reed-josh': ['hometown'] } }).update).toEqual([]);
    expect(plan(players, ROSTER).update).toHaveLength(1);
  });

  test('players missing from the file are reported, and deleted only with prune', () => {
    const players = committed([], plan([], ROSTER).edits);
    const shorter = ROSTER.split('\n').slice(0, 3).join('\n');
    expect<string[]>(plan(players, shorter).missing.map((player) => player.id)).toEqual(['drexel-mbb@2026-27/de-laporterie']);
    expect(plan(players, shorter).edits).toEqual([]);
    expect<unknown>(plan(players, shorter, { prune: true }).edits).toEqual([{ op: 'delete', kind: 'player', id: 'drexel-mbb@2026-27/de-laporterie' }]);
  });

  test('two rows with one name get distinct ids', () => {
    const result = plan([], `${HEADER}\n3,Chris,Lee,G,FR,,,,,\n4,Chris,Lee,F,SO,,,,,`);
    expect<string[]>(result.add.map((player) => player.id)).toEqual(['drexel-mbb@2026-27/lee-chris', 'drexel-mbb@2026-27/lee-chris-4']);
  });
});
