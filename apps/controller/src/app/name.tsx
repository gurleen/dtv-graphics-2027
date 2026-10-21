/** Asks for the operator's name: on the first visit, and from the operator chip to change it. */

import type { OperatorId } from '@dtv/playout';
import { useState } from 'react';
import { Button, Dialog, Form, Heading, Input, Label, Modal, ModalOverlay, TextField } from 'react-aria-components';
import { operatorFromName, switchOperator } from './operator';

export function NameDialog(props: {
  readonly current: OperatorId | null;
  /** Operators connected now, to warn before taking a name in use. */
  readonly connected: readonly OperatorId[];
  /** Present when the dialog can close without a name: a rename. */
  readonly onClose?: () => void;
}) {
  const [name, setName] = useState('');
  const operator = operatorFromName(name);
  const taken = operator !== null && operator !== props.current && props.connected.includes(operator);
  return (
    <ModalOverlay className="overlay" isOpen isDismissable={!!props.onClose} onOpenChange={(open) => !open && props.onClose?.()}>
      <Modal className="modal">
        <Dialog className="dialog name-dialog" aria-label="Operator name">
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              if (operator && operator !== props.current) switchOperator(operator);
              else props.onClose?.();
            }}
          >
            <Heading slot="title">{props.current ? 'Change operator' : 'Who is operating?'}</Heading>
            <TextField className="field" value={name} onChange={setName} autoFocus isRequired>
              <Label>Your name</Label>
              <Input placeholder="Alex" />
            </TextField>
            <p className="hint">
              {operator ? (
                <>
                  You will be <code>{operator}</code>. Your preview and the journal use this name.
                </>
              ) : (
                'Letters or digits, such as Alex or Sam.'
              )}
            </p>
            {taken && (
              <p className="warning" role="alert">
                <code>{operator}</code> is already connected on another controller. Two controllers with one name share one preview.
              </p>
            )}
            <div className="dialog-actions">
              {props.onClose && (
                <Button className="button" onPress={props.onClose}>
                  Cancel
                </Button>
              )}
              <Button className="button primary" type="submit" isDisabled={!operator}>
                {taken ? 'Use it anyway' : props.current ? 'Change' : 'Start'}
              </Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
