import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { EspnTeam, espnEdits, putValues, SeasonId } from '../index';

const TEAMS_JSON = join(import.meta.dir, '../../../../data/seed/teams.json');
const records = EspnTeam.array().parse(await Bun.file(TEAMS_JSON).json());
const season = SeasonId.parse('2026-27');
const { edits, warnings } = espnEdits(records, { season, programs: ['mbb', 'wbb'] });

const warned = (code: string) => warnings.filter((warning) => warning.code === code);

describe('espnEdits on the vendored teams.json', () => {
  test('one school per record, and a team and season row per program', () => {
    expect(records).toHaveLength(361);
    expect(putValues(edits, 'conference')).toHaveLength(34);
    expect(putValues(edits, 'school')).toHaveLength(361);
    expect(putValues(edits, 'team')).toHaveLength(722);
    expect(putValues(edits, 'teamSeason')).toHaveLength(722);
  });

  test('ids and ESPN ids are unique, so the natural-key indexes accept the batch', () => {
    const unique = (list: readonly (string | null)[]) => new Set(list).size === list.length;
    expect(unique(putValues(edits, 'school').map((school) => school.id))).toBe(true);
    expect(unique(putValues(edits, 'school').map((school) => school.espnId))).toBe(true);
    expect(unique(putValues(edits, 'conference').flatMap((conference) => (conference.espnId ? [conference.espnId] : [])))).toBe(true);
  });

  test('conference_id 7 names two conferences', () => {
    expect(warned('conference-id-shared').map((warning) => warning.subjects)).toEqual([['Big Ten', 'EIWA']]);
    const eiwa = putValues(edits, 'conference').find((conference) => conference.shortName === 'EIWA');
    expect(eiwa?.espnId).toBeNull();
  });

  test('conference_id 10 carries two names for the CAA', () => {
    const [caa, ...others] = warned('conference-names');
    expect(others).toEqual([]);
    expect(caa?.subjects).toHaveLength(2);
    expect(caa?.message).toStartWith('CAA ');
  });

  test('12 logo files are shared by 31 schools', () => {
    const shared = warned('logo-shared');
    expect(shared).toHaveLength(12);
    expect(shared.flatMap((warning) => warning.subjects)).toHaveLength(31);
  });

  test('35 records lack a valid alternate colour and 38 lack a logo; every primary colour is valid', () => {
    expect(warned('no-alternate-color').flatMap((warning) => warning.subjects)).toHaveLength(35);
    expect(warned('no-logo').flatMap((warning) => warning.subjects)).toHaveLength(38);
    expect(warned('no-color')).toEqual([]);
  });

  test("Drexel's record becomes its school, a team per program, and a season row in the CAA", () => {
    expect<unknown>(putValues(edits, 'school').find((school) => school.id === 'drexel')).toEqual({
      id: 'drexel',
      name: 'Drexel',
      shortName: 'Drexel',
      mascot: 'Dragons',
      abbreviation: 'DREX',
      primaryColor: '#07294d',
      secondaryColor: '#ffc600',
      logo: 'https://images.dragonstv.io/logos/DREXEL.PNG',
      website: 'drexeldragons.com',
      espnId: '2182',
    });
    expect<string[]>(putValues(edits, 'team').filter((team) => team.schoolId === 'drexel').map((team) => team.id)).toEqual(['drexel-mbb', 'drexel-wbb']);
    expect<unknown>(putValues(edits, 'teamSeason').find((row) => row.id === 'drexel-wbb@2026-27')?.conferenceId).toBe('caa');
  });

  test('a school with no alternate colour gets the fallback, and one with no logo gets none', () => {
    const hampton = putValues(edits, 'school').find((school) => school.id === 'hampton');
    expect<unknown>(hampton?.secondaryColor).toBe('#ffffff');
    const noLogo = records.find((record) => !record.logo_name)!;
    expect(putValues(edits, 'school').find((school) => school.espnId === String(noLogo.team_id))?.logo).toBeNull();
  });

  test('the same file gives the same edits', () => {
    expect(espnEdits(records, { season, programs: ['mbb', 'wbb'] }).edits).toEqual(edits);
  });
});
