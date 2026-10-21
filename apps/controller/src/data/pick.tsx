import { Button, Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components';

export interface Option {
  readonly id: string;
  readonly label: string;
}

/** A dropdown over a short list. `''` is the empty choice when `empty` names it. */
export function Pick({ label, value, options, empty, onChange, className }: { readonly label: string; readonly value: string; readonly options: readonly Option[]; readonly empty?: string; readonly onChange: (id: string) => void; readonly className?: string }) {
  const all = empty === undefined ? options : [{ id: '', label: empty }, ...options];
  return (
    <Select className={className ? `pick ${className}` : 'pick'} aria-label={label} selectedKey={value} onSelectionChange={(key) => onChange(String(key))}>
      <Label className="visually-hidden">{label}</Label>
      <Button className="pick-button">
        <SelectValue />
        <span aria-hidden="true">▾</span>
      </Button>
      <Popover className="popover select-popover data-portal">
        <ListBox className="list-box" items={all}>
          {(option) => <ListBoxItem id={option.id} textValue={option.label} className="list-item">{option.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </Select>
  );
}
