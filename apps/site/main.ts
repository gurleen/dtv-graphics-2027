/**
 * The stakeholder preview page: one graphic at a time on a stage, with Show and Hide.
 *
 * It fetches world.json (written by scripts/build.ts) and runs a local show over it: the
 * reducer and projector the server runs, drawn by the renderer the /renderer page uses.
 * A graphic meant to sit beside the scorebug is shown with the scorebug on air behind it.
 */

import type { Sponsor } from '@dtv/domain';
import { GRAPHICS } from '@dtv/graphics';
import { type AnyGraphic, createLocalShow, type LocalShow } from '@dtv/playout';
import { createRenderer } from '@dtv/renderer';
import { mountForm } from './form';
import type { SiteWorld } from './world';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const list = element<HTMLElement>('list');
const title = element<HTMLElement>('title');
const stage = element<HTMLDivElement>('stage');
const status = element<HTMLElement>('status');
const fieldsForm = element<HTMLFormElement>('fields');
const formError = element<HTMLElement>('form-error');
const showButton = element<HTMLButtonElement>('show');
const hideButton = element<HTMLButtonElement>('hide');
const previousButton = element<HTMLButtonElement>('previous');
const nextButton = element<HTMLButtonElement>('next');
const scorebugToggle = element<HTMLLabelElement>('scorebug-toggle');
const scorebugInput = element<HTMLInputElement>('scorebug');
const backdrop = element<HTMLSelectElement>('backdrop');

const world = (await (await fetch('/world.json')).json()) as SiteWorld;
const rundown = world.snapshot.entities.show.find((show) => show.id === world.gameId)!.rundown;

const SECTIONS = [
  { site: 'scorebug', title: 'Scorebug' },
  { site: 'with-scorebug', title: 'Beside the scorebug' },
  { site: 'full-frame', title: 'Full frame' },
] as const;

const entries = SECTIONS.flatMap(({ site }) => Object.values(GRAPHICS).filter((entry) => entry.site === site).sort((a, b) => a.name.localeCompare(b.name)));
const scorebugEntry = Object.values(GRAPHICS).find((entry) => entry.site === 'scorebug');
const cueOf = (entry: AnyGraphic) => rundown.find((cue) => cue.graphic === entry.id)!;

/** The sponsors that present a graphic here, with the graphics each presents. */
const sponsors = world.snapshot.entities.sponsor.flatMap((sponsor) => {
  const graphics = world.snapshot.entities.sponsorship.filter((row) => row.sponsorId === sponsor.id).map((row) => row.id);
  return graphics.some((id) => id in GRAPHICS) ? [{ sponsor, graphics: new Set<string>(graphics) }] : [];
});

interface Selection {
  readonly entry: AnyGraphic;
  readonly show: LocalShow;
  /** Puts the cue back as the demo cued it, and the form with it. */
  reset(): void;
  dispose(): void;
}

let selection: Selection | null = null;
/** The sponsor the list is narrowed to, or null for every graphic. */
let sponsorFilter: Sponsor['id'] | null = null;

// --- list --------------------------------------------------------------------------

const renderSponsors = () => {
  if (!sponsors.length) return [];
  const heading = document.createElement('h3');
  heading.textContent = 'Sponsors';
  const grid = document.createElement('div');
  grid.className = 'sponsors';
  for (const { sponsor } of sponsors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.sponsor = sponsor.id;
    button.dataset.chip = sponsor.logoOnDark ? 'dark' : 'light';
    button.title = sponsor.name;
    button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img');
    image.src = sponsor.logoOnDark ?? sponsor.logoOnLight ?? '';
    image.alt = sponsor.name;
    button.append(image);
    // Tapping the selected sponsor again shows every graphic.
    button.onclick = () => {
      sponsorFilter = sponsorFilter === sponsor.id ? null : sponsor.id;
      applySponsorFilter();
    };
    grid.append(button);
  }
  return [heading, grid];
};

const renderList = () => {
  const nodes: Node[] = renderSponsors();
  for (const section of SECTIONS) {
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    heading.dataset.section = section.site;
    nodes.push(heading);
    for (const entry of entries.filter((each) => each.site === section.site)) {
      const link = document.createElement('a');
      link.href = `#${entry.id}`;
      link.dataset.id = entry.id;
      link.textContent = entry.name;
      nodes.push(link);
    }
  }
  list.replaceChildren(...nodes);
};

/** Hides the graphics the chosen sponsor does not present, and any section left empty. */
const applySponsorFilter = () => {
  for (const button of list.querySelectorAll<HTMLButtonElement>('[data-sponsor]')) {
    button.setAttribute('aria-pressed', String(button.dataset.sponsor === sponsorFilter));
  }
  const shown = (entry: AnyGraphic) => sponsorFilter === null || sponsors.some(({ sponsor, graphics }) => sponsor.id === sponsorFilter && graphics.has(entry.id));
  for (const link of list.querySelectorAll<HTMLAnchorElement>('a')) link.hidden = !shown(GRAPHICS[link.dataset.id as keyof typeof GRAPHICS]);
  for (const heading of list.querySelectorAll<HTMLElement>('h3[data-section]')) {
    heading.hidden = !entries.some((entry) => entry.site === heading.dataset.section && shown(entry));
  }
};

// --- the stage ---------------------------------------------------------------------

const onAir = (current: Selection) => current.show.frame().layers.find((layer) => layer.graphic === current.entry.id);

const renderControls = () => {
  const frame = selection && onAir(selection);
  const stepped = (selection?.entry.steps?.count ?? 1) > 1;
  showButton.disabled = !selection || frame !== undefined;
  hideButton.disabled = frame === undefined;
  previousButton.hidden = !stepped;
  previousButton.disabled = !frame || frame.step === 0;
  nextButton.disabled = !frame;
};

const air = (show: LocalShow, entry: AnyGraphic) => show.command({ type: 'air', operator: show.operator, ref: { kind: 'rundown', cue: cueOf(entry).id } });

const select = (entry: AnyGraphic) => {
  selection?.dispose();
  const show = createLocalShow({ registry: GRAPHICS, ...world });
  const renderer = createRenderer({
    host: stage,
    registry: GRAPHICS,
    rivUrl: (scene) => `/riv/${scene.file.replace(/\.rml$/, '.riv')}`,
    blankImage: '/assets/images/blank.png',
    onProblem: (_layer, message) => {
      status.textContent = message;
    },
  });
  // A driver or the console can read each layer's phase.
  Object.assign(window, { dtvRenderer: renderer });
  const stop = show.subscribe(() => {
    renderer.render(show.frame());
    renderControls();
  });
  const cue = cueOf(entry);
  const mount = () => mountForm({ form: fieldsForm, entry, show, cue: cue.id, onError: (message) => (formError.textContent = message) });
  let unmountForm = mount();
  selection = {
    entry,
    show,
    reset() {
      unmountForm();
      show.edit(cue.id, { params: cue.params, overrides: cue.overrides });
      unmountForm = mount();
    },
    dispose() {
      stop();
      unmountForm();
      renderer.dispose();
    },
  };

  title.textContent = entry.name;
  document.title = `${entry.name} · Dragons TV Graphics Preview`;
  for (const link of list.querySelectorAll<HTMLAnchorElement>('a')) {
    if (link.dataset.id === entry.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  status.textContent = '';
  formError.textContent = '';
  const beside = entry.site === 'with-scorebug' && scorebugEntry !== undefined;
  scorebugToggle.hidden = !beside;
  if (beside && scorebugInput.checked) air(show, scorebugEntry);
  air(show, entry);
  renderControls();
};

// --- wiring ------------------------------------------------------------------------

/** Links shared before the move off OGraf name the old package: `#dtv-basketball-v2-scorebug`. */
const OLD_LINK_RENAMES: Readonly<Record<string, string>> = {
  'player-of-the-game-lower-third': 'player-of-the-game',
  'player-to-watch-lower-third': 'player-to-watch',
  'starting-five-lower-third': 'starting-five',
};

const idFromHash = (hash: string) => {
  const old = /^#dtv-basketball-v2-(.+)$/.exec(hash)?.[1];
  return old ? `basketball-v2/${OLD_LINK_RENAMES[old] ?? old}` : hash.slice(1);
};

const routeFromHash = () => {
  const id = idFromHash(location.hash);
  const entry = entries.find((candidate) => candidate.id === id) ?? scorebugEntry ?? entries[0];
  if (entry && location.hash !== `#${entry.id}` && id === entry.id) history.replaceState(null, '', `#${entry.id}`);
  if (!entry) status.textContent = 'No graphics have been built.';
  else if (entry !== selection?.entry) select(entry);
};

showButton.onclick = () => {
  if (selection) air(selection.show, selection.entry);
};
hideButton.onclick = () => {
  const frame = selection && onAir(selection);
  if (selection && frame) selection.show.command({ type: 'clear', layer: frame.layer, slot: frame.slot });
};
const step = (delta: number) => {
  const frame = selection && onAir(selection);
  if (selection && frame) selection.show.command({ type: 'step', layer: frame.layer, slot: frame.slot, to: frame.step + delta });
};
previousButton.onclick = () => step(-1);
nextButton.onclick = () => step(1);
element<HTMLButtonElement>('reset').onclick = () => selection?.reset();
backdrop.onchange = () => {
  stage.dataset.backdrop = backdrop.value;
};
scorebugInput.onchange = () => {
  if (!selection || !scorebugEntry) return;
  const { show } = selection;
  if (scorebugInput.checked) return void air(show, scorebugEntry);
  const frame = show.frame().layers.find((layer) => layer.graphic === scorebugEntry.id);
  if (frame) show.command({ type: 'clear', layer: frame.layer, slot: frame.slot });
};
window.addEventListener('hashchange', routeFromHash);

renderList();
routeFromHash();
