import { expect, test } from 'bun:test';
import { type Tool, toolFromHash, toolHref } from './registry';

const tool = (id: string): Tool => ({ id, label: id, component: () => null });
const TOOLS: readonly [Tool, ...Tool[]] = [tool('statcrew'), tool('other')];

test('a tools hash selects the tool it names, and anything else selects the first', () => {
  expect(toolFromHash('#/tools/other', TOOLS).id).toBe('other');
  expect(toolFromHash('#/tools/statcrew', TOOLS).id).toBe('statcrew');
  expect(toolFromHash('#/tools', TOOLS).id).toBe('statcrew');
  expect(toolFromHash('#/tools/nope', TOOLS).id).toBe('statcrew');
  expect(toolFromHash('', TOOLS).id).toBe('statcrew');
  expect(toolHref({ id: 'other' })).toBe('#/tools/other');
});
