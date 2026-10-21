import { useState } from 'react';
import { Button, ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { searchTeams, type TeamEntry } from './teams';

const LIMIT = 40;

/** A team chosen by typing: any word of its school, mascot, abbreviation or program narrows the list. */
export function TeamCombo({ label, entries, value, onChange }: {
  readonly label: string;
  readonly entries: readonly TeamEntry[];
  /** The chosen team's id, or `''`. */
  readonly value: string;
  readonly onChange: (id: string) => void;
}) {
  const chosen = entries.find((entry) => entry.team.id === value);
  const [typed, setTyped] = useState(chosen?.label ?? '');
  const narrowing = typed.trim() !== '' && typed !== chosen?.label;
  // The chosen team stays in the list so the field can show its name even when it is not among the first few.
  const items = narrowing ? searchTeams(entries, typed, LIMIT) : chosen ? [chosen, ...entries.filter((entry) => entry !== chosen).slice(0, LIMIT)] : entries.slice(0, LIMIT);
  return (
    <ComboBox
      className="team-combo"
      aria-label={label}
      items={items.map((entry) => ({ id: entry.team.id, label: entry.label }))}
      inputValue={typed}
      onInputChange={setTyped}
      selectedKey={value || null}
      onSelectionChange={(key) => {
        // With the key and the text both controlled here, the field does not rewrite its own text on a choice.
        const picked = entries.find((entry) => entry.team.id === key);
        if (picked) setTyped(picked.label);
        onChange(key === null ? '' : String(key));
      }}
      menuTrigger="focus"
      allowsEmptyCollection
    >
      <Label className="visually-hidden">{label}</Label>
      <div className="team-combo-field">
        <Input className="record-input" placeholder="Search schools…" />
        <Button className="button team-combo-button" aria-label={`Show ${label} choices`}>▾</Button>
      </div>
      <Popover className="popover select-popover data-portal">
        <ListBox className="list-box" renderEmptyState={() => <span className="faint empty">No team matches</span>}>
          {(item: { id: string; label: string }) => <ListBoxItem id={item.id} textValue={item.label} className="list-item">{item.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
