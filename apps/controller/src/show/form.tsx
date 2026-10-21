/**
 * A cue's params as a form, generic over every graphic: `paramForm` reads the params
 * schema into fields, and this renders each kind of field. No graphic has form code.
 */

import type { EntityKind } from '@dtv/domain';
import { blankGroup, blankValue, type FormField, type FormNode } from '@dtv/playout';
import {
  Button, ComboBox, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, TextField, ToggleButton, ToggleButtonGroup,
} from 'react-aria-components';
import type { PickerOption } from './pickers';

type Value = Record<string, unknown>;
export type Options = (kind: EntityKind, current: string | null) => readonly PickerOption[];

/** `fgPct` reads "Fg pct"; `talents` reads "Talents". */
export const humanize = (name: string) => {
  const words = name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words[0]!.toUpperCase() + words.slice(1);
};

export function ParamsForm(props: { readonly fields: readonly FormField[]; readonly value: Value; readonly onChange: (value: Value) => void; readonly options: Options }) {
  const { value, onChange } = props;
  return (
    <>
      {props.fields.map((field) => {
        const current = value[field.name] ?? field.fallback;
        const set = (next: unknown) => {
          const { [field.name]: _old, ...rest } = value;
          onChange(next === undefined || (field.optional && next === '') ? rest : { ...rest, [field.name]: next });
        };
        return <Control key={field.name} label={humanize(field.name)} node={field.node} value={current} onChange={set} options={props.options} />;
      })}
    </>
  );
}

function Control(props: { readonly label: string; readonly node: FormNode; readonly value: unknown; readonly onChange: (value: unknown) => void; readonly options: Options }) {
  const { label, node, value, onChange } = props;
  switch (node.kind) {
    case 'text':
      return (
        <TextField className="field" value={typeof value === 'string' ? value : ''} onChange={onChange}>
          <Label>{label}</Label>
          <Input />
        </TextField>
      );
    case 'choice':
      return <Choice label={label} options={node.options.map((option) => ({ id: option, label: humanize(option) }))} value={value} onChange={onChange} />;
    case 'ref': {
      const options = props.options(node.ref, typeof value === 'string' && value ? value : null);
      return (
        <ComboBox
          className="field picker"
          defaultItems={options}
          selectedKey={typeof value === 'string' && value ? value : null}
          onSelectionChange={(key) => key !== null && onChange(String(key))}
          menuTrigger="focus"
          data-ref={node.ref}
        >
          <Label>{label}</Label>
          <div className="combo">
            <Input placeholder={`Pick a ${node.ref}`} />
            <Button className="combo-button">▾</Button>
          </div>
          <Popover className="popover">
            <ListBox className="listbox" items={options}>
              {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
            </ListBox>
          </Popover>
        </ComboBox>
      );
    }
    case 'choices': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      const full = node.max !== null && chosen.length >= node.max;
      return (
        <div className="field">
          <span className="field-label">
            {label}
            {node.max !== null && <span className="muted"> · up to {node.max}, in order</span>}
          </span>
          <ToggleButtonGroup
            className="chips"
            selectionMode="multiple"
            aria-label={label}
            selectedKeys={chosen}
            onSelectionChange={(keys) => {
              const picked = [...keys].map(String);
              onChange([...chosen.filter((key) => picked.includes(key)), ...picked.filter((key) => !chosen.includes(key))]);
            }}
          >
            {node.options.map((option) => (
              <ToggleButton key={option} id={option} className="chip-toggle" isDisabled={full && !chosen.includes(option)}>
                {option}
                {chosen.includes(option) && <span className="order">{chosen.indexOf(option) + 1}</span>}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
      );
    }
    case 'list': {
      const items = Array.isArray(value) ? value : [];
      const fixed = node.max !== null && node.min === node.max;
      return (
        <fieldset className="group">
          <legend>{label}</legend>
          {items.map((item, index) => (
            <div className="list-item" key={index}>
              <Control
                label={`${index + 1}`}
                node={node.item}
                value={item}
                onChange={(next) => onChange(items.map((each, at) => (at === index ? next : each)))}
                options={props.options}
              />
              {!fixed && items.length > node.min && (
                <Button className="button small" aria-label={`Remove ${label} ${index + 1}`} onPress={() => onChange(items.filter((_, at) => at !== index))}>
                  ✕
                </Button>
              )}
            </div>
          ))}
          {!fixed && (node.max === null || items.length < node.max) && (
            <Button className="button small" onPress={() => onChange([...items, blankValue(node.item)])}>
              Add
            </Button>
          )}
        </fieldset>
      );
    }
    case 'group':
      return (
        <fieldset className="group">
          <legend>{label}</legend>
          <ParamsForm fields={node.fields} value={(value as Value | undefined) ?? {}} onChange={onChange} options={props.options} />
        </fieldset>
      );
    case 'variants': {
      const current = (value as Value | undefined) ?? {};
      const variant = node.variants.find((each) => each.value === current[node.key]) ?? node.variants[0]!;
      return (
        <fieldset className="group variants">
          <Choice
            label={label}
            options={node.variants.map((each) => ({ id: each.value, label: humanize(each.value) }))}
            value={variant.value}
            onChange={(picked) => {
              const next = node.variants.find((each) => each.value === picked)!;
              onChange({ [node.key]: next.value, ...blankGroup(next.fields) });
            }}
          />
          <ParamsForm fields={variant.fields} value={current} onChange={(next) => onChange({ ...next, [node.key]: variant.value })} options={props.options} />
        </fieldset>
      );
    }
    case 'fixed':
      return null;
  }
}

function Choice(props: { readonly label: string; readonly options: readonly PickerOption[]; readonly value: unknown; readonly onChange: (value: string) => void }) {
  return (
    <Select className="field select" selectedKey={typeof props.value === 'string' ? props.value : null} onSelectionChange={(key) => key !== null && props.onChange(String(key))}>
      <Label>{props.label}</Label>
      <Button className="select-button">
        <SelectValue />
        <span aria-hidden>▾</span>
      </Button>
      <Popover className="popover">
        <ListBox className="listbox" items={props.options}>
          {(option) => <ListBoxItem className="option">{option.label}</ListBoxItem>}
        </ListBox>
      </Popover>
    </Select>
  );
}
