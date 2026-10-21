/**
 * Builds one signed .riv per basketball-v2 scene, for the renderer to load.
 *
 *   bun run riv:build                          every scene, into build/riv/<scene-stem>.riv
 *   bun scripts/build_riv.ts basketball_scorebug player_lower_third   only these
 *
 * A browser loads only a signed .riv: an unsigned one never settles its load promise and
 * logs nothing. So every scene goes through `rive --publish`, which needs `rive login`.
 * Each scene is staged as a project of its own, so its .riv holds one artboard and the
 * assets, not all seventeen scenes.
 */

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SCENE_DIR = join(ROOT, 'graphics/basketball-v2');
const STAGING = join(ROOT, 'build/riv-src');
const OUT = join(ROOT, 'build/riv');

// The Rive CLI dies by a signal (SIGABRT, SIGTRAP, SIGSEGV) on about 1 run in 20 with no
// message, and a pause between runs does not change the rate. A run that dies by a signal
// runs again; one that exits with an error code (not logged in, too many publishes) failed
// for a reason and does not.
const ATTEMPTS = 3;

async function run(command: readonly string[]): Promise<void> {
  let failure = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const child = Bun.spawn([...command], { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
    const exitCode = await child.exited;
    if (exitCode === 0) return;
    failure = child.signalCode ? String(child.signalCode) : `exit code ${exitCode}`;
    if (!child.signalCode) break;
    if (attempt < ATTEMPTS) console.warn(`\`${command.join(' ')}\` died with ${failure}; retrying (${attempt + 1} of ${ATTEMPTS})`);
  }
  throw new Error(`\`${command.join(' ')}\` failed (${failure}). If it says you are signed out, run \`rive login\`.`);
}

const stemOf = (file: string) => file.replace(/\.rml$/, '');

const scenes = await Promise.all(
  (await readdir(SCENE_DIR))
    .filter((entry) => entry.endsWith('.rml'))
    .sort()
    .map(async (file) => {
      const artboard = /<Artboard name="([^"]+)"/.exec(await Bun.file(join(SCENE_DIR, file)).text())?.[1];
      if (!artboard) throw new Error(`${file} has no <Artboard name="...">`);
      return { file, artboard };
    }),
);
const wanted = process.argv.slice(2);
const unknown = wanted.filter((stem) => !scenes.some((scene) => stemOf(scene.file) === stem));
if (unknown.length) {
  console.error(`No scene named ${unknown.join(', ')}. Scenes: ${scenes.map((scene) => stemOf(scene.file)).join(', ')}`);
  process.exit(1);
}
const selected = wanted.length ? scenes.filter((scene) => wanted.includes(stemOf(scene.file))) : scenes;

// A publish is watermarked until the project is bound to a Rive file, so each staged project
// carries the repository's `push:` binding.
const rootConfig = await Bun.file(join(ROOT, 'rive.yaml')).text();
const pushBinding = rootConfig.match(/^push:\n(?:[ \t]+.*\n?)*/m)?.[0] ?? '';
if (!pushBinding) console.warn('rive.yaml has no `push:` binding; every .riv will be watermarked.');

const scripts = (await readdir(SCENE_DIR)).filter((entry) => entry.endsWith('.luau') && !entry.endsWith('.test.luau'));

await mkdir(OUT, { recursive: true });
for (const scene of selected) {
  const stem = stemOf(scene.file);
  const stage = join(STAGING, stem);
  await rm(stage, { recursive: true, force: true });
  const stagedScenes = join(stage, 'graphics/basketball-v2');
  await mkdir(stagedScenes, { recursive: true });
  // Every scene script goes along: a scene names the ones it uses, and an unused one only has to build.
  for (const file of [scene.file, ...scripts]) await cp(join(SCENE_DIR, file), join(stagedScenes, file));
  await cp(join(ROOT, 'assets'), join(stage, 'assets'), { recursive: true });
  await writeFile(join(stage, 'rive.yaml'), `name: ${stem}\nmain: ${scene.artboard}\n${pushBinding}`);

  await run(['rive', relative(ROOT, stage), '--publish', '--quiet']);
  await cp(join(stage, 'build', `${stem}.riv`), join(OUT, `${stem}.riv`));
  const size = Bun.file(join(OUT, `${stem}.riv`)).size;
  console.log(`build/riv/${stem}.riv ${(size / 1024).toFixed(0)} KB`);
}
