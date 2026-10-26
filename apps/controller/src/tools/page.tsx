/** The Tools page: a tab list down the left, one tab per tool in the registry, and the selected tool beside it. */

import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import './tools.css';
import { TOOLS, toolFromHash, toolHref } from './registry';

export function ToolsPage(props: { readonly hash: string }) {
  const selected = toolFromHash(props.hash);
  return (
    <Tabs
      className="tools-page"
      orientation="vertical"
      selectedKey={selected.id}
      onSelectionChange={(key) => {
        const tool = TOOLS.find((each) => each.id === key);
        if (tool) location.hash = toolHref(tool);
      }}
    >
      <TabList className="tools-tabs" aria-label="Tools">
        {TOOLS.map((tool) => (
          <Tab key={tool.id} id={tool.id} className="tools-tab">
            {tool.label}
          </Tab>
        ))}
      </TabList>
      {TOOLS.map(({ id, component: Component }) => (
        <TabPanel key={id} id={id} className="tools-panel">
          <Component />
        </TabPanel>
      ))}
    </Tabs>
  );
}
