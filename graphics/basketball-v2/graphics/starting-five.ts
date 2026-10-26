import { type Player, type Side, type TeamView } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { headshotOf, playerOf, requireBasketball, requireGame } from './shared';

const row = (player: Player, team: TeamView) => ({
  number: player.jersey,
  lastName: player.lastName,
  position: player.position,
  headshot: headshotOf(player, team),
});

export const startingFive = defineGraphic({
  id: 'basketball-v2/starting-five',
  scene: SCENES.starting_five_lower_third,
  params: z.object({}),
})({
  name: 'Starting Five',
  sport: 'basketball',
  layer: 'lower',
  demo: {},
  site: 'with-scorebug',
  label: () => 'Starting five',
  bind(_params, context) {
    const { sides } = requireGame(context);
    const live = requireBasketball(context);
    const starters = (side: Side) => live.starters[side].map((id) => {
      const { player, team } = playerOf(context.world, id);
      return row(player, team);
    });
    const { away, home } = sides;
    return {
      step: 0,
      awaySchool: away.school.name,
      homeSchool: home.school.name,
      awayLogo: away.brand.logo,
      homeLogo: home.brand.logo,
      awayPrimaryColor: away.brand.primaryColor,
      homePrimaryColor: home.brand.primaryColor,
      awaySecondaryColor: away.brand.secondaryColor,
      homeSecondaryColor: home.brand.secondaryColor,
      awayPlayer: starters('away'),
      homePlayer: starters('home'),
      sponsorLogo: context.sponsor?.logoOnDark ?? null,
    };
  },
  steps: { count: 2, values: (step) => ({ step }), transition: 'Away To Home' },
});
