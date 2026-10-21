import { PROGRAMS, resolveTeam, SeasonId, type TeamView } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { NON_CONFERENCE } from '../conference_teams';
import { SCENES } from '../scenes.gen';
import { fail, record, requireGame } from './shared';

/** The card matches each row to the logo and tint the scene embeds by this name. Schools not listed use their own name. */
const CARD_NAMES: Readonly<Record<string, string>> = { 'unc-wilmington': 'UNCW', 'north-carolina-a-t': 'N.C. A&T' };

const cardName = ({ school }: TeamView) => CARD_NAMES[school.id] ?? school.name;

export const conferenceStandings = defineGraphic({
  id: 'basketball-v2/conference-standings',
  scene: SCENES.conference_standings,
  params: z.object({ season: SeasonId.optional() }),
})({
  name: 'Conference Standings',
  sport: 'basketball',
  layer: 'card',
  demo: { season: '2025-26' },
  site: 'full-frame',
  label: (params, context) => {
    const game = requireGame(context);
    return `Conference standings · ${params.season ?? game.season.id}`;
  },
  bind(params, context) {
    const { game, program, season, sides } = requireGame(context);
    const conference = sides.home.conference ?? sides.away.conference ?? fail('Neither team has a conference');
    const seasonId = params.season ?? season.id;
    const tinted = (side: TeamView) => (side.conference?.id === conference.id ? cardName(side) : NON_CONFERENCE);
    return {
      sport: PROGRAMS[program].name,
      awayTeam: tinted(sides.away),
      homeTeam: tinted(sides.home),
      row: context.world.standings(conference.id, seasonId, program).map((row) => ({
        team: cardName(resolveTeam(context.world, row.teamId, seasonId) ?? fail(`Team ${row.teamId} is gone`)),
        conferenceRecord: record(row.conference),
        overallRecord: record(row.overall),
        streak: row.streak ?? '',
      })),
    };
  },
});
