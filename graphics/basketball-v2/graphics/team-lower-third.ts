import { basketball, TeamId } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { overallRecord, record, teamOf } from './shared';

const { avg } = basketball;

const Body = z.discriminatedUnion('kind', [z.object({ kind: z.literal('stats') }), z.object({ kind: z.literal('text'), text: z.string().min(1) })]);

export const teamLowerThird = defineGraphic({
  id: 'basketball-v2/team-lower-third',
  scene: SCENES.team_lower_third,
  params: z.object({ team: TeamId, body: Body.default({ kind: 'stats' }) }),
})({
  name: 'Team Lower Third',
  sport: 'basketball',
  layer: 'lower',
  demo: { team: 'drexel-mbb' },
  site: 'full-frame',
  label: (params, context) => `${teamOf(context, params.team).school.name} · ${params.body.kind}`,
  bind(params, context) {
    const team = teamOf(context, params.team);
    const stats = team.season?.stats;
    const cells =
      params.body.kind === 'stats'
        ? [
            { value: overallRecord(team), label: 'Overall' },
            { value: team.season ? record(team.season.conference) : '', label: team.conference?.shortName ?? '' },
            { value: stats ? avg(stats.totals.pts, stats.gp) : '', label: 'PPG' },
            { value: stats ? avg(stats.opponentPts, stats.gp) : '', label: 'Opp PPG' },
          ]
        : [];
    return {
      bodyMode: params.body.kind === 'stats' ? 'STATS' : 'TEXT',
      school: team.school.name,
      mascot: team.school.mascot,
      stat: cells,
      bodyText: params.body.kind === 'text' ? params.body.text : '',
      teamLogo: team.brand.logo,
      teamPrimaryColor: team.brand.primaryColor,
      teamSecondaryColor: team.brand.secondaryColor,
    };
  },
});
