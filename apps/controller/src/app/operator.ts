/** This browser's operator: a name typed once, slugged to an OperatorId and kept in localStorage. */

import { slugify } from '@dtv/domain';
import { OperatorId } from '@dtv/playout';

const KEY = 'dtv.operator';

export function storedOperator(): OperatorId | null {
  const parsed = OperatorId.safeParse(localStorage.getItem(KEY));
  return parsed.success ? parsed.data : null;
}

/** `Alex P.` becomes `alex-p`; null for a name with no letters or digits. */
export function operatorFromName(name: string): OperatorId | null {
  const parsed = OperatorId.safeParse(slugify(name));
  return parsed.success ? parsed.data : null;
}

/** Saves the operator and reloads, so the page's one connection names the new operator in the journal. */
export function switchOperator(operator: OperatorId): void {
  localStorage.setItem(KEY, operator);
  location.reload();
}
