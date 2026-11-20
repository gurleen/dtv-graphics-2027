/**
 * Generates the Coming Up Next lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_coming_up_next.ts
 *
 * writes coming_up_next.rml beside this file. Edit this file, not the output.
 *
 * A full-width lower third the operator takes going to a break before the game: tonight's
 * matchup, with less on it than the matchup locator lower third. It is the Big 5 Stakes
 * build with team names and records in place of the stakes copy.
 *
 *   Tab     a title centred above the block, as wide as its text.
 *   Halves  away at the left, home at the right, as a matchup reads. Each is a team panel
 *           (the logo large at the outer end and cropped by the panel, the school and its
 *           mascot on one line) over a dark-glass strip with the team's record. The home
 *           half mirrors the away half: its logo and marker on the outer edge, its text
 *           right-aligned.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro, gated on
 * `isPlaying`).
 */

import { join } from 'node:path';

const PREFIX = 57;
const ARTBOARD_Y = 35000;

// Test data: Saint Joseph's at Drexel, the seed's demo game.
const AWAY = {
  school: "SAINT JOSEPH'S", mascot: 'HAWKS', record: '15-5 · 7-2 A10',
  logoFile: 'assets/images/big5/saint-josephs.png', primary: 'FFC2071B', secondary: 'FFFFFFFF',
};
const HOME = {
  school: 'DREXEL', mascot: 'DRAGONS', record: '14-6 · 6-3 CAA',
  logoFile: 'assets/images/big5/drexel.png', primary: 'FF07294D', secondary: 'FFFFC600',
};
const TITLE = 'COMING UP NEXT';
const MASCOT_GAP = '  ';

// Geometry. The block spans the action-safe width (x 96 to 1824) and stands on the
// scorebug's baseline (y 1022). y 0 is the tab's top edge; the halves meet at the seam.
const BLOCK_X = 96;
const BLOCK_WIDTH = 1728;
const GAP = 4;
const TAB_HEIGHT = 44;
const TAB_Y = 0;
const PANEL_Y = TAB_Y + TAB_HEIGHT + GAP;
const PANEL_HEIGHT = 84;
const STRIP_Y = PANEL_Y + PANEL_HEIGHT + GAP;
const STRIP_HEIGHT = 44;
const BLOCK_HEIGHT = STRIP_Y + STRIP_HEIGHT;
const BLOCK_Y = 1022 - BLOCK_HEIGHT;
const SEAM = BLOCK_WIDTH / 2;
const HALF_WIDTH = (BLOCK_WIDTH - GAP) / 2;
const LEFT_X = 0;
const RIGHT_X = HALF_WIDTH + GAP;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const TEXT_INSET = 24;
// The tab hugs its title, padded TAB_PADDING each side, up to TAB_MAX_WIDTH.
const TAB_PADDING = 28;
const TAB_MAX_WIDTH = 1000;
const TAB_DROP = 12;
// As on the matchup locator lower third, the logo is larger than its panel and cropped at
// the outer edge, top and bottom: a 1024 source holds about 650 x 520 of mark, about
// 143 x 114 at 0.22 against the panel's 84. LOGO_CENTRE is the logo's centre from the
// panel's outer edge; the text starts TEXT_START from that edge, clear of the mark.
const LOGO_SCALE = 0.18;
const LOGO_CENTRE = 66;
const LOGO_DRIFT = 18;
const TEXT_START = 150;
const BLOOM_SIZE = 240;
// The reveal mask and edge lights run REVEAL_OVERHANG past each end of the block.
const REVEAL_OVERHANG = 24;
const STRIP_DROP = STRIP_HEIGHT + GAP;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 84;
const OUTRO_FRAMES = 24;
const WIPE_START = 6;
const WIPE_END = 40;
const SWEEP_FROM = 44;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

// Property keys used by the timelines and binds.
const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const FALLOFF_FROM = 317;
const FALLOFF_TO = 318;
const MODIFY_FROM = 327;
const MODIFY_TO = 336;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;
const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const BAND = id(300);
const TAB = id(400);
const TAB_RISE = id(401);
const TITLE_STYLE = id(403);
const TITLE_REVEAL = id(404);
const STRIP = id(450);
const STRIP_SLIDE = id(451);
const LEFT_EDGE_LIGHT = id(502);
const RIGHT_EDGE_LIGHT = id(507);
const REVEAL_MASK = id(510);
const STRIP_MASK = id(513);
const INTRO_SWEEP = id(600);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const AWAY_LOGO_ASSET = id(910);
const HOME_LOGO_ASSET = id(911);

const P = {
  isPlaying: 1002,
  title: 1010,
  awaySchool: 1011, homeSchool: 1012,
  awayMascot: 1013, homeMascot: 1014,
  awayRecord: 1015, homeRecord: 1016,
  awayLogo: 1020, homeLogo: 1021,
  awayPrimaryColor: 1022, homePrimaryColor: 1023,
  homeSecondaryColor: 1024,
} as const;

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

const rectangle = (width: number, height: number, radii: Radii, position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const GLAZE_FILL = (height: number) => `<Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>`;
const HAIRLINE = (height: number, top: string) => `<Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${top}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    ${GLAZE_FILL(height)}
    ${HAIRLINE(height, strokeTop)}
  </Shape>`;

// The block's dark backing: one piece per moving part, tiling the block's outline once so
// the 4-unit seams read as glass, not video. A piece is the last child of its panel.
type Piece = { x: number; y: number; width: number; height: number; radii: Radii };

const backing = (name: string, { x, y, width, height, radii }: Piece) => `<Shape name="${name} Backing" x="${x}" y="${y}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

const tint = (name: string, tintId: string, width: number, height: number, radii: Radii, color: string, property: number) =>
  `<Shape name="${name}" id="${tintId}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="${color}">${bound(property, COLOR)}</SolidColor></Fill>
  </Shape>`;

const underlay = (name: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>`;

// Text reveals, as on the matchup locator lower third: each glyph rises 14 into place as
// it fades in. A backward reveal builds the line from its last glyph.
type Direction = 'forward' | 'backward';

const RANGE_AT_REST: Record<Direction, string> = {
  forward: 'modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"',
  backward: 'modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"',
};

const rise = (name: string, rangeId: string, direction: Direction) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" ${RANGE_AT_REST[direction]}/></TextModifierGroup>`;

const paint = (styleId: string, font: string, size: number, spacing: number, color: string) =>
  `<TextStylePaint id="${styleId}" fontAssetId="${font}" fontSize="${size}" letterSpacing="${spacing}"><Fill><SolidColor colorValue="${color}"/></Fill></TextStylePaint>`;

const run = (name: string, styleId: string, value: string, property?: number) =>
  `<TextValueRun name="${name}" styleId="${styleId}" text="${xml(value)}">${property === undefined ? '' : bound(property, TEXT)}</TextValueRun>`;

/** A fixed text box, shrunk to fit when its value is longer. */
const textBox = (o: { name: string; x: number; y: number; width: number; height: number; align?: string; body: string }) =>
  `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.height}" sizingValue="fixed" overflowValue="fitFontSize"${o.align ? ` alignValue="${o.align}"` : ''}>
    ${o.body}
  </Text>`;

// --- halves ---------------------------------------------------------------------------

// Each half is laid out from the seam outward: the away half's outer end is at the left,
// the home half's at the right. Per-side elements are numbered from a base.
const half = (o: { label: 'Home' | 'Away'; key: 'home' | 'away'; team: typeof HOME; base: number; outward: -1 | 1; logoAsset: string }) => {
  const left = o.outward === -1;
  const p = o.key === 'home'
    ? { school: P.homeSchool, mascot: P.homeMascot, record: P.homeRecord, logo: P.homeLogo, primary: P.homePrimaryColor }
    : { school: P.awaySchool, mascot: P.awayMascot, record: P.awayRecord, logo: P.awayLogo, primary: P.awayPrimaryColor };
  return {
    ...o, p,
    x: left ? LEFT_X : RIGHT_X,
    // The seam takes 2 units each side; the gap under the panel, above the sliding strip,
    // is the panel's.
    panelBacking: {
      x: left ? 0 : -GAP / 2, y: 0, width: HALF_WIDTH + GAP / 2, height: PANEL_HEIGHT + GAP,
      radii: (left ? [OUTER_RADIUS, 0, 0, 0] : [0, OUTER_RADIUS, 0, 0]) as Radii,
    },
    stripBacking: {
      x: left ? 0 : -GAP / 2, y: 0, width: HALF_WIDTH + GAP / 2, height: STRIP_HEIGHT,
      radii: (left ? [0, 0, OUTER_RADIUS, 0] : [0, 0, 0, OUTER_RADIUS]) as Radii,
    },
    panelRadii: (left ? [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS] : [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS]) as Radii,
    stripRadii: (left ? [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS] : [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS]) as Radii,
    markerX: left ? 0 : HALF_WIDTH - MARKER_WIDTH,
    markerRadii: (left ? [OUTER_RADIUS, 0, INNER_RADIUS, 0] : [0, OUTER_RADIUS, 0, INNER_RADIUS]) as Radii,
    // Home's marker takes its secondary colour; away's is white, since a visitor's
    // secondary (Saint Joseph's near black) can vanish on glass.
    marker: o.key === 'home' ? bound(P.homeSecondaryColor, COLOR) : '',
    logoX: left ? LOGO_CENTRE : HALF_WIDTH - LOGO_CENTRE,
    // Type reads from the seam outward: the left half's is left-aligned and revealed from
    // its last glyph, the right half's right-aligned and revealed from its first.
    textX: left ? TEXT_START : TEXT_INSET,
    align: left ? undefined : 'right',
    direction: (left ? 'backward' : 'forward') as Direction,
    ids: {
      marker: id(o.base + 2), logo: id(o.base + 3), bloom: id(o.base + 4),
      panel: id(o.base + 10), content: id(o.base + 11), panelTint: id(o.base + 12), strip: id(o.base + 13),
      schoolStyle: id(o.base + 20), mascotStyle: id(o.base + 21), recordStyle: id(o.base + 22),
      nameReveal: id(o.base + 30), recordReveal: id(o.base + 31),
    },
  };
};

const HALVES = [
  half({ label: 'Away', key: 'away', team: AWAY, base: 100, outward: -1, logoAsset: AWAY_LOGO_ASSET }),
  half({ label: 'Home', key: 'home', team: HOME, base: 200, outward: 1, logoAsset: HOME_LOGO_ASSET }),
];
type Half = (typeof HALVES)[number];

const NAME_BASELINE = 60;
const RECORD_BASELINE = 31;
const TEXT_WIDTH = HALF_WIDTH - TEXT_START - TEXT_INSET;

// The school in Bold and the mascot beside it as a muted label, in reading order on both
// sides.
const nameLine = (h: Half) => [
  paint(h.ids.schoolStyle, FONT_BOLD, 54, 0.5, 'FFFFFFFF'),
  paint(h.ids.mascotStyle, FONT_REGULAR, 32, 2, 'B3FFFFFF'),
  run(`${h.label} School`, h.ids.schoolStyle, h.team.school, h.p.school),
  run(`${h.label} Mascot Gap`, h.ids.mascotStyle, MASCOT_GAP),
  run(`${h.label} Mascot`, h.ids.mascotStyle, h.team.mascot, h.p.mascot),
  rise(`${h.label} Name`, h.ids.nameReveal, h.direction),
].join('\n    ');

const panel = (h: Half) => `<Node name="${h.label} Panel" id="${h.ids.panel}" x="${h.x}" y="${PANEL_Y}">
  <Node name="${h.label} Content" id="${h.ids.content}" x="0" y="0">
  ${textBox({ name: `${h.label} Name`, x: h.textX, y: NAME_BASELINE, width: TEXT_WIDTH, height: 64, align: h.align, body: nameLine(h) })}
  </Node>
  <!-- Grows upward from the panel's bottom edge. -->
  <Shape name="${h.label} Marker" id="${h.ids.marker}" x="${h.markerX}" y="${PANEL_HEIGHT}">
    ${rectangle(MARKER_WIDTH, PANEL_HEIGHT, h.markerRadii, ` x="0" y="${-PANEL_HEIGHT}"`)}
    <Fill><SolidColor colorValue="${h.team.secondary}">${h.marker}</SolidColor></Fill>
  </Shape>
  <!-- Larger than the panel: the tint crops it at the outer edge, top and bottom. -->
  <Node name="${h.label} Logo" id="${h.ids.logo}" x="${h.logoX}" y="${PANEL_HEIGHT / 2}">
    <ClippingShape name="${h.label} Logo Clip" sourceId="${h.ids.panelTint}"/>
    <Image name="${h.label} Logo Image" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${h.logoAsset}">${bound(h.p.logo, IMAGE)}</Image>
  </Node>
  <Shape name="${h.label} Logo Bloom" id="${h.ids.bloom}" x="${h.logoX}" y="${PANEL_HEIGHT / 2}">
    <Ellipse width="${BLOOM_SIZE}" height="${BLOOM_SIZE}"/>
    <Fill><RadialGradient startX="0" startY="0" endX="${BLOOM_SIZE / 2}" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="${h.label} Logo Bloom Clip" sourceId="${h.ids.panelTint}"/>
  </Shape>
  ${glaze(`${h.label} Panel`, HALF_WIDTH, PANEL_HEIGHT, h.panelRadii)}
  ${tint(`${h.label} Panel Tint`, h.ids.panelTint, HALF_WIDTH, PANEL_HEIGHT, h.panelRadii, h.team.primary, h.p.primary)}
  ${underlay(`${h.label} Panel Underlay`, HALF_WIDTH, PANEL_HEIGHT, h.panelRadii)}
  ${backing(`${h.label} Panel`, h.panelBacking)}
</Node>`;

const band = `<Node name="Band" id="${BAND}" x="0" y="0">
  <ClippingShape name="Band Reveal Clip" sourceId="${REVEAL_MASK}"/>
  ${HALVES.map(panel).join('\n  ')}
</Node>`;

// --- strips ---------------------------------------------------------------------------

const stripHalf = (h: Half) => `<Node name="${h.label} Strip" id="${h.ids.strip}" x="${h.x}" y="0">
  ${textBox({
    name: `${h.label} Record`, x: h.textX, y: RECORD_BASELINE, width: TEXT_WIDTH, height: 34, align: h.align,
    body: [
      paint(h.ids.recordStyle, FONT_BOLD, 28, 1, 'D9FFFFFF'),
      run(`${h.label} Record Value`, h.ids.recordStyle, h.team.record, h.p.record),
      rise(`${h.label} Record`, h.ids.recordReveal, h.direction),
    ].join('\n    '),
  })}
  ${glaze(`${h.label} Strip`, HALF_WIDTH, STRIP_HEIGHT, h.stripRadii, '59FFFFFF')}
  ${backing(`${h.label} Strip`, h.stripBacking)}
</Node>`;

// Both strips slide down together from under the panels.
const strip = `<Node name="Strip" id="${STRIP}" x="0" y="${STRIP_Y}">
  <ClippingShape name="Strip Reveal Clip" sourceId="${REVEAL_MASK}"/>
  <ClippingShape name="Strip Slide Clip" sourceId="${STRIP_MASK}"/>
  <Node name="Strip Slide" id="${STRIP_SLIDE}" x="0" y="0">
  ${HALVES.map(stripHalf).join('\n  ')}
  </Node>
</Node>`;

// --- title tab ------------------------------------------------------------------------

// The tab hugs its title, as the Scorebug Slider's glass does: a row as wide as the block
// centres a hug panel, whose glaze and backing are absolute boxes at 100% of its width.
// The backing reaches down across the tab's own 4-unit gap. A box's fill ignores an
// ancestor's ClippingShape, so the tab cannot rise from behind the band as the matchup
// locator lower third's does; it fades in as it rises a short way.
const pinned = (edges: Record<string, number>) =>
  `positionTypeValue="absolute" ${Object.entries(edges).map(([edge, value]) => `position${edge}="${value}" position${edge}UnitsValue="points"`).join(' ')}`;
const boxRadii = (radii: Radii) =>
  `linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"`;

const titleTab = `<Node name="Title" id="${TAB}" x="0" y="0" opacity="0">
  <Node name="Title Rise" id="${TAB_RISE}" x="0" y="${TAB_Y}">
  <LayoutComponent name="Title Row" id="${id(410)}" clip="false" width="${BLOCK_WIDTH}" height="${TAB_HEIGHT}" styleId="${id(411)}">
    <LayoutComponentStyle name="Title Row Style" id="${id(411)}" ${pinned({ Left: 0, Top: 0 })} layoutWidthScaleType="fixed" layoutHeightScaleType="fixed" flexDirectionValue="row" layoutAlignmentType="topCenter"/>
    <LayoutComponent name="Title Panel" id="${id(420)}" clip="false" width="0" height="${TAB_HEIGHT}" styleId="${id(421)}">
      <LayoutComponentStyle name="Title Panel Style" id="${id(421)}" layoutWidthScaleType="hug" layoutHeightScaleType="fixed" flexDirectionValue="row"/>
      <LayoutComponent name="Title Content" id="${id(430)}" clip="false" width="0" height="${TAB_HEIGHT}" styleId="${id(431)}">
        <LayoutComponentStyle name="Title Content Style" id="${id(431)}" layoutWidthScaleType="hug" layoutHeightScaleType="fixed" flexDirectionValue="row" layoutAlignmentType="center" paddingLeft="${TAB_PADDING}" paddingLeftUnitsValue="points" paddingRight="${TAB_PADDING}" paddingRightUnitsValue="points"/>
        <Text name="Title Text" id="${id(432)}" wrapValue="noWrap" overflowValue="fit">
          <LayoutParticipant layoutWidthScaleType="hug" layoutHeightScaleType="hug" maxWidth="${TAB_MAX_WIDTH - 2 * TAB_PADDING}" maxWidthUnitsValue="points"/>
          ${paint(TITLE_STYLE, FONT_BOLD, 28, 1, 'FFFFFFFF')}
          ${run('Title Value', TITLE_STYLE, TITLE, P.title)}
          ${rise('Title', TITLE_REVEAL, 'forward')}
        </Text>
      </LayoutComponent>
      <LayoutComponent name="Title Glaze" id="${id(440)}" clip="false" width="100" height="${TAB_HEIGHT}" styleId="${id(441)}">
        <LayoutComponentStyle name="Title Glaze Style" id="${id(441)}" ${pinned({ Left: 0, Top: 0 })} widthUnitsValue="percent" ${boxRadii([OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS])}/>
        ${GLAZE_FILL(TAB_HEIGHT)}
        ${HAIRLINE(TAB_HEIGHT, '59FFFFFF')}
      </LayoutComponent>
      <LayoutComponent name="Title Backing" id="${id(445)}" clip="false" width="100" height="${TAB_HEIGHT + GAP}" styleId="${id(446)}">
        <LayoutComponentStyle name="Title Backing Style" id="${id(446)}" ${pinned({ Left: 0, Top: 0 })} widthUnitsValue="percent" ${boxRadii([OUTER_RADIUS, OUTER_RADIUS, 0, 0])}/>
        <Fill><SolidColor colorValue="D10E1116"/></Fill>
      </LayoutComponent>
    </LayoutComponent>
  </LayoutComponent>
  </Node>
</Node>`;

const sweep = `<Shape name="Glass Specular Sweep" id="${INTRO_SWEEP}" x="${SWEEP_END}" y="${(PANEL_Y + BLOCK_HEIGHT) / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="130" height="${(BLOCK_HEIGHT - PANEL_Y) * 1.7}"/>
  <Fill><LinearGradient startX="-65" startY="0" endX="65" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Glass Specular Sweep Clip" sourceId="${SILHOUETTE}"/>
</Shape>`;

// The halves' outer outline, panels and strips with the seams between them.
const silhouette = rectangle(BLOCK_WIDTH, BLOCK_HEIGHT - PANEL_Y, [OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS], ` x="0" y="${PANEL_Y}"`);

// --- timelines ------------------------------------------------------------------------

type Key = { frame: number; value: number; ease?: string; linear?: boolean };
type Track = { objectId: string; propertyKey: number; keys: Key[] };

const renderTrack = ({ objectId, propertyKey, keys }: Track) => {
  const frames = keys.map(({ frame, value, ease, linear }) => {
    if (ease) return `    <KeyFrameDouble frame="${frame}" value="${value}" interpolationType="cubic">${ease}</KeyFrameDouble>`;
    return `    <KeyFrameDouble frame="${frame}" value="${value}" interpolationType="${linear ? 'linear' : 'hold'}"/>`;
  });
  return `  <KeyedObject objectId="${objectId}"><KeyedProperty propertyKey="${propertyKey}">\n${frames.join('\n')}\n  </KeyedProperty></KeyedObject>`;
};

const hold = (objectId: string, propertyKey: number, value: number): Track =>
  ({ objectId, propertyKey, keys: [{ frame: 0, value }] });
/** A move from `from` to `to` over frames start..end, holding before and after. */
const move = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number, ease: string): Track => ({
  objectId, propertyKey,
  keys: start > 0
    ? [{ frame: 0, value: from }, { frame: start, value: from, ease }, { frame: end, value: to }]
    : [{ frame: 0, value: from, ease }, { frame: end, value: to }],
});
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
const holdScale = (objectId: string, value: number): Track[] => [hold(objectId, SCALE_X, value), hold(objectId, SCALE_Y, value)];

const reveal = (rangeId: string, direction: Direction, start: number, end: number): Track[] => direction === 'forward'
  ? [move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT), move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT)]
  : [move(rangeId, MODIFY_TO, 1.4, 0, start, end, EASE_OUT), move(rangeId, FALLOFF_TO, 1, -0.4, start, end, EASE_OUT)];
const revealed = (rangeId: string, direction: Direction): Track[] => direction === 'forward'
  ? [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)]
  : [hold(rangeId, MODIFY_TO, 0), hold(rangeId, FALLOFF_TO, -0.4)];

const RANGES: [string, Direction][] = [
  [TITLE_REVEAL, 'forward'],
  ...HALVES.flatMap((h): [string, Direction][] => [[h.ids.nameReveal, h.direction], [h.ids.recordReveal, h.direction]]),
];
const GROUPS = [BAND, STRIP];
const EDGE_LIGHTS = [LEFT_EDGE_LIGHT, RIGHT_EDGE_LIGHT];

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sweepOpacity: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: SWEEP_FROM, value: 0, linear: true }, { frame: SWEEP_FROM + 6, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

const LEFT_EDGE_END = -REVEAL_OVERHANG;
const RIGHT_EDGE_END = BLOCK_WIDTH + REVEAL_OVERHANG;

const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  // Seam ignition at the centre; the glass wipes outward to both ends.
  move(REVEAL_MASK, SCALE_X, 0, 1, WIPE_START, WIPE_END, EASE_WIPE),
  move(LEFT_EDGE_LIGHT, X, SEAM, LEFT_EDGE_END, WIPE_START, WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE_LIGHT, X, SEAM, RIGHT_EDGE_END, WIPE_START, WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [
    move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT),
    { objectId: light, propertyKey: OPACITY, keys: edgeFlare(18, 42) },
  ]),
  ...HALVES.flatMap((h): Track[] => [
    move(h.ids.content, X, -h.outward * CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
    ...reveal(h.ids.nameReveal, h.direction, 14, 40),
    ...reveal(h.ids.recordReveal, h.direction, 26, 52),
    // The logo settles in as the wipe reaches the outer end, drifting outward with it.
    move(h.ids.logo, X, h.logoX - h.outward * LOGO_DRIFT, h.logoX, 22, 60, EASE_OUT),
    ...scale(h.ids.logo, 1.12, 1, 22, 60, EASE_OUT),
    move(h.ids.logo, OPACITY, 0, 1, 22, 42, EASE_OUT),
    ...scale(h.ids.bloom, 0.7, 1, 26, 62, EASE_OUT),
    move(h.ids.bloom, OPACITY, 0, 1, 26, 56, EASE_OUT),
    move(h.ids.marker, SCALE_Y, 0, 1, 34, 54, EASE_OUT),
  ]),
  move(STRIP_SLIDE, Y, -STRIP_DROP, 0, 16, 42, EASE_OUT),
  move(TAB, OPACITY, 0, 1, 30, 48, EASE_OUT),
  move(TAB_RISE, Y, TAB_Y + TAB_DROP, TAB_Y, 30, 54, EASE_OUT),
  ...reveal(TITLE_REVEAL, 'forward', 36, 58),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, SWEEP_FROM, INTRO_FRAMES, EASE_SWEEP),
  { objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: sweepOpacity },
];

const settledRanges = RANGES.flatMap(([rangeId, direction]) => revealed(rangeId, direction));

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(REVEAL_MASK, SCALE_X, 1),
  hold(LEFT_EDGE_LIGHT, X, LEFT_EDGE_END),
  hold(RIGHT_EDGE_LIGHT, X, RIGHT_EDGE_END),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  ...HALVES.flatMap((h): Track[] => [
    hold(h.ids.content, X, 0),
    hold(h.ids.logo, X, h.logoX), ...holdScale(h.ids.logo, 1), hold(h.ids.logo, OPACITY, 1),
    ...holdScale(h.ids.bloom, 1), hold(h.ids.bloom, OPACITY, 1),
    hold(h.ids.marker, SCALE_Y, 1),
  ]),
  hold(STRIP_SLIDE, Y, 0),
  hold(TAB, OPACITY, 1),
  hold(TAB_RISE, Y, TAB_Y),
  ...settledRanges,
  hold(INTRO_SWEEP, X, SWEEP_END), hold(INTRO_SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  // The glass closes back into the seam.
  closing(REVEAL_MASK, SCALE_X, 1, 0, 2, OUTRO_FRAMES),
  closing(LEFT_EDGE_LIGHT, X, LEFT_EDGE_END, SEAM, 2, OUTRO_FRAMES),
  closing(RIGHT_EDGE_LIGHT, X, RIGHT_EDGE_END, SEAM, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  ...HALVES.flatMap((h): Track[] => [
    closing(h.ids.content, X, 0, -h.outward * 18, 0, OUTRO_FRAMES),
    hold(h.ids.logo, X, h.logoX),
    ...[SCALE_X, SCALE_Y].map((key) => closing(h.ids.logo, key, 1, 1.06, 0, OUTRO_FRAMES)),
    closing(h.ids.logo, OPACITY, 1, 0, 0, 12),
    ...holdScale(h.ids.bloom, 1),
    closing(h.ids.bloom, OPACITY, 1, 0, 0, 14),
    closing(h.ids.marker, SCALE_Y, 1, 0, 0, 12),
  ]),
  closing(STRIP_SLIDE, Y, 0, -STRIP_DROP, 0, 16),
  closing(TAB, OPACITY, 1, 0, 0, 14),
  closing(TAB_RISE, Y, TAB_Y, TAB_Y + TAB_DROP, 0, 16),
  ...settledRanges,
  hold(INTRO_SWEEP, X, SWEEP_END), hold(INTRO_SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  hold(TAB, OPACITY, 0),
  ...EDGE_LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(P.isPlaying, 634)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const ID = { hold: 30, intro: 31, outro: 32, hidden: 33 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43 } as const;

const stateMachine = `<StateMachine name="Coming Up Next" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.hidden)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.hidden)}" animationId="${id(ID.hidden)}"><StateTransition stateToId="${id(STATE.intro)}" duration="0">${onAir('equal')}</StateTransition></AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.intro)}" animationId="${id(ID.intro)}" reset="true">
    <StateTransition stateToId="${id(STATE.hold)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.outro)}" duration="0">${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.hold)}" animationId="${id(ID.hold)}"><StateTransition stateToId="${id(STATE.outro)}" duration="0">${onAir('notEqual')}</StateTransition></AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.outro)}" animationId="${id(ID.outro)}" reset="true"><StateTransition stateToId="${id(STATE.hidden)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/></AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const string = (name: string, local: number) => `<ViewModelPropertyString name="${name}" id="${id(local)}" componentProps="1"/>`;
const image = (name: string, local: number) => `<ViewModelPropertyAssetImage name="${name}" id="${id(local)}" componentProps="1"/>`;
const color = (name: string, local: number) => `<ViewModelPropertyColor name="${name}" id="${id(local)}" componentProps="1"/>`;

const viewModelProperties = [
  `<ViewModelPropertyBoolean name="isPlaying" id="${id(P.isPlaying)}" componentProps="1"/>`,
  string('title', P.title),
  ...HALVES.flatMap((h) => [
    string(`${h.key}School`, h.p.school),
    string(`${h.key}Mascot`, h.p.mascot),
    string(`${h.key}Record`, h.p.record),
    image(`${h.key}Logo`, h.p.logo),
    color(`${h.key}PrimaryColor`, h.p.primary),
  ]),
  color('homeSecondaryColor', P.homeSecondaryColor),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${xml(value)}"/>`;
const imageValue = (local: number, asset: string) => `<ViewModelInstanceAssetImage viewModelPropertyId="${id(local)}" propertyValue="${asset}"/>`;
const colorValue = (local: number, value: string) => `<ViewModelInstanceColor viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.title, TITLE),
  ...HALVES.flatMap((h) => [
    stringValue(h.p.school, h.team.school),
    stringValue(h.p.mascot, h.team.mascot),
    stringValue(h.p.record, h.team.record),
    imageValue(h.p.logo, h.logoAsset),
    colorValue(h.p.primary, h.team.primary),
  ]),
  colorValue(P.homeSecondaryColor, HOME.secondary),
];

// --- document -------------------------------------------------------------------------

// The edge lights span the panels only: the strips and the tab arrive after the wipe.
const edgeLight = (name: string, lightId: string, x: number, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" x="${x}" y="${PANEL_Y + PANEL_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${PANEL_HEIGHT / 2}"><Rectangle width="2" height="${PANEL_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${PANEL_HEIGHT / 2}"><Rectangle width="44" height="${PANEL_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const MASK_MARGIN = 60;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_coming_up_next.ts; edit that file, not this one.
     Basketball Coming Up Next v2: a full-width two-team lower third, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, at the
     bottom of a transparent 1920 x 1080 canvas (origin ${BLOCK_X}, ${BLOCK_Y}), on the scorebug's
     baseline. A title tab sits centred above two halves, away at the left and home at the
     right; each half is a team panel over a dark-glass strip. Sibling draw order is front
     to back; within one shape the last paint declared is on top. -->
<Artboard name="Basketball Coming Up Next v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Coming Up Next v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Lower Third" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition at the centre; the two edges wipe outward to the ends. -->
${edgeLight('Left', LEFT_EDGE_LIGHT, LEFT_EDGE_END, 1)}
${edgeLight('Right', RIGHT_EDGE_LIGHT, RIGHT_EDGE_END, -1)}
${sweep}

<!-- ============================== Title ==================================== -->
${titleTab}

<!-- ============================== Panels =================================== -->
${band}

<!-- ============================== Strips =================================== -->
${strip}

<!-- Unpainted shapes: the clip sources. -->
<Shape name="Reveal Mask" id="${REVEAL_MASK}" x="${SEAM}" y="${-MASK_MARGIN}"><Rectangle width="${BLOCK_WIDTH + 2 * REVEAL_OVERHANG}" height="${BLOCK_HEIGHT + 2 * MASK_MARGIN}" originX="0.5" originY="0"/></Shape>
<Shape name="Strip Slide Mask" id="${STRIP_MASK}" x="${-MASK_MARGIN}" y="${STRIP_Y - GAP / 2}"><Rectangle width="${BLOCK_WIDTH + 2 * MASK_MARGIN}" height="${STRIP_HEIGHT + GAP / 2 + MASK_MARGIN}" originX="0" originY="0"/></Shape>
<Shape name="Block Silhouette" id="${SILHOUETTE}">${silhouette}</Shape>
</Node>

<!-- Intro: seam ignition at the centre, glass wiping outward, rising type, the logos
     settling in at the outer ends, the strips sliding out, the title fading up, and one
     sheen; ${INTRO_FRAMES / 60} s. Hold and Outro explicitly restore every animated property for
     repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Defaults off. -->
${stateMachine}
</Artboard>

<FontAsset name="Coming Up Next v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Coming Up Next v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Coming Up Next v2 Saint Joseph's" id="${AWAY_LOGO_ASSET}" file="${AWAY.logoFile}"/>
<ImageAsset name="Coming Up Next v2 Drexel" id="${HOME_LOGO_ASSET}" file="${HOME.logoFile}"/>

<ViewModel name="BasketballComingUpNextV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'coming_up_next.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
