/** What several basketball binds read the same way. Each throws a message an operator can act on. */

import { type basketball, type GameView, type Player, type PlayerId, resolveTeam, type TeamView, type World } from '@dtv/domain';
import type { ShowContext } from '@dtv/playout';

const fail = (message: string): never => {
  throw new Error(message);
};

export const requireGame = (context: ShowContext): GameView => context.game ?? fail('The active show has no game');

export const requireBasketball = (context: ShowContext): basketball.BasketballLive =>
  context.live?.sport === 'basketball' ? context.live : fail('The game has no live basketball state');

export const playerOf = (world: World, id: PlayerId): { player: Player; team: TeamView } => {
  const player = world.get('player', id) ?? fail(`Player ${id} is gone`);
  const team = resolveTeam(world, player.teamId, player.seasonId) ?? fail(`Team ${player.teamId} is gone`);
  return { player, team };
};

export const fullName = (person: { readonly firstName: string; readonly lastName: string }) => `${person.firstName} ${person.lastName}`.trim();

const CLASS_NAMES = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Graduate' } as const;

/** `Redshirt Junior`; empty when the roster has no class. */
export const classYearName = (player: Player) => (player.classYear ? `${player.redshirt ? 'Redshirt ' : ''}${CLASS_NAMES[player.classYear]}` : '');
