/**
 * Binds every entry's demo cue against the seed data (Saint Joseph's at Drexel) and compares
 * what would go on air with the scene's Default instance. One check proves the bind, the
 * seed and the scene the designer previews in Rive agree. Images are skipped: the scene
 * embeds assets where the data has URLs.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadLive, loadSnapshot, migrate, openDb, seed } from '@dtv/db';
import { GraphicId, indexWorld, ShowId } from '@dtv/domain';
import { type AnyGraphic, bindValues, showContext } from '@dtv/playout';
import { BASKETBALL_V2, SCENES } from './index';

/** Each disagreement with a scene's Default instance, by `<graphic> <property>`, and why it stands. */
const KNOWN_DRIFT: Readonly<Record<string, string>> = {
  'basketball-v2/scorebug period':
    'The scene says 2ND PERIOD; periodLabel says 2ND HALF for men’s games, as Score to Break does. Open question in docs/ARCHITECTURE.md section 7.',
};

/** Scenes whose registry entries land in phase 3. Delete each line as its entry lands. */
const PENDING = [
  'burning_question.rml',
  'conference_standings.rml',
  'halftime_adjustments.rml',
  'halftime_statistics.rml',
  'matchup_locator.rml',
  'matchup_locator_lower_third.rml',
  'player_of_the_game_lower_third.rml',
  'player_to_watch_lower_third.rml',
  'score_to_break.rml',
  'staff_lower_third.rml',
  'starting_five_lower_third.rml',
  'talent_lower_third_double.rml',
  'talent_lower_third_single.rml',
  'talent_lower_third_triple.rml',
  'team_lower_third.rml',
];

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

test('every scene has a registry entry or is pending', () => {
  const played = new Set(ENTRIES.map((entry) => entry.scene.file));
  const files = Object.values(SCENES).map((scene) => scene.file);
  expect(files.filter((file) => !played.has(file) && !PENDING.includes(file))).toEqual([]);
  expect(PENDING.filter((file) => played.has(file)), 'pending scenes that now have an entry').toEqual([]);
});
