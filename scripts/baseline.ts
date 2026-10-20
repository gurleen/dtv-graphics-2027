#!/usr/bin/env bun
// Renders the settled on-air frame of every basketball-v2 scene and compares two
// such captures, so a change to the repo can prove it left every pixel alone.
//
//   bun scripts/baseline.ts capture <outDir>      one <scene-file-stem>.png per scene
//   bun scripts/baseline.ts compare <dirA> <dirB> one line per file; exits 1 on any difference
//
// A PNG pair counts as identical when its bytes match. When the bytes differ the
// pair is decoded to raw RGBA and compared pixel by pixel, so an encoder change
// is reported apart from a rendering change.

import { mkdir, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SCENES_DIR = join(ROOT, "graphics/basketball-v2");
const CONCURRENCY = 4;
const ATTEMPTS = 3;
const ADVANCE = 180;

// The CLI dies by a signal on about 1 run in 20; an error exit code is a real failure.
async function renderScene(artboard: string, outFile: string): Promise<string | undefined> {
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const proc = Bun.spawn(
      ["rive", ".", "--quiet", `--artboard=${artboard}`, "--data=isPlaying=true", `--advance=${ADVANCE}`, `--screenshot=${outFile}`],
      { cwd: ROOT, stdout: "ignore", stderr: "pipe" },
    );
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code === 0) return undefined;
    failure = proc.signalCode ?? `exit code ${code}: ${stderr.trim()}`;
    if (!proc.signalCode) break;
  }
  return failure;
}

async function capture(outDir: string) {
  const out = resolve(outDir);
  await mkdir(out, { recursive: true });
  const scenes = (await readdir(SCENES_DIR)).filter((f) => f.endsWith(".rml")).sort();
  const queue = [...scenes];
  const failures: string[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let scene = queue.shift(); scene !== undefined; scene = queue.shift()) {
        const stem = basename(scene, ".rml");
        const text = await Bun.file(join(SCENES_DIR, scene)).text();
        const artboard = /<Artboard name="([^"]+)"/.exec(text)?.[1];
        if (!artboard) {
          failures.push(`${scene}: no <Artboard name="..."> found`);
          continue;
        }
        const failure = await renderScene(artboard, join(out, `${stem}.png`));
        if (failure) failures.push(`${scene} (${artboard}): ${failure}`);
        else console.log(`${stem}.png <- ${artboard}`);
      }
    }),
  );
  console.log(`${scenes.length - failures.length}/${scenes.length} scenes captured -> ${out}`);
  if (failures.length) {
    for (const failure of failures) console.error(`failed: ${failure}`);
    process.exit(1);
  }
}

async function decode(file: string): Promise<Uint8Array> {
  const proc = Bun.spawn(["ffmpeg", "-loglevel", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg could not decode ${file}`);
  return bytes;
}

async function describeDifference(a: string, b: string): Promise<{ same: boolean; line: string }> {
  let pa: Uint8Array, pb: Uint8Array;
  try {
    [pa, pb] = await Promise.all([decode(a), decode(b)]);
  } catch (error) {
    return { same: false, line: `differs: bytes differ and pixels could not be decoded (${(error as Error).message})` };
  }
  if (pa.length !== pb.length) return { same: false, line: `differs: decoded sizes ${pa.length} vs ${pb.length}` };
  let pixels = 0;
  let maxDelta = 0;
  for (let i = 0; i < pa.length; i += 4) {
    let differs = false;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(pa[i + c] - pb[i + c]);
      if (delta) differs = true;
      if (delta > maxDelta) maxDelta = delta;
    }
    if (differs) pixels++;
  }
  if (pixels === 0) return { same: true, line: "identical pixels (PNG bytes differ)" };
  return { same: false, line: `differs: ${pixels} pixels, max channel delta ${maxDelta}` };
}

async function pngsIn(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
}

async function compare(dirA: string, dirB: string) {
  const [a, b] = [resolve(dirA), resolve(dirB)];
  const [filesA, filesB] = await Promise.all([pngsIn(a), pngsIn(b)]);
  const names = [...new Set([...filesA, ...filesB])].sort();
  let identical = 0;
  for (const name of names) {
    if (!filesA.includes(name)) console.log(`${name}: missing in ${a}`);
    else if (!filesB.includes(name)) console.log(`${name}: missing in ${b}`);
    else {
      const [bytesA, bytesB] = await Promise.all([Bun.file(join(a, name)).bytes(), Bun.file(join(b, name)).bytes()]);
      if (Buffer.compare(bytesA, bytesB) === 0) {
        console.log(`${name}: identical bytes`);
        identical++;
      } else {
        const { same, line } = await describeDifference(join(a, name), join(b, name));
        console.log(`${name}: ${line}`);
        if (same) identical++;
      }
    }
  }
  console.log(`${identical}/${names.length} identical (${a} vs ${b})`);
  if (identical !== names.length) process.exit(1);
}

const [command, ...args] = Bun.argv.slice(2);
if (command === "capture" && args.length === 1) await capture(args[0]);
else if (command === "compare" && args.length === 2) await compare(args[0], args[1]);
else {
  console.error("usage: bun scripts/baseline.ts capture <outDir> | compare <dirA> <dirB>");
  process.exit(2);
}
