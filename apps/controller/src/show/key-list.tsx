/** Every key of the show page, from the key map itself, opened with `?` or the Keys button. */

import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { KEY_MAP } from './keys';

export function KeyList(props: { readonly onClose: () => void }) {
  return (
    <ModalOverlay className="overlay show-portal" isOpen isDismissable onOpenChange={(open) => !open && props.onClose()}>
      <Modal className="modal">
        <Dialog className="dialog key-list" aria-label="Keys">
          <Heading slot="title">Keys</Heading>
          <p className="muted">Keys do nothing while you type in a field.</p>
          <dl className="key-lines">
            {KEY_MAP.map((line) => (
          <div key={line.what} className="key-line">
            <dt>
              {line.bindings.length > 3 ? (
                <>
                  <kbd>{line.bindings[0]!.label}</kbd> to <kbd>{line.bindings.at(-1)!.label}</kbd>
                </>
              ) : (
                line.bindings.map((binding) => <kbd key={binding.label}>{binding.label}</kbd>)
              )}
            </dt>
            <dd>{line.what}</dd>
          </div>
        ))}
          </dl>
          <div className="dialog-actions">
            <Button className="button" onPress={props.onClose}>
              Close <kbd>Esc</kbd>
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
