import { useState } from 'react';
import { Button, Dialog, DialogTrigger, Popover, Tooltip, TooltipTrigger } from 'react-aria-components';
import { useController } from '../app/context';
import { useEditing } from './editing';
import type { EditableKind } from './fields';
import { describeLock, locksOf } from './locks';

export function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * A padlock beside a locked value. Hovering says who locked it and when; pressing asks
 * once, in one line, and then unlocks so the next import may write the field again.
 */
export function LockMark({ kind, id, field, label }: { readonly kind: EditableKind; readonly id: string; readonly field: string; readonly label: string }) {
  const { world } = useController();
  const editing = useEditing();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = world && locksOf(world, kind, id).find((each) => each.field === field);
  if (!lock) return null;
  const why = describeLock(lock);

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <TooltipTrigger delay={120} closeDelay={0}>
        <Button className="lock-mark" aria-label={`${label} is locked. ${why}`}>
          <LockIcon />
        </Button>
        <Tooltip className="tooltip" offset={6}>
          {why}
        </Tooltip>
      </TooltipTrigger>
      <Popover className="popover" placement="bottom start">
        <Dialog className="confirm" aria-label={`Unlock ${label}`}>
          <span>Unlock {label}? The next import may change it.</span>
          <Button
            className="button danger"
            onPress={async () => {
              const failed = await editing.unlock(kind, id, field);
              setError(failed);
              if (!failed) setOpen(false);
            }}
          >
            Unlock
          </Button>
          <Button className="button" onPress={() => setOpen(false)}>
            Cancel
          </Button>
          {error && <span className="field-error">{error}</span>}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
