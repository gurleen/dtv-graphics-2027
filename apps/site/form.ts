/**
 * The content form: what a person may change on one cue. Free-text params and choices come
 * from the graphic's params schema; every text the scene shows can be replaced with an
 * override. Ids (a player, a team) stay as the demo cued them.
 */

import type { CueId } from '@dtv/domain';
import { type AnyGraphic, boundProps, type LocalShow, type Overrides, paramFields } from '@dtv/playout';

/** `awayLine1` reads "Away line 1". */
const humanize = (name: string) => {
  const words = name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words[0]!.toUpperCase() + words.slice(1);
};

const DEBOUNCE_MS = 250;

/** Fills `form` with the cue's controls. Returns the way to take them off again. */
export function mountForm(options: {
  readonly form: HTMLFormElement;
  readonly entry: AnyGraphic;
  readonly show: LocalShow;
  readonly cue: CueId;
  readonly onError: (message: string) => void;
}): () => void {
  const { form, entry, show, cue, onError } = options;
  const current = () => show.show().rundown.find((candidate) => candidate.id === cue)!;

  const label = (text: string, control: HTMLElement) => {
    const wrapper = document.createElement('label');
    wrapper.append(text, control);
    return wrapper;
  };

  const paramControls = paramFields(entry.params).map((field) => {
    const value = String(current().params[field.name] ?? '');
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.kind === 'choice') {
      control = document.createElement('select');
      for (const option of field.options) control.add(new Option(option, option));
    } else {
      control = document.createElement('input');
      control.type = 'text';
    }
    control.name = field.name;
    control.value = value;
    return label(humanize(field.name), control);
  });

  const baseline = show.unedited(cue) ?? {};
  const kinds = boundProps(entry.scene);
  const textInputs = new Map<string, HTMLInputElement>();
  for (const [name, kind] of kinds) {
    const bound = baseline[name];
    if (kind !== 'string' || typeof bound !== 'string' || bound === '') continue;
    const input = document.createElement('input');
    input.type = 'text';
    const overridden = current().overrides[name];
    input.value = String(overridden ?? bound);
    if (overridden !== undefined) input.dataset.edited = 'true';
    textInputs.set(name, input);
  }

  const section = (title: string, controls: readonly HTMLElement[]) => {
    if (!controls.length) return [];
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    group.append(legend, ...controls);
    return [group];
  };
  form.replaceChildren(
    ...section('Content', paramControls),
    ...section('Text on screen', [...textInputs].map(([name, input]) => label(humanize(name), input))),
  );

  let pending: ReturnType<typeof setTimeout> | undefined;
  const apply = () => {
    const params = { ...current().params };
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name]')) params[control.name] = control.value;
    // The text a bind gives for the new params, so an input left alone follows them.
    const bound = show.unedited(cue) ?? {};
    const overrides: Record<string, string> = {};
    for (const [name, input] of textInputs) {
      if (!input.dataset.edited) continue;
      if (input.value.toUpperCase() === bound[name]) delete input.dataset.edited;
      else overrides[name] = input.value;
    }
    const result = show.edit(cue, { params, overrides: overrides as Overrides });
    onError(result.ok ? '' : result.error);
    if (!result.ok) return;
    const after = show.unedited(cue) ?? {};
    for (const [name, input] of textInputs) if (!(name in overrides) && typeof after[name] === 'string') input.value = after[name];
  };
  const onInput = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && !target.name) target.dataset.edited = 'true';
    clearTimeout(pending);
    pending = setTimeout(apply, DEBOUNCE_MS);
  };
  form.addEventListener('input', onInput);
  return () => {
    clearTimeout(pending);
    form.removeEventListener('input', onInput);
    form.replaceChildren();
  };
}
