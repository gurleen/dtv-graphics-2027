/**
 * The whole API: twelve procedures. Every caller depends on this package and never on the
 * server, so no client's typecheck pulls in SQLite. Inputs are validated with the domain's
 * zod schemas; outputs are the server's own values, typed and not re-validated.
 *
 * Every `watch` streams complete values, newest only, so a client that reconnects has
 * caught up as soon as its first value arrives.
 */

import {
  EditBatch, type EntityKind, GameApplyInput, GameId, type GameLive, ProgramCode, type Revision, type RosterError, type RosterPlan, type SdvLoadReport,
  SeasonId, TeamId, type WorldSnapshot,
} from '@dtv/domain';
import { BusRef, CommandId, type OutputFrame, OperatorId, ShowCommand, type ShowView } from '@dtv/playout';
import { eventIterator, oc, type } from '@orpc/contract';
import { z } from 'zod';

const detail = z.object({ detail: z.string() });

/** The StatCrew feed process the server supervises. `exited` is a process that ended on its own (a crash, bad arguments); `exitCode` says how. */
export interface StatcrewFeed {
  readonly state: 'stopped' | 'running' | 'exited';
  /** What was last requested, kept after a stop so a form prefills after a reload. */
  readonly file: string | null;
  readonly game: GameId | null;
  /** Epoch ms the running or last run began. */
  readonly startedAt: number | null;
  readonly exitCode: number | null;
  /** The last 200 stdout and stderr lines of the current or last run, newest last. */
  readonly log: readonly string[];
}

/** Why a data commit is refused. */
const refusals = {
  CONFLICT: { message: 'A row changed after your basis revision', data: detail },
  INVALID_REFERENCE: { message: 'An edit points at a row that does not exist', data: detail },
  DUPLICATE: { message: 'An edit repeats a natural key', data: detail },
  INCONSISTENT: { message: 'The edits break a rule that spans rows', data: detail },
};

export const contract = {
  data: {
    watch: oc.output(eventIterator(type<WorldSnapshot>())),
    /** `skipped` names the locked fields an import left alone. */
    apply: oc
      .input(EditBatch)
      .output(type<{ revision: Revision; skipped: readonly { kind: EntityKind; id: string; fields: readonly string[] }[] }>())
      .errors(refusals),
    /** Parses a roster CSV and plans it against the team-season. Writes nothing; commit `plan.edits` with `apply`. */
    planRoster: oc
      .input(z.object({ team: TeamId, season: SeasonId, csv: z.string().min(1), prune: z.boolean().default(false) }))
      .output(type<{ ok: true; plan: RosterPlan } | { ok: false; errors: readonly RosterError[] }>()),
    /** Downloads the program-season's sportsdataverse files and commits what they change as one import batch. A second load writes nothing. */
    load: oc
      .input(z.object({ program: ProgramCode, season: SeasonId }))
      .output(type<SdvLoadReport>())
      .errors({ ...refusals, UNAVAILABLE: { message: 'A sportsdataverse file could not be downloaded or read', data: detail } }),
  },
  game: {
    watch: oc.input(z.object({ game: GameId })).output(eventIterator(type<GameLive>())),
    /** Absolute values, so a resend changes nothing. */
    apply: oc
      .input(GameApplyInput)
      .output(type<{ revision: Revision; live: GameLive }>())
      .errors({
        NOT_AUTHORITY: { message: 'Another source writes this field group', data: z.object({ group: z.string() }) },
        NOT_IN_GAME: { message: 'A command names a player who is not on that team in this game', data: z.object({ player: z.string() }) },
        NO_GAME: { message: 'No such game, or not that sport' },
      }),
  },
  show: {
    watch: oc.input(z.object({ operator: OperatorId })).output(eventIterator(type<ShowView>())),
    /** A repeated `id` answers with the first result instead of applying the command again. */
    command: oc
      .input(z.object({ id: CommandId, command: ShowCommand }))
      .output(type<{ revision: Revision; changed: boolean }>())
      .errors({ REJECTED: { message: 'The command cannot apply', data: z.object({ reason: z.string() }) } }),
  },
  tools: {
    statcrew: {
      watch: oc.output(eventIterator(type<StatcrewFeed>())),
      /** Idempotent: the same file and game while running changes nothing; other values restart the feed. */
      start: oc
        .input(z.object({ file: z.string().min(1), game: GameId }))
        .output(type<StatcrewFeed>())
        .errors({
          NO_GAME: { message: 'No such basketball game' },
          NO_FILE: { message: 'No file at that path on the server' },
        }),
      /** Interrupts the feed so it hands score and stats back to the operator, then waits for it to end. Idempotent. */
      stop: oc.output(type<StatcrewFeed>()),
    },
  },
  output: {
    watch: oc.input(z.object({ bus: BusRef })).output(eventIterator(type<OutputFrame>())),
  },
};

export type Contract = typeof contract;
