/** The show's name, who is connected, the Reconnecting badge, Clear All, and Show | Data. */

import { useState } from 'react';
import { Button, Link } from 'react-aria-components';
import { useCommands } from './commands';
import { useController } from './context';
import { NameDialog } from './name';
import type { Route } from './shell';

export function TopBar(props: { readonly route: Route }) {
  const { operator, show, status } = useController();
  const { clearAll } = useCommands();
  const [renaming, setRenaming] = useState(false);
  const others = (show?.operators ?? []).filter((each) => each !== operator);
  return (
    <header className="topbar">
      <span className="brand">DTV Controller</span>
      <span className="show-name">{show?.show ? show.show.name : 'No active show'}</span>
      <nav className="nav" aria-label="Pages">
        <Link href="#/show" className="nav-link" data-current={props.route === 'show' || undefined}>
          Show
        </Link>
        <Link href="#/data" className="nav-link" data-current={props.route === 'data' || undefined}>
          Data
        </Link>
      </nav>
      <div className="spacer" />
      <div className="operators" aria-label="Operators connected">
        <span className="label">Operators</span>
        <Button className="chip me" onPress={() => setRenaming(true)} aria-label={`You are ${operator}; change`}>
          {operator} <span className="muted">(you)</span>
        </Button>
        {others.map((each) => (
          <span key={each} className="chip" data-has-preview={Object.hasOwn(show?.otherPreviews ?? {}, each) || undefined}>
            {each}
          </span>
        ))}
      </div>
      {status === 'reconnecting' && (
        <span className="badge reconnecting" role="status" data-testid="reconnecting">
          Reconnecting…
        </span>
      )}
      <Button className="button danger hold" data-arming={clearAll.arming || undefined} onPressStart={clearAll.down} onPressEnd={clearAll.up}>
        Clear all <kbd>hold ⇧⌫</kbd>
      </Button>
      {renaming && <NameDialog current={operator} connected={show?.operators ?? []} onClose={() => setRenaming(false)} />}
    </header>
  );
}
