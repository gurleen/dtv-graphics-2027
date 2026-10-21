/** Every key of the show page, from the key map itself, opened with `?` or the Keys button. */

import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { KEY_MAP, type KeyLine } from './keys';

export function KeyList(props: { readonly onClose: () => void }) {
  const section = (name: KeyLine['section']) => (
    <section className="key-section" aria-label={`${name} keys`}>
      <h3>{name}</h3>
      <dl>
        {KEY_MAP.filter((line) => line.section === name).map((line) => (
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
    </section>
  );
  return (
    <ModalOverlay className="overlay" isOpen isDismissable onOpenChange={(open) => !open && props.onClose()}>
      <Modal className="modal wide">
        <Dialog className="dialog key-list" aria-label="Keys">
          <Heading slot="title">Keys</Heading>
          <p className="muted">Keys do nothing while you type in a field.</p>
          <div className="key-sections">
            {section('Show')}
            {section('Game')}
          </div>
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
