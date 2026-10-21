import { describe, expect, test } from 'bun:test';
import { type EntityOf, indexWorld, emptySnapshot, type TeamId } from '@dtv/domain';
import { pinnedTeams, readRecent, searchTeams, teamEntries, touchRecent, writeRecent } from './teams';

const school = (id: string, name: string, shortName: string, mascot: string, abbreviation: string): EntityOf<'school'> =>
  ({ id, name, shortName, mascot, abbreviation, primaryColor: '#000000', secondaryColor: '#ffffff', logo: null, website: null, espnId: null }) as EntityOf<'school'>;
const team = (id: string, schoolId: string, program: 'mbb' | 'wbb') => ({ id, schoolId, program, branding: {} }) as EntityOf<'team'>;

const snapshot = emptySnapshot();
const world = indexWorld({
  ...snapshot,
  entities: {
    ...snapshot.entities,
    school: [school('drexel', 'Drexel Dragons', 'Drexel', 'Dragons', 'DREX'), school('saint-josephs', "Saint Joseph's Hawks", "Saint Joseph's", 'Hawks', 'SJU'), school('delaware', 'Delaware Blue Hens', 'Delaware', 'Blue Hens', 'DEL')],
    team: [team('drexel-mbb', 'drexel', 'mbb'), team('drexel-wbb', 'drexel', 'wbb'), team('saint-josephs-mbb', 'saint-josephs', 'mbb'), team('delaware-mbb', 'delaware', 'mbb')],
  },
});
const entries = teamEntries(world);

describe('team list', () => {
  test('lists every program of every school, by school name', () => {
    expect(entries.map((entry) => entry.label)).toEqual(['Delaware · MBB', 'Drexel · MBB', 'Drexel · WBB', "Saint Joseph's · MBB"]);
  });

  test('search matches name, mascot, abbreviation and program, and puts name prefixes first', () => {
    expect(searchTeams(entries, 'drex wbb', 10).map((entry) => entry.label)).toEqual(['Drexel · WBB']);
    expect(searchTeams(entries, 'hawks', 10).map((entry) => entry.label)).toEqual(["Saint Joseph's · MBB"]);
    expect(searchTeams(entries, 'del', 10).map((entry) => entry.label)).toEqual(['Delaware · MBB']);
    expect(searchTeams(entries, '', 10)).toEqual([]);
    expect(searchTeams(entries, 'mbb', 2)).toHaveLength(2);
  });

  test("pins the show's teams first, then recents without repeating either", () => {
    const ids = (list: readonly { team: { id: string } }[]) => list.map((entry) => entry.team.id);
    const pinned = pinnedTeams(entries, ['drexel-mbb', 'saint-josephs-mbb'] as TeamId[], ['delaware-mbb', 'drexel-mbb', 'gone'] as TeamId[]);
    expect(ids(pinned.game)).toEqual(['drexel-mbb', 'saint-josephs-mbb']);
    expect(ids(pinned.recent)).toEqual(['delaware-mbb']);
  });

  test('recents keep the newest first, once each, and survive storage', () => {
    const stored = new Map<string, string>();
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) };
    let recent = readRecent(storage);
    for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f', 'g'] as TeamId[]) recent = touchRecent(recent, id);
    expect<readonly string[]>(recent).toEqual(['g', 'f', 'e', 'd', 'a', 'c']);
    writeRecent(storage, recent);
    expect<readonly string[]>(readRecent(storage)).toEqual(recent);
    stored.set('dtv.data.recent', 'not json');
    expect<readonly string[]>(readRecent(storage)).toEqual([]);
  });
});
