/**
 * Rundown edits. The rundown is the active game's Show row, so every edit is one `data.apply`
 * that puts the show with its new rundown, on the revision the editor read; the first edit of
 * a game with no show stored creates the row. An edited cue on air
 * reaches air through `refresh`; one in my preview is cued again, since a slot is frozen
 * when it is cued.
 */

import { type Cue, CueId, type GraphicId, type Revision, showOf } from '@dtv/domain';
import type { CueView } from '@dtv/playout';
import { reasonOf, useCommands } from '../app/commands';
import { useController } from '../app/context';

export interface RundownEdits {
  /** Replaces one cue. `basis` is the revision the editor began from, so a change by someone else since is a CONFLICT. */
  save(cue: Cue, basis: Revision): Promise<boolean>;
  add(cue: Cue, at: number): Promise<boolean>;
  /** Adds the cues at the end of the rundown in one write. */
  append(cues: readonly Cue[]): Promise<boolean>;
  remove(id: CueId): Promise<boolean>;
  /** Moves the cues `ids` to sit before `before`, or to the end. */
  move(ids: readonly CueId[], before: CueId | null): Promise<boolean>;
}

/** `player-lower-third-3f9a2c`: readable in the journal, unique without a counter. */
export const newCueId = (graphic: GraphicId) => CueId.parse(`${graphic.split('/').pop()}-${crypto.randomUUID().slice(0, 6)}`);

export function useRundownEdits(): RundownEdits | null {
  const { api, operator, world, revision, show: view } = useController();
  const { send, fail } = useCommands();
  if (!view?.game || !world || revision === null) return null;
  const show = showOf(world, view.game.id);

  const write = async (rundown: readonly Cue[], basis: Revision, onConflict = 'The rundown changed just now; nothing was saved. Try again.') => {
    try {
      await api.data.apply({ origin: 'manual', basis, edits: [{ op: 'put', kind: 'show', value: { ...show, rundown: [...rundown] } }] });
      return true;
    } catch (error) {
      fail((error as { code?: unknown }).code === 'CONFLICT' ? onConflict : `Rundown not saved: ${reasonOf(error)}`);
      return false;
    }
  };

  return {
    async save(cue, basis) {
      const before = view.rundown.find((each) => each.ref.kind === 'rundown' && each.ref.cue === cue.id);
      const replaced = show.rundown.map((each) => (each.id === cue.id ? cue : each));
      const conflict = 'Someone changed the rundown while you edited this cue; nothing was saved. Your edit is still here: Save again to write over their change, or Revert.';
      if (!(await write(replaced, basis, conflict))) return false;
      if (before?.onProgram && before.layer) void send({ type: 'refresh', layer: before.layer, slot: before.onProgram });
      if (before?.inMyPreview) void send({ type: 'cue', operator, ref: before.ref });
      return true;
    },
    add: (cue, at) => write([...show.rundown.slice(0, at), cue, ...show.rundown.slice(at)], revision),
    append: (cues) => write([...show.rundown, ...cues], revision),
    remove: (id) => write(show.rundown.filter((cue) => cue.id !== id), revision),
    move(ids, before) {
      const moving = show.rundown.filter((cue) => ids.includes(cue.id));
      const rest = show.rundown.filter((cue) => !ids.includes(cue.id));
      const at = before === null ? rest.length : rest.findIndex((cue) => cue.id === before);
      return write([...rest.slice(0, at), ...moving, ...rest.slice(at)], revision);
    },
  };
}

/** The rundown cue a view names. */
export const cueIdOf = (cue: CueView): CueId | null => (cue.ref.kind === 'rundown' ? cue.ref.cue : null);
