import { type EditBatch, mergePut, type Writer } from './edits';
import { type EntityKind, type EntityOf, parseEntity } from './entities';
import type { Game } from './entities';
import type { GameId, PlayerId, TeamId } from './ids';
import { SIDES, type Side } from './primitives';
import { PROGRAMS, type ProgramCode, type Sport } from './programs';
import { type GameApplyInput, SPORT_MODULES } from './sports';
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

/** The rows of `kind` once `batch` commits. Only documents matter here, so a manual put's writer stays unknown. */
function rowsAfter<K extends EntityKind>(world: World, batch: EditBatch, kind: K): ReadonlyMap<string, EntityOf<K>> {
  const rows = new Map<string, EntityOf<K>>(world.all(kind).map((row) => [row.id, row]));
  const writer: Writer = batch.origin === 'import' ? { origin: 'import' } : { origin: 'manual', actor: null, at: null };
  for (const edit of batch.edits) {
    if (edit.kind !== kind) continue;
    if (edit.op === 'delete') {
      rows.delete(edit.id);
      continue;
    }
    const id = edit.value.id;
    const existing = rows.get(id);
    const merge = mergePut(writer, existing && { doc: existing, locks: world.locks(kind, id) }, edit);
    if (merge.change === 'none') continue;
    rows.set(id, parseEntity(kind, merge.row.doc));
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

/** The first player a live update names who is not on that side's team, or either team, in the game's season. */
export function playerOutsideGame(world: World, game: Game, input: GameApplyInput): PlayerId | null {
  const teams = { away: game.awayTeamId, home: game.homeTeamId };
  for (const command of input.commands) {
    for (const { player, side } of SPORT_MODULES[input.sport].players(command)) {
      const row = world.get('player', player);
      const onTeam = row?.seasonId === game.seasonId && (side ? row.teamId === teams[side] : row.teamId === teams.away || row.teamId === teams.home);
      if (!onTeam) return player;
    }
  }
  return null;
}
