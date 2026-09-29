/**
 * Builds an OGraf package from a graphic directory under ograf/graphics/.
 *
 *   bun ograf/scripts/build_package.ts ograf/graphics/basketball_v2_scorebug
 *
 * The output is build/ograf/<id>/ plus build/ograf/<id>.zip:
 *
 *   <id>.ograf.json   manifest.base.json with the `schema` generated from the field table
 *   index.mjs         the web component, Rive runtime and wasm bundled in
 *   graphic.riv       signed, one artboard
 *   thumbnail.png     the settled on-air frame
 *
 * Nothing here is specific to one graphic; adding the next one means adding a directory,
 * not editing this file.
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { GraphicSource, RiveGraphicDefinition } from '../shared/definition';
import { toJsonSchema } from '../shared/schema';

const root = resolve(import.meta.dir, '../..');

// The Rive CLI crashes at random: about 1 run in 20, screenshot or publish, dies with
// SIGABRT, SIGTRAP or SIGSEGV and no message (a screenshot's log stops at `deferred
// replay: inline`). A pause between runs does not change the rate. A command that dies
// by a signal therefore runs again, up to ATTEMPTS runs in all; one that exits with an
// error code (not logged in, no such project, too many publishes) has failed for a
// reason and does not.
const ATTEMPTS = 3;

const run = async (command: string[], options: { cwd?: string; hint?: string } = {}) => {
  const { cwd = root, hint: failureHint } = options;
  let failure = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const process = Bun.spawn(command, { cwd, stdout: 'inherit', stderr: 'inherit' });
    const exitCode = await process.exited;
    if (exitCode === 0) return;
    failure = process.signalCode ?? `exit code ${exitCode}`;
    if (!process.signalCode) break;
    if (attempt < ATTEMPTS) {
      console.warn(`\`${command.join(' ')}\` died with ${failure}; retrying (${attempt + 1} of ${ATTEMPTS})`);
    }
  }
  throw new Error(`\`${command.join(' ')}\` failed (${failure})${failureHint ? `. ${failureHint}` : ''}`);
};

const graphicArgument = process.argv[2];
if (!graphicArgument) {
  console.error('usage: bun ograf/scripts/build_package.ts <graphic-directory>');
  process.exit(1);
}
const graphicDirectory = resolve(root, graphicArgument);

// --- read the graphic's declarations -----------------------------------------------

const { DEFINITION, SOURCE } = (await import(join(graphicDirectory, 'definition.ts'))) as {
  DEFINITION: RiveGraphicDefinition;
  SOURCE: GraphicSource;
};
const manifestBase = JSON.parse(await readFile(join(graphicDirectory, 'manifest.base.json'), 'utf8'));
const id: string = manifestBase.id;
if (!id) throw new Error(`${graphicArgument}/manifest.base.json has no "id"`);

const packageDirectory = join(root, 'build', 'ograf', id);
const stagingDirectory = join(root, 'build', 'ograf-src', id);
await rm(packageDirectory, { recursive: true, force: true });
await rm(stagingDirectory, { recursive: true, force: true });
await mkdir(packageDirectory, { recursive: true });

// --- 1. stage a single-graphic Rive project ----------------------------------------

// Building the repository as a whole would put all six artboards and every asset into
// one .riv. A staging project with just this scene keeps the package to what it needs.
const sceneDirectory = join(root, SOURCE.sceneDirectory);
const stagedSceneDirectory = join(stagingDirectory, SOURCE.sceneDirectory);
await mkdir(stagedSceneDirectory, { recursive: true });

let sceneFile: string | undefined;
for (const entry of await readdir(sceneDirectory)) {
  // Tests are left behind: the staged project only has to build.
  if (entry.endsWith('.test.luau')) continue;
  if (entry.endsWith('.rml')) {
    if (SOURCE.sceneFile && entry !== SOURCE.sceneFile) continue;
    sceneFile = entry;
  } else if (!entry.endsWith('.luau')) continue;
  await cp(join(sceneDirectory, entry), join(stagedSceneDirectory, entry));
}
if (SOURCE.sceneFile && !sceneFile) {
  throw new Error(`Scene file ${SOURCE.sceneFile} not found in ${SOURCE.sceneDirectory}`);
}
if (!sceneFile) throw new Error(`No .rml found in ${SOURCE.sceneDirectory}`);
await cp(join(root, 'assets'), join(stagingDirectory, 'assets'), { recursive: true });

// A publish is watermarked until the project is bound to a Rive file, so carry the
// repository's own `push:` binding across to the staging project. Until someone runs
// `rive push` at the repository root there is nothing to carry, and the .riv — and so
// the packaged graphic — is watermarked.
const rootConfiguration = await readFile(join(root, 'rive.yaml'), 'utf8');
const pushBinding = rootConfiguration.match(/^push:\n(?:[ \t]+.*\n?)*/m)?.[0] ?? '';
if (!pushBinding) {
  console.warn('rive.yaml has no `push:` binding; the published .riv will be watermarked.');
}
await writeFile(
  join(stagingDirectory, 'rive.yaml'),
  `name: ${id}\nmain: ${DEFINITION.artboard}\n${pushBinding}`,
);

const stagedRelative = relative(root, stagingDirectory);

// --- 2. build and sign the .riv ----------------------------------------------------

await run(['rive', stagedRelative, '--publish'], { hint: 'Run `rive login` and retry.' });
await cp(
  join(stagingDirectory, 'build', `${id}.riv`),
  join(packageDirectory, basename(DEFINITION.riv)),
);

// --- 3. thumbnail ------------------------------------------------------------------

// The scene's on-air flag defaults to false so the graphic starts hidden; --data flips
// it for this render only, leaving the scene file alone.
await run([
  'rive',
  stagedRelative,
  `--screenshot=${relative(root, join(packageDirectory, 'thumbnail.png'))}`,
  `--artboard=${DEFINITION.artboard}`,
  `--data=${DEFINITION.onAirProperty}=true`,
  // Render past the longest intro so the packaged thumbnail shows the settled frame.
  `--advance=${Math.ceil((DEFINITION.introDuration * 60) / 1000) + 2}`,
]);

// --- 4. bundle the web component ---------------------------------------------------

const bundle = await Bun.build({
  entrypoints: [join(graphicDirectory, SOURCE.entry)],
  target: 'browser',
  format: 'esm',
  minify: true,
  naming: 'index.mjs',
  outdir: packageDirectory,
});
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log);
  throw new Error('Bundling the web component failed');
}

// --- 5. manifest -------------------------------------------------------------------

const manifest = { ...manifestBase, schema: toJsonSchema(DEFINITION.fields) };
const manifestPath = join(packageDirectory, `${id}.ograf.json`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Validate against the specification's own schemas, vendored in docs/ograf.
const schemaDirectory = join(root, 'docs', 'ograf', 'json-schemas');
const schemaFiles = [
  'graphics/schema.json',
  'gdd/object.json',
  'gdd/gdd-types.json',
  'gdd/basic-types.json',
  'gdd/playout-options.json',
  'lib/action.json',
  'lib/constraints/boolean.json',
  'lib/constraints/number.json',
  'lib/constraints/string.json',
];
// gdd/object.json $refs the 2020-12 meta-schema, which Ajv2020 registers for itself.
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
for (const file of schemaFiles) {
  ajv.addSchema(JSON.parse(await readFile(join(schemaDirectory, file), 'utf8')));
}
const validate = ajv.getSchema('https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json')!;
if (!validate(manifest)) {
  for (const error of validate.errors ?? []) {
    console.error(`  ${error.instancePath || '/'} ${error.message}`);
  }
  throw new Error(`${id}.ograf.json does not conform to the OGraf manifest schema`);
}
console.log(`manifest valid: ${relative(root, manifestPath)}`);

// --- 6. zip ------------------------------------------------------------------------

const ografDirectory = join(root, 'build', 'ograf');
const archive = join(ografDirectory, `${id}.zip`);
await rm(archive, { force: true });
// -X drops the resource forks macOS would otherwise add. Zipping from build/ograf keeps
// the package folder as the archive's single root entry.
await run(['zip', '-rXq', archive, id], { cwd: ografDirectory });

console.log(`\nBuilt build/ograf/${id}/ and build/ograf/${id}.zip`);
for (const entry of (await readdir(packageDirectory)).sort()) {
  const size = (await Bun.file(join(packageDirectory, entry)).arrayBuffer()).byteLength;
  console.log(`  ${entry.padEnd(36)} ${(size / 1024).toFixed(0)} KB`);
}
