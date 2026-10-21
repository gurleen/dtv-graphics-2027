/**
 * Compile-time tests, run by the typecheck in `bun run check`: the registry's types refuse
 * the mistakes they exist to refuse. Each `@ts-expect-error` fails the build if its line
 * ever compiles.
 */

import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { scorebug } from './graphics/scorebug';
import { SCENES } from './scenes.gen';

const head = { id: 'check/scorebug', scene: SCENES.basketball_scorebug, params: z.object({}) };
const rest = { name: 'Check', sport: 'basketball', layer: 'bug', demo: {}, site: 'scorebug', label: () => 'Check' } as const;

export const compiles = defineGraphic(head)({ ...rest, bind: (params, context) => scorebug.bind(params, context) });

export const misspelledProperty = defineGraphic(head)({
  ...rest,
  // @ts-expect-error `awayAcronimo` is not a scorebug property, so `awayAcronym` is missing
  bind: (params, context) => {
    const { awayAcronym, ...values } = scorebug.bind(params, context);
    return { ...values, awayAcronimo: awayAcronym };
  },
});

export const wrongValueKind = defineGraphic(head)({
  ...rest,
  // @ts-expect-error `awayScore` is a number property
  bind: (params, context) => ({ ...scorebug.bind(params, context), awayScore: '68' }),
});

export const bindsIsPlaying = defineGraphic(head)({
  ...rest,
  // @ts-expect-error the renderer owns `isPlaying`; a bind never writes it
  bind: (params, context) => ({ ...scorebug.bind(params, context), isPlaying: true }),
});

export const badInternalName = defineGraphic({ id: 'check/score-to-break', scene: SCENES.score_to_break, params: z.object({}) })({
  ...rest,
  bind: () => {
    throw new Error('not bound');
  },
  // @ts-expect-error Score to Break's exit signal is `_onScreen`
  exitSignal: '_offScreen',
});

export const stringInternalAsExitSignal = defineGraphic(head)({
  ...rest,
  bind: (params, context) => scorebug.bind(params, context),
  // @ts-expect-error `_awayShown` is a string; an exit signal is a number the scene sets to 0
  exitSignal: '_awayShown',
});

export const badFrozenName = defineGraphic(head)({
  ...rest,
  bind: (params, context) => scorebug.bind(params, context),
  // @ts-expect-error `alignRight` is a Score to Break property, not a scorebug one
  frozenOnAir: ['alignRight'],
});
