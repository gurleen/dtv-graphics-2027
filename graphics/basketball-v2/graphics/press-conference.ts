import { basketball, type GameView, type Player, PlayerId, resolveTeam, Side, type TeamId, type World } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { fail, fullName, initialedName, requireBasketball, requireGame, teamLinesTonight } from './shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** The calendar date as the ISO string writes it, so the offset's own date wins over the machine's. */
const calendarDate = (iso: string) => {
  const [year = 0, month = 1, day = 1] = iso.slice(0, 10).split('-').map(Number);
  return { year, month, day };
};

/** `November 2nd 2026`. */
const longDate = (iso: string) => {
  const { year, month, day } = calendarDate(iso);
  return `${MONTHS[month - 1]} ${basketball.ordinal(day)} ${year}`;
};

/** `11/6/26`. */
const shortDate = (iso: string) => {
  const { year, month, day } = calendarDate(iso);
  return `${month}/${day}/${String(year % 100).padStart(2, '0')}`;
};

/** `A. Baker 25 PTS, 8-20 FG, 9-11 FT`. */
const playerLine = (player: Player, line: basketball.StatLine) =>
  `${initialedName(player)} ${line.pts} PTS, ${line.fgm}-${line.fga} FG, ${line.ftm}-${line.fta} FT`;

const LINES = 3;
const TOP_SCORERS = 2;

/** The listed players in order, else the team's top scorers tonight: ties by field goals made, then name. */
const playerLines = (params: { players?: readonly PlayerId[] | undefined }, world: World, live: basketball.BasketballLive, teamId: TeamId) => {
  const line = (id: PlayerId) => live.players[id] ?? basketball.StatLine.parse({});
  const listed = params.players?.map((id) => ({ player: world.get('player', id) ?? fail(`Player ${id} is gone`), line: line(id) }));
  const scorers = teamLinesTonight(world, live, teamId)
    .sort((a, b) => b.line.pts - a.line.pts || b.line.fgm - a.line.fgm || fullName(a.player).localeCompare(fullName(b.player)))
    .slice(0, TOP_SCORERS);
  const shown = (listed ?? scorers).map(({ player, line }) => playerLine(player, line));
  return Array.from({ length: LINES }, (_, index) => shown[index] ?? '');
};

/** The featured team's earliest game after this one: `at Penn` or `vs Penn`, and its date. Blank without one. */
const nextGame = ({ game }: GameView, world: World, teamId: string) => {
  const after = Date.parse(game.startsAt);
  const next = world
    .all('game')
    .filter((other) => other.id !== game.id && (other.awayTeamId === teamId || other.homeTeamId === teamId) && Date.parse(other.startsAt) > after)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  if (!next) return { nextGameLabel: '', nextGameOpponent: '', nextGameDate: '' };
  const away = next.awayTeamId === teamId;
  const opponent = resolveTeam(world, away ? next.homeTeamId : next.awayTeamId, next.seasonId) ?? fail('The next opponent is gone');
  return { nextGameLabel: 'Next Game', nextGameOpponent: `${away ? 'at' : 'vs'} ${opponent.school.shortName}`, nextGameDate: shortDate(next.startsAt) };
};

export const pressConference = defineGraphic({
  id: 'basketball-v2/press-conference',
  scene: SCENES.press_conference,
  params: z.object({ side: Side.default('home'), players: z.array(PlayerId).max(LINES).optional() }),
})({
  name: 'Press Conference',
  sport: 'basketball',
  layer: 'card',
  clears: ['bug'],
  demo: { side: 'home' },
  site: 'full-frame',
  label: (params, context) => `Press conference · ${requireGame(context).sides[params.side].school.shortName}`,
  bind(params, context) {
    const view = requireGame(context);
    const live = requireBasketball(context);
    const { away, home } = view.sides;
    const featured = view.sides[params.side];
    const [playerLine1, playerLine2, playerLine3] = playerLines(params, context.world, live, featured.team.id);
    return {
      date: longDate(view.game.startsAt),
      homeLogo: home.brand.logo,
      awayLogo: away.brand.logo,
      homeScore: String(live.score.home),
      awayScore: String(live.score.away),
      playerLine1: playerLine1 ?? '',
      playerLine2: playerLine2 ?? '',
      playerLine3: playerLine3 ?? '',
      ...nextGame(view, context.world, featured.team.id),
      primaryColor: featured.brand.primaryColor,
      secondaryColor: featured.brand.secondaryColor,
    };
  },
});
