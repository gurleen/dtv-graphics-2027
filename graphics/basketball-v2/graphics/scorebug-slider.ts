import { TalentId } from '@dtv/domain';
import { type BindContext, defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';
import { fail, fullName, requireGame } from './shared';

const Line = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('venue') }),
  z.object({ kind: z.literal('commentators'), talents: z.array(TalentId).min(1).max(3) }),
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
    case 'custom':
      return { title: line.title, subtitle: line.subtitle };
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
  label: (params, context) => `Slider · ${params.kind === 'venue' ? 'Venue' : params.kind === 'commentators' ? commentators(params.talents, context) : params.title}`,
  bind: (params, context) => lineText(params, context),
});
