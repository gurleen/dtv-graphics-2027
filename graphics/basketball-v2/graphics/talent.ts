/** What the three talent lower thirds share: a crew member's name and the role for the night. */

import { TalentId } from '@dtv/domain';
import type { BindContext } from '@dtv/playout';
import { z } from 'zod';
import { fail, fullName } from './shared';

/** The talent a lower third names, in the order they stand on screen. */
export const talentParams = (count: number) => z.object({ talents: z.array(TalentId).length(count) });

/** The role a crew member has tonight, else the talent's default. */
export const talentRows = (ids: readonly TalentId[], context: BindContext) =>
  ids.map((id) => {
    const talent = context.world.get('talent', id) ?? fail(`Talent ${id} is gone`);
    return { name: fullName(talent), role: context.crew.find((member) => member.talent.id === id)?.role ?? talent.role };
  });

export const talentLabel = (ids: readonly TalentId[], context: BindContext) => talentRows(ids, context).map((row) => row.name).join(' + ');
