import { basketball } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { requireBasketball, requireGame } from './shared';

const { formatGameClock, formatShotClock, periodLabel, remainingAt } = basketball;

export const scorebug = defineGraphic({
  id: 'basketball-v2/scorebug',
  scene: SCENES.basketball_scorebug,
  params: z.object({}),
})({
  name: 'Scorebug',
  sport: 'basketball',
  layer: 'bug',
  demo: {},
  site: 'scorebug',
  free: () => ({}),
  label: () => 'Scorebug',
  bind(_params, context) {
    const { sides, program } = requireGame(context);
    const live = requireBasketball(context);
    const { away, home } = sides;
    return {
      awayAcronym: away.brand.abbreviation,
      homeAcronym: home.brand.abbreviation,
      awayScore: live.score.away,
      homeScore: live.score.home,
      awayLogo: away.brand.logo,
      homeLogo: home.brand.logo,
      awayPrimaryColor: away.brand.primaryColor,
      homePrimaryColor: home.brand.primaryColor,
      awaySecondaryColor: away.brand.secondaryColor,
      homeSecondaryColor: home.brand.secondaryColor,
      awayTimeouts: live.timeouts.away,
      homeTimeouts: live.timeouts.home,
      awayBonus: live.bonus.away,
      homeBonus: live.bonus.home,
      awayPossession: live.possession === 'away',
      homePossession: live.possession === 'home',
      period: live.phase === 'halftime' ? 'Half' : live.phase === 'final' ? 'Final' : periodLabel(program, live.period),
      clock: formatGameClock(remainingAt(live.clock, context.now)),
      shotClock: live.shotClock ? formatShotClock(remainingAt(live.shotClock, context.now)) : '',
      sponsorLogo: context.sponsor?.logoOnDark ?? null,
    };
  },
});
