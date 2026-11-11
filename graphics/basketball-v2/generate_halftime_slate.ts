/**
 * Generates the Halftime Slate scene:
 *
 *   bun graphics/basketball-v2/generate_halftime_slate.ts
 *
 * writes halftime_slate.rml beside this file. Edit this file, not the output.
 *
 * A full-frame slate for halftime, in the package's glass language.
 *
 *   Backdrop  opaque near-black with a wash of each team's colour, and a 16:9 hole at the
 *             window: an even-odd clip of the frame and the window cuts it out.
 *   Header    the away panel, the centre cell (title over the game clock), the home panel.
 *   Window    a Stage filling the hole: two team-tint halves with the logos. With the
 *             window open the Stage is hidden, so whatever is under the graphic shows
 *             through, ringed by a hairline.
 *   Column    one dark glass panel paging through team stats, away leaders, home leaders.
 *
 * The state machine has three layers that never key the same property:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro on `isPlaying`; keys only the shell.
 *   Pages    Idle -> Page 1 -> Page 2 -> Page 3 -> Page 1 ..., each page its 8 s dwell; keys
 *            only the page containers and their contents. Off air it returns to Idle,
 *            which keys nothing, so the last page closes with the glass.
 *   Window   Closed / Open poses on `showWindow`, a crossfade between them on air; keys
 *            only the Stage's and the window frame's opacity.
 *
 * The game clock is drawn at the scorebug's size in a scaled node, so the scorebug's own
 * controller lays its digits out tabular.
 */

import { join } from 'node:path';

const PREFIX = 49;
const ARTBOARD_Y = 25400;
const id = (local: number) => `${PREFIX}:${local}`;

// --- test data and view model ----------------------------------------------------------

// Saint Joseph's at Drexel, as the seed's demo game, in capitals as the projector sends it.
const AWAY = { logoFile: 'assets/images/scorebug/saint-josephs.png', primary: 'FFC2071B', secondary: 'FF101010' };
const HOME = { logoFile: 'assets/images/scorebug/drexel.png', primary: 'FF07294D', secondary: 'FFFFC600' };
const AWAY_LOGO_ASSET = 910;
const HOME_LOGO_ASSET = 911;
const CLOCK = '13:59';

const TEAM_ROWS = [
  ['FG', '12-28', '13-27'], ['3PT', '4-11', '5-12'], ['FT', '3-4', '3-5'],
  ['REB', '17', '15'], ['AST', '8', '10'], ['TO', '5', '7'],
] as const;
const LEADERS = {
  away: [['POINTS', 'CAREY', '16'], ['REBOUNDS', 'MARRS', '6'], ['ASSISTS', 'JOHNSON', '4']],
  home: [['POINTS', 'J. REED', '18'], ['REBOUNDS', 'EDOMWONYIN', '8'], ['ASSISTS', 'HIPPS', '5']],
} as const;

// The scorebug's clock: Zuume Bold digit advances (1000 per em) and size, as in
// scorebug_controller.luau, so the default instance opens with the digits it would lay out.
const DIGIT_ADVANCE = [373, 236, 369, 369, 355, 371, 375, 316, 371, 375];
const DIGIT_CELL = 375;
const CLOCK_FONT = 62;
const CLOCK_TRACKING = 0.5;
const CLOCK_SLOTS = 5;
const digitPad = (char: string) => (/^\d$/.test(char) ? ((DIGIT_CELL - DIGIT_ADVANCE[Number(char)]!) * CLOCK_FONT) / 1000 / 2 : 0);
const round = (value: number) => String(Math.round(value * 1000) / 1000);
const clockChars = (text: string) => Array.from({ length: CLOCK_SLOTS }, (_, i) => (i < CLOCK_SLOTS - 1 ? text.charAt(i) : text.slice(i)));
const clockSpacings = (text: string) =>
  clockChars(text).map((char, i) => CLOCK_TRACKING + digitPad(char) + digitPad(i < Math.min(text.length, CLOCK_SLOTS) - 1 ? text.charAt(i + 1) : ''));

type Kind = 'boolean' | 'string' | 'number' | 'color' | 'image';
type Prop = { readonly name: string; readonly kind: Kind; readonly value: string };
const string = (name: string, value: string): Prop => ({ name, kind: 'string', value });
const team = (side: 'away' | 'home', school: string, mascot: string, score: string, data: typeof AWAY, asset: number): Prop[] => [
  string(`${side}School`, school), string(`${side}Mascot`, mascot), string(`${side}Score`, score),
  { name: `${side}Logo`, kind: 'image', value: id(asset) },
  { name: `${side}PrimaryColor`, kind: 'color', value: data.primary },
  { name: `${side}SecondaryColor`, kind: 'color', value: data.secondary },
];

// One table drives the view model's declarations and its Default instance. `_` properties
// are the clock controller's; operators never set them.
const PROPS: readonly Prop[] = [
  { name: 'showWindow', kind: 'boolean', value: 'false' },
  string('title', 'HALFTIME'),
  string('clock', CLOCK),
  ...team('away', "SAINT JOSEPH'S", 'HAWKS', '68', AWAY, AWAY_LOGO_ASSET),
  ...team('home', 'DREXEL', 'DRAGONS', '72', HOME, HOME_LOGO_ASSET),
  ...TEAM_ROWS.flatMap(([label, away, home], i) => [string(`row${i + 1}Label`, label), string(`row${i + 1}AwayValue`, away), string(`row${i + 1}HomeValue`, home)]),
  ...(['away', 'home'] as const).flatMap((side) =>
    LEADERS[side].flatMap(([label, name, value], i) => [
      string(`${side}Leader${i + 1}Label`, label), string(`${side}Leader${i + 1}Name`, name), string(`${side}Leader${i + 1}Value`, value),
    ]),
  ),
  ...clockChars(CLOCK).map((char, i) => string(`_clockChar${i + 1}`, char)),
  ...clockSpacings(CLOCK).map((spacing, i): Prop => ({ name: `_clockSpacing${i + 1}`, kind: 'number', value: round(spacing) })),
  { name: '_clockX', kind: 'number', value: round(digitPad(CLOCK.charAt(0)) / 2) },
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

// --- geometry -------------------------------------------------------------------------

const FRAME = { width: 1920, height: 1080 };
const GAP = 4;
const OUTER = 24;
const SEAM = 6;
const HEADER = { x: 48, y: 48, width: 1824, height: 240 };
const TEAM_WIDTH = 700;
const CENTRE_X = TEAM_WIDTH + GAP;
const CENTRE_WIDTH = HEADER.width - 2 * (TEAM_WIDTH + GAP);
const HOME_X = CENTRE_X + CENTRE_WIDTH + GAP;
// Header-local seams, at the middle of each gap.
const LEFT_SEAM = TEAM_WIDTH + GAP / 2;
const RIGHT_SEAM = HOME_X - GAP / 2;
const WINDOW = { x: 48, y: 312, width: 1280, height: 720 };
const COLUMN = { x: 1352, y: 312, width: 520, height: 720 };
const LOWER_SEAM = (WINDOW.x + WINDOW.width + COLUMN.x) / 2;
const HALF_WIDTH = (WINDOW.width - GAP) / 2;

const STRIPE = 6;
const TINT_OPACITY = 0.78;
const BASE = 'FF0A0D12';
const HAIRLINE = '1FFFFFFF';
const LABEL_BAND = '0AFFFFFF';

// Header logos: the 1024 source at 0.27, a mark about 190 across; the hero's at 0.5.
const HEADER_LOGO = { x: 150, y: 126, scale: 0.27, bloom: 380 };
const HERO_LOGO = { y: WINDOW.height / 2, scale: 0.5, bloom: 720 };
const CLOCK_SCALE = 1.75;
const CLOCK_TEXT_WIDTH = 124;

// Column: a title strip, then each page's body.
const TITLE_HEIGHT = 64;
const BODY_Y = TITLE_HEIGHT + GAP;
const VALUE_WIDTH = 180;
const LABEL_X = VALUE_WIDTH + GAP;
const LABEL_WIDTH = COLUMN.width - 2 * (VALUE_WIDTH + GAP);
const HOME_VALUE_X = LABEL_X + LABEL_WIDTH + GAP;
const CAP_HEIGHT = 72;
const TEAM_ROW_Y = BODY_Y + CAP_HEIGHT + GAP;
const TEAM_ROW_HEIGHT = 92;
const teamRowY = (i: number) => TEAM_ROW_Y + i * (TEAM_ROW_HEIGHT + GAP);
const LEADER_ROW_HEIGHT = 214;
const leaderRowY = (i: number) => BODY_Y + i * (LEADER_ROW_HEIGHT + GAP);

// --- ids ------------------------------------------------------------------------------

const ROOT = id(10);
const BACKDROP = id(15);
const HEADER_NODE = id(100);
const CENTRE = id(150);
const TITLE_REVEAL = id(151);
const CLOCK_REVEAL = id(152);
const STAGE = id(300);
const HERO = id(301);
const STAGE_BASE = id(302);
const WINDOW_FRAME = id(320);
const COLUMN_NODE = id(400);
const PAGE = [id(410), id(440), id(470)] as const;
const HEADER_MASK = id(505);
const HEADER_MASK_RECTS = [id(506), id(507), id(508), id(509)] as const;
const LOWER_MASK = id(510);
const LOWER_MASK_RECTS = [id(511), id(512)] as const;
const WINDOW_CUTOUT = id(600);
const SWEEP = id(601);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const CONTROLLER = id(950);

// Six leading edges: four from the header's seams, two from the column/window seam.
type Edge = { name: string; node: string; light: string; from: number; to: number; top: number; height: number; glow: 1 | -1 };
const EDGES: readonly Edge[] = [
  { name: 'Away', from: HEADER.x + LEFT_SEAM, to: HEADER.x - 8, top: HEADER.y, height: HEADER.height, glow: 1 },
  { name: 'Centre Left', from: HEADER.x + LEFT_SEAM, to: HEADER.x + CENTRE_X + CENTRE_WIDTH / 2, top: HEADER.y, height: HEADER.height, glow: -1 },
  { name: 'Centre Right', from: HEADER.x + RIGHT_SEAM, to: HEADER.x + CENTRE_X + CENTRE_WIDTH / 2, top: HEADER.y, height: HEADER.height, glow: 1 },
  { name: 'Home', from: HEADER.x + RIGHT_SEAM, to: HEADER.x + HEADER.width + 8, top: HEADER.y, height: HEADER.height, glow: -1 },
  { name: 'Window', from: LOWER_SEAM, to: WINDOW.x - 8, top: WINDOW.y, height: WINDOW.height, glow: 1 },
  { name: 'Column', from: LOWER_SEAM, to: COLUMN.x + COLUMN.width + 8, top: COLUMN.y, height: COLUMN.height, glow: -1 },
].map((edge, i) => ({ ...edge, node: id(520 + 2 * i), light: id(521 + 2 * i) }) as Edge);

// The masks open from the seams: a rectangle anchored at a seam per panel, its width keyed.
type Mask = { rect: string; x: number; y: number; height: number; originX: 0 | 1; width: number };
const HEADER_MASKS: readonly Mask[] = [
  { rect: HEADER_MASK_RECTS[0], x: LEFT_SEAM, originX: 1, width: LEFT_SEAM + 8 },
  { rect: HEADER_MASK_RECTS[1], x: LEFT_SEAM, originX: 0, width: CENTRE_WIDTH / 2 + 4 },
  { rect: HEADER_MASK_RECTS[2], x: RIGHT_SEAM, originX: 1, width: CENTRE_WIDTH / 2 + 4 },
  { rect: HEADER_MASK_RECTS[3], x: RIGHT_SEAM, originX: 0, width: HEADER.width - RIGHT_SEAM + 8 },
].map((mask) => ({ ...mask, y: -8, height: HEADER.height + 16 }) as Mask);
const LOWER_MASKS: readonly Mask[] = [
  { rect: LOWER_MASK_RECTS[0], x: LOWER_SEAM, y: WINDOW.y - 8, height: WINDOW.height + 16, originX: 1, width: LOWER_SEAM - WINDOW.x + 8 },
  { rect: LOWER_MASK_RECTS[1], x: LOWER_SEAM, y: COLUMN.y - 8, height: COLUMN.height + 16, originX: 0, width: COLUMN.x + COLUMN.width - LOWER_SEAM + 8 },
];
const MASKS = [...HEADER_MASKS, ...LOWER_MASKS];

// --- markup helpers -------------------------------------------------------------------

const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const RECT_WIDTH = 20;
const COLOR = 37;
const STOP_COLOR = 38;
const IMAGE = 206;
const TEXT = 268;
const LETTER_SPACING = 390;
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

type Radii = readonly [number, number, number, number];
const SQUARE: Radii = [0, 0, 0, 0];
const ALL_OUTER: Radii = [OUTER, OUTER, OUTER, OUTER];
const LEFT_OUTER: Radii = [OUTER, SEAM, OUTER, SEAM];
const RIGHT_OUTER: Radii = [SEAM, OUTER, SEAM, OUTER];
const SEAMS: Radii = [SEAM, SEAM, SEAM, SEAM];

const rectangle = (width: number, height: number, radii: Radii, attributes = '') =>
  `<Rectangle${attributes} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const glazeFill = (height: number) =>
  `<Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF') => `<Shape name="${name} Glaze">
    ${rectangle(width, height, radii)}
    ${glazeFill(height)}
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const darkGlass = (name: string, width: number, height: number, radii: Radii) => `${glaze(name, width, height, radii, '59FFFFFF')}
  <Shape name="${name} Body">${rectangle(width, height, radii)}<Fill><SolidColor colorValue="D10E1116"/></Fill></Shape>`;

/** Team tint over the underlay; `tintId` names the tint so content can clip to it. */
const tintGlass = (name: string, width: number, height: number, radii: Radii, side: 'away' | 'home', tintId: string) => `${glaze(name, width, height, radii)}
  <Shape name="${name} Tint" id="${tintId}" opacity="${TINT_OPACITY}">${rectangle(width, height, radii)}<Fill><SolidColor colorValue="${valueOf(`${side}PrimaryColor`)}">${bind(`${side}PrimaryColor`, COLOR)}</SolidColor></Fill></Shape>
  <Shape name="${name} Underlay">${rectangle(width, height, radii)}<Fill><SolidColor colorValue="59000000"/></Fill></Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

let styleCount = 0;
type Run = { prop?: string; literal?: string; font: string; size: number; spacing: number; color: string };
/** A line of fixed width that shrinks to fit; each run is bound to a property or fixed copy. */
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

const image = (name: string, side: 'away' | 'home', scale: number) =>
  `<Image name="${name}" x="0" y="0" scaleX="${scale}" scaleY="${scale}" assetId="${id(side === 'away' ? AWAY_LOGO_ASSET : HOME_LOGO_ASSET)}">${bind(`${side}Logo`, IMAGE)}</Image>`;

const bloom = (name: string, bloomId: string, x: number, y: number, size: number, clip: string) => `<Shape name="${name} Bloom" id="${bloomId}" x="${x}" y="${y}">
    <Ellipse width="${size}" height="${size}"/>
    <Fill><RadialGradient startX="0" startY="0" endX="${size / 2}" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="${name} Bloom Clip" sourceId="${clip}"/>
  </Shape>`;

/** The secondary-colour stripe along a panel's top, with a light hairline so a dark colour reads, drawn from the seam end. */
const stripe = (name: string, stripeId: string, hairlineId: string, side: 'away' | 'home', width: number, seamAtRight: boolean, clip: string) => {
  const x = seamAtRight ? width : 0;
  const origin = seamAtRight ? 1 : 0;
  return `<Shape name="${name} Stripe" id="${stripeId}" x="${x}" y="0">
    <Rectangle width="${width}" height="${STRIPE}" originX="${origin}" originY="0"/>
    <Fill><SolidColor colorValue="${valueOf(`${side}SecondaryColor`)}">${bind(`${side}SecondaryColor`, COLOR)}</SolidColor></Fill>
    <ClippingShape name="${name} Stripe Clip" sourceId="${clip}"/>
  </Shape>
  <Shape name="${name} Stripe Hairline" id="${hairlineId}" x="${x}" y="${STRIPE}">
    <Rectangle width="${width}" height="1" originX="${origin}" originY="0"/>
    <Fill><SolidColor colorValue="59FFFFFF"/></Fill>
    <ClippingShape name="${name} Stripe Hairline Clip" sourceId="${clip}"/>
  </Shape>`;
};

// --- header ---------------------------------------------------------------------------

const headerTeam = (side: 'away' | 'home') => {
  const away = side === 'away';
  const base = away ? 110 : 130;
  const t = {
    side, name: away ? 'Away' : 'Home', panelX: away ? 0 : HOME_X, towardSeam: away ? 1 : -1,
    content: id(base), logo: id(base + 1), bloom: id(base + 2), stripe: id(base + 3), hairline: id(base + 4), tint: id(base + 5),
    schoolReveal: id(base + 6), mascotReveal: id(base + 7), scoreReveal: id(base + 8),
  };
  const mirror = (x: number, width = 0) => (away ? x : TEAM_WIDTH - x - width);
  const markup = `<Node name="${t.name} Panel" x="${t.panelX}" y="0">
  ${stripe(t.name, t.stripe, t.hairline, side, TEAM_WIDTH, away, t.tint)}
  <Node name="${t.name} Content" id="${t.content}">
    ${text({ name: `${t.name} School`, x: mirror(290, 200), y: 106, width: 200, size: 32, align: away ? 'left' : 'right', runs: [regular(`${side}School`, 32)], reveal: t.schoolReveal })}
    ${text({ name: `${t.name} Mascot`, x: mirror(290, 200), y: 182, width: 200, size: 80, align: away ? 'left' : 'right', runs: [bold(`${side}Mascot`, 80)], reveal: t.mascotReveal })}
    ${text({ name: `${t.name} Score`, x: mirror(490, 186), y: 180, width: 186, size: 150, align: away ? 'right' : 'left', runs: [bold(`${side}Score`, 150)], reveal: t.scoreReveal })}
    <Node name="${t.name} Logo Group" id="${t.logo}" x="${mirror(HEADER_LOGO.x)}" y="${HEADER_LOGO.y}">${image(`${t.name} Logo`, side, HEADER_LOGO.scale)}</Node>
    ${bloom(t.name, t.bloom, mirror(HEADER_LOGO.x), HEADER_LOGO.y, HEADER_LOGO.bloom, t.tint)}
  </Node>
  ${tintGlass(t.name, TEAM_WIDTH, HEADER.height, away ? LEFT_OUTER : RIGHT_OUTER, side, t.tint)}
</Node>`;
  return { ...t, markup };
};
const HEADER_TEAMS = [headerTeam('away'), headerTeam('home')] as const;

// Zuume has no tabular figures: the scorebug's controller pads each digit run to the widest
// digit at its 62-unit size, and the node scales the clock up to the cell.
const clockNodeX = CENTRE_X + (CENTRE_WIDTH - CLOCK_TEXT_WIDTH * CLOCK_SCALE) / 2;
const clockStyles = Array.from({ length: CLOCK_SLOTS }, (_, i) => id(160 + i));
const clock = `<Node name="Clock Scale" x="${clockNodeX}" y="198" scaleX="${CLOCK_SCALE}" scaleY="${CLOCK_SCALE}">
    <Text name="Clock" x="${valueOf('_clockX')}" y="0" originValue="baseline" wrapValue="noWrap" width="${CLOCK_TEXT_WIDTH}" sizingValue="fixed" alignValue="center">${bind('_clockX', X)}
      ${clockStyles.map((style, i) => `<TextStylePaint id="${style}" fontAssetId="${FONT_BOLD}" fontSize="${CLOCK_FONT}" letterSpacing="${valueOf(`_clockSpacing${i + 1}`)}">${bind(`_clockSpacing${i + 1}`, LETTER_SPACING)}<Fill><SolidColor colorValue="FFFFFFFF"/></Fill><TextStyleFeature name="kern" tag="1801810542" featureValue="0"/></TextStylePaint>`).join('\n      ')}
      ${clockStyles.map((style, i) => `<TextValueRun name="Clock Character ${i + 1}" styleId="${style}" text="${valueOf(`_clockChar${i + 1}`)}">${bind(`_clockChar${i + 1}`, TEXT)}</TextValueRun>`).join('\n      ')}
      ${rise('Clock', CLOCK_REVEAL)}
    </Text>
  </Node>`;

const centre = `<Node name="Centre Cell" x="${CENTRE_X}" y="0">
  <Node name="Centre Content" id="${CENTRE}">
    ${text({ name: 'Title', x: 24, y: 62, width: CENTRE_WIDTH - 48, size: 30, align: 'center', runs: [regular('title', 30, 'D9FFFFFF')], reveal: TITLE_REVEAL })}
  </Node>
  ${darkGlass('Centre', CENTRE_WIDTH, HEADER.height, SEAMS)}
</Node>`;

const header = `<Node name="Header" id="${HEADER_NODE}" x="${HEADER.x}" y="${HEADER.y}">
  <ClippingShape name="Header Reveal Clip" sourceId="${HEADER_MASK}"/>
  ${HEADER_TEAMS[0].markup}
  ${clock}
  ${centre}
  ${HEADER_TEAMS[1].markup}
  <Shape name="Header Reveal Mask" id="${HEADER_MASK}">
    ${HEADER_MASKS.map((m) => `<Rectangle id="${m.rect}" x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" originX="${m.originX}" originY="0"/>`).join('\n    ')}
  </Shape>
</Node>`;

// --- window ---------------------------------------------------------------------------

const heroHalf = (side: 'away' | 'home') => {
  const away = side === 'away';
  const base = away ? 330 : 350;
  const t = {
    side, name: away ? 'Hero Away' : 'Hero Home', towardSeam: away ? 1 : -1,
    content: id(base), logo: id(base + 1), bloom: id(base + 2), stripe: id(base + 3), hairline: id(base + 4), tint: id(base + 5),
  };
  const markup = `<Node name="${t.name}" x="${WINDOW.x + (away ? 0 : HALF_WIDTH + GAP)}" y="${WINDOW.y}">
  ${stripe(t.name, t.stripe, t.hairline, side, HALF_WIDTH, away, t.tint)}
  <Node name="${t.name} Content" id="${t.content}">
    <Node name="${t.name} Logo Group" id="${t.logo}" x="${HALF_WIDTH / 2}" y="${HERO_LOGO.y}">${image(`${t.name} Logo`, side, HERO_LOGO.scale)}</Node>
    ${bloom(t.name, t.bloom, HALF_WIDTH / 2, HERO_LOGO.y, HERO_LOGO.bloom, t.tint)}
  </Node>
  ${tintGlass(t.name, HALF_WIDTH, WINDOW.height, away ? LEFT_OUTER : RIGHT_OUTER, side, t.tint)}
</Node>`;
  return { ...t, markup };
};
const HERO_HALVES = [heroHalf('away'), heroHalf('home')] as const;

// The base fills the hole under the hero, so its seam shows the slate, not what lies under it.
const stage = `<Node name="Stage" id="${STAGE}">
  <Node name="Hero" id="${HERO}">
    <ClippingShape name="Hero Reveal Clip" sourceId="${LOWER_MASK}"/>
    ${HERO_HALVES.map((half) => half.markup).join('\n')}
  </Node>
  <Shape name="Stage Base" id="${STAGE_BASE}" x="${WINDOW.x}" y="${WINDOW.y}">${rectangle(WINDOW.width, WINDOW.height, ALL_OUTER)}<Fill><SolidColor colorValue="${BASE}"/></Fill></Shape>
</Node>`;

// A one-unit hairline just outside the hole, lit from above as the glass is.
const windowFrame = `<Node name="Window Frame Reveal">
  <ClippingShape name="Window Frame Reveal Clip" sourceId="${LOWER_MASK}"/>
  <Shape name="Window Frame" id="${WINDOW_FRAME}" x="${WINDOW.x - 0.5}" y="${WINDOW.y - 0.5}" opacity="0">
    ${rectangle(WINDOW.width + 1, WINDOW.height + 1, [OUTER + 0.5, OUTER + 0.5, OUTER + 0.5, OUTER + 0.5])}
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${WINDOW.height}"><GradientStop colorValue="8CFFFFFF" position="0"/><GradientStop colorValue="33FFFFFF" position="1"/></LinearGradient></Stroke>
  </Shape>
</Node>`;

// --- column and its pages -------------------------------------------------------------

type PageElement = { node: string; y: number };
const hairlines = (name: string, ys: readonly number[]) => `<Shape name="${name} Hairlines">
    ${ys.map((y) => rectangle(COLUMN.width, 1, SQUARE, ` x="0" y="${y}"`)).join('\n    ')}
    <Fill><SolidColor colorValue="${HAIRLINE}"/></Fill>
  </Shape>`;

/** A team's cap over its value column: the tint out to the hairlines, the logo on a shade so it reads on its own colour. */
const cap = (side: 'away' | 'home', x: number) => {
  const name = side === 'away' ? 'Away Cap' : 'Home Cap';
  const height = CAP_HEIGHT + GAP;
  return `<Node name="${name}" x="${x}" y="${-GAP / 2}">
    <Node name="${name} Logo Group" x="${VALUE_WIDTH / 2}" y="${height / 2}">${image(`${name} Logo`, side, 0.085)}</Node>
    <Shape name="${name} Logo Shade" x="${VALUE_WIDTH / 2}" y="${height / 2}" scaleY="${height / 120}">
      <Ellipse width="120" height="120"/>
      <Fill><RadialGradient startX="0" startY="0" endX="60" endY="0"><GradientStop colorValue="73000000" position="0"/><GradientStop colorValue="2E000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
    </Shape>
    <Shape name="${name} Tint" opacity="${TINT_OPACITY}">
      ${rectangle(VALUE_WIDTH, height, SQUARE)}
      <Fill><SolidColor colorValue="${valueOf(`${side}PrimaryColor`)}">${bind(`${side}PrimaryColor`, COLOR)}</SolidColor></Fill>
      ${glazeFill(height)}
    </Shape>
  </Node>`;
};

const pageTitle = (name: string, node: string, runs: Run[], tint?: 'away' | 'home') => `<Node name="${name} Title" id="${node}" x="0" y="0">
    ${text({ name: `${name} Title Text`, x: 24, y: 45, width: COLUMN.width - 48, size: 36, align: 'center', runs })}
    ${tint ? `<Shape name="${name} Title Tint" opacity="${TINT_OPACITY}">
      ${rectangle(COLUMN.width, TITLE_HEIGHT + GAP / 2, [OUTER, OUTER, 0, 0])}
      <Fill><SolidColor colorValue="${valueOf(`${tint}PrimaryColor`)}">${bind(`${tint}PrimaryColor`, COLOR)}</SolidColor></Fill>
      ${glazeFill(TITLE_HEIGHT)}
    </Shape>` : ''}
  </Node>`;

const teamPage = (() => {
  const node = PAGE[0];
  const title: PageElement = { node: id(411), y: 0 };
  const caps: PageElement = { node: id(412), y: BODY_Y };
  const rows: PageElement[] = TEAM_ROWS.map((_, i) => ({ node: id(413 + i), y: teamRowY(i) }));
  const frame: PageElement = { node: id(420), y: 0 };
  const dividers = [TITLE_HEIGHT, BODY_Y + CAP_HEIGHT, ...TEAM_ROWS.slice(0, -1).map((_, i) => teamRowY(i) + TEAM_ROW_HEIGHT)].map((y) => y + GAP / 2);
  const value = (prop: string, x: number) => text({ name: prop, x: x + 12, y: 64, width: VALUE_WIDTH - 24, size: 56, align: 'center', runs: [bold(prop, 56)] });
  const markup = `<Node name="Team Stats Page" id="${node}" opacity="1">
  ${pageTitle('Team Stats', title.node, [{ literal: 'TEAM STATS', font: FONT_BOLD, size: 36, spacing: 1, color: 'FFFFFFFF' }])}
  <Node name="Team Stats Caps" id="${caps.node}" x="0" y="${caps.y}">
    ${cap('away', 0)}
    ${cap('home', HOME_VALUE_X)}
  </Node>
  ${rows.map((row, i) => `<Node name="Team Row ${i + 1}" id="${row.node}" x="0" y="${row.y}">
    ${value(`row${i + 1}AwayValue`, 0)}
    ${text({ name: `row${i + 1}Label`, x: LABEL_X + 8, y: 58, width: LABEL_WIDTH - 16, size: 30, align: 'center', runs: [regular(`row${i + 1}Label`, 30)] })}
    ${value(`row${i + 1}HomeValue`, HOME_VALUE_X)}
  </Node>`).join('\n  ')}
  <Node name="Team Stats Frame" id="${frame.node}" x="0" y="0">
    ${hairlines('Team Stats', dividers)}
    <Shape name="Team Stats Label Band" x="${VALUE_WIDTH}" y="${dividers[0]}">${rectangle(LABEL_WIDTH + 2 * GAP, COLUMN.height - dividers[0]!, SQUARE)}<Fill><SolidColor colorValue="${LABEL_BAND}"/></Fill></Shape>
  </Node>
</Node>`;
  return { node, elements: [title, caps, ...rows], frame, markup };
})();

const leaderPage = (side: 'away' | 'home', index: 1 | 2) => {
  const node = PAGE[index];
  const base = 410 + 30 * index;
  const name = side === 'away' ? 'Away Leaders' : 'Home Leaders';
  const title: PageElement = { node: id(base + 1), y: 0 };
  const rows: PageElement[] = [0, 1, 2].map((i) => ({ node: id(base + 2 + i), y: leaderRowY(i) }));
  const frame: PageElement = { node: id(base + 10), y: 0 };
  const dividers = [TITLE_HEIGHT, ...[0, 1].map((i) => leaderRowY(i) + LEADER_ROW_HEIGHT)].map((y) => y + GAP / 2);
  const leader = (i: number) => `${side}Leader${i + 1}`;
  const markup = `<Node name="${name} Page" id="${node}" opacity="0">
  ${pageTitle(name, title.node, [bold(`${side}School`, 36), { literal: '  LEADERS', font: FONT_REGULAR, size: 32, spacing: 2, color: 'D9FFFFFF' }], side)}
  ${rows.map((row, i) => `<Node name="${name} Row ${i + 1}" id="${row.node}" x="0" y="${row.y}">
    ${text({ name: `${leader(i)}Label`, x: 32, y: 84, width: 300, size: 30, align: 'left', runs: [regular(`${leader(i)}Label`, 30)] })}
    ${text({ name: `${leader(i)}Name`, x: 32, y: 156, width: 300, size: 68, align: 'left', runs: [bold(`${leader(i)}Name`, 68)] })}
    ${text({ name: `${leader(i)}Value`, x: 336, y: 160, width: 152, size: 140, align: 'right', runs: [bold(`${leader(i)}Value`, 140)] })}
  </Node>`).join('\n  ')}
  <Node name="${name} Frame" id="${frame.node}" x="0" y="0">
    ${hairlines(name, dividers)}
  </Node>
</Node>`;
  return { node, elements: [title, ...rows], frame, markup };
};

const PAGES = [teamPage, leaderPage('away', 1), leaderPage('home', 2)] as const;

const column = `<Node name="Column" id="${COLUMN_NODE}" x="${COLUMN.x}" y="${COLUMN.y}">
  <ClippingShape name="Column Reveal Clip" sourceId="${LOWER_MASK}"/>
  <Node name="Pages">
${PAGES.map((page) => page.markup).join('\n')}
  </Node>
  ${darkGlass('Column', COLUMN.width, COLUMN.height, ALL_OUTER)}
</Node>`;

// --- backdrop -------------------------------------------------------------------------

const wash = (side: 'away' | 'home') => {
  const away = side === 'away';
  const start = away ? 0 : FRAME.width;
  const end = away ? 1150 : FRAME.width - 1150;
  return `<Shape name="${away ? 'Away' : 'Home'} Wash" opacity="0.34">
    ${rectangle(FRAME.width, FRAME.height, SQUARE)}
    <Fill><LinearGradient startX="${start}" startY="0" endX="${end}" endY="${FRAME.height * 0.35}"><GradientStop colorValue="${valueOf(`${side}PrimaryColor`)}" position="0">${bind(`${side}PrimaryColor`, STOP_COLOR)}</GradientStop><GradientStop colorValue="000A0D12" position="1"/></LinearGradient></Fill>
  </Shape>`;
};

const backdrop = `<Node name="Backdrop" id="${BACKDROP}">
  <ClippingShape name="Window Cutout Clip" sourceId="${WINDOW_CUTOUT}" fillRule="evenOdd"/>
  ${wash('away')}
  ${wash('home')}
  <Shape name="Backdrop Base">${rectangle(FRAME.width, FRAME.height, SQUARE)}<Fill><SolidColor colorValue="${BASE}"/></Fill></Shape>
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
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
const reveal = (rangeId: string, start: number, end: number): Track[] =>
  [move(rangeId, MODIFY_FROM, 0, 1, start, end, EASE_OUT), move(rangeId, FALLOFF_FROM, 0.4, 1.4, start, end, EASE_OUT)];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) => move(objectId, propertyKey, from, to, start, end, EASE_IN);

const INTRO_FRAMES = 84;
const OUTRO_FRAMES = 24;
const FADE_END = 12;
const WIPE_START = 14;
const WIPE_END = 50;
const SWEEP_START = -200;
const SWEEP_END = FRAME.width + 200;

const RANGES = [
  TITLE_REVEAL, CLOCK_REVEAL,
  ...HEADER_TEAMS.flatMap((t) => [t.schoolReveal, t.mascotReveal, t.scoreReveal]),
];
const TEAMS = [...HEADER_TEAMS, ...HERO_HALVES];
const STRIPES = TEAMS.flatMap((t) => [t.stripe, t.hairline]);

const edgeFlare: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 8, value: 0, linear: true }, { frame: 10, value: 1, linear: true },
  { frame: 26, value: 1, ease: EASE_OUT }, { frame: 48, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sheen: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 42, value: 0, linear: true }, { frame: 48, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

const intro: Track[] = [
  hold(ROOT, OPACITY, 1),
  move(BACKDROP, OPACITY, 0, 1, 0, FADE_END, EASE_OUT),
  move(STAGE_BASE, OPACITY, 0, 1, 0, FADE_END, EASE_OUT),
  ...MASKS.map((m) => move(m.rect, RECT_WIDTH, 0, m.width, WIPE_START, WIPE_END, EASE_WIPE)),
  ...EDGES.flatMap((e): Track[] => [
    move(e.node, X, e.from, e.to, WIPE_START, WIPE_END, EASE_WIPE),
    move(e.light, SCALE_Y, 0, 1, 8, 22, EASE_OUT),
    { objectId: e.light, propertyKey: OPACITY, keys: edgeFlare },
  ]),
  ...TEAMS.flatMap((t): Track[] => [
    move(t.content, X, t.towardSeam * 32, 0, 16, 60, EASE_OUT),
    ...scale(t.logo, 1.12, 1, 18, 60, EASE_OUT),
    move(t.logo, OPACITY, 0, 1, 18, 40, EASE_OUT),
    ...scale(t.bloom, 0.6, 1, 18, 58, EASE_OUT),
    move(t.bloom, OPACITY, 0, 1, 18, 44, EASE_OUT),
    move(t.stripe, SCALE_X, 0, 1, 26, 50, EASE_WIPE),
    move(t.hairline, SCALE_X, 0, 1, 26, 50, EASE_WIPE),
  ]),
  ...reveal(TITLE_REVEAL, 22, 46),
  ...reveal(CLOCK_REVEAL, 24, 50),
  ...HEADER_TEAMS.flatMap((t) => [...reveal(t.scoreReveal, 24, 50), ...reveal(t.schoolReveal, 26, 50), ...reveal(t.mascotReveal, 28, 54)]),
  move(SWEEP, X, SWEEP_START, SWEEP_END, 42, INTRO_FRAMES, EASE_SWEEP),
  { objectId: SWEEP, propertyKey: OPACITY, keys: sheen },
];

const settled: Track[] = [
  hold(ROOT, OPACITY, 1),
  hold(BACKDROP, OPACITY, 1),
  hold(STAGE_BASE, OPACITY, 1),
  ...MASKS.map((m) => hold(m.rect, RECT_WIDTH, m.width)),
  ...EDGES.flatMap((e) => [hold(e.node, X, e.to), hold(e.light, SCALE_Y, 1), hold(e.light, OPACITY, 0)]),
  ...TEAMS.flatMap((t) => [
    hold(t.content, X, 0),
    hold(t.logo, SCALE_X, 1), hold(t.logo, SCALE_Y, 1), hold(t.logo, OPACITY, 1),
    hold(t.bloom, SCALE_X, 1), hold(t.bloom, SCALE_Y, 1), hold(t.bloom, OPACITY, 1),
  ]),
  ...STRIPES.map((s) => hold(s, SCALE_X, 1)),
  ...RANGES.flatMap(revealed),
  hold(SWEEP, X, SWEEP_END), hold(SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  // The glass closes by frame 20; what is left fades over the last frames, so nothing pops off.
  { objectId: ROOT, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: 12, value: 1, linear: true }, { frame: OUTRO_FRAMES, value: 0 }] },
  closing(BACKDROP, OPACITY, 1, 0, 6, OUTRO_FRAMES),
  closing(STAGE_BASE, OPACITY, 1, 0, 6, OUTRO_FRAMES),
  ...MASKS.map((m) => closing(m.rect, RECT_WIDTH, m.width, 0, 0, 20)),
  ...EDGES.flatMap((e): Track[] => [
    closing(e.node, X, e.to, e.from, 0, 20),
    hold(e.light, SCALE_Y, 1),
    { objectId: e.light, propertyKey: OPACITY, keys: edgeClosing },
  ]),
  ...TEAMS.flatMap((t): Track[] => [
    closing(t.content, X, 0, t.towardSeam * 24, 0, OUTRO_FRAMES),
    closing(t.logo, SCALE_X, 1, 1.06, 0, 16), closing(t.logo, SCALE_Y, 1, 1.06, 0, 16),
    closing(t.logo, OPACITY, 1, 0, 0, 16),
    hold(t.bloom, SCALE_X, 1), hold(t.bloom, SCALE_Y, 1),
    closing(t.bloom, OPACITY, 1, 0, 0, 16),
  ]),
  ...STRIPES.map((s) => closing(s, SCALE_X, 1, 0, 6, 22)),
  ...RANGES.flatMap(revealed),
  hold(SWEEP, X, SWEEP_END), hold(SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  hold(ROOT, OPACITY, 0),
  ...EDGES.map((e) => hold(e.light, OPACITY, 0)),
  hold(SWEEP, OPACITY, 0),
];

// Pages: each page holds for PAGE_FRAMES. Its parts rise and fade in a few frames apart at
// the start, and sink and fade at the end; the other pages stay hidden.
const PAGE_FRAMES = 480;
const PAGE_IN = { start: 4, length: 24, stagger: 3 };
const PAGE_OUT = { length: 12, stagger: 2 };
const PAGE_RISE = 18;
const PAGE_SINK = 12;

const pageTimeline = (shown: number): Track[] => {
  const page = PAGES[shown]!;
  const parts = page.elements;
  const outStart = (i: number) => PAGE_FRAMES - PAGE_OUT.length - PAGE_OUT.stagger * (parts.length - 1 - i);
  const part = (el: PageElement, i: number): Track[] => {
    const inStart = PAGE_IN.start + PAGE_IN.stagger * i;
    const inEnd = inStart + PAGE_IN.length;
    const out = outStart(i);
    return [
      { objectId: el.node, propertyKey: Y, keys: [{ frame: 0, value: el.y + PAGE_RISE }, { frame: inStart, value: el.y + PAGE_RISE, ease: EASE_OUT }, { frame: inEnd, value: el.y }, { frame: out, value: el.y, ease: EASE_IN }, { frame: out + PAGE_OUT.length, value: el.y + PAGE_SINK }] },
      { objectId: el.node, propertyKey: OPACITY, keys: [{ frame: 0, value: 0 }, { frame: inStart, value: 0, ease: EASE_OUT }, { frame: inEnd, value: 1 }, { frame: out, value: 1, ease: EASE_IN }, { frame: out + PAGE_OUT.length, value: 0 }] },
    ];
  };
  return [
    ...PAGES.map((p, i) => hold(p.node, OPACITY, i === shown ? 1 : 0)),
    ...parts.flatMap(part),
    { objectId: page.frame.node, propertyKey: OPACITY, keys: [{ frame: 0, value: 0, ease: EASE_OUT }, { frame: 16, value: 1 }, { frame: outStart(0), value: 1, ease: EASE_IN }, { frame: PAGE_FRAMES, value: 0 }] },
  ];
};

// Window: two poses and a crossfade between them.
const WINDOW_FRAMES = 20;
const windowPose = (open: boolean): Track[] => [hold(STAGE, OPACITY, open ? 0 : 1), hold(WINDOW_FRAME, OPACITY, open ? 1 : 0)];
const windowFade = (open: boolean): Track[] => [
  move(STAGE, OPACITY, open ? 1 : 0, open ? 0 : 1, 0, WINDOW_FRAMES, EASE_SWEEP),
  move(WINDOW_FRAME, OPACITY, open ? 0 : 1, open ? 1 : 0, 0, WINDOW_FRAMES, EASE_SWEEP),
];

const ANIMATION = {
  hold: 30, intro: 31, outro: 32, hidden: 33,
  pagesIdle: 34, page1: 35, page2: 36, page3: 37,
  windowClosed: 38, windowOpen: 39, windowOpening: 50, windowClosing: 51,
} as const;
const STATE = {
  hold: 40, intro: 41, outro: 42, hidden: 43,
  pagesIdle: 44, page1: 45, page2: 46, page3: 47,
  windowClosed: 48, windowOpen: 49, windowOpening: 52, windowClosing: 53,
} as const;

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const isTrue = (prop: string, op: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${op}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bind(prop, BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
const onAir = (op: 'equal' | 'notEqual') => isTrue('isPlaying', op);
const windowOpen = (op: 'equal' | 'notEqual') => isTrue('showWindow', op);
const to = (state: number, conditions = '') => `<StateTransition stateToId="${id(state)}" duration="0">${conditions}</StateTransition>`;
const atEnd = (state: number) => `<StateTransition stateToId="${id(state)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>`;
const PAGE_STATES = [STATE.page1, STATE.page2, STATE.page3];

const stateMachine = `<StateMachine name="Halftime Slate" id="${id(7)}">
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
  <AnimationState x="180" y="140" id="${id(STATE.pagesIdle)}" animationId="${id(ANIMATION.pagesIdle)}">${to(STATE.page1, onAir('equal'))}</AnimationState>
${PAGE_STATES.map((state, i) => `  <AnimationState x="${180 + 240 * i}" y="0" id="${id(state)}" animationId="${id(ANIMATION.page1 + i)}" reset="true">${atEnd(PAGE_STATES[(i + 1) % PAGE_STATES.length]!)}${to(STATE.pagesIdle, onAir('notEqual'))}</AnimationState>`).join('\n')}
</StateMachineLayer>
<StateMachineLayer name="Window">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.windowClosed)}"/></EntryState>
  <AnimationState x="180" y="0" id="${id(STATE.windowClosed)}" animationId="${id(ANIMATION.windowClosed)}">${to(STATE.windowOpening, windowOpen('equal') + onAir('equal'))}${to(STATE.windowOpen, windowOpen('equal') + onAir('notEqual'))}</AnimationState>
  <AnimationState x="420" y="-120" id="${id(STATE.windowOpening)}" animationId="${id(ANIMATION.windowOpening)}" reset="true">${atEnd(STATE.windowOpen)}${to(STATE.windowClosing, windowOpen('notEqual'))}</AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.windowOpen)}" animationId="${id(ANIMATION.windowOpen)}">${to(STATE.windowClosing, windowOpen('notEqual') + onAir('equal'))}${to(STATE.windowClosed, windowOpen('notEqual') + onAir('notEqual'))}</AnimationState>
  <AnimationState x="420" y="140" id="${id(STATE.windowClosing)}" animationId="${id(ANIMATION.windowClosing)}" reset="true">${atEnd(STATE.windowClosed)}${to(STATE.windowOpening, windowOpen('equal'))}</AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const TYPES: Record<Kind, string> = { boolean: 'Boolean', string: 'String', number: 'Number', color: 'Color', image: 'AssetImage' };
const declare = (prop: Prop) =>
  `<ViewModelProperty${TYPES[prop.kind]} name="${prop.name}" id="${id(propLocal(prop.name))}"${prop.name.startsWith('_') ? '' : ' componentProps="1"'}/>`;
const instance = (prop: Prop) => `<ViewModelInstance${TYPES[prop.kind]} viewModelPropertyId="${id(propLocal(prop.name))}" propertyValue="${prop.value}"/>`;

// --- document -------------------------------------------------------------------------

const edgeLight = (e: Edge) => `<Node name="${e.name} Leading Edge" id="${e.node}" x="${e.to}" y="${e.top}">
  <Node name="${e.name} Edge Light" id="${e.light}" y="${e.height / 2}" opacity="0">
    <Shape name="${e.name} Edge Line" y="${-e.height / 2}"><Rectangle width="2" height="${e.height}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${e.name} Edge Glow" y="${-e.height / 2}"><Rectangle width="44" height="${e.height}" originX="${e.glow === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * e.glow}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>
</Node>`;

// The sheen crosses the header and the column, never the window, where it would cross video.
const silhouette = [
  rectangle(TEAM_WIDTH, HEADER.height, LEFT_OUTER, ` x="${HEADER.x}" y="${HEADER.y}"`),
  rectangle(CENTRE_WIDTH, HEADER.height, SEAMS, ` x="${HEADER.x + CENTRE_X}" y="${HEADER.y}"`),
  rectangle(TEAM_WIDTH, HEADER.height, RIGHT_OUTER, ` x="${HEADER.x + HOME_X}" y="${HEADER.y}"`),
  rectangle(COLUMN.width, COLUMN.height, ALL_OUTER, ` x="${COLUMN.x}" y="${COLUMN.y}"`),
].join('\n  ');

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_halftime_slate.ts; edit that file, not this one.
     Basketball halftime slate v2: an opaque 1920 x 1080 slate with a header (away panel, title
     and clock, home panel), a ${WINDOW.width} x ${WINDOW.height} window at ${WINDOW.x}, ${WINDOW.y} that can open onto
     whatever is under the graphic, and a column paging through team stats and each team's
     leaders. Sibling draw order is front to back. -->
<Artboard name="Basketball Halftime Slate v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="${FRAME.width}" height="${FRAME.height}" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Halftime Slate v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- The scorebug's controller: lays the clock's digits out tabular. -->
<ScriptedDrawable name="Halftime Slate Clock Controller" scriptAssetId="${CONTROLLER}"/>

<Node name="Halftime Slate" id="${ROOT}" opacity="0">

${EDGES.map(edgeLight).join('\n')}

<Shape name="Specular Sweep" id="${SWEEP}" x="${SWEEP_END}" y="${FRAME.height / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="220" height="${FRAME.height * 1.6}" originX="0.5" originY="0.5"/>
  <Fill><LinearGradient startX="-110" startY="0" endX="110" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="24FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>

${header}

${column}

${windowFrame}

${stage}

${backdrop}

<!-- Clip sources: unpainted, so they draw nothing. -->
<Shape name="Lower Reveal Mask" id="${LOWER_MASK}">
  ${LOWER_MASKS.map((m) => `<Rectangle id="${m.rect}" x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" originX="${m.originX}" originY="0"/>`).join('\n  ')}
</Shape>
<Shape name="Slate Silhouette" id="${SILHOUETTE}">
  ${silhouette}
</Shape>
</Node>

<Node name="Window Cutout Source">
<Shape name="Window Cutout" id="${WINDOW_CUTOUT}">${rectangle(FRAME.width, FRAME.height, SQUARE)}${rectangle(WINDOW.width, WINDOW.height, ALL_OUTER, ` x="${WINDOW.x}" y="${WINDOW.y}"`)}</Shape>
</Node>

<!-- Display: the backdrop fades up, then the glass ignites at the seams and wipes open;
     ${(INTRO_FRAMES / 60).toFixed(2)} s. Hold and Outro restore every property the Intro animates. -->
${animation('Intro', ANIMATION.intro, INTRO_FRAMES, 'oneShot', intro)}
${animation('Hold', ANIMATION.hold, 1, 'loop', settled)}
${animation('Outro', ANIMATION.outro, OUTRO_FRAMES, 'oneShot', outro)}
${animation('Hidden', ANIMATION.hidden, 1, 'oneShot', hidden)}

<!-- Pages: Idle keys nothing, so the page on screen when the slate leaves closes with the glass. -->
${animation('Pages Idle', ANIMATION.pagesIdle, 1, 'oneShot', [])}
${PAGES.map((_, i) => animation(`Page ${i + 1}`, ANIMATION.page1 + i, PAGE_FRAMES, 'oneShot', pageTimeline(i))).join('\n')}

<!-- Window: the hero, or the hole with its frame. -->
${animation('Window Closed', ANIMATION.windowClosed, 1, 'oneShot', windowPose(false))}
${animation('Window Open', ANIMATION.windowOpen, 1, 'oneShot', windowPose(true))}
${animation('Window Opening', ANIMATION.windowOpening, WINDOW_FRAMES, 'oneShot', windowFade(true))}
${animation('Window Closing', ANIMATION.windowClosing, WINDOW_FRAMES, 'oneShot', windowFade(false))}

${stateMachine}
</Artboard>

<FontAsset name="Halftime Slate v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Halftime Slate v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Halftime Slate v2 Saint Joseph's" id="${id(AWAY_LOGO_ASSET)}" file="${AWAY.logoFile}"/>
<ImageAsset name="Halftime Slate v2 Drexel" id="${id(HOME_LOGO_ASSET)}" file="${HOME.logoFile}"/>
<ScriptAsset name="halftime_slate_clock" folderPath="graphics/basketball-v2" id="${CONTROLLER}" file="graphics/basketball-v2/scorebug_controller.luau"/>

<ViewModel name="BasketballHalftimeSlateV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>
${PROPS.map(declare).join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>
${PROPS.map(instance).join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'halftime_slate.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
