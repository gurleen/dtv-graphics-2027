import { describe, expect, test } from 'bun:test';
import { emptySnapshot, type EntityOf, indexWorld, planRoster, SeasonId, TeamId } from '@dtv/domain';
import { diffOf, lockedSkips, readFile, withoutBadRows } from './roster-diff';

const team = TeamId.parse('drexel-mbb');
const season = SeasonId.parse('2026-27');

const player = (slug: string, jersey: string, firstName: string, lastName: string, extra: object = {}) =>
  ({ id: `drexel-mbb@2026-27/${slug}`, teamId: team, seasonId: season, firstName, lastName, jersey, position: 'G', classYear: null, redshirt: false, hometown: null, headshot: null, motionHeadshot: null, sourceKey: null, ...extra }) as EntityOf<'player'>;

const snapshot = emptySnapshot();
const world = indexWorld({
  ...snapshot,
  entities: {
    ...snapshot.entities,
    player: [player('hipp-kobe', '0', 'Kobe', 'Hipp'), player('reed-josh', '5', 'Josh', 'Reid'), player('reynolds-erik', '11', 'Erik', 'Reynolds', { classYear: 'JR' }), player('walker-ty', '32', 'Ty', 'Walker')],
  },
  locks: { ...snapshot.locks, player: { 'drexel-mbb@2026-27/reed-josh': ['lastName'] } },
});

const HEADER = 'jersey,first_name,last_name,position,class_year';
const file = [
  HEADER,
  '0,Kobe,Hipp,G,',
  '5,Josh,Reed,G,',
  '11,Erik,Reynolds,G,SR',
  '14,Luke,House,F,FR',
  '17,Bad,Row,G,zz',
  '99x,Nope,Jersey,G,',
].join('\n');

describe('reading a file with bad rows', () => {
  test('drops the bad records and keeps the header and the good ones', () => {
    const parsed = readFile(file);
    expect(parsed.ok).toBe(true);
    expect(parsed.bad.map((error) => error.line)).toEqual([6, 7]);
    expect(parsed.ok && parsed.rows.map((row) => row.lastName)).toEqual(['Hipp', 'Reed', 'Reynolds', 'House']);
  });

  test('a bad header leaves nothing to plan', () => {
    expect(readFile('number,who\n5,Josh').ok).toBe(false);
    expect(withoutBadRows('x\n', [{ line: 1, message: 'bad' }])).toBeNull();
  });

  test('a record with a quoted line break is one record to drop', () => {
    const csv = `${HEADER}\n5,Josh,Reed,G,\n7,"Two\nLines",Name,G,zz\n9,Ann,Lee,G,`;
    const parsed = readFile(csv);
    expect(parsed.bad.map((error) => error.line)).toEqual([3]);
    expect(parsed.ok && parsed.rows.map((row) => row.lastName)).toEqual(['Reed', 'Lee']);
  });
});

describe('the roster diff', () => {
  const parsed = readFile(file);
  if (!parsed.ok) throw new Error('fixture');
  const plan = planRoster(world, { team, season, rows: parsed.rows, prune: false });
  const skips = lockedSkips(world, { team, season, rows: parsed.rows });
  const diff = diffOf(plan, skips);

  test('shows adds, field changes, locked skips and missing players with their counts', () => {
    expect(diff.counts).toEqual({ added: 1, updated: 1, unchanged: 1, skipped: 1, missing: 1 });
    const kinds = diff.rows.map((row) => `${row.kind}:${row.player.lastName}`);
    expect(kinds).toEqual(['add:House', 'update:Reid', 'update:Reynolds', 'missing:Walker']);
  });

  test('a locked field is skipped and named, with what the file said', () => {
    expect(skips).toMatchObject([{ field: 'lastName', current: 'Reid', file: 'Reed', label: 'Last' }]);
    const reynolds = diff.rows.find((row) => row.kind === 'update' && row.player.lastName === 'Reynolds');
    expect(reynolds).toMatchObject({ changes: [{ label: 'Class', from: 'JR', to: 'SR' }] });
  });

  test('the same file planned after the plan is applied has nothing to do', () => {
    const after = indexWorld({ ...snapshot, entities: { ...snapshot.entities, player: [...world.all('player').filter((each) => each.lastName !== 'Reynolds'), ...plan.add, ...plan.update.map((each) => each.after)] }, locks: world.snapshot.locks });
    const again = planRoster(after, { team, season, rows: parsed.rows, prune: false });
    expect(diffOf(again, lockedSkips(after, { team, season, rows: parsed.rows })).nothingToDo).toBe(true);
  });
});
