import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const project = join(root, 'build', 'preview-scorebug');
const output = join(root, 'preview', 'public', 'graphics', 'ncaa-basketball-scorebug.png');

await mkdir(project, { recursive: true });
await mkdir(join(root, 'preview', 'public', 'graphics'), { recursive: true });

const graphicRelDir = join('graphics', '10_ncaa_basketball_scorebug');
const graphicDir = join(root, graphicRelDir);
const projectGraphicDir = join(project, graphicRelDir);
const source = await readFile(join(graphicDir, '10_ncaa_basketball_scorebug.rml'), 'utf8');
const hiddenInput = '<ViewModelInstanceBoolean viewModelPropertyId="20:1002" propertyValue="false"/>';
if (!source.includes(hiddenInput)) throw new Error('Could not find the scorebug on-air input');
await mkdir(projectGraphicDir, { recursive: true });
await writeFile(join(project, 'scorebug.rml'), source.replace(hiddenInput, hiddenInput.replace('false', 'true')));
await writeFile(join(project, 'rive.yaml'), 'name: scorebug-preview\nmain: NCAA Basketball Scorebug\n');
// Every script the graphic references, so a new one needs no edit here. Tests
// are left behind: the preview project only has to render.
for (const entry of await readdir(graphicDir)) {
  if (!entry.endsWith('.luau') || entry.endsWith('.test.luau')) continue;
  await cp(join(graphicDir, entry), join(projectGraphicDir, entry));
}
await cp(join(root, 'assets'), join(project, 'assets'), { recursive: true });

const rivOutput = join(root, 'preview', 'public', 'graphics', 'ncaa-basketball-scorebug.riv');
const proc = Bun.spawn(['rive', project, `--screenshot=${output}`, '--artboard=NCAA Basketball Scorebug', '--advance=60'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
});
if ((await proc.exited) !== 0) throw new Error('Rive preview render failed');
// Screenshots build unsigned files. Sign afterwards and copy only that output:
const publish = Bun.spawn(['rive', project, '--publish'], {
  cwd: root, stdout: 'inherit', stderr: 'inherit',
});
if ((await publish.exited) !== 0) throw new Error('Rive script signing failed. Run rive login and retry.');
await cp(join(project, 'build', 'scorebug-preview.riv'), rivOutput);
console.log(`Generated ${output}`);
