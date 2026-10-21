/**
 * The whole API: eight procedures. Every caller depends on this package and never on the
 * server, so no client's typecheck pulls in SQLite. Inputs are validated with the domain's
 * zod schemas; outputs are the server's own values, typed and not re-validated.
 *
 * Every `watch` streams complete values, newest only, so a client that reconnects has
 * caught up as soon as its first value arrives.
 */

import {
  EditBatch, type EntityKind, GameApplyInput, GameId, type GameLive, type Revision, type RosterError, type RosterPlan, SeasonId, TeamId,
  type WorldSnapshot,
} from '@dtv/domain';
import { BusRef, CommandId, type OutputFrame, OperatorId, ShowCommand, type ShowView } from '@dtv/playout';
import { eventIterator, oc, type } from '@orpc/contract';
import { z } from 'zod';

const detail = z.object({ detail: z.string() });

export const contract = {
  data: {
    watch: oc.output(eventIterator(type<WorldSnapshot>())),
    /** `skipped` names the locked fields an import left alone. */
    apply: oc
      .input(EditBatch)
      .output(type<{ revision: Revision; skipped: readonly { kind: EntityKind; id: string; fields: readonly string[] }[] }>())
      .errors({
        CONFLICT: { message: 'A row changed after your basis revision', data: detail },
        INVALID_REFERENCE: { message: 'An edit points at a row that does not exist', data: detail },
        DUPLICATE: { message: 'An edit repeats a natural key', data: detail },
        INCONSISTENT: { message: 'The edits break a rule that spans rows', data: detail },
      }),
    /** Parses a roster CSV and plans it against the team-season. Writes nothing; commit `plan.edits` with `apply`. */
    planRoster: oc
      .input(z.object({ team: TeamId, season: SeasonId, csv: z.string().min(1), prune: z.boolean().default(false) }))
      .output(type<{ ok: true; plan: RosterPlan } | { ok: false; errors: readonly RosterError[] }>()),
  },
  game: {
    watch: oc.input(z.object({ game: GameId })).output(eventIterator(type<GameLive>())),
    /** Absolute values, so a resend changes nothing. */
    apply: oc
      .input(GameApplyInput)
      .output(type<{ revision: Revision; live: GameLive }>())
      .errors({
        NOT_AUTHORITY: { message: 'Another source writes this field group', data: z.object({ group: z.string() }) },
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
  output: {
    watch: oc.input(z.object({ bus: BusRef })).output(eventIterator(type<OutputFrame>())),
  },
};

export type Contract = typeof contract;
