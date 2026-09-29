#!/usr/bin/env bun
// Renders a scene's state machine frame by frame with the Rive CLI, for
// reviewing an intro or outro, and optionally tiles the frames into a contact
// sheet over a broadcast-grey field.
//
//   bun scripts/render_frames.ts <scene.rml> --frames=0-72:6 --out=build/frames/staff/intro
//     [--outro | --on-air] [--data=key=value ...] [--sheet=<columns>] [--crop=w:h:x:y] [--tile-width=440]
//
// --frames   first-last:step, counted at 60 fps after the state machine starts.
// --out      output prefix; frames are written as <prefix>_f000.png.
// --outro    renders the Outro instead of the Intro. The CLI applies --data only
//            before the scene runs, so the scene is copied to a scratch
//            directory whose EntryState goes straight to Hold (<ns>:40) and
//            isPlaying is false. The working copy is never edited.
// --on-air   starts in Hold with isPlaying true, by the same scratch copy, for
//            reviewing another layer that --data sets off, such as a team
//            change (--data=step=1 on the starting five lower third).
// --data     extra view model values, repeatable (e.g. --data=detail=).
// --sheet    also writes <prefix>_sheet.png with this many columns.
// --crop     crops each frame before tiling (default: the whole frame).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dir, "..");
const CONCURRENCY = 6;
const ATTEMPTS = 3;

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    frames: { type: "string" },
    out: { type: "string" },
    outro: { type: "boolean", default: false },
    "on-air": { type: "boolean", default: false },
    data: { type: "string", multiple: true, default: [] },
    sheet: { type: "string" },
    crop: { type: "string" },
    "tile-width": { type: "string", default: "440" },
  },
});

const scenePath = positionals[0];
if (!scenePath || !values.frames || !values.out) {
  console.error(
    "usage: bun scripts/render_frames.ts <scene.rml> --frames=first-last:step --out=<prefix> [--outro | --on-air] [--data=k=v] [--sheet=cols] [--crop=w:h:x:y]",
  );
  process.exit(2);
}

const frameSpec = /^(\d+)-(\d+)(?::(\d+))?$/.exec(values.frames);
if (!frameSpec) throw new Error(`--frames must be first-last:step, got ${values.frames}`);
const [first, last, step] = [Number(frameSpec[1]), Number(frameSpec[2]), Number(frameSpec[3] ?? 1)];
const frames: number[] = [];
for (let frame = first; frame <= last; frame += step) frames.push(frame);

const sceneFile = resolve(scenePath);
const sceneText = await Bun.file(sceneFile).text();
const artboard = /<Artboard name="([^"]+)" id="(\d+):2"/.exec(sceneText);
if (!artboard) throw new Error(`${scenePath}: no <Artboard name="…" id="<ns>:2"> found`);
const [, artboardName, namespace] = artboard;

const outPrefix = resolve(values.out);
await Bun.$`mkdir -p ${join(outPrefix, "..")}`.quiet();

let projectDir = ROOT;
let scratchDir: string | undefined;
if (values.outro && values["on-air"]) throw new Error("--outro and --on-air are exclusive");
if (values.outro || values["on-air"]) {
  scratchDir = await mkdtemp(join(tmpdir(), "render-frames-"));
  await Bun.$`rsync -a --exclude build --exclude node_modules --exclude preview-dist ${ROOT}/ ${scratchDir}/`.quiet();
  const scratchScene = join(scratchDir, relative(ROOT, sceneFile));
  const entry = `<StateTransition stateToId="${namespace}:43"/></EntryState>`;
  if (!sceneText.includes(entry)) throw new Error(`${scenePath}: EntryState does not target Hidden (${namespace}:43)`);
  await Bun.write(scratchScene, sceneText.replace(entry, `<StateTransition stateToId="${namespace}:40"/></EntryState>`));
  projectDir = scratchDir;
}

const dataArgs = [`--data=isPlaying=${values.outro ? "false" : "true"}`, ...values.data.map((d) => `--data=${d}`)];
const frameFile = (frame: number) => `${outPrefix}_f${String(frame).padStart(3, "0")}.png`;

// About 1-3% of parallel CLI runs abort; a lone retry always succeeds.
// --advance=0 renders the authored rest pose, not the state machine, so frame 0
// is rendered as the first state-machine frame.
async function renderFrame(frame: number): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const proc = Bun.spawn(
      ["rive", ".", "--quiet", `--artboard=${artboardName}`, ...dataArgs, `--screenshot=${frameFile(frame)}`, `--advance=${Math.max(frame, 1)}`],
      { cwd: projectDir, stdout: "ignore", stderr: "ignore" },
    );
    if ((await proc.exited) === 0) return true;
  }
  return false;
}

const failed: number[] = [];
const queue = [...frames];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let frame = queue.shift(); frame !== undefined; frame = queue.shift()) {
      if (!(await renderFrame(frame))) failed.push(frame);
    }
  }),
);
if (scratchDir) await rm(scratchDir, { recursive: true, force: true });

console.log(`${frames.length - failed.length}/${frames.length} frames of "${artboardName}" -> ${relative(process.cwd(), outPrefix)}_f*.png`);
if (failed.length) {
  console.error(`failed frames: ${failed.sort((a, b) => a - b).join(", ")}`);
  process.exit(1);
}

if (values.sheet) {
  const columns = Number(values.sheet);
  const rows = Math.ceil(frames.length / columns);
  const crop = values.crop ? `crop=${values.crop},` : "";
  const sheet = `${outPrefix}_sheet.png`;
  const inputs = frames.flatMap((frame) => ["-i", frameFile(frame)]);
  const overlays = frames.map((_, i) => `[bg${i}][${i}:v]overlay=shortest=1[f${i}]`).join(";");
  const backgrounds = frames.map((_, i) => `color=c=0x2B3038:s=1920x1080[bg${i}]`).join(";");
  const tiles = frames.map((_, i) => `[f${i}]${crop}scale=${values["tile-width"]}:-1[t${i}]`).join(";");
  const labels = frames.map((_, i) => `[t${i}]`).join("");
  const filter = `${backgrounds};${overlays};${tiles};${labels}concat=n=${frames.length}:v=1:a=0,tile=${columns}x${rows}:padding=4:color=0x111111`;
  await Bun.$`ffmpeg -y -loglevel error ${inputs} -filter_complex ${filter} -frames:v 1 ${sheet}`;
  console.log(`contact sheet -> ${relative(process.cwd(), sheet)}`);
}
