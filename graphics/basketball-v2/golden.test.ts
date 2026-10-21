/**
 * Binds every entry's demo cue against the seed data (Saint Joseph's at Drexel) and compares
 * what would go on air with the scene's Default instance. One check proves the bind, the
 * seed and the scene the designer previews in Rive agree. Images are skipped: the scene
 * embeds assets where the data has URLs.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadLive, loadSnapshot, migrate, openDb, seed } from '@dtv/db';
import { GraphicId, indexWorld, PlayerId, ShowId, Url } from '@dtv/domain';
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
  return showContext({ world, showId: ShowId.parse('drexel-sju'), live: (game) => lives.get(game), now: Date.parse('2026-11-08T21:00:00Z') });
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
  const aired = [...view.free, ...view.rundown].map((cue) => cue.graphic).sort();
  expect(aired).toEqual(ENTRIES.map((entry) => entry.id).sort());
  expect(view.rundown.filter((cue) => cue.error).map((cue) => `${cue.graphic}: ${cue.error}`)).toEqual([]);
});
