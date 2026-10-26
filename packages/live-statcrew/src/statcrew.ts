/**
 * Reads a StatCrew basketball XML file's box score. Pure: the shell reads the file.
 * Plays and the game clock are left out; StatCrew's clock is a per-play snapshot and the operator keeps it.
 */

import { basketball, type Sides } from '@dtv/domain';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

export interface StatcrewPlayer {
  readonly uni: string;
  readonly name: string;
  readonly starter: boolean;
  readonly line: basketball.StatLine;
}

export interface StatcrewTeam {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly line: basketball.StatLine;
  readonly players: readonly StatcrewPlayer[];
}

export interface StatcrewGame {
  readonly teams: Sides<StatcrewTeam>;
}

/** Each domain stat key and the StatCrew attribute that fills it. */
const ATTRIBUTE = {
  min: 'min',
  pts: 'tp',
  fgm: 'fgm',
  fga: 'fga',
  tpm: 'fgm3',
  tpa: 'fga3',
  ftm: 'ftm',
  fta: 'fta',
  reb: 'treb',
  ast: 'ast',
  stl: 'stl',
  blk: 'blk',
  to: 'to',
  pf: 'pf',
} as const satisfies Record<keyof basketball.StatLine, string>;

const count = z.coerce.number().int().nonnegative().default(0);
const RawStats = z.preprocess(
  // An element with no attributes parses to '', so a missing or empty one reads as no stats.
  (value) => (value && typeof value === 'object' ? value : {}),
  z.object({
    min: count,
    tp: count,
    fgm: count,
    fga: count,
    fgm3: count,
    fga3: count,
    ftm: count,
    fta: count,
    treb: count,
    ast: count,
    stl: count,
    blk: count,
    to: count,
    pf: count,
  }),
);
type RawStats = z.infer<typeof RawStats>;

const RawPlayer = z.object({
  uni: z.string(),
  name: z.string().default(''),
  checkname: z.string().default(''),
  gs: z.string().optional(),
  stats: RawStats,
});

const RawTeam = z.object({
  vh: z.string(),
  id: z.string().default(''),
  name: z.string().default(''),
  linescore: z.object({ score: z.string().optional() }).optional(),
  totals: z.object({ stats: RawStats }).optional(),
  player: z.array(RawPlayer).default([]),
});

const RawGame = z.object({ bbgame: z.object({ team: z.array(RawTeam) }) });

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => name === 'team' || name === 'player',
});

const lineOf = (stats: RawStats): basketball.StatLine =>
  basketball.StatLine.parse(Object.fromEntries(Object.entries(ATTRIBUTE).map(([key, attribute]) => [key, stats[attribute]])));

const teamOf = (raw: z.infer<typeof RawTeam>): StatcrewTeam => {
  const line = lineOf(raw.totals?.stats ?? RawStats.parse({}));
  const linescore = Number(raw.linescore?.score);
  return {
    id: raw.id,
    name: raw.name,
    score: raw.linescore?.score && Number.isInteger(linescore) && linescore >= 0 ? linescore : line.pts,
    line,
    players: raw.player
      .filter((player) => player.uni !== 'TM')
      .map((player) => ({
        uni: player.uni,
        name: player.name || player.checkname,
        starter: player.gs === '1',
        line: lineOf(player.stats),
      })),
  };
};

/** Throws, naming what is wrong, on a file that is not a complete box score: the shell treats that as half-written. */
export function parseStatcrew(xml: string): StatcrewGame {
  let tree: unknown;
  try {
    tree = parser.parse(xml);
  } catch (error) {
    throw new Error(`StatCrew XML did not parse: ${(error as Error).message}`);
  }
  const parsed = RawGame.safeParse(tree);
  if (!parsed.success) throw new Error(`StatCrew XML has no <bbgame> box score: ${z.prettifyError(parsed.error)}`);
  const { team } = parsed.data.bbgame;
  const away = team.find((candidate) => candidate.vh === 'V');
  const home = team.find((candidate) => candidate.vh === 'H');
  if (!away || !home) throw new Error('StatCrew XML needs a <team vh="V"> and a <team vh="H">');
  return { teams: { away: teamOf(away), home: teamOf(home) } };
}
