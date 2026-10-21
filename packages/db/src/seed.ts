import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkEdits, editRows, EspnTeam, espnEdits, fixtureRows, type ImportEdit, type ImportWarning, indexWorld, type LayerWarning,
  layerEdits, parseRosterCsv, planRoster, type Revision, SeasonId, SeedFixtures, TeamId,
} from '@dtv/domain';
import type { Db } from './db';
import { commitEdits, commitLive, loadLive, loadSnapshot } from './store';

export interface SeedReport {
  readonly revision: Revision;
  readonly inserted: number;
  readonly updated: number;
  readonly liveInserted: number;
  readonly warnings: readonly (ImportWarning | LayerWarning)[];
}

const ROSTER_FILE = /^(?<team>[a-z0-9-]+)@(?<season>\d{4}-\d{2})\.csv$/;

/**
 * The prefilled data in `dir` (data/seed/): teams.json, then each roster CSV through the
 * roster importer, then fixtures.json, merged by id in that order and committed as one
 * import batch. Every put is `keep`, so a second run writes nothing and a row a person or
 * a feed changed since is never reset. Live states are written only for games without one.
 */
export async function seed(db: Db, options: { readonly dir: string; readonly at?: number }): Promise<SeedReport> {
  const at = options.at ?? Date.now();
  const fixtures = SeedFixtures.parse(await Bun.file(join(options.dir, 'fixtures.json')).json());
  const teams = espnEdits(EspnTeam.array().parse(await Bun.file(join(options.dir, 'teams.json')).json()), fixtures.teams);
  const world = indexWorld(loadSnapshot(db));

  const rosters: ImportEdit[] = [];
  for (const file of readdirSync(join(options.dir, 'rosters')).filter((name) => name.endsWith('.csv')).sort()) {
    const name = ROSTER_FILE.exec(file)?.groups;
    if (!name) throw new Error(`rosters/${file}: name a roster <team id>@<season>.csv, as in drexel-mbb@2026-27.csv`);
    const parsed = parseRosterCsv(await Bun.file(join(options.dir, 'rosters', file)).text());
    if (!parsed.ok) throw new Error(parsed.errors.map((error) => `rosters/${file}:${error.line}: ${error.message}`).join('\n'));
    const plan = planRoster(world, { team: TeamId.parse(name.team), season: SeasonId.parse(name.season), rows: parsed.rows, prune: false });
    rosters.push(...plan.edits);
  }

  const layered = layerEdits([editRows(teams.edits), editRows(rosters), fixtureRows(fixtures)], 'keep');
  const batch = { origin: 'import', edits: layered.edits } as const;
  const problems = checkEdits(world, batch);
  if (problems.length) throw new Error(`the seed is inconsistent:\n${problems.map((problem) => problem.message).join('\n')}`);
  const result = commitEdits(db, { actor: 'seed', at, batch });
  if (!result.ok) throw new Error(`the seed was refused as ${result.reason}: ${result.detail}`);

  const existing = loadLive(db);
  const missing = fixtures.live.filter((live) => !existing.has(live.gameId));
  for (const live of missing) commitLive(db, { actor: 'seed', at, live, payload: live });

  return {
    revision: result.revision,
    inserted: result.inserted,
    updated: result.updated,
    liveInserted: missing.length,
    warnings: [...teams.warnings, ...layered.warnings],
  };
}
