/**
 * Compile-time tests, run by the typecheck in `bun run check`: the registry's types refuse
 * the mistakes they exist to refuse. Each `@ts-expect-error` fails the build if its line
 * ever compiles.
 */

import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { halftimeAdjustments } from './graphics/halftime-adjustments';
import { playerToWatch } from './graphics/player-to-watch';
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

const featureHead = { id: 'check/feature', scene: SCENES.player_to_watch_lower_third, params: playerToWatch.params };
const featureRest = { ...rest, layer: 'lower', demo: { player: 'x' } } as const;

export const overlayCompiles = defineGraphic(featureHead)({ ...featureRest, bind: (params, context) => playerToWatch.bind(params, context), overlay: playerToWatch.overlay });

export const badStillOpacity = defineGraphic(featureHead)({
  ...featureRest,
  bind: (params, context) => playerToWatch.bind(params, context),
  // @ts-expect-error `_headshotOpacty` is not a Player To Watch property
  overlay: { ...playerToWatch.overlay!, stillOpacity: '_headshotOpacty' },
});

export const stringInternalAsStillOpacity = defineGraphic(featureHead)({
  ...featureRest,
  bind: (params, context) => playerToWatch.bind(params, context),
  // @ts-expect-error `_contextSeparator` is a string; the still's opacity is a number
  overlay: { ...playerToWatch.overlay!, stillOpacity: '_contextSeparator' },
});

const stepsHead = { id: 'check/steps', scene: SCENES.halftime_adjustments, params: halftimeAdjustments.params };
const stepsRest = { ...rest, demo: halftimeAdjustments.demo } as const;

export const stepsCompile = defineGraphic(stepsHead)({ ...stepsRest, bind: (params, context) => halftimeAdjustments.bind(params, context), steps: { count: 2, values: (step) => ({ step }), transition: 'Away To Home' } });

export const badTransition = defineGraphic(stepsHead)({
  ...stepsRest,
  bind: (params, context) => halftimeAdjustments.bind(params, context),
  // @ts-expect-error `Away To Hom` is not a Halftime Adjustments timeline
  steps: { count: 2, values: (step) => ({ step }), transition: 'Away To Hom' },
});

export const stepWritesWrongKind = defineGraphic(stepsHead)({
  ...stepsRest,
  bind: (params, context) => halftimeAdjustments.bind(params, context),
  // @ts-expect-error `step` is a number property
  steps: { count: 2, values: () => ({ step: 'home' }), transition: 'Away To Home' },
});
