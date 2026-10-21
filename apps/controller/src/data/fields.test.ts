import { describe, expect, test } from 'bun:test';
import { fieldOf, readText, validate, writeField } from './fields';

const player = {
  id: 'drexel-mbb@2026-27/reed-josh', teamId: 'drexel-mbb', seasonId: '2026-27', firstName: 'Josh', lastName: 'Reed', jersey: '5',
  position: 'G', classYear: 'JR', redshirt: false, hometown: null, headshot: null, motionHeadshot: null, sourceKey: null,
};

const write = (kind: 'player' | 'school' | 'team' | 'teamSeason', doc: Record<string, unknown>, id: string, text: string) => {
  const spec = fieldOf(kind, id)!;
  const written = writeField(doc, spec, text);
  if (!written.ok) return written;
  return { ...written, ...validate(kind, written.doc) };
};

describe('writeField', () => {
  test('a text field takes the trimmed text and clears to its empty kind', () => {
    expect(write('player', player, 'lastName', '  Reed II ')).toMatchObject({ ok: true, doc: { lastName: 'Reed II' } });
    expect(write('player', player, 'hometown', '')).toMatchObject({ ok: true, doc: { hometown: null } });
  });

  test('a choice matches its options without regard to case and refuses anything else', () => {
    expect(write('player', player, 'classYear', 'sr')).toMatchObject({ ok: true, doc: { classYear: 'SR' } });
    expect(write('player', player, 'classYear', '')).toMatchObject({ ok: true, doc: { classYear: null } });
    expect(write('player', player, 'classYear', 'senior')).toMatchObject({ ok: false, error: 'one of FR, SO, JR, SR, GR' });
  });

  test('a jersey stays text, so 00 and 0 differ, and the schema refuses three digits with the field hint', () => {
    expect(write('player', player, 'jersey', '00')).toMatchObject({ ok: true, doc: { jersey: '00' } });
    expect(write('player', player, 'jersey', '123')).toMatchObject({ ok: false, errors: { jersey: 'one or two digits' } });
  });

  test('a colour gains its # and lower case, and a bad one fails with the hint', () => {
    const school = { id: 'drexel', name: 'Drexel', shortName: 'Drexel', mascot: 'Dragons', abbreviation: 'DREX', primaryColor: '#07294d', secondaryColor: '#fdc300', logo: null, website: null, espnId: null };
    expect(write('school', school, 'primaryColor', 'C2071B')).toMatchObject({ ok: true, doc: { primaryColor: '#c2071b' } });
    expect(write('school', school, 'primaryColor', 'navy')).toMatchObject({ ok: false, errors: { primaryColor: 'a colour like #07294d' } });
  });

  test('a branding override with no text leaves the key out, so the school shows through', () => {
    const team = { id: 'drexel-mbb', schoolId: 'drexel', program: 'mbb', branding: { primaryColor: '#111111' } };
    expect(write('team', team, 'branding.primaryColor', '')).toMatchObject({ ok: true, doc: { branding: {} } });
    expect(write('team', team, 'branding.logo', '/assets/images/x.png')).toMatchObject({ ok: true, doc: { branding: { primaryColor: '#111111', logo: '/assets/images/x.png' } } });
  });

  test('typing the first team stat makes the stats object', () => {
    const season = { id: 'drexel-mbb@2026-27', teamId: 'drexel-mbb', seasonId: '2026-27', conferenceId: null, overall: { wins: 1, losses: 0 }, conference: { wins: 0, losses: 0 }, streak: null, rank: null, stats: null };
    const written = write('teamSeason', season, 'stats.totals.pts', '1568');
    expect(written).toMatchObject({ ok: true, doc: { stats: { sport: 'basketball', gp: 0, totals: { pts: 1568, reb: 0 }, opponentPts: 0 } } });
    expect(write('teamSeason', season, 'overall.wins', 'x')).toMatchObject({ ok: false, error: 'a whole number' });
  });

  test('readText shows null as empty and a boolean as yes or no', () => {
    expect(readText(player, fieldOf('player', 'hometown')!)).toBe('');
    expect(readText(player, fieldOf('player', 'redshirt')!)).toBe('no');
  });
});
