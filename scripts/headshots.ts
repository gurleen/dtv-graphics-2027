/**
 * bun scripts/headshots.ts fetch <espnId> <program> <roster url>
 *     downloads a Sidearm roster page's headshots to data/headshots/<espnId>/<program>/<jersey>.png
 * bun scripts/headshots.ts push [--force]
 *     uploads data/headshots/**.png to the dtv-headshots R2 bucket
 */

import { Glob } from 'bun';
import { join } from 'node:path';
import { HEADSHOT_KEY } from '../packages/domain/src/headshots';

const BUCKET = 'dtv-headshots';
const DIR = join(import.meta.dir, '../data/headshots');
const [command, ...flags] = process.argv.slice(2);

const page = async (url: string) => {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
};

interface Found {
  readonly jersey: string;
  readonly name: string;
  readonly image: string | null;
}
const decode = (text: string) => text.replaceAll('&amp;', '&').replaceAll('&#39;', "'");

/** The newer Sidearm sites (Drexel): the card's thumbnail is an image-resizer URL around the original. */
function listCards(html: string): Found[] {
  return html
    .split('data-test-id="s-person-card-list__root"')
    .slice(1)
    .flatMap((card) => {
      const label = /aria-label="([^"]+?) jersey number (\S+) full bio"/.exec(card);
      if (!label) return [];
      const original = /crop\?url=([^&"]+)/.exec(card)?.[1];
      const image = original ? decodeURIComponent(original) : null;
      return [{ name: decode(label[1]!), jersey: label[2]!, image: image?.includes('person-default') ? null : image }];
    });
}

/** The classic Sidearm sites (Penn State): the card lazy-loads its image, so each player's page gives it as og:image. */
async function profileCards(html: string, site: string): Promise<Found[]> {
  const cards = html.split('class="roster-card-item"').slice(1);
  return Promise.all(
    cards.map(async (card) => {
      const jersey = /roster-card-jersey-number[^>]*>#?(\d+)</.exec(card)?.[1] ?? '';
      const name = decode(/alt="([^"]+)"/.exec(card)?.[1] ?? '');
      const link = /href="([^"]+)"/.exec(card)?.[1] ?? '';
      const profile = await (await page(new URL(link, site).href)).text();
      const image = /og:image" content="([^"]+)"/.exec(profile)?.[1] ?? null;
      return { name, jersey, image: image && !image.includes('default') ? decode(image) : null };
    }),
  );
}

async function fetchRoster(espnId: string, program: string, rosterUrl: string) {
  const html = await (await page(rosterUrl)).text();
  const found = html.includes('s-person-card-list__root') ? listCards(html) : await profileCards(html, rosterUrl);
  const dir = join(DIR, espnId, program);
  await Bun.$`mkdir -p ${dir}`;
  for (const { name, jersey, image } of found) {
    if (!image) {
      console.info(`no photo   #${jersey} ${name}`);
      continue;
    }
    const raw = join(dir, `${jersey}.download`);
    await Bun.write(raw, await (await page(image)).arrayBuffer());
    await Bun.$`sips -s format png ${raw} --out ${join(dir, `${jersey}.png`)}`.quiet();
    await Bun.$`rm ${raw}`;
    console.info(`downloaded #${jersey} ${name}`);
  }
}

if (command === 'fetch') {
  const [espnId, program, rosterUrl] = flags;
  if (!espnId || !program || !rosterUrl) throw new Error('usage: bun scripts/headshots.ts fetch <espnId> <program> <roster url>');
  await fetchRoster(espnId, program, rosterUrl);
  process.exit(0);
}
if (command !== 'push') {
  console.error('usage: bun scripts/headshots.ts fetch <espnId> <program> <roster url> | push [--force]');
  process.exit(2);
}

const wrangler = (...args: string[]) => Bun.spawnSync(['bunx', 'wrangler', 'r2', 'object', ...args, '--remote'], { stdout: 'pipe', stderr: 'pipe' });

let uploaded = 0;
let skipped = 0;
const bad: string[] = [];
for (const key of [...new Glob('**/*.png').scanSync(DIR)].sort()) {
  if (!HEADSHOT_KEY.test(key)) {
    bad.push(key);
    continue;
  }
  const exists = wrangler('get', `${BUCKET}/${key}`, '--file', '/dev/null').exitCode === 0;
  if (exists && !flags.includes('--force')) {
    skipped++;
    continue;
  }
  const put = wrangler('put', `${BUCKET}/${key}`, '--file', join(DIR, key), '--content-type', 'image/png');
  if (put.exitCode !== 0) throw new Error(`upload of ${key} failed:\n${put.stderr}`);
  uploaded++;
}
console.info(`headshots: uploaded ${uploaded}, skipped ${skipped}`);
if (bad.length) {
  console.error(`not <espnId>/<program>/<jersey>.png, so not uploaded:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
