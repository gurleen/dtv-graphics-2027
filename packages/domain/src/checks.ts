import { type EditBatch, mergePut } from './edits';
import { type EntityKind, type EntityOf, parseEntity } from './entities';
import type { GameId, TeamId } from './ids';
import { SIDES, type Side } from './primitives';
import { PROGRAMS, type ProgramCode, type Sport } from './programs';
import type { World } from './world';

export type Inconsistency =
  | {
      readonly rule: 'game-program';
      readonly game: GameId;
      readonly side: Side;
      readonly team: TeamId;
      readonly program: ProgramCode;
      readonly message: string;
    }
  | {
      readonly rule: 'stats-sport';
      readonly kind: 'teamSeason' | 'playerStats';
      readonly id: string;
      readonly sport: Sport;
      readonly expected: Sport;
      readonly message: string;
    };

function rowsAfter<K extends EntityKind>(world: World, batch: EditBatch, kind: K): ReadonlyMap<string, EntityOf<K>> {
  const rows = new Map<string, EntityOf<K>>(world.all(kind).map((row) => [row.id, row]));
  const locks = new Map<string, readonly string[]>();
  for (const edit of batch.edits) {
    if (edit.kind !== kind) continue;
    if (edit.op === 'delete') {
      rows.delete(edit.id);
      continue;
    }
    const id = edit.value.id;
    const existing = rows.get(id);
    const locked = locks.get(id) ?? world.locked(kind, id);
    const merge = mergePut(batch.origin, existing && { doc: existing, locked }, edit);
    if (merge.change === 'none') continue;
    rows.set(id, parseEntity(kind, merge.row.doc));
    locks.set(id, merge.row.locked);
  }
  return rows;
}

export function checkEdits(world: World, batch: EditBatch): readonly Inconsistency[] {
  const teams = rowsAfter(world, batch, 'team');
  const players = rowsAfter(world, batch, 'player');
  const sportOf = (teamId: string) => {
    const team = teams.get(teamId);
    return team && PROGRAMS[team.program].sport;
  };
  const problems: Inconsistency[] = [];

  for (const game of rowsAfter(world, batch, 'game').values()) {
    for (const side of SIDES) {
      const teamId = side === 'away' ? game.awayTeamId : game.homeTeamId;
      const team = teams.get(teamId);
      if (team && team.program !== game.program) {
        problems.push({
          rule: 'game-program',
          game: game.id,
          side,
          team: teamId,
          program: team.program,
          message: `${game.id}: the ${side} team ${teamId} plays ${team.program}, not the game's ${game.program}`,
        });
      }
    }
  }

  const statsSport = (kind: 'teamSeason' | 'playerStats', id: string, sport: Sport, expected: Sport | undefined) => {
    if (expected && sport !== expected) {
      problems.push({ rule: 'stats-sport', kind, id, sport, expected, message: `${kind} ${id}: ${sport} stats on a ${expected} team` });
    }
  };
  for (const row of rowsAfter(world, batch, 'teamSeason').values()) {
    if (row.stats) statsSport('teamSeason', row.id, row.stats.sport, sportOf(row.teamId));
  }
  for (const row of rowsAfter(world, batch, 'playerStats').values()) {
    const player = players.get(row.id);
    if (player) statsSport('playerStats', row.id, row.stats.sport, sportOf(player.teamId));
  }
  return problems;
}
