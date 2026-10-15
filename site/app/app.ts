/**
 * The stakeholder preview page: one graphic at a time, on a stage, with Show and Hide.
 *
 * It reads graphics.json (written by site/scripts/build_site.ts), then drives a built
 * OGraf package through the GraphicsAPI (`load`, `playAction`, `stopAction`,
 * `updateAction`, `dispose`), the same calls a broadcast renderer makes. A graphic that
 * is meant to sit beside the scorebug is shown with the scorebug on air behind it.
 */

interface CatalogEntry {
  id: string;
  name: string;
  placement: 'scorebug' | 'with-scorebug' | 'full-frame';
  /** Keys of the sponsors whose logos the graphic carries. */
  sponsors: string[];
  manifest: string;
  thumbnail?: string;
}

interface Sponsor {
  key: string;
  name: string;
  logo: string;
  chip: 'light' | 'dark';
}

interface Catalog {
  scorebug: string | null;
  sponsors: Sponsor[];
  graphics: CatalogEntry[];
}

interface GddProperty {
  type: string;
  gddType?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

interface Manifest {
  main: string;
  stepCount?: number;
  schema?: { properties?: Record<string, GddProperty> };
}

interface PlayResult {
  currentStep?: number;
}

interface Graphic extends HTMLElement {
  load(params: { data?: unknown; renderType: string; renderCharacteristics: unknown }): Promise<unknown>;
  dispose(params: Record<string, never>): Promise<unknown>;
  playAction(params: { delta?: number; goto?: number }): Promise<PlayResult>;
  stopAction(params: Record<string, never>): Promise<unknown>;
  updateAction(params: { data: unknown }): Promise<unknown>;
}

/** A graphic on the stage, with its manifest. */
interface Loaded {
  element: Graphic;
  manifest: Manifest;
}

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const list = element<HTMLElement>('list');
const title = element<HTMLElement>('title');
const stage = element<HTMLDivElement>('stage');
const status = element<HTMLElement>('status');
const fieldsForm = element<HTMLFormElement>('fields');
const showButton = element<HTMLButtonElement>('show');
const hideButton = element<HTMLButtonElement>('hide');
const previousButton = element<HTMLButtonElement>('previous');
const nextButton = element<HTMLButtonElement>('next');
const scorebugToggle = element<HTMLLabelElement>('scorebug-toggle');
const scorebugInput = element<HTMLInputElement>('scorebug');
const backdrop = element<HTMLSelectElement>('backdrop');

const catalog = (await (await fetch('/graphics.json')).json()) as Catalog;

const SECTION_TITLES: Record<CatalogEntry['placement'], string> = {
  scorebug: 'Scorebug',
  'with-scorebug': 'Beside the scorebug',
  'full-frame': 'Full frame',
};

let current: CatalogEntry | null = null;
/** The sponsor the list is narrowed to, or null for every graphic. */
let sponsorFilter: string | null = null;
let primary: Loaded | null = null;
let scorebug: Loaded | null = null;
let onAir = false;
let busy = false;
/** Bumped on every selection so a slow load for a graphic already left behind is discarded. */
let generation = 0;

// --- list --------------------------------------------------------------------------

const renderSponsors = () => {
  if (!catalog.sponsors.length) return [];
  const heading = document.createElement('h3');
  heading.textContent = 'Sponsors';
  const grid = document.createElement('div');
  grid.className = 'sponsors';
  for (const sponsor of catalog.sponsors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.sponsor = sponsor.key;
    button.dataset.chip = sponsor.chip;
    button.title = sponsor.name;
    button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img');
    image.src = sponsor.logo;
    image.alt = sponsor.name;
    button.appendChild(image);
    // Tapping the selected sponsor again shows every graphic.
    button.onclick = () => {
      sponsorFilter = sponsorFilter === sponsor.key ? null : sponsor.key;
      applySponsorFilter();
    };
    grid.appendChild(button);
  }
  return [heading, grid];
};

const renderList = () => {
  const nodes: Node[] = renderSponsors();
  let section: CatalogEntry['placement'] | null = null;
  for (const entry of catalog.graphics) {
    if (entry.placement !== section) {
      section = entry.placement;
      const heading = document.createElement('h3');
      heading.textContent = SECTION_TITLES[section];
      heading.dataset.section = section;
      nodes.push(heading);
    }
    const link = document.createElement('a');
    link.href = `#${entry.id}`;
    link.dataset.id = entry.id;
    if (entry.thumbnail) {
      const image = document.createElement('img');
      image.src = entry.thumbnail;
      image.alt = '';
      image.loading = 'lazy';
      link.appendChild(image);
    }
    const label = document.createElement('span');
    label.textContent = entry.name;
    link.appendChild(label);
    nodes.push(link);
  }
  list.replaceChildren(...nodes);
};

/** Hides the graphics without the chosen sponsor, and any section left empty. */
const applySponsorFilter = () => {
  for (const button of list.querySelectorAll<HTMLButtonElement>('[data-sponsor]')) {
    button.setAttribute('aria-pressed', String(button.dataset.sponsor === sponsorFilter));
  }
  const visible = (entry: CatalogEntry) => sponsorFilter === null || entry.sponsors.includes(sponsorFilter);
  for (const link of list.querySelectorAll<HTMLAnchorElement>('a')) link.hidden = !visible(catalogEntry(link.dataset.id!));
  for (const heading of list.querySelectorAll<HTMLElement>('h3[data-section]')) {
    heading.hidden = !catalog.graphics.some((entry) => entry.placement === heading.dataset.section && visible(entry));
  }
};

// --- content form ------------------------------------------------------------------

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
    input = document.createElement('input');
    if (property.type === 'boolean') input.type = 'checkbox';
    else if (property.gddType === 'color-rrggbb') input.type = 'color';
    else if (property.type === 'number' || property.type === 'integer') input.type = 'number';
    else input.type = 'text';
  }
  input.name = name;
  label.appendChild(input);
  return label;
};

const properties = () => primary?.manifest.schema?.properties ?? {};

const resetFields = () => {
  for (const [name, spec] of Object.entries(properties())) {
    const input = fieldsForm.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (!input) continue;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(spec.default);
    else input.value = spec.default === undefined ? '' : String(spec.default);
  }
};

/**
 * The `data` payload. A blank field is left out when it has no default, so an image URL
 * left empty keeps the graphic's embedded image; a blank field that has a default is
 * sent blank, so clearing a name really clears it.
 */
const collectData = () => {
  const data: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(properties())) {
    const input = fieldsForm.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (!input) continue;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') data[name] = input.checked;
    else if (spec.type === 'number' || spec.type === 'integer') {
      if (input.value !== '') data[name] = Number(input.value);
    } else if (input.value !== '' || spec.default !== undefined) data[name] = input.value;
  }
  return data;
};

// --- graphics ----------------------------------------------------------------------

const renderControls = () => {
  const stepped = (primary?.manifest.stepCount ?? 1) > 1;
  showButton.disabled = busy || !primary || onAir;
  hideButton.disabled = busy || !primary || !onAir;
  previousButton.hidden = nextButton.hidden = !stepped;
  previousButton.disabled = nextButton.disabled = busy || !onAir;
};

/** Runs one action on the primary graphic, keeping the buttons off while it animates. */
const act = async (action: (graphic: Graphic) => Promise<unknown>) => {
  if (!primary || busy) return;
  busy = true;
  renderControls();
  try {
    await action(primary.element);
  } catch (error) {
    status.textContent = `Graphic error: ${String(error)}`;
  } finally {
    busy = false;
    renderControls();
  }
};

const show = () =>
  act(async (graphic) => {
    await graphic.playAction({ goto: 0 });
    onAir = true;
  });

const hide = () =>
  act(async (graphic) => {
    await graphic.stopAction({});
    onAir = false;
  });

/** Steps a multi-step graphic. The specification reports no current step once it has left the air. */
const step = (delta: number) =>
  act(async (graphic) => {
    const result = await graphic.playAction({ delta });
    onAir = result.currentStep !== undefined;
  });

/** The manifest's defaults as a `data` payload; a graphic loaded with none shows the scene's own placeholders. */
const defaultData = (manifest: Manifest) =>
  Object.fromEntries(
    Object.entries(manifest.schema?.properties ?? {})
      .filter(([, spec]) => spec.default !== undefined)
      .map(([name, spec]) => [name, spec.default]),
  );

const unload = async (loaded: Loaded | null) => {
  if (!loaded) return;
  await loaded.element.dispose({});
  loaded.element.remove();
};

const loadGraphic = async (entry: CatalogEntry): Promise<Loaded> => {
  const manifestUrl = new URL(entry.manifest, location.href);
  const manifest = (await (await fetch(manifestUrl)).json()) as Manifest;
  const { default: GraphicClass } = (await import(/* @vite-ignore */ new URL(manifest.main, manifestUrl).href)) as {
    default: CustomElementConstructor;
  };
  // A package default-exports its class without registering it, so each needs a tag.
  const tag = `dtv-graphic-${entry.id}`;
  if (!customElements.get(tag)) customElements.define(tag, class extends GraphicClass {});
  const graphic = document.createElement(tag) as Graphic;
  stage.appendChild(graphic);
  await graphic.load({
    data: defaultData(manifest),
    renderType: 'realtime',
    renderCharacteristics: { resolution: { width: 1920, height: 1080 }, frameRate: 60, accessToPublicInternet: true },
  });
  return { element: graphic, manifest };
};

const catalogEntry = (id: string) => catalog.graphics.find((entry) => entry.id === id)!;

const select = async (entry: CatalogEntry) => {
  const mine = ++generation;
  current = entry;
  title.textContent = entry.name;
  document.title = `${entry.name} · Dragons TV Graphics Preview`;
  for (const link of list.querySelectorAll<HTMLAnchorElement>('a')) {
    if (link.dataset.id === entry.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  await Promise.all([unload(primary), unload(scorebug)]);
  primary = scorebug = null;
  onAir = false;
  fieldsForm.replaceChildren();
  const beside = entry.placement === 'with-scorebug' && catalog.scorebug !== null;
  scorebugToggle.hidden = !beside;
  renderControls();
  status.textContent = 'Loading…';

  let loaded: Loaded;
  let beneath: Loaded | null = null;
  try {
    // The scorebug loads first so the graphic beside it is stacked on top.
    if (beside && scorebugInput.checked) beneath = await loadGraphic(catalogEntry(catalog.scorebug!));
    loaded = await loadGraphic(entry);
  } catch (error) {
    await unload(beneath);
    if (mine === generation) status.textContent = `Could not load this graphic: ${String(error)}`;
    return;
  }
  if (mine !== generation) {
    await Promise.all([unload(beneath), unload(loaded)]);
    return;
  }
  scorebug = beneath;
  primary = loaded;

  status.textContent = '';
  fieldsForm.replaceChildren(...Object.entries(properties()).map(([name, spec]) => controlFor(name, spec)));
  resetFields();
  // The scorebug's intro runs alongside the graphic's own.
  void scorebug?.element.playAction({});
  await show();
};

// --- wiring ------------------------------------------------------------------------

const routeFromHash = () => {
  const entry = catalog.graphics.find((candidate) => `#${candidate.id}` === location.hash) ?? catalog.graphics[0];
  if (!entry) status.textContent = 'No graphics have been built.';
  else if (entry !== current) void select(entry);
};

let pending: ReturnType<typeof setTimeout> | undefined;
fieldsForm.addEventListener('input', () => {
  clearTimeout(pending);
  pending = setTimeout(() => void primary?.element.updateAction({ data: collectData() }), 250);
});
fieldsForm.addEventListener('submit', (event) => event.preventDefault());

showButton.onclick = () => void show();
hideButton.onclick = () => void hide();
previousButton.onclick = () => void step(-1);
nextButton.onclick = () => void step(1);
element<HTMLButtonElement>('reset').onclick = () => {
  resetFields();
  void primary?.element.updateAction({ data: collectData() });
};
backdrop.onchange = () => {
  stage.dataset.backdrop = backdrop.value;
};
scorebugInput.onchange = () => {
  if (current) void select(current);
};
window.addEventListener('hashchange', routeFromHash);

renderList();
routeFromHash();
