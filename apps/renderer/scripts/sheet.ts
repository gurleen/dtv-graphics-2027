/**
 * Stacks a proof directory's screenshots, in name order, into one contact sheet over grey,
 * so a transparent frame reads at a glance.
 *
 *   bun apps/renderer/scripts/sheet.ts <dir> [--crop=x,y,w,h] [--scale=0.5]   writes <dir>/sheet.png
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: sheet.ts <dir> [--crop=x,y,w,h] [--scale=0.5]');
const flag = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const scale = Number(flag('scale') ?? '0.5');
const files = readdirSync(dir).filter((name) => name.endsWith('.png') && name !== 'sheet.png').sort();
const first = PNG.sync.read(readFileSync(join(dir, files[0]!)));
const [cx, cy, cw, ch] = (flag('crop') ?? `0,0,${first.width},${first.height}`).split(',').map(Number) as [number, number, number, number];
const w = Math.round(cw * scale);
const h = Math.round(ch * scale);
const GAP = 4;
const sheet = new PNG({ width: w, height: files.length * (h + GAP) });
sheet.data.fill(255);

files.forEach((file, index) => {
  const png = PNG.sync.read(readFileSync(join(dir, file)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const source = ((cy + Math.floor(y / scale)) * png.width + cx + Math.floor(x / scale)) * 4;
      const target = ((index * (h + GAP) + y) * w + x) * 4;
      const alpha = png.data[source + 3]! / 255;
      for (let c = 0; c < 3; c++) sheet.data[target + c] = Math.round(png.data[source + c]! * alpha + 64 * (1 - alpha));
      sheet.data[target + 3] = 255;
    }
  }
});

writeFileSync(join(dir, 'sheet.png'), PNG.sync.write(sheet));
console.log(`${join(dir, 'sheet.png')}: ${files.join(', ')}`);
