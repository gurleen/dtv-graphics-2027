/**
 * Binds every entry's demo cue against the seed data (Saint Joseph's at Drexel) and compares
 * what would go on air with the scene's Default instance. One check proves the bind, the
 * seed and the scene the designer previews in Rive agree. Images are skipped: the scene
 * embeds assets where the data has URLs.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadLive, loadSnapshot, migrate, openDb, seed } from '@dtv/db';
import { GameId, GraphicId, indexWorld, PlayerId, Url } from '@dtv/domain';
import { type AnyGraphic, bindValues, EMPTY_SHOW, OperatorId, showContext, viewShow } from '@dtv/playout';
import { BASKETBALL_V2, SCENES } from './index';

/** One reason for several properties of one graphic. */
const drift = (graphic: string, properties: readonly string[], reason: string) => properties.map((name) => [`basketball-v2/${graphic} ${name}`, reason] as const);

/** Each disagreement with a scene's Default instance, by `<graphic> <property>`, and why it stands. */
const KNOWN_DRIFT: Readonly<Record<string, string>> = Object.fromEntries([
  ...drift(
    'scorebug',
    ['period'],
    'The scene says 2ND PERIOD; periodLabel says 2ND HALF for men’s games, as Score to Break does. Open question in docs/ARCHITECTURE.md section 7.',
  ),
  ...['starting-five', 'halftime-adjustments'].flatMap((graphic) =>
    drift(graphic, ['awaySecondaryColor'], 'This scene says #a7a9ac for Saint Joseph’s; the seed says #101010, as three other scenes do. Open question in docs/ARCHITECTURE.md section 7.'),
  ),
  ...drift('halftime-statistics', ['awayScore', 'homeScore'], 'The scene shows a halftime score (31-34); the demo game is in the 2nd half at 68-72.'),
  ...drift('player-to-watch', ['bodyText'], 'Placeholder copy; the bind blanks it in stats mode.'),
  ...drift(
    'player-of-the-game',
    ['contextLabel', 'stat1Value', 'stat2Value', 'stat3Value', 'stat4Value', 'bodyText'],
    'The scene’s placeholder is a finished game against St. John’s (24 PTS, 8 REB, 5 AST, 9-14 FG) with copy for text mode; the demo game is Saint Joseph’s at Drexel, mid-game.',
  ),
  ...drift('conference-standings', ['awayTeam'], 'The scene’s away team is the CAA placeholder Campbell; the demo game’s visitor, Saint Joseph’s, is outside the conference, so no row is tinted for it.'),
  ...drift(
    'score-to-break',
    ['awayScore', 'homeScore', 'status', 'awayPrimaryColor', 'awaySecondaryColor'],
    'The scene’s placeholder game is Campbell at Drexel, 58-61 with 8:42 left; the demo game is Saint Joseph’s at Drexel, 68-72 with 13:59 left.',
  ),
  ...drift('team-lower-third', ['stat1Value', 'stat2Value'], 'The scene’s placeholder record (14-3, 8-1) is not the 14-6, 6-3 the matchup scenes and the seed agree on.'),
  ...drift('team-lower-third', ['bodyText'], 'Placeholder copy; the bind blanks it in stats mode.'),
]);

const ENTRIES: readonly AnyGraphic[] = Object.values(BASKETBALL_V2);

async function seededContext() {
  const db = openDb(':memory:');
  migrate(db, { backupDir: '/dev/null' });
  await seed(db, { dir: join(import.meta.dir, '../../data/seed') });
  const world = indexWorld(loadSnapshot(db));
  const lives = loadLive(db);
  db.sqlite.close();
  return showContext({ world, gameId: GameId.parse('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb'), live: (game) => lives.get(game), now: Date.parse('2026-11-08T21:00:00Z') });
}

describe('every entry binds its demo to the scene’s Default instance', async () => {
  const context = await seededContext();
  for (const entry of ENTRIES) {
    test(entry.id, () => {
      const values = bindValues(entry, { graphic: GraphicId.parse(entry.id), params: entry.params.parse(entry.demo), step: 0, overrides: {} }, context);
      const drift: Record<string, { bound: unknown; scene: unknown }> = {};
      for (const [name, value] of Object.entries(values)) {
        const scene = entry.scene.defaults[name];
        if (String(scene).startsWith('asset:')) continue;
        if (value !== scene) drift[`${entry.id} ${name}`] = { bound: value, scene };
      }
      const known = Object.keys(KNOWN_DRIFT).filter((key) => key.startsWith(`${entry.id} `));
      expect(Object.keys(drift).filter((key) => !(key in KNOWN_DRIFT)).map((key) => ({ key, ...drift[key] }))).toEqual([]);
      expect(known.filter((key) => !(key in drift)), 'KNOWN_DRIFT entries that now agree; delete them').toEqual([]);
    });
  }
});

test('every scene has a registry entry', () => {
  const played = new Set(ENTRIES.map((entry) => entry.scene.file));
  expect(Object.values(SCENES).map((scene) => scene.file).filter((file) => !played.has(file))).toEqual([]);
});

describe('what the entries do beyond their values', async () => {
  const context = await seededContext();
  const bound = (entry: AnyGraphic, params: unknown, step: number, at = context) =>
    bindValues(entry, { graphic: GraphicId.parse(entry.id), params: entry.params.parse(params), step, overrides: {} }, at);
  const REED = PlayerId.parse('drexel-mbb@2026-27/reed-josh');

  test('every entry labels its demo cue', () => {
    for (const entry of ENTRIES) expect(entry.label(entry.params.parse(entry.demo), { ...context, sponsor: undefined }), entry.id).toMatch(/\S/);
    expect(ENTRIES.map((entry) => entry.label(entry.params.parse(entry.demo), { ...context, sponsor: undefined }))).toContain('Talent · Rob Brooks + Mike Tuberosa');
  });

  test('the free panel holds the scorebug at 1 and Score to Break at 2, nothing else', () => {
    expect(ENTRIES.filter((entry) => entry.free).map((entry) => entry.id)).toEqual(['basketball-v2/scorebug', 'basketball-v2/score-to-break']);
  });

  test('a talent lower third shows the role the crew has tonight', () => {
    const crew = context.crew.map((member, index) => (index === 0 ? { ...member, role: 'Host' } : member));
    const values = bound(BASKETBALL_V2['basketball-v2/talent-lower-third-single'], { talents: ['rob-brooks'] }, 0, { ...context, crew });
    expect(values.talent1Role).toBe('HOST');
  });

  test('the scorebug slider joins the commentators, takes custom text, and needs a venue', () => {
    const slider = BASKETBALL_V2['basketball-v2/scorebug-slider'];
    const said = (params: unknown, at = context) => {
      const { title, subtitle } = bound(slider, params, 0, at);
      return [title, subtitle];
    };
    expect(said({ kind: 'commentators', talents: ['rob-brooks'] })).toEqual(['COMMENTATORS', 'ROB BROOKS']);
    expect(said({ kind: 'commentators', talents: ['rob-brooks', 'mike-tuberosa', 'tessa-peloso'] })).toEqual(['COMMENTATORS', 'ROB BROOKS, MIKE TUBEROSA AND TESSA PELOSO']);
    expect(said({ kind: 'custom', title: 'Attendance', subtitle: '4,212' })).toEqual(['ATTENDANCE', '4,212']);
    expect(() => said({ kind: 'venue' }, { ...context, game: { ...context.game!, venue: undefined } })).toThrow('The game has no venue');
    expect(slider.label(slider.params.parse({ kind: 'commentators', talents: ['rob-brooks', 'mike-tuberosa'] }), { ...context, sponsor: undefined })).toBe('Slider · Rob Brooks and Mike Tuberosa');
  });

  test('the scorebug slider reads a team’s insights off the play by play', () => {
    const slider = BASKETBALL_V2['basketball-v2/scorebug-slider'];
    const live = context.live?.sport === 'basketball' ? context.live : undefined;
    if (!live) throw new Error('The demo game has no live state');
    // The demo game is at 13:59 of the 2nd half: Drexel on a 10-0 run from 16:30, Saint Joseph's missing five straight.
    const shot = (side: 'away' | 'home', seconds: number, value: 1 | 2 | 3, made: boolean) => ({ period: 2, remainingMs: seconds * 1000, side, value, made });
    const shots = [
      shot('away', 1050, 2, true),
      shot('home', 990, 3, true),
      ...[980, 940, 900, 880, 860].map((seconds) => shot('away', seconds, 2, false)),
      shot('home', 970, 2, true),
      shot('home', 930, 3, true),
      shot('home', 870, 2, true),
    ];
    const at = { ...context, live: { ...live, shots } };
    const said = (params: unknown) => {
      const { title, subtitle } = bound(slider, params, 0, at);
      return [title, subtitle];
    };
    expect(said({ kind: 'insights', side: 'home' })).toEqual(['DREXEL', '10-0 RUN OVER 2:31']);
    expect(said({ kind: 'insights', side: 'away' })).toEqual(["SAINT JOSEPH'S", 'SCORING DROUGHT 3:31 · FGS: 0 OF LAST 5']);
    expect(said({ kind: 'insights', side: 'away', insights: ['fgStreak'] })).toEqual(["SAINT JOSEPH'S", 'FGS: 0 OF LAST 5']);
    expect(() => said({ kind: 'insights', side: 'home', insights: ['scoringDrought'] })).toThrow('Nothing stands out about Drexel right now');
    expect(() => bound(slider, { kind: 'insights', side: 'home' }, 0)).toThrow('The game has no play by play yet');
    expect(slider.label(slider.params.parse({ kind: 'insights', side: 'home' }), { ...at, sponsor: undefined })).toBe('Slider · Drexel insights');
 
    // Cued, it keeps what held and the shots there were; on air the clock runs, then Drexel scores.
    const pinned = slider.pin!(slider.params.parse({ kind: 'insights', side: 'away' }), at);
    expect(pinned).toEqual({ kind: 'insights', side: 'away', insights: ['scoringDrought', 'fgStreak'], asOf: shots.length });
    const clock = { running: true as const, remainingMs: 839_000, since: at.now };
    const onAir = (seconds: number, more: typeof shots = []) => {
      const { subtitle } = bound(slider, pinned, 0, { ...at, now: at.now + seconds * 1000, live: { ...live, clock, shots: [...shots, ...more] } });
      return subtitle;
    };
    expect(onAir(9)).toBe('SCORING DROUGHT 3:40 · FGS: 0 OF LAST 5');
    expect(onAir(9, [shot('home', 832, 2, true), shot('away', 832, 2, false)])).toBe('SCORING DROUGHT 3:40 · FGS: 0 OF LAST 5');
    expect(onAir(30, [shot('away', 829, 3, true)])).toBe('SCORING DROUGHT 3:41 · FGS: 0 OF LAST 5');
    expect(slider.frozenOnAir).toEqual(['title']);
  });

  test('Next moves a stepped graphic: the answer, then the home team', () => {
    expect(bound(BASKETBALL_V2['basketball-v2/burning-question'], { question: 'Q', answer: 'A', team: 'drexel-mbb' }, 0).showAnswer).toBe(false);
    expect(bound(BASKETBALL_V2['basketball-v2/burning-question'], { question: 'Q', answer: 'A', team: 'drexel-mbb' }, 1).showAnswer).toBe(true);
    expect(bound(BASKETBALL_V2['basketball-v2/starting-five'], {}, 1).step).toBe(1);
    expect(bound(BASKETBALL_V2['basketball-v2/halftime-adjustments'], BASKETBALL_V2['basketball-v2/halftime-adjustments'].demo, 1).step).toBe(1);
  });

  test('the player features play the player’s motion headshot over their still', () => {
    const url = Url.parse('/assets/motion/reed.webm');
    const player = context.world.snapshot.entities.player.map((row) => (row.id === REED ? { ...row, motionHeadshot: url } : row));
    const world = indexWorld({ ...context.world.snapshot, entities: { ...context.world.snapshot.entities, player } });
    for (const entry of [BASKETBALL_V2['basketball-v2/player-to-watch'], BASKETBALL_V2['basketball-v2/player-of-the-game']]) {
      expect(entry.overlay?.source(entry.params.parse({ player: REED }), { ...context, world, sponsor: undefined })).toBe(url);
      expect(entry.overlay?.source(entry.params.parse({ player: REED }), { ...context, sponsor: undefined })).toBeNull();
    }
  });
});

test('the demo show’s rundown cues every graphic the free panel lacks, each ready to air', async () => {
  const context = await seededContext();
  const view = viewShow({ registry: BASKETBALL_V2, state: EMPTY_SHOW, operator: OperatorId.parse('golden'), operators: [], revision: context.world.revision, context });
  const aired = [...new Set([...view.free, ...view.rundown].map((cue) => cue.graphic))].sort();
  expect(aired).toEqual(ENTRIES.map((entry) => entry.id).sort());
  expect(view.rundown.filter((cue) => cue.error).map((cue) => `${cue.graphic}: ${cue.error}`)).toEqual([]);
});
