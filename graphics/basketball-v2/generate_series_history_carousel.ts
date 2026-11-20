/**
 * Generates the Series History Carousel scene:
 *
 *   bun graphics/basketball-v2/generate_series_history_carousel.ts
 *
 * writes series_history_carousel.rml beside this file. Edit this file, not the output.
 *
 * A mid-screen card on the last five meetings of a series, paging through them on its own.
 *
 *   Title    `SERIES HISTORY` at the left; the leader and the series record at the right.
 *   Feature  one page per meeting: the winner's tint, the winner's logo large, and an optional
 *            photo over both; the year, the winner and score, and the caption on a dark
 *            gradient at the panel's foot.
 *   List     the five meetings, one row each (year over site, winner, score). The row of the
 *            meeting on show takes the winner's tint.
 *   Footer   one line of copy, and a pip per page.
 *
 * The state machine has two layers that never key the same property:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro on `isPlaying`; keys only the shell.
 *   Pages    Idle -> Page 1 -> ... -> Page 5 -> Page 1 Again -> Page 2 ..., each page an 8 s
 *            dwell. A page change cross-fades the feature panel, slides the list's highlight
 *            to the next row and moves the lit pip. Off air it returns to Idle, which keys
 *            nothing, so the page on show closes with the glass.
 */

import { join } from 'node:path';

const PREFIX = 54;
const ARTBOARD_Y = 31400;
const id = (local: number) => `${PREFIX}:${local}`;

// --- test data and view model ----------------------------------------------------------

// Drexel and Saint Joseph's, the last five meetings in big5.ts's SERIES order, in capitals as
// the projector sends them.
const ASSET = { saintJosephs: 910, drexel: 911, blank: 912 } as const;
const SJU = { school: "SAINT JOSEPH'S", site: 'AT SJU', primary: 'FFC2071B', logo: ASSET.saintJosephs };
const DREXEL = { school: 'DREXEL', site: 'AT DREXEL', primary: 'FF07294D', logo: ASSET.drexel };

type Meeting = { year: string; date: string; host: typeof SJU; winner: typeof SJU; score: string; caption: string };
const MEETINGS: readonly Meeting[] = [
  { year: '2025', date: 'NOV 8, 2025', host: SJU, winner: SJU, score: '76-65', caption: 'HAWKS RALLY FROM 3 DOWN AT THE HALF' },
  { year: '2021', date: 'NOV 17, 2021', host: SJU, winner: DREXEL, score: '78-75', caption: 'DRAGONS WIN AT HAGAN ARENA' },
  { year: '2020', date: 'DEC 17, 2020', host: DREXEL, winner: DREXEL, score: '81-77', caption: 'DRAGONS WIN AT HOME' },
  { year: '2016', date: 'DEC 11, 2016', host: DREXEL, winner: SJU, score: '72-71', caption: 'DECIDED BY A SINGLE POINT' },
  { year: '2015', date: 'NOV 13, 2015', host: SJU, winner: SJU, score: '82-81', caption: 'ONE POINT AGAIN' },
];
const COUNT = MEETINGS.length;
/** Keep equal to the separator the registry entry puts between the date and the caption. */
const CAPTION_SEPARATOR = ' · ';

type Kind = 'string' | 'color' | 'image';
type Prop = { readonly name: string; readonly kind: Kind; readonly value: string };
const string = (name: string, value: string): Prop => ({ name, kind: 'string', value });

// One table drives the view model's declarations and its Default instance.
const PROPS: readonly Prop[] = [
  string('seriesLeader', "SAINT JOSEPH'S LEADS"),
  string('seriesRecord', '48-11'),
  string('footer', 'FIRST MEETING 1919 · DREXEL HAS WON 2 OF THE LAST 4'),
  ...MEETINGS.flatMap((m, i): Prop[] => {
    const name = `meeting${i + 1}`;
    return [
      string(`${name}Year`, m.year),
      string(`${name}Site`, m.host.site),
      string(`${name}Winner`, m.winner.school),
      string(`${name}Score`, m.score),
      string(`${name}Caption`, `${m.date}${CAPTION_SEPARATOR}${m.caption}`),
      { name: `${name}Logo`, kind: 'image', value: id(m.winner.logo) },
      { name: `${name}PrimaryColor`, kind: 'color', value: m.winner.primary },
      { name: `${name}Photo`, kind: 'image', value: id(ASSET.blank) },
    ];
  }),
];

const IS_PLAYING = 1002;
const propLocal = (name: string) => {
  if (name === 'isPlaying') return IS_PLAYING;
  const index = PROPS.findIndex((prop) => prop.name === name);
  if (index < 0) throw new Error(`no property ${name}`);
  return 1010 + index;
};
const valueOf = (name: string) => PROPS.find((prop) => prop.name === name)!.value;
const bind = (name: string, key: number) => `<DataBindContext sourcePathIds="${id(1000)}-${id(propLocal(name))}" propertyKey="${key}"/>`;
const meeting = (i: number, field: string) => `meeting${i + 1}${field}`;

// --- geometry -------------------------------------------------------------------------

const GAP = 4;
const OUTER = 24;
const SEAM = 6;
const CARD = { x: 216, width: 1488 };
const TITLE_HEIGHT = 92;
const BODY_Y = TITLE_HEIGHT + GAP;
const BODY_HEIGHT = 540;
const FOOTER_Y = BODY_Y + BODY_HEIGHT + GAP;
const FOOTER_HEIGHT = 64;
const CARD_HEIGHT = FOOTER_Y + FOOTER_HEIGHT;
// The card ends at y 858, as the halftime and standings cards do, 32 clear of the scorebug.
const CARD_Y = 858 - CARD_HEIGHT;
const FEATURE_WIDTH = 880;
const LIST_X = FEATURE_WIDTH + GAP;
const LIST_WIDTH = CARD.width - LIST_X;
// The glass ignites in the gap between the feature and the list and opens both ways.
const SEAM_X = FEATURE_WIDTH + GAP / 2;
const ROW_HEIGHT = BODY_HEIGHT / COUNT;
const rowY = (i: number) => i * ROW_HEIGHT;
const INSET = 36;

// The feature's logo: the 1024 source at 0.44, a mark about 310 across, in the upper part of
// the panel; the text sits on a gradient below it.
const LOGO = { x: FEATURE_WIDTH / 2, y: 178, scale: 0.44 };
const SHADE = { width: 120, scaleX: 5.2, scaleY: 3.4 };
const FOOT_GRADIENT_TOP = 220;

const PIP = { size: 10, pitch: 20 };
const PIPS_RIGHT = CARD.width - 40;

const TINT_OPACITY = 0.78;
const HAIRLINE = '1FFFFFFF';
const DARK_GLASS = 'D10E1116';

// --- ids ------------------------------------------------------------------------------

const ROOT = id(10);
const CONTENT = id(11);
const FEATURE_SHAPE = id(205);
const VISUAL = (i: number) => id(220 + i);
const PUSH = (i: number) => id(230 + i);
const TEXT_PAGE = (i: number) => id(240 + i);
const PART = (i: number, part: number) => id(250 + 10 * part + i);
const PARTS = 3;
const HIGHLIGHT_MASK = id(305);
const ROW_TINTS = id(310);
const PIPS = id(410);
const LIT_PIP = (i: number) => id(420 + i);
const LEFT_EDGE = id(500);
const LEFT_EDGE_LIGHT = id(501);
const RIGHT_EDGE = id(502);
const RIGHT_EDGE_LIGHT = id(503);
const REVEAL_MASK = id(505);
const LEFT_MASK_RECT = id(506);
const RIGHT_MASK_RECT = id(507);
const SWEEP = id(600);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);

const LEFT_MASK_WIDTH = SEAM_X + 8;
const RIGHT_MASK_WIDTH = CARD.width - SEAM_X + 8;

// --- markup helpers -------------------------------------------------------------------

const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const RECT_WIDTH = 20;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

type Radii = readonly [number, number, number, number];
const SQUARE: Radii = [0, 0, 0, 0];
const SEAMS: Radii = [SEAM, SEAM, SEAM, SEAM];
const TOP_OUTER: Radii = [OUTER, OUTER, SEAM, SEAM];
const BOTTOM_OUTER: Radii = [SEAM, SEAM, OUTER, OUTER];
const ALL_OUTER: Radii = [OUTER, OUTER, OUTER, OUTER];

const round = (value: number) => String(Math.round(value * 1000) / 1000);

const rectangle = (width: number, height: number, radii: Radii, attributes = '') =>
  `<Rectangle${attributes} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const glazeFill = (height: number) =>
  `<Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop: string) => `<Shape name="${name} Glaze">
    ${rectangle(width, height, radii)}
    ${glazeFill(height)}
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const hairlines = (name: string, width: number, ys: readonly number[]) => `<Shape name="${name} Hairlines">
    ${ys.map((y) => rectangle(width, 1, SQUARE, ` x="0" y="${y}"`)).join('\n    ')}
    <Fill><SolidColor colorValue="${HAIRLINE}"/></Fill>
  </Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

let styleCount = 0;
let revealCount = 0;
/** The shell's letter-by-letter reveals, which the Display layer keys. */
const RANGES: string[] = [];
const nextReveal = () => {
  const range = id(800 + revealCount++);
  RANGES.push(range);
  return range;
};

type Run = { prop?: string; literal?: string; font: string; size: number; spacing: number; color: string };
/** A line of fixed width that shrinks to fit; each run is bound to a property or is fixed copy. */
const text = (o: { name: string; x: number; y: number; width: number; size: number; align: 'left' | 'center' | 'right'; runs: Run[]; reveal?: string }) => {
  const runs = o.runs.map((run) => ({ ...run, style: id(700 + styleCount++) }));
  return `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${Math.round(o.size * 1.2)}" sizingValue="fixed" alignValue="${o.align}" overflowValue="fitFontSize">${runs
    .map((run) => `<TextStylePaint id="${run.style}" fontAssetId="${run.font}" fontSize="${run.size}" letterSpacing="${run.spacing}"><Fill><SolidColor colorValue="${run.color}"/></Fill></TextStylePaint>`)
    .join('')}${runs
    .map((run, i) => `<TextValueRun name="${o.name} Run ${i + 1}" styleId="${run.style}" text="${run.prop ? valueOf(run.prop) : run.literal}">${run.prop ? bind(run.prop, TEXT) : ''}</TextValueRun>`)
    .join('')}${o.reveal ? rise(o.name, o.reveal) : ''}</Text>`;
};
const bold = (prop: string, size: number, color = 'FFFFFFFF'): Run => ({ prop, font: FONT_BOLD, size, spacing: 0.5, color });
const regular = (prop: string, size: number, color = 'B3FFFFFF'): Run => ({ prop, font: FONT_REGULAR, size, spacing: 2, color });

// --- title ----------------------------------------------------------------------------

const title = `<Node name="Title Panel" x="0" y="0">
  ${text({ name: 'Title', x: INSET, y: 70, width: 640, size: 68, align: 'left', runs: [{ literal: 'SERIES HISTORY', font: FONT_BOLD, size: 68, spacing: 0.5, color: 'FFFFFFFF' }], reveal: nextReveal() })}
  ${text({ name: 'Series Standing', x: CARD.width - INSET - 760, y: 70, width: 760, size: 68, align: 'right', runs: [regular('seriesLeader', 34), { literal: '   ', font: FONT_REGULAR, size: 34, spacing: 2, color: '00FFFFFF' }, bold('seriesRecord', 68)], reveal: nextReveal() })}
  ${glaze('Title', CARD.width, TITLE_HEIGHT, TOP_OUTER, '59FFFFFF')}
</Node>`;

// --- feature --------------------------------------------------------------------------

// A page's visual: the photo covers the logo, which sits on a shade so it reads on its own
// colour, over the winner's tint. The push node scales from the panel's centre.
const visual = (i: number) => `<Node name="Feature Page ${i + 1} Visual" id="${VISUAL(i)}" opacity="${i === 0 ? 1 : 0}">
    <Node name="Feature Page ${i + 1} Push" id="${PUSH(i)}" x="${FEATURE_WIDTH / 2}" y="${BODY_HEIGHT / 2}">
      <LayoutComponent name="Feature Page ${i + 1} Photo Frame" x="${-FEATURE_WIDTH / 2}" y="${-BODY_HEIGHT / 2}" width="${FEATURE_WIDTH}" height="${BODY_HEIGHT}" styleId="${id(1300 + i)}">
        <LayoutComponentStyle name="Feature Page ${i + 1} Photo Frame Style" id="${id(1300 + i)}"/>
        <Image name="Feature Page ${i + 1} Photo" fit="cover" assetId="${id(ASSET.blank)}">${bind(meeting(i, 'Photo'), IMAGE)}</Image>
      </LayoutComponent>
      <Image name="Feature Page ${i + 1} Logo" x="${LOGO.x - FEATURE_WIDTH / 2}" y="${LOGO.y - BODY_HEIGHT / 2}" scaleX="${LOGO.scale}" scaleY="${LOGO.scale}" assetId="${valueOf(meeting(i, 'Logo'))}">${bind(meeting(i, 'Logo'), IMAGE)}</Image>
      <Shape name="Feature Page ${i + 1} Logo Shade" x="${LOGO.x - FEATURE_WIDTH / 2}" y="${LOGO.y - BODY_HEIGHT / 2}" scaleX="${SHADE.scaleX}" scaleY="${SHADE.scaleY}">
        <Ellipse width="${SHADE.width}" height="${SHADE.width}"/>
        <Fill><RadialGradient startX="0" startY="0" endX="${SHADE.width / 2}" endY="0"><GradientStop colorValue="66000000" position="0"/><GradientStop colorValue="29000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
      </Shape>
    </Node>
    <Shape name="Feature Page ${i + 1} Tint" opacity="${TINT_OPACITY}">
      ${rectangle(FEATURE_WIDTH, BODY_HEIGHT, SEAMS)}
      <Fill><SolidColor colorValue="${valueOf(meeting(i, 'PrimaryColor'))}">${bind(meeting(i, 'PrimaryColor'), COLOR)}</SolidColor></Fill>
    </Shape>
  </Node>`;

// A page's text, in three parts the Pages layer brings in and takes out one by one.
const PART_LINES = [
  { name: 'Year', y: 384, size: 36, runs: (i: number) => [regular(meeting(i, 'Year'), 36, 'D9FFFFFF')] },
  { name: 'Result', y: 466, size: 84, runs: (i: number) => [bold(meeting(i, 'Winner'), 84), { literal: '  ', font: FONT_BOLD, size: 84, spacing: 0.5, color: '00FFFFFF' }, bold(meeting(i, 'Score'), 84)] },
  { name: 'Caption', y: 510, size: 28, runs: (i: number) => [regular(meeting(i, 'Caption'), 28, 'D9FFFFFF')] },
] as const;
const PART_Y = 0;

const textPage = (i: number) => `<Node name="Feature Page ${i + 1} Text" id="${TEXT_PAGE(i)}" opacity="${i === 0 ? 1 : 0}">
    ${PART_LINES.map((line, part) => `<Node name="Feature Page ${i + 1} ${line.name}" id="${PART(i, part)}" x="0" y="${PART_Y}">
      ${text({ name: `Feature Page ${i + 1} ${line.name} Text`, x: 40, y: line.y, width: FEATURE_WIDTH - 80, size: line.size, align: 'left', runs: [...line.runs(i)] })}
    </Node>`).join('\n    ')}
  </Node>`;

const feature = `<Node name="Feature Panel" x="0" y="${BODY_Y}">
  <Node name="Feature Text">
  ${Array.from({ length: COUNT }, (_, i) => textPage(i)).join('\n  ')}
  </Node>
  ${glaze('Feature', FEATURE_WIDTH, BODY_HEIGHT, SEAMS, '73FFFFFF')}
  <!-- The text's ground: clear above, dark at the foot, so the lines read over any photo. -->
  <Shape name="Feature Foot Gradient" x="0" y="0">
    ${rectangle(FEATURE_WIDTH, BODY_HEIGHT, SEAMS)}
    <Fill><LinearGradient startX="0" startY="${FOOT_GRADIENT_TOP}" endX="0" endY="${BODY_HEIGHT}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="40000000" position="0.4"/><GradientStop colorValue="B3000000" position="1"/></LinearGradient></Fill>
  </Shape>
  <Node name="Feature Visuals">
    <ClippingShape name="Feature Visuals Clip" sourceId="${FEATURE_SHAPE}"/>
  ${Array.from({ length: COUNT }, (_, i) => visual(i)).join('\n  ')}
  </Node>
  <Shape name="Feature Underlay">${rectangle(FEATURE_WIDTH, BODY_HEIGHT, SEAMS)}<Fill><SolidColor colorValue="59000000"/></Fill></Shape>
  <Shape name="Feature Shape" id="${FEATURE_SHAPE}">${rectangle(FEATURE_WIDTH, BODY_HEIGHT, SEAMS)}</Shape>
</Node>`;

// --- list -----------------------------------------------------------------------------

const rowRadii = (i: number): Radii => (i === 0 ? [SEAM, SEAM, 0, 0] : i === COUNT - 1 ? [0, 0, SEAM, SEAM] : SQUARE);

const row = (i: number) => `<Node name="Row ${i + 1}" x="0" y="${rowY(i)}">
    ${text({ name: `Row ${i + 1} Year`, x: 28, y: 54, width: 120, size: 40, align: 'left', runs: [bold(meeting(i, 'Year'), 40)], reveal: nextReveal() })}
    ${text({ name: `Row ${i + 1} Site`, x: 28, y: 84, width: 130, size: 22, align: 'left', runs: [regular(meeting(i, 'Site'), 22, 'A6FFFFFF')], reveal: nextReveal() })}
    ${text({ name: `Row ${i + 1} Winner`, x: 168, y: 70, width: 270, size: 44, align: 'left', runs: [bold(meeting(i, 'Winner'), 44)], reveal: nextReveal() })}
    ${text({ name: `Row ${i + 1} Score`, x: 440, y: 72, width: LIST_WIDTH - 28 - 440, size: 50, align: 'right', runs: [bold(meeting(i, 'Score'), 50)], reveal: nextReveal() })}
  </Node>`;
const ROW_RANGES_START = revealCount;

// Each row's tint, under one mask a row high that slides to the meeting on show, so the
// highlight moves down the list and takes each row's colour as it arrives.
const rowTint = (i: number) => `<Shape name="Row ${i + 1} Tint" x="0" y="${rowY(i)}" opacity="${TINT_OPACITY}">
      ${rectangle(LIST_WIDTH, ROW_HEIGHT, rowRadii(i))}
      <Fill><SolidColor colorValue="${valueOf(meeting(i, 'PrimaryColor'))}">${bind(meeting(i, 'PrimaryColor'), COLOR)}</SolidColor></Fill>
      ${glazeFill(ROW_HEIGHT)}
    </Shape>`;

const ROWS = Array.from({ length: COUNT }, (_, i) => row(i));
const ROW_REVEALS = RANGES.slice(ROW_RANGES_START, ROW_RANGES_START + 4 * COUNT);

const list = `<Node name="List Panel" x="${LIST_X}" y="${BODY_Y}">
  ${ROWS.join('\n  ')}
  ${hairlines('List', LIST_WIDTH, Array.from({ length: COUNT - 1 }, (_, i) => rowY(i + 1)))}
  <Node name="Row Tints" id="${ROW_TINTS}" opacity="0">
    <ClippingShape name="Row Tints Clip" sourceId="${HIGHLIGHT_MASK}"/>
    ${Array.from({ length: COUNT }, (_, i) => rowTint(i)).join('\n    ')}
  </Node>
  ${glaze('List', LIST_WIDTH, BODY_HEIGHT, SEAMS, '59FFFFFF')}
  <Shape name="Highlight Mask" id="${HIGHLIGHT_MASK}" x="0" y="${rowY(0)}">${rectangle(LIST_WIDTH, ROW_HEIGHT, SQUARE)}</Shape>
</Node>`;

// --- footer ---------------------------------------------------------------------------

const pipX = (i: number) => PIPS_RIGHT - PIP.size / 2 - (COUNT - 1 - i) * PIP.pitch;
const pip = (i: number) => `<Shape name="Pip ${i + 1} Lit" id="${LIT_PIP(i)}" x="${pipX(i)}" y="${FOOTER_HEIGHT / 2}" opacity="${i === 0 ? 1 : 0}"><Ellipse width="${PIP.size}" height="${PIP.size}"/><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></Shape>
    <Shape name="Pip ${i + 1}" x="${pipX(i)}" y="${FOOTER_HEIGHT / 2}"><Ellipse width="${PIP.size}" height="${PIP.size}"/><Fill><SolidColor colorValue="40FFFFFF"/></Fill></Shape>`;

const footer = `<Node name="Footer Panel" x="0" y="${FOOTER_Y}">
  ${text({ name: 'Footer', x: INSET, y: 43, width: pipX(0) - PIP.size - 40 - INSET, size: 30, align: 'left', runs: [{ prop: 'footer', font: FONT_BOLD, size: 30, spacing: 1, color: 'FFFFFFFF' }], reveal: nextReveal() })}
  <Node name="Pips" id="${PIPS}" opacity="0">
    ${Array.from({ length: COUNT }, (_, i) => pip(i)).join('\n    ')}
  </Node>
  ${glaze('Footer', CARD.width, FOOTER_HEIGHT, BOTTOM_OUTER, '59FFFFFF')}
</Node>`;

// --- timelines ------------------------------------------------------------------------

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

type Key = { frame: number; value: number; ease?: string; linear?: boolean };
type Track = { objectId: string; propertyKey: number; keys: Key[] };

const renderTrack = ({ objectId, propertyKey, keys }: Track) => {
  const frames = keys.map(({ frame, value, ease, linear }) =>
    ease
      ? `    <KeyFrameDouble frame="${frame}" value="${round(value)}" interpolationType="cubic">${ease}</KeyFrameDouble>`
      : `    <KeyFrameDouble frame="${frame}" value="${round(value)}" interpolationType="${linear ? 'linear' : 'hold'}"/>`,
  );
  return `  <KeyedObject objectId="${objectId}"><KeyedProperty propertyKey="${propertyKey}">\n${frames.join('\n')}\n  </KeyedProperty></KeyedObject>`;
};

const hold = (objectId: string, propertyKey: number, value: number): Track => ({ objectId, propertyKey, keys: [{ frame: 0, value }] });
const move = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number, ease: string): Track => ({
  objectId, propertyKey,
  keys: start > 0 ? [{ frame: 0, value: from }, { frame: start, value: from, ease }, { frame: end, value: to }] : [{ frame: 0, value: from, ease }, { frame: end, value: to }],
});
const reveal = (rangeId: string, start: number, end: number): Track[] =>
  [move(rangeId, MODIFY_FROM, 0, 1, start, end, EASE_OUT), move(rangeId, FALLOFF_FROM, 0.4, 1.4, start, end, EASE_OUT)];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) => move(objectId, propertyKey, from, to, start, end, EASE_IN);

const INTRO_FRAMES = 86;
const OUTRO_FRAMES = 24;
const WIPE_START = 8;
const WIPE_END = 46;
const SWEEP_START = -150;
const SWEEP_END = CARD.width + 150;

const EDGES = [
  { node: LEFT_EDGE, light: LEFT_EDGE_LIGHT, open: -8 },
  { node: RIGHT_EDGE, light: RIGHT_EDGE_LIGHT, open: CARD.width + 8 },
];
const MASKS = [
  { rect: LEFT_MASK_RECT, width: LEFT_MASK_WIDTH },
  { rect: RIGHT_MASK_RECT, width: RIGHT_MASK_WIDTH },
];

const edgeFlare: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: 18, value: 1, ease: EASE_OUT }, { frame: 42, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sheen: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 44, value: 0, linear: true }, { frame: 50, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

const [TITLE_REVEAL, STANDING_REVEAL] = RANGES as [string, string];
const FOOTER_REVEAL = RANGES[RANGES.length - 1]!;

const intro: Track[] = [
  hold(CONTENT, OPACITY, 1),
  ...MASKS.map((m) => move(m.rect, RECT_WIDTH, 0, m.width, WIPE_START, WIPE_END, EASE_WIPE)),
  ...EDGES.flatMap((e): Track[] => [
    move(e.node, X, SEAM_X, e.open, WIPE_START, WIPE_END, EASE_WIPE),
    move(e.light, SCALE_Y, 0, 1, 0, 16, EASE_OUT),
    { objectId: e.light, propertyKey: OPACITY, keys: edgeFlare },
  ]),
  ...reveal(TITLE_REVEAL, 14, 40),
  ...reveal(STANDING_REVEAL, 18, 44),
  // The rows rise from the top, a few frames apart; the highlight lights once they settle.
  ...ROW_REVEALS.flatMap((range, k) => {
    const rowIndex = Math.floor(k / 4);
    return reveal(range, 16 + 4 * rowIndex + (k % 4), 40 + 4 * rowIndex + (k % 4));
  }),
  move(ROW_TINTS, OPACITY, 0, 1, 44, 62, EASE_OUT),
  ...reveal(FOOTER_REVEAL, 30, 54),
  move(PIPS, OPACITY, 0, 1, 34, 54, EASE_OUT),
  move(SWEEP, X, SWEEP_START, SWEEP_END, 44, INTRO_FRAMES, EASE_SWEEP),
  { objectId: SWEEP, propertyKey: OPACITY, keys: sheen },
];

const settled: Track[] = [
  hold(CONTENT, OPACITY, 1),
  ...MASKS.map((m) => hold(m.rect, RECT_WIDTH, m.width)),
  ...EDGES.flatMap((e) => [hold(e.node, X, e.open), hold(e.light, SCALE_Y, 1), hold(e.light, OPACITY, 0)]),
  ...RANGES.flatMap(revealed),
  hold(ROW_TINTS, OPACITY, 1),
  hold(PIPS, OPACITY, 1),
  hold(SWEEP, X, SWEEP_END), hold(SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  { objectId: CONTENT, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] },
  ...MASKS.map((m) => closing(m.rect, RECT_WIDTH, m.width, 0, 2, OUTRO_FRAMES)),
  ...EDGES.flatMap((e): Track[] => [
    closing(e.node, X, e.open, SEAM_X, 2, OUTRO_FRAMES),
    hold(e.light, SCALE_Y, 1),
    { objectId: e.light, propertyKey: OPACITY, keys: edgeClosing },
  ]),
  ...RANGES.flatMap(revealed),
  hold(ROW_TINTS, OPACITY, 1),
  closing(PIPS, OPACITY, 1, 0, 0, 14),
  hold(SWEEP, X, SWEEP_END), hold(SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  hold(CONTENT, OPACITY, 0),
  ...EDGES.map((e) => hold(e.light, OPACITY, 0)),
  hold(SWEEP, OPACITY, 0),
];

// Pages: each holds for PAGE_FRAMES. A page cross-fades its visual over the last page's,
// slides the highlight from the last page's row and lights its pip, then its text rises in
// a part at a time; at its end the text sinks and fades.
const PAGE_FRAMES = 480;
const CROSSFADE = { length: 24 };
const SLIDE_FRAMES = 30;
const PAGE_IN = { start: 10, firstStart: 22, length: 24, stagger: 4 };
const PAGE_OUT = { length: 12, stagger: 2 };
const PAGE_RISE = 18;
const PAGE_SINK = 12;
const PUSH_TO = 1.04;

const pageTimeline = (shown: number, from?: number): Track[] => {
  const inBase = from === undefined ? PAGE_IN.firstStart : PAGE_IN.start;
  const outStart = (part: number) => PAGE_FRAMES - PAGE_OUT.length - PAGE_OUT.stagger * (PARTS - 1 - part);
  const partTracks = (part: number): Track[] => {
    const node = PART(shown, part);
    const inStart = inBase + PAGE_IN.stagger * part;
    const inEnd = inStart + PAGE_IN.length;
    const out = outStart(part);
    return [
      { objectId: node, propertyKey: Y, keys: [{ frame: 0, value: PART_Y + PAGE_RISE }, { frame: inStart, value: PART_Y + PAGE_RISE, ease: EASE_OUT }, { frame: inEnd, value: PART_Y }, { frame: out, value: PART_Y, ease: EASE_IN }, { frame: out + PAGE_OUT.length, value: PART_Y + PAGE_SINK }] },
      { objectId: node, propertyKey: OPACITY, keys: [{ frame: 0, value: 0 }, { frame: inStart, value: 0, ease: EASE_OUT }, { frame: inEnd, value: 1 }, { frame: out, value: 1, ease: EASE_IN }, { frame: out + PAGE_OUT.length, value: 0 }] },
    ];
  };
  // The first child draws on top, so a lower-numbered visual lies over a higher one. Whichever
  // of the two is on top fades, and the one beneath stays opaque, so the glass never shows.
  const incomingOnTop = from !== undefined && shown < from;
  const visualOpacity = (i: number): Track => {
    if (i === shown) return incomingOnTop ? move(VISUAL(i), OPACITY, 0, 1, 0, CROSSFADE.length, EASE_SWEEP) : hold(VISUAL(i), OPACITY, 1);
    if (i === from) {
      return incomingOnTop
        ? { objectId: VISUAL(i), propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: CROSSFADE.length, value: 0 }] }
        : move(VISUAL(i), OPACITY, 1, 0, 0, CROSSFADE.length, EASE_SWEEP);
    }
    return hold(VISUAL(i), OPACITY, 0);
  };
  const pipOpacity = (i: number): Track => {
    if (i === shown) return from === undefined ? hold(LIT_PIP(i), OPACITY, 1) : move(LIT_PIP(i), OPACITY, 0, 1, 0, 16, EASE_OUT);
    if (i === from) return move(LIT_PIP(i), OPACITY, 1, 0, 0, 16, EASE_OUT);
    return hold(LIT_PIP(i), OPACITY, 0);
  };
  return [
    ...Array.from({ length: COUNT }, (_, i) => [
      visualOpacity(i),
      hold(TEXT_PAGE(i), OPACITY, i === shown ? 1 : 0),
      pipOpacity(i),
    ]).flat(),
    // A slow push-in across the dwell; the visual keeps its last scale as it fades out.
    { objectId: PUSH(shown), propertyKey: SCALE_X, keys: [{ frame: 0, value: 1, linear: true }, { frame: PAGE_FRAMES, value: PUSH_TO }] },
    { objectId: PUSH(shown), propertyKey: SCALE_Y, keys: [{ frame: 0, value: 1, linear: true }, { frame: PAGE_FRAMES, value: PUSH_TO }] },
    from === undefined ? hold(HIGHLIGHT_MASK, Y, rowY(shown)) : move(HIGHLIGHT_MASK, Y, rowY(from), rowY(shown), 0, SLIDE_FRAMES, EASE_SWEEP),
    ...Array.from({ length: PARTS }, (_, part) => partTracks(part)).flat(),
  ];
};

const ANIMATION = { hold: 30, intro: 31, outro: 32, hidden: 33, pagesIdle: 34, page: 35, firstPage: 50 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43, pagesIdle: 44, page: 45, firstPage: 51 } as const;

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (op: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${op}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bind('isPlaying', BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
const to = (state: number, conditions = '') => `<StateTransition stateToId="${id(state)}" duration="0">${conditions}</StateTransition>`;
const atEnd = (state: number) => `<StateTransition stateToId="${id(state)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>`;
// Page N at index N - 1. Page 1 Again follows Page 5 and cross-fades from it; Page 1 opens a take.
const pageState = (i: number) => STATE.page + i;

const stateMachine = `<StateMachine name="Series History Carousel" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.hidden)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.hidden)}" animationId="${id(ANIMATION.hidden)}">${to(STATE.intro, onAir('equal'))}</AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.intro)}" animationId="${id(ANIMATION.intro)}" reset="true">${atEnd(STATE.hold)}${to(STATE.outro, onAir('notEqual'))}</AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.hold)}" animationId="${id(ANIMATION.hold)}">${to(STATE.outro, onAir('notEqual'))}</AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.outro)}" animationId="${id(ANIMATION.outro)}" reset="true">${atEnd(STATE.hidden)}</AnimationState>
</StateMachineLayer>
<StateMachineLayer name="Pages">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.pagesIdle)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.pagesIdle)}" animationId="${id(ANIMATION.pagesIdle)}">${to(STATE.firstPage, onAir('equal'))}</AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.firstPage)}" animationId="${id(ANIMATION.firstPage)}" reset="true">${atEnd(pageState(1))}${to(STATE.pagesIdle, onAir('notEqual'))}</AnimationState>
${Array.from({ length: COUNT }, (_, i) => `  <AnimationState x="${420 + 240 * i}" y="0" id="${id(pageState(i))}" animationId="${id(ANIMATION.page + i)}" reset="true">${atEnd(pageState((i + 1) % COUNT))}${to(STATE.pagesIdle, onAir('notEqual'))}</AnimationState>`).join('\n')}
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const TYPES: Record<Kind, string> = { string: 'String', color: 'Color', image: 'AssetImage' };
const declare = (prop: Prop) => `<ViewModelProperty${TYPES[prop.kind]} name="${prop.name}" id="${id(propLocal(prop.name))}" componentProps="1"/>`;
const instance = (prop: Prop) => `<ViewModelInstance${TYPES[prop.kind]} viewModelPropertyId="${id(propLocal(prop.name))}" propertyValue="${prop.value}"/>`;

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, node: string, light: string, open: number, glow: 1 | -1) => `<Node name="${name} Leading Edge" id="${node}" x="${open}">
  <Node name="${name} Edge Light" id="${light}" y="${CARD_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="${-CARD_HEIGHT / 2}"><Rectangle width="2" height="${CARD_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="${-CARD_HEIGHT / 2}"><Rectangle width="44" height="${CARD_HEIGHT}" originX="${glow === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glow}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>
</Node>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_series_history_carousel.ts; edit that file, not this one.
     Basketball series history carousel v2: a card, ${CARD.width} x ${CARD_HEIGHT}, at ${CARD.x}, ${CARD_Y} on a transparent
     1920 x 1080 canvas, clear of the scorebug. A title panel over a feature panel that pages
     through the last five meetings and a list of them, over a footer. Sibling draw order is
     front to back. -->
<Artboard name="Basketball Series History Carousel v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Series History Carousel v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Series History Carousel Card" id="${ROOT}" x="${CARD.x}" y="${CARD_Y}">

${edgeLight('Left', LEFT_EDGE, LEFT_EDGE_LIGHT, -8, 1)}
${edgeLight('Right', RIGHT_EDGE, RIGHT_EDGE_LIGHT, CARD.width + 8, -1)}

<Shape name="Card Specular Sweep" id="${SWEEP}" x="${SWEEP_END}" y="${CARD_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="180" height="${Math.round(CARD_HEIGHT * 1.7)}" originX="0.5" originY="0.5"/>
  <Fill><LinearGradient startX="-90" startY="0" endX="90" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="24FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>

<Node name="Card Content" id="${CONTENT}" x="0" y="0" opacity="0">
  <ClippingShape name="Card Reveal Clip" sourceId="${REVEAL_MASK}"/>
${title}
${feature}
${list}
${footer}
  <!-- The card's dark glass, behind every panel, so the seams read as glass. -->
  <Shape name="Card Backing">${rectangle(CARD.width, CARD_HEIGHT, ALL_OUTER)}<Fill><SolidColor colorValue="${DARK_GLASS}"/></Fill></Shape>
</Node>

<!-- Clip sources: unpainted, so they draw nothing. The reveal mask opens from the seam
     between the feature and the list, both ways at once; at rest it covers the card. -->
<Shape name="Card Reveal Mask" id="${REVEAL_MASK}">
  <Rectangle id="${LEFT_MASK_RECT}" x="${SEAM_X}" y="-8" width="${LEFT_MASK_WIDTH}" height="${CARD_HEIGHT + 16}" originX="1" originY="0"/>
  <Rectangle id="${RIGHT_MASK_RECT}" x="${SEAM_X}" y="-8" width="${RIGHT_MASK_WIDTH}" height="${CARD_HEIGHT + 16}" originX="0" originY="0"/>
</Shape>
<Shape name="Card Silhouette" id="${SILHOUETTE}">
  ${rectangle(CARD.width, CARD_HEIGHT, ALL_OUTER)}
</Shape>
</Node>

<!-- Display: the glass ignites at the seam and wipes open both ways, the rows rise and the
     highlight lights, one sheen to finish; ${(INTRO_FRAMES / 60).toFixed(2)} s. Hold and Outro restore every
     property the Intro animates. -->
${animation('Intro', ANIMATION.intro, INTRO_FRAMES, 'oneShot', intro)}
${animation('Hold', ANIMATION.hold, 1, 'loop', settled)}
${animation('Outro', ANIMATION.outro, OUTRO_FRAMES, 'oneShot', outro)}
${animation('Hidden', ANIMATION.hidden, 1, 'oneShot', hidden)}

<!-- Pages: Idle keys nothing, so the page on show when the card leaves closes with the glass. -->
${animation('Pages Idle', ANIMATION.pagesIdle, 1, 'oneShot', [])}
${animation('Page 1', ANIMATION.firstPage, PAGE_FRAMES, 'oneShot', pageTimeline(0))}
${Array.from({ length: COUNT }, (_, i) => animation(i === 0 ? 'Page 1 Again' : `Page ${i + 1}`, ANIMATION.page + i, PAGE_FRAMES, 'oneShot', pageTimeline(i, (i + COUNT - 1) % COUNT))).join('\n')}

${stateMachine}
</Artboard>

<FontAsset name="Series History Carousel v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Series History Carousel v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Series History Carousel v2 Saint Joseph's" id="${id(ASSET.saintJosephs)}" file="assets/images/big5/saint-josephs.png"/>
<ImageAsset name="Series History Carousel v2 Drexel" id="${id(ASSET.drexel)}" file="assets/images/big5/drexel.png"/>
<ImageAsset name="Series History Carousel v2 No Photo" id="${id(ASSET.blank)}" file="assets/images/blank.png"/>

<ViewModel name="BasketballSeriesHistoryCarouselV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>
${PROPS.map(declare).join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>
${PROPS.map(instance).join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'series_history_carousel.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
