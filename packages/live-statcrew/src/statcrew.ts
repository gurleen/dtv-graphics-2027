/**
 * Reads a StatCrew basketball XML file's box score, play by play, period and team fouls. Pure: the shell reads the file.
 * The game clock is left out; StatCrew's clock is a per-play snapshot and the operator keeps it.
 */

import type { StatcrewPlay } from '@dtv/api';
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
  /** Team fouls by period number, from `<statsbyprd>`; a period with none recorded is absent. */
  readonly fouls: ReadonlyMap<number, number>;
  readonly players: readonly StatcrewPlayer[];
}

export interface StatcrewGame {
  readonly teams: Sides<StatcrewTeam>;
  /** The current period, from `<status>`; null on a file without one. */
  readonly period: number | null;
  /** Regulation periods, from `<rules prds>`: 2 for halves, 4 for quarters. Null on a file without them. */
  readonly periods: number | null;
  /** In the file's order, which is the game's. */
  readonly plays: readonly StatcrewPlay[];
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
  totals: z.object({ stats: RawStats, statsbyprd: z.array(z.object({ prd: z.coerce.number().int().positive(), pf: count })).catch([]).default([]) }).optional(),
  player: z.array(RawPlayer).default([]),
});

const text = z.string().default('');
const RawPlay = z.object({ vh: text, time: text, uni: text, team: text, checkname: text, action: text, type: text, vscore: z.string().optional(), hscore: z.string().optional() });

const RawPeriod = z.object({ number: z.coerce.number().int().nonnegative().catch(0), play: z.array(RawPlay).default([]) });

const RawPlays = z.preprocess(
  // An empty <plays/> parses to '', as an empty <stats/> does.
  (value) => (value && typeof value === 'object' ? value : {}),
  z.object({ period: z.array(RawPeriod).default([]) }),
);

const positive = z.coerce.number().int().positive();

const RawGame = z.object({
  bbgame: z.object({
    venue: z.object({ rules: z.object({ prds: positive }).optional().catch(undefined) }).optional().catch(undefined),
    status: z.object({ period: positive }).optional().catch(undefined),
    team: z.array(RawTeam),
    plays: RawPlays,
  }),
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  // A play's `team` is an attribute, not the <team> element.
  isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ['team', 'player', 'statsbyprd', 'period', 'play'].includes(name),
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
    fouls: new Map(raw.totals?.statsbyprd.map((period) => [period.prd, period.pf])),
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

const scoreOf = (raw: z.infer<typeof RawPlay>): Sides<number> | null => {
  const away = Number(raw.vscore);
  const home = Number(raw.hscore);
  return raw.vscore && raw.hscore && Number.isInteger(away) && Number.isInteger(home) ? { away, home } : null;
};

const SIDE_OF = { V: 'away', H: 'home' } as const;

const playsOf = (raw: z.infer<typeof RawPlays>, teams: Sides<StatcrewTeam>): StatcrewPlay[] =>
  raw.period.flatMap((period) =>
    period.play.map((play) => {
      const side = SIDE_OF[play.vh as keyof typeof SIDE_OF] ?? null;
      return {
        period: period.number,
        time: play.time,
        side,
        team: play.team || (side ? teams[side].id : ''),
        uni: play.uni,
        name: play.checkname,
        action: play.action,
        type: play.type,
        score: scoreOf(play),
      };
    }),
  );

/** Throws, naming what is wrong, on a file that is not a complete box score: the shell treats that as half-written. */
export function parseStatcrew(xml: string): StatcrewGame {
  let tree: unknown;
  try {
    // Validated, because the parser alone closes the tags a file cut short leaves open.
    tree = parser.parse(xml, true);
  } catch (error) {
    throw new Error(`StatCrew XML did not parse: ${(error as Error).message}`);
  }
  const parsed = RawGame.safeParse(tree);
  if (!parsed.success) throw new Error(`StatCrew XML has no <bbgame> box score: ${z.prettifyError(parsed.error)}`);
  const { venue, status, team, plays } = parsed.data.bbgame;
  const away = team.find((candidate) => candidate.vh === 'V');
  const home = team.find((candidate) => candidate.vh === 'H');
  if (!away || !home) throw new Error('StatCrew XML needs a <team vh="V"> and a <team vh="H">');
  const teams = { away: teamOf(away), home: teamOf(home) };
  return { teams, period: status?.period ?? null, periods: venue?.rules?.prds ?? null, plays: playsOf(plays, teams) };
}
