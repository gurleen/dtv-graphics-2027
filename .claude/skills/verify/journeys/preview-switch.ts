#!/usr/bin/env bun
/**
 * Switching the rundown selection between cues on different layers: alex's preview plays the
 * last cue out before the next cue's intro starts. The preview monitor's layer phases are
 * sampled every animation frame. The next cue's intro is timed from when its layer reaches
 * `on`, less its Intro length. That start must come after the old layer is empty.
 *
 *   .claude/skills/verify/scripts/dtv.sh up --port=8998
 *   .claude/skills/verify/journeys/preview-switch.ts --port=8998
 */

import { BASKETBALL_V2 } from '../../../../graphics/basketball-v2';
import { session } from '../scripts/lib';

const s = await session('preview-switch');

type Sample = { t: number; phases: Record<string, string>; graphics: Record<string, string | undefined> };

await s.run(async () => {
  const alex = await s.operator('alex');
  const activate = alex.getByRole('button', { name: 'Activate' }).first();
  const rows = alex.getByRole('grid', { name: 'Rundown cues' }).getByRole('row');
  await Promise.race([activate.waitFor(), rows.first().waitFor()]);
  if (await activate.isVisible()) await activate.click();
  await rows.first().waitFor();

  const phasesOn = (want: Record<string, string>) =>
    alex.waitForFunction((want) => {
      const layers = window.dtvMonitors?.preview?.renderer.layers() as Record<string, { phase: string }> | undefined;
      return layers && Object.entries(want).every(([layer, phase]) => layers[layer]?.phase === phase);
    }, want, { timeout: 15_000 });

  /** Selects `text`'s row and samples the preview until `to` is on and every other layer empty. */
  const switchTo = async (text: string, from: string, to: string) => {
    await alex.evaluate(() => {
      const samples: Sample[] = [];
      (window as unknown as { samples: Sample[] }).samples = samples;
      const tick = () => {
        const layers = window.dtvMonitors!.preview!.renderer.layers() as Record<string, { phase: string; frame?: { graphic: string } }>;
        samples.push({
          t: performance.now(),
          phases: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.phase])),
          graphics: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.frame?.graphic])),
        });
        requestAnimationFrame(tick);
      };
      tick();
    });
    await rows.filter({ hasText: text }).first().click();
    await phasesOn({ [to]: 'on', [from]: 'empty' });
    const samples = await alex.evaluate(() => (window as unknown as { samples: Sample[] }).samples);
    const fromEmpty = samples.find((x) => x.phases[from] === 'empty')!.t;
    const toOn = samples.find((x) => x.phases[to] === 'on')!;
    const graphic = toOn.graphics[to]!;
    const intro = (BASKETBALL_V2 as Record<string, { scene: { animations: Record<string, number> } }>)[graphic]!.scene.animations.Intro!;
    const introStart = toOn.t - intro;
    s.log(`  ${from} -> ${to} (${graphic}): ${from} empty at ${Math.round(fromEmpty)}, ${to} on at ${Math.round(toOn.t)}, Intro ${intro} ms, so the intro began ${Math.round(introStart - fromEmpty)} ms after ${from} emptied`);
    s.check(introStart >= fromEmpty - 50, `${to}'s intro starts only after ${from} has played out`);
  };

  await rows.filter({ hasText: 'Zach Spiker' }).click();
  await phasesOn({ lower: 'on' });
  await s.shoot(alex, 'staff-on');
  await switchTo('Matchup locator', 'lower', 'card');
  await s.shoot(alex, 'card-on');
  await switchTo('Zach Spiker', 'card', 'lower');
  await s.shoot(alex, 'lower-on');
});
