import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ENTITY_KINDS } from './entities';
import * as ids from './ids';
import { idFor, PlayerId, SeasonId, slugify, TeamId } from './index';

describe('slugify', () => {
  test.each([
    ["Saint Joseph's", 'saint-josephs'],
    ['Miami (OH)', 'miami-oh'],
    ['William & Mary', 'william-mary'],
    ['Texas A&M-Corpus Christi', 'texas-a-m-corpus-christi'],
    ['San José State', 'san-jose-state'],
    ['  St. Francis (PA) ', 'st-francis-pa'],
  ])('%p becomes %p', (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });
});

describe('idFor', () => {
  const season = SeasonId.parse('2026-27');
  const drexel = idFor.team(idFor.school('Drexel'), 'mbb');
  const sju = idFor.team(idFor.school("Saint Joseph's"), 'mbb');

  test('builds the ids the architecture names', () => {
    expect(drexel).toBe(TeamId.parse('drexel-mbb'));
    expect<string>(idFor.teamSeason(drexel, season)).toBe('drexel-mbb@2026-27');
    expect<string>(idFor.player(drexel, season, 'Josh', 'Reed')).toBe('drexel-mbb@2026-27/reed-josh');
    expect<string>(idFor.staff(drexel, season, 'Zach', 'Spiker')).toBe('drexel-mbb@2026-27/spiker-zach');
    expect<string>(idFor.game(season, '2026-11-08', sju, drexel)).toBe('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb');
  });

  test('an unknown first name still gives a valid player id', () => {
    expect<string>(idFor.player(drexel, season, '', 'De Laporterie')).toBe('drexel-mbb@2026-27/de-laporterie');
  });

  test('ids reject text that is not a slug', () => {
    expect(PlayerId.safeParse('Drexel MBB').success).toBe(false);
    expect(PlayerId.safeParse('drexel--mbb').success).toBe(false);
    expect(SeasonId.safeParse('2026').success).toBe(false);
  });
});

test('every id that names a row says which kind, for a form’s picker', () => {
  const refs = Object.entries(ids).flatMap(([name, schema]) => {
    const ref = schema instanceof z.ZodType ? (schema.meta() as { ref?: string } | undefined)?.ref : undefined;
    return ref ? [[name, ref] as const] : [];
  });
  for (const [, ref] of refs) expect(ENTITY_KINDS as readonly string[]).toContain(ref);
  expect(refs.map(([name]) => name).sort()).toEqual(
    ['ConferenceId', 'GameId', 'PlayerId', 'SchoolId', 'SeasonId', 'ShowId', 'SponsorId', 'StaffId', 'TalentId', 'TeamId', 'TeamSeasonId', 'VenueId'],
  );
});
