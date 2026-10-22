/** The mark on the active game, or the button that makes another game active after a one-line confirm. */

import { GameId } from '@dtv/domain';
import { useState } from 'react';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { useCommands } from '../app/commands';
import { useController } from '../app/context';

export function MakeActive({ id, name }: { readonly id: string; readonly name: string }) {
  const { show } = useController();
  const { send, problem } = useCommands();
  const [failed, setFailed] = useState(false);
  if (show?.game?.id === id) return <span className="active-mark" data-testid="active-show">Active</span>;
  return (
    <DialogTrigger>
      <Button className="button small" aria-label={`Make ${name} active`}>Make active</Button>
      <Popover className="popover data-portal" placement="bottom end">
        <Dialog className="confirm" aria-label={`Make ${name} active`}>
          {({ close }) => (
            <>
              <span>Make {name} active? Every operator’s preview empties. Program stays on air.</span>
              <Button
                className="button primary"
                onPress={async () => {
                  const done = await send({ type: 'activate', game: GameId.parse(id) });
                  setFailed(!done);
                  if (done) close();
                }}
              >
                Make active
              </Button>
              <Button className="button" onPress={close}>Cancel</Button>
              {failed && problem && <span className="remove" role="alert">{problem.message}</span>}
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
