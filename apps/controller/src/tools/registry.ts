/** The tools on the Tools page: one row each. A tool's tab is `#/tools/<id>`. */

import type { ComponentType } from 'react';
import { AllsportTool } from './allsport';
import { StatcrewTool } from './statcrew';

export interface Tool {
  readonly id: string;
  readonly label: string;
  readonly component: ComponentType;
}

export const TOOLS: readonly [Tool, ...Tool[]] = [
  { id: 'statcrew', label: 'StatCrew', component: StatcrewTool },
  { id: 'allsport', label: 'AllSport', component: AllsportTool },
];

/** The tool a hash names: `#/tools/statcrew`. `#/tools`, and a hash that names no tool, give the first. */
export function toolFromHash(hash: string, tools: readonly [Tool, ...Tool[]] = TOOLS): Tool {
  const id = /^#\/tools\/([^/?]+)/.exec(hash)?.[1];
  return tools.find((tool) => tool.id === id) ?? tools[0];
}

export const toolHref = (tool: Pick<Tool, 'id'>) => `#/tools/${tool.id}`;
