import { describe, expect, test } from 'bun:test';
import { type Cue, CueId, parseRundownCsv, rundownCsv } from '../index';

const HEADER = 'graphic,note,params,overrides';

const cue = (id: string, graphic: string, extra: Partial<Cue> = {}): Cue => ({
  id: CueId.parse(id),
  graphic: graphic as Cue['graphic'],
  params: {},
  overrides: {},
  note: '',
  ...extra,
});

const errorsOf = (text: string) => {
  const result = parseRundownCsv(text);
  if (result.ok) throw new Error('expected errors');
  return result.errors;
};

describe('rundownCsv', () => {
  test('survives a round trip, minus the ids', () => {
    const cues = [
      cue('scorebug-1', 'basketball-v2/scorebug'),
      cue('slider-2', 'basketball-v2/scorebug-slider', {
        note: 'Say "hello", then\nbreak',
        params: { kind: 'custom', title: 'Attendance, tonight', nested: { list: [1, { deep: 'x "y"' }] } },
        overrides: { title: 'Fix, "this"', size: 3, bold: true },
      }),
    ];
    const result = parseRundownCsv(rundownCsv(cues));
    expect(result).toEqual({ ok: true, cues: cues.map(({ id: _id, ...rest }) => rest) });
  });

  test('writes the header first and carries no ids', () => {
    const text = rundownCsv([cue('scorebug-1', 'basketball-v2/scorebug')]);
    expect(text).toBe(`${HEADER}\nbasketball-v2/scorebug,,{},{}`);
  });
});

describe('parseRundownCsv', () => {
  test('an empty file and a header alone hold no cues', () => {
    expect(parseRundownCsv('')).toEqual({ ok: true, cues: [] });
    expect(parseRundownCsv(`${HEADER}\n`)).toEqual({ ok: true, cues: [] });
  });

  test('empty params, overrides and note are blank', () => {
    expect(parseRundownCsv(`${HEADER}\nbasketball-v2/scorebug,,,`)).toEqual({
      ok: true,
      cues: [{ graphic: 'basketball-v2/scorebug', note: '', params: {}, overrides: {} }],
    });
  });

  test('reads the columns in any order, by trimmed lower-case name', () => {
    const result = parseRundownCsv(' Params ,Graphic,OVERRIDES,Note\n"{""a"":1}",basketball-v2/scorebug,,hi');
    expect(result).toEqual({ ok: true, cues: [{ graphic: 'basketball-v2/scorebug', note: 'hi', params: { a: 1 }, overrides: {} }] });
  });

  test('a missing or extra column is reported on the header line', () => {
    expect(errorsOf('graphic,params,overrides\nbasketball-v2/scorebug,{},{}')).toEqual([
      { line: 1, message: expect.stringContaining('missing column note') },
    ]);
    expect(errorsOf(`${HEADER},id\nbasketball-v2/scorebug,,,,x`)).toEqual([
      { line: 1, message: expect.stringContaining('unexpected column "id"') },
    ]);
  });

  test('reports every bad row at the line it starts on', () => {
    const errors = errorsOf(
      [
        HEADER,
        'basketball-v2/scorebug,,{},{}',
        ',,{},{}',
        '"basketball-v2/scorebug","two\nlines",{nope},{}',
        'basketball-v2/scorebug,,[1],{}',
        'basketball-v2/scorebug,,{},{"a":{"b":1}}',
        'basketball-v2/scorebug,,{},null',
        'Not A Graphic,,{},{}',
      ].join('\n'),
    );
    expect(errors.map((error) => error.line)).toEqual([3, 4, 6, 7, 8, 9]);
    expect(errors[0]!.message).toContain('graphic');
    expect(errors[1]!.message).toContain('params is not valid JSON');
    expect(errors[2]!.message).toContain('params');
    expect(errors[3]!.message).toContain('overrides');
    expect(errors[4]!.message).toContain('overrides');
    expect(errors[5]!.message).toContain('graphic');
  });
});
