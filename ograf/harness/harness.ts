/**
 * The harness page's behaviour: a stand-in OGraf renderer.
 *
 * It reads a package's manifest, builds a control for every property in the manifest's
 * `schema`, imports `main` as a module, and calls the Graphic's methods. Because it is
 * driven entirely by the manifest, it works for any graphic this repository builds.
 */

type GddProperty = {
  type: string;
  gddType?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
};

type Manifest = {
  id: string;
  name: string;
  main: string;
  stepCount?: number;
  schema?: { properties?: Record<string, GddProperty> };
};

type Graphic = HTMLElement & {
  load(params: { data?: unknown; renderType: string; renderCharacteristics: unknown }): Promise<unknown>;
  dispose(params: Record<string, never>): Promise<unknown>;
  playAction(params: { delta?: number; goto?: number; skipAnimation?: boolean }): Promise<unknown>;
  stopAction(params: { skipAnimation?: boolean }): Promise<unknown>;
  updateAction(params: { data: unknown; skipAnimation?: boolean }): Promise<unknown>;
};

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const packageSelect = element<HTMLSelectElement>('package');
const fieldsForm = element<HTMLFormElement>('fields');
const stage = element<HTMLDivElement>('stage');
const logElement = element<HTMLPreElement>('log');

const log = (message: string) => {
  const stamp = new Date().toLocaleTimeString([], { hour12: false });
  logElement.textContent = `${stamp}  ${message}\n${logElement.textContent}`;
};

let manifest: Manifest | null = null;
let manifestUrl = '';
let graphic: Graphic | null = null;

// --- controls ----------------------------------------------------------------------

const controlFor = (name: string, property: GddProperty) => {
  const label = document.createElement('label');
  label.textContent = property.title ?? name;
  if (property.description) label.title = property.description;

  let input: HTMLInputElement | HTMLSelectElement;
  if (property.enum) {
    const select = document.createElement('select');
    for (const option of property.enum) select.add(new Option(option, option));
    input = select;
  } else {
    const field = document.createElement('input');
    if (property.type === 'boolean') field.type = 'checkbox';
    else if (property.gddType === 'color-rrggbb') field.type = 'color';
    else if (property.type === 'number' || property.type === 'integer') field.type = 'number';
    else field.type = 'text';
    input = field;
  }
  input.name = name;
  input.dataset.type = property.type;
  label.appendChild(input);
  return label;
};

const resetFields = () => {
  for (const property of Object.keys(manifest?.schema?.properties ?? {})) {
    const input = fieldsForm.elements.namedItem(property) as HTMLInputElement | HTMLSelectElement | null;
    const spec = manifest!.schema!.properties![property]!;
    if (!input) continue;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(spec.default);
    else input.value = spec.default === undefined ? '' : String(spec.default);
  }
};

/** The `data` payload: every control that holds a value. */
const collectData = () => {
  const data: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(manifest?.schema?.properties ?? {})) {
    const input = fieldsForm.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (!input) continue;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') data[name] = input.checked;
    else if (input.value === '') continue;
    else if (spec.type === 'number' || spec.type === 'integer') data[name] = Number(input.value);
    else data[name] = input.value;
  }
  return data;
};

// --- lifecycle ---------------------------------------------------------------------

const selectPackage = async (url: string) => {
  await teardown();
  manifestUrl = url;
  manifest = (await (await fetch(url)).json()) as Manifest;
  fieldsForm.replaceChildren(
    ...Object.entries(manifest.schema?.properties ?? {}).map(([name, spec]) => controlFor(name, spec)),
  );
  resetFields();
  log(`manifest ${manifest.id} — ${Object.keys(manifest.schema?.properties ?? {}).length} properties, stepCount ${manifest.stepCount ?? 1}`);
};

const teardown = async () => {
  if (!graphic) return;
  await graphic.dispose({});
  graphic.remove();
  graphic = null;
};

const call = async (label: string, action: () => Promise<unknown>) => {
  const started = performance.now();
  try {
    const result = await action();
    log(`${label} -> ${JSON.stringify(result)} (${Math.round(performance.now() - started)} ms)`);
  } catch (error) {
    log(`${label} threw: ${String(error)}`);
    throw error;
  }
};

const loadGraphic = async () => {
  if (!manifest) return;
  await teardown();
  const moduleUrl = new URL(manifest.main, new URL(manifestUrl, location.href)).href;
  const { default: GraphicClass } = (await import(/* @vite-ignore */ moduleUrl)) as { default: CustomElementConstructor };

  // The class registers itself on import; a renderer still needs a tag to instantiate.
  let tag = '';
  for (const candidate of [manifest.id, `ograf-${manifest.id}`]) {
    if (customElements.get(candidate) === GraphicClass) tag = candidate;
  }
  if (!tag) {
    tag = `harness-${manifest.id}`;
    if (!customElements.get(tag)) customElements.define(tag, class extends GraphicClass {});
  }
  const instance = document.createElement(tag) as Graphic;
  stage.appendChild(instance);
  graphic = instance;

  await call('load', () =>
    instance.load({
      data: collectData(),
      renderType: 'realtime',
      renderCharacteristics: { resolution: { width: 1920, height: 1080 }, frameRate: 60, accessToPublicInternet: true },
    }),
  );
};

element<HTMLButtonElement>('load').onclick = () => void loadGraphic();
element<HTMLButtonElement>('dispose').onclick = () => void call('dispose', () => teardown().then(() => undefined));
element<HTMLButtonElement>('play').onclick = () => void call('playAction', () => graphic!.playAction({}));
element<HTMLButtonElement>('previous').onclick = () => void call('playAction', () => graphic!.playAction({ delta: -1 }));
element<HTMLButtonElement>('stop').onclick = () => void call('stopAction', () => graphic!.stopAction({}));
element<HTMLButtonElement>('update').onclick = () =>
  void call('updateAction', () => graphic!.updateAction({ data: collectData() }));
element<HTMLButtonElement>('reset').onclick = () => resetFields();
packageSelect.onchange = () => void selectPackage(packageSelect.value);

const built = (await (await fetch('/packages.json')).json()) as { id: string; manifest: string }[];
for (const entry of built) packageSelect.add(new Option(entry.id, entry.manifest));
if (built.length) await selectPackage(built[0]!.manifest);
else log('No packages in build/ograf. Run: bun run ograf:build');
