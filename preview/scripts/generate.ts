import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Every graphic the preview page shows. `slug` names the runtime asset and reference PNG
// in preview/public/graphics/; `onAirInput` is the scene's isPlaying default, switched on
// in the temporary copy so the reference PNG shows the settled on-air frame.
const PREVIEW_GRAPHICS = [
  {
    slug: 'ncaa-basketball-scorebug',
    scene: 'graphics/10_ncaa_basketball_scorebug/10_ncaa_basketball_scorebug.rml',
    artboard: 'NCAA Basketball Scorebug',
    onAirInput: '<ViewModelInstanceBoolean viewModelPropertyId="20:1002" propertyValue="false"/>',
    advance: 60,
  },
  {
    slug: 'basketball-halftime-adjustments',
    scene: 'graphics/basketball-v2/halftime_adjustments.rml',
    artboard: 'Basketball Halftime Adjustments v2',
    onAirInput: '<ViewModelInstanceBoolean viewModelPropertyId="44:1002" propertyValue="false"/>',
    advance: 90,
  },
] as const;

type PreviewGraphic = (typeof PREVIEW_GRAPHICS)[number];

const root = resolve(import.meta.dir, '../..');
const publicDir = join(root, 'preview', 'public', 'graphics');

const run = async (command: string[], failure: string) => {
  const proc = Bun.spawn(command, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if ((await proc.exited) !== 0) throw new Error(failure);
};

const generate = async (graphic: PreviewGraphic) => {
  // Each graphic compiles alone: the repository's scenes compile as one document, so the
  // preview project holds only this scene, its scripts and the shared assets.
  const project = join(root, 'build', `preview-${graphic.slug}`);
  const projectName = `${graphic.slug}-preview`;
  const sceneDir = join(root, graphic.scene, '..');
  const projectSceneDir = join(project, graphic.scene, '..');
  await mkdir(projectSceneDir, { recursive: true });

  const source = await readFile(join(root, graphic.scene), 'utf8');
  if (!source.includes(graphic.onAirInput)) throw new Error(`Could not find the on-air input of ${graphic.scene}`);
  await writeFile(join(project, `${graphic.slug}.rml`), source.replace(graphic.onAirInput, graphic.onAirInput.replace('false', 'true')));
  await writeFile(join(project, 'rive.yaml'), `name: ${projectName}\nmain: ${graphic.artboard}\n`);
  // Every script beside the scene, so a new one needs no edit here. Tests are left
  // behind: the preview project only has to render.
  for (const entry of await readdir(sceneDir)) {
    if (!entry.endsWith('.luau') || entry.endsWith('.test.luau')) continue;
    await cp(join(sceneDir, entry), join(projectSceneDir, entry));
  }
  await cp(join(root, 'assets'), join(project, 'assets'), { recursive: true });

  const image = join(publicDir, `${graphic.slug}.png`);
  await run(['rive', project, `--screenshot=${image}`, `--artboard=${graphic.artboard}`, `--advance=${graphic.advance}`], `Rive preview render of ${graphic.slug} failed`);
  // Screenshots build unsigned files. Sign afterwards and copy only that output:
  await run(['rive', project, '--publish'], 'Rive signing failed. Run rive login and retry.');
  await cp(join(project, 'build', `${projectName}.riv`), join(publicDir, `${graphic.slug}.riv`));
  console.log(`Generated ${image}`);
};

// `bun preview/scripts/generate.ts [slug ...]` regenerates the named graphics, or all.
const requested = process.argv.slice(2);
const unknown = requested.filter((slug) => !PREVIEW_GRAPHICS.some((graphic) => graphic.slug === slug));
if (unknown.length > 0) throw new Error(`Unknown preview graphic: ${unknown.join(', ')}`);

await mkdir(publicDir, { recursive: true });
// One at a time: each publish is a request to Rive's compile service.
for (const graphic of PREVIEW_GRAPHICS) {
  if (requested.length === 0 || requested.includes(graphic.slug)) await generate(graphic);
}
