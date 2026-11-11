import { basketball, type Player } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { fullName, initialedName, requireBasketball, requireGame, TEAM_STAT_ROWS, teamLinesTonight } from './shared';

const { formatGameClock, remainingAt } = basketball;

/** The leader rows, in order: the figure each ranks by. */
const LEADS = [
  { label: 'Points', stat: 'pts' },
  { label: 'Rebounds', stat: 'reb' },
  { label: 'Assists', stat: 'ast' },
] as const;

const BLANK = { label: '', name: '', value: '' };

/** The team's leader in each figure tonight, ties by name; a row is blank when nobody has one. */
const leaders = (lines: readonly { player: Player; line: basketball.StatLine }[]) =>
  LEADS.map(({ label, stat }) => {
    const [top] = lines.filter(({ line }) => line[stat] > 0).sort((a, b) => b.line[stat] - a.line[stat] || fullName(a.player).localeCompare(fullName(b.player)));
    return top ? { label, name: initialedName(top.player), value: String(top.line[stat]) } : BLANK;
  });

export const halftimeSlate = defineGraphic({
  id: 'basketball-v2/halftime-slate',
  scene: SCENES.halftime_slate,
  params: z.object({
    title: z.string().min(1).default('Halftime'),
    window: z.enum(['closed', 'open']).meta({ labels: { closed: 'No window', open: 'Highlights window' } }).default('closed'),
  }),
})({
  name: 'Halftime Slate',
  sport: 'basketball',
  layer: 'card',
  clears: ['bug', 'lower'],
  demo: {},
  site: 'full-frame',
  label: (params) => `${params.title} slate${params.window === 'open' ? ' · highlights' : ''}`,
  bind(params, context) {
    const { sides } = requireGame(context);
    const live = requireBasketball(context);
    const { away, home } = sides;
    return {
      showWindow: params.window === 'open',
      title: params.title,
      clock: formatGameClock(remainingAt(live.clock, context.now)),
      awaySchool: away.school.name,
      homeSchool: home.school.name,
      awayMascot: away.school.mascot,
      homeMascot: home.school.mascot,
      awayScore: String(live.score.away),
      homeScore: String(live.score.home),
      awayLogo: away.brand.logo,
      homeLogo: home.brand.logo,
      awayPrimaryColor: away.brand.primaryColor,
      homePrimaryColor: home.brand.primaryColor,
      awaySecondaryColor: away.brand.secondaryColor,
      homeSecondaryColor: home.brand.secondaryColor,
      row: TEAM_STAT_ROWS.map((row) => ({ label: row.label, awayValue: row.value(live.team.away), homeValue: row.value(live.team.home) })),
      awayLeader: leaders(teamLinesTonight(context.world, live, away.team.id)),
      homeLeader: leaders(teamLinesTonight(context.world, live, home.team.id)),
    };
  },
});
