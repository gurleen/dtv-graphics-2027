import { basketball, Side, TalentId } from '@dtv/domain';
import { type BindContext, defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { fail, fullName, requireBasketball, requireGame } from './shared';

const InsightKind = z.enum(Object.keys(basketball.INSIGHTS) as [basketball.InsightKind, ...basketball.InsightKind[]]).meta({ labels: basketball.INSIGHTS });

const Line = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('venue') }),
  z.object({ kind: z.literal('commentators'), talents: z.array(TalentId).min(1).max(3) }),
  /**
   * What the play by play says about one team. `insights` narrows the kinds; none picked shows every one that holds.
   * `asOf` is the shot count when the cue was cued, which `pin` writes; the form does not show it.
   */
  z.object({ kind: z.literal('insights'), side: Side, insights: z.array(InsightKind).default([]), asOf: z.number().int().nonnegative().optional() }),
  z.object({ kind: z.literal('custom'), title: z.string().min(1), subtitle: z.string().min(1) }),
]);
type Line = z.output<typeof Line>;

/** `A`, `A and B`, `A, B and C`. */
const spoken = (names: readonly string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

const commentators = (ids: readonly TalentId[], context: BindContext) =>
  spoken(ids.map((id) => fullName(context.world.get('talent', id) ?? fail(`Talent ${id} is gone`))));

/** What the strip says, in natural case. */
function lineText(line: Line, context: BindContext): { title: string; subtitle: string } {
  switch (line.kind) {
    case 'venue': {
      const venue = requireGame(context).venue ?? fail('The game has no venue');
      return { title: 'Venue', subtitle: `${venue.name} · ${venue.city}, ${venue.state}` };
    }
    case 'commentators':
      return { title: 'Commentators', subtitle: commentators(line.talents, context) };
    case 'insights': {
      const { program, sides } = requireGame(context);
      const live = requireBasketball(context);
      const team = sides[line.side].school.shortName;
      if (live.shots.length === 0) fail('The game has no play by play yet');
      const found = basketball
        .insights(program, live, line.side, context.now, line.asOf)
        .filter((insight) => line.insights.length === 0 || line.insights.includes(insight.kind));
      if (found.length === 0) fail(`Nothing stands out about ${team} right now`);
      return { title: team, subtitle: found.map((insight) => insight.text).join(' · ') };
    }
    case 'custom':
      return { title: line.title, subtitle: line.subtitle };
  }
}

function labelText(line: Line, context: BindContext): string {
  switch (line.kind) {
    case 'venue':
      return 'Venue';
    case 'commentators':
      return commentators(line.talents, context);
    case 'insights':
      return `${context.game?.sides[line.side].school.shortName ?? line.side} insights`;
    case 'custom':
      return line.title;
  }
}

export const scorebugSlider = defineGraphic({
  id: 'basketball-v2/scorebug-slider',
  scene: SCENES.scorebug_slider,
  params: Line,
})({
  name: 'Scorebug Slider',
  sport: 'basketball',
  layer: 'lower',
  demo: { kind: 'venue' },
  site: 'with-scorebug',
  label: (params, context) => `Slider · ${labelText(params, context)}`,
  // An insights cue keeps the kinds that held and the shots there were when it was cued, so on air its times count up
  // and stop at the basket that ends them, and the line never gains or loses an insight.
  pin(params, context) {
    if (params.kind !== 'insights' || context.live?.sport !== 'basketball' || !context.game) return params;
    const holding = basketball.insights(context.game.program, context.live, params.side, context.now).map((insight) => insight.kind);
    return { ...params, asOf: context.live.shots.length, insights: params.insights.length ? params.insights : holding };
  },
  bind: (params, context) => lineText(params, context),
  frozenOnAir: ['title'],
});
