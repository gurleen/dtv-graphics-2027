import { type EpochMs } from '@dtv/domain';
import { defineGraphic } from '@dtv/playout';
import { z } from 'zod';
import { SCENES } from '../scenes.gen';

const NEW_YORK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const EVENING_FROM = 17;

export type SlateShow = 'pre' | 'post';

/** The Eastern wall clock as the slate shows it: `04:00:00` and `PM ET`, and the greeting for the show's half. */
export function slateTime(now: EpochMs, show: SlateShow) {
  const part = Object.fromEntries(NEW_YORK.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const hour = part.hour!;
  const two = (value: number) => String(value).padStart(2, '0');
  const greeting = show === 'post' ? 'GOOD NIGHT' : hour < EVENING_FROM ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  return {
    clock: `${two(hour % 12 || 12)}:${two(part.minute!)}:${two(part.second!)}`,
    period: `${hour < 12 ? 'AM' : 'PM'} ET`,
    message: `${greeting} FROM PHILADELPHIA`,
  };
}

export const barsSlate = defineGraphic({
  id: 'basketball-v2/bars-slate',
  scene: SCENES.bars_slate,
  params: z.object({
    show: z.enum(['pre', 'post']).meta({ labels: { pre: 'Pre-show', post: 'Post-show' } }).default('pre'),
  }),
})({
  name: 'Bars Slate',
  sport: 'basketball',
  layer: 'card',
  clears: ['bug', 'lower'],
  demo: {},
  site: 'full-frame',
  ticks: 'second',
  label: (params) => `Bars slate · ${params.show === 'post' ? 'post-show' : 'pre-show'}`,
  bind: (params, context) => slateTime(context.now, params.show),
});
