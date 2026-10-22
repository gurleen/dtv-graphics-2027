import { type EpochMs, type GameId, type GameLive, resolveGame, showOf, type World } from '@dtv/domain';
import type { ShowContext } from './graphic';

/** What every bind of the active game's show reads, resolved once. */
export function showContext(input: {
  readonly world: World;
  readonly gameId: GameId | null;
  readonly live: (game: GameId) => GameLive | undefined;
  readonly now: EpochMs;
}): ShowContext {
  const { world, gameId } = input;
  const show = gameId ? showOf(world, gameId) : undefined;
  const crew = (show?.crew ?? []).flatMap((member) => {
    const talent = world.get('talent', member.talentId);
    return talent ? [{ talent, role: member.role ?? talent.role }] : [];
  });
  return {
    world,
    show,
    game: gameId ? resolveGame(world, gameId) : undefined,
    live: gameId ? input.live(gameId) : undefined,
    crew,
    now: input.now,
  };
}
