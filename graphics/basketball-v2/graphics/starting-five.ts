import { type Player, sides as perSide, type Side, type TeamView } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { fail, headshotOf, playerOf, requireBasketball, requireGame } from './shared';

const row = (player: Player, team: TeamView) => ({
  number: player.jersey,
  lastName: player.lastName,
  position: player.position,
  headshot: headshotOf(player, team),
});

const SLOTS = 5;
const BLANK_NUMBERS = { away: Array<string>(SLOTS).fill(''), home: Array<string>(SLOTS).fill('') };

/** Jersey numbers to start in place of the game's starters, one per slot. A blank slot keeps the game's starter. */
const Numbers = perSide(z.array(z.string().regex(/^\d{0,2}$/, 'A jersey number is one or two digits').meta({ numeric: true })).length(SLOTS));

export const startingFive = defineGraphic({
  id: 'basketball-v2/starting-five',
  scene: SCENES.starting_five_lower_third,
  params: z.object({ numbers: Numbers.default(BLANK_NUMBERS) }),
})({
  name: 'Starting Five',
  sport: 'basketball',
  layer: 'lower',
  demo: {},
  site: 'with-scorebug',
  label: () => 'Starting five',
  bind(params, context) {
    const { sides, season } = requireGame(context);
    const live = requireBasketball(context);
    const starters = (side: Side) => {
      const { team } = sides[side];
      const roster = context.world.roster(team.id, season.id);
      const slots = Array.from({ length: SLOTS }, (_, slot) => {
        const jersey = params.numbers[side][slot] ?? '';
        if (!jersey) return live.starters[side][slot];
        return roster.find((player) => player.jersey === jersey)?.id ?? fail(`${sides[side].school.name} has no #${jersey} on its ${season.id} roster`);
      });
      return slots.flatMap((id) => {
        if (id === undefined) return [];
        const { player, team: view } = playerOf(context.world, id);
        return [row(player, view)];
      });
    };
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
