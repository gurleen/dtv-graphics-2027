/**
 * Generates the Big 5 Champions lower third:
 *
 *   bun graphics/basketball-v2/generate_big5_champions.ts
 *
 * writes big5_champions.rml beside this file. Edit this file, not the output.
 *
 * A title strip across the block over three cells, one per past Classic champion, oldest
 * first: a team-tinted panel (year, school, logo) over a dark-glass strip with the title
 * game. The light ignites at the left end; the title strip and then each cell, a few frames
 * apart, wipe open left to right.
 */

import { join } from 'node:path';

const PREFIX = 56;
const ARTBOARD_Y = 33800;

type Champion = { year: string; name: string; result: string; primary: string; logo: 'saint-josephs' | 'villanova' };

// The scene's defaults: what the entry's demo binds from CHAMPIONS in graphics/big5.ts.
const CHAMPIONS: readonly Champion[] = [
  { year: '2023', name: "SAINT JOSEPH'S", result: '74-65 OVER TEMPLE', primary: 'FFC2071B', logo: 'saint-josephs' },
  { year: '2024', name: "SAINT JOSEPH'S", result: '82-68 OVER LA SALLE', primary: 'FFC2071B', logo: 'saint-josephs' },
  { year: '2025', name: 'VILLANOVA', result: '90-63 OVER PENN', primary: 'FF123D7C', logo: 'villanova' },
];
const LOGO_FILES = [
  { key: 'saint-josephs', name: "Saint Joseph's" },
  { key: 'villanova', name: 'Villanova' },
] as const;
const TITLE = 'BIG 5 CLASSIC CHAMPIONS';
const SUBTITLE = 'FOURTH YEAR OF THE FORMAT';

// Geometry. The block stands 24 clear of the scorebug (right edge x 526), ends on the right
// action-safe margin (x 1824) and shares the scorebug's foot (y 1022).
const BLOCK_X = 550;
const BLOCK_WIDTH = 1274;
const GAP = 4;
const TITLE_HEIGHT = 44;
const PANEL_HEIGHT = 84;
const STRIP_HEIGHT = 44;
const CELLS_Y = TITLE_HEIGHT + GAP;
const STRIP_Y = PANEL_HEIGHT + GAP;
const CELL_HEIGHT = PANEL_HEIGHT + GAP + STRIP_HEIGHT;
const BLOCK_HEIGHT = CELLS_Y + CELL_HEIGHT;
const BLOCK_Y = 1022 - BLOCK_HEIGHT;
const CELL_COUNT = 3;
const CELL_WIDTH = (BLOCK_WIDTH - (CELL_COUNT - 1) * GAP) / CELL_COUNT;
const CELL_STEP = CELL_WIDTH + GAP;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 6;
const CONTENT_DRIFT = 22;
const TEXT_INSET = 22;
const YEAR_WIDTH = 56;
const NAME_X = TEXT_INSET + YEAR_WIDTH + 12;
// Each logo source is 1024 square with its mark across about 70% of it.
const LOGO_SCALE = 0.095;
const LOGO_X = CELL_WIDTH - 16 - 36;
const NAME_WIDTH = LOGO_X - 42 - NAME_X;
const SHADE_WIDTH = 120;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 84;
const OUTRO_FRAMES = 24;
const TITLE_WIPE = { start: 6, end: 40 };
const CELL_WIPE_LENGTH = 30;
const cellStart = (index: number) => 6 + index * 6;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;
const COLOR = 37;
const TEXT = 268;
const IMAGE = 206;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const TITLE_STRIP = id(100);
const TITLE_CONTENT = id(101);
const TITLE_REVEAL = id(102);
const SUBTITLE_REVEAL = id(103);
const MARKER = id(106);
const TITLE_EDGE = id(500);
const TITLE_MASK = id(501);
const TITLE_EDGE_LIGHT = id(502);
const SWEEP = id(600);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const logoAsset = (key: Champion['logo']) => id(910 + LOGO_FILES.findIndex((file) => file.key === key));

const IS_PLAYING = 1002;
const SUBTITLE_PROPERTY = 1010;

const cell = (index: number) => {
  const base = 200 + index * 100;
  const property = 1020 + index * 10;
  const start = cellStart(index);
  return {
    index, start,
    name: `Cell ${index + 1}`,
    x: index * CELL_STEP,
    data: CHAMPIONS[index]!,
    node: id(base), panel: id(base + 1), panelContent: id(base + 2), logoGroup: id(base + 3), shade: id(base + 4),
    tint: id(base + 5), underlay: id(base + 6), strip: id(base + 10), stripContent: id(base + 11), stripMask: id(base + 12),
    yearReveal: id(base + 20), nameReveal: id(base + 21), resultReveal: id(base + 22),
    yearStyle: id(base + 30), nameStyle: id(base + 31), resultStyle: id(base + 32),
    edge: id(510 + index * 10), mask: id(511 + index * 10), light: id(512 + index * 10),
    property: { year: property, name: property + 1, result: property + 2, logo: property + 3, primary: property + 4 },
  };
};
const CELLS = Array.from({ length: CELL_COUNT }, (_, index) => cell(index));
type Cell = (typeof CELLS)[number];

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

const rectangle = (width: number, height: number, radii: Radii, position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const panelGlaze = (name: string, width: number, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="73FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

// Neutral glass: the glaze alone; the backing piece beneath is its dark body.
const stripGlass = (name: string, width: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, STRIP_HEIGHT, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${STRIP_HEIGHT}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="40000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${STRIP_HEIGHT}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

// The block's dark backing, one piece per moving part, the last child of the node it backs.
// Neighbours that wipe meet mid-gap; the gap above a strip, which slides, belongs to its panel.
const backing = (name: string, x: number, y: number, width: number, height: number, radii: Radii) =>
  `<Shape name="${name} Backing" x="${x}" y="${y}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

type TextSpec = {
  name: string; x: number; y: number; width: number; height: number; font: string; size: number; spacing: number;
  color: string; styleId: string; value: string; property?: number; reveal: string; align?: 'left' | 'right';
};
const text = (t: TextSpec) =>
  `<Text name="${t.name}" x="${t.x}" y="${t.y}" originValue="baseline" wrapValue="noWrap" width="${t.width}" height="${t.height}" sizingValue="fixed" overflowValue="fitFontSize"${t.align === 'right' ? ' alignValue="right"' : ''}><TextStylePaint id="${t.styleId}" fontAssetId="${t.font}" fontSize="${t.size}" letterSpacing="${t.spacing}"><Fill><SolidColor colorValue="${t.color}"/></Fill></TextStylePaint><TextValueRun name="${t.name} Value" styleId="${t.styleId}" text="${t.value}">${t.property === undefined ? '' : bound(t.property, TEXT)}</TextValueRun>${rise(t.name, t.reveal)}</Text>`;

const TITLE_RADII: Radii = [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const MARKER_RADII: Radii = [OUTER_RADIUS, 0, INNER_RADIUS, 0];
const PANEL_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const stripRadii = (index: number): Radii =>
  [INNER_RADIUS, INNER_RADIUS, index === 0 ? OUTER_RADIUS : INNER_RADIUS, index === CELL_COUNT - 1 ? OUTER_RADIUS : INNER_RADIUS];

// A cell's backing reaches half of each gap it shares with a neighbour, none past the block's edge.
const sideReach = (index: number) => ({ left: index === 0 ? 0 : GAP / 2, right: index === CELL_COUNT - 1 ? 0 : GAP / 2 });

// --- title strip ----------------------------------------------------------------------

const SUBTITLE_WIDTH = 520;
const titleStrip = `<Node name="Title Strip" id="${TITLE_STRIP}" x="0" y="0">
  <ClippingShape name="Title Reveal Clip" sourceId="${TITLE_MASK}"/>
  <Shape name="Title Marker" id="${MARKER}" x="0" y="0">
    ${rectangle(MARKER_WIDTH, TITLE_HEIGHT, MARKER_RADII)}
    <Fill><SolidColor colorValue="FFFFFFFF"/></Fill>
  </Shape>
  <Node name="Title Content" id="${TITLE_CONTENT}">
  ${text({ name: 'Title', x: MARKER_WIDTH + 20, y: 32, width: 600, height: 34, font: FONT_BOLD, size: 28, spacing: 1, color: 'FFFFFFFF', styleId: id(104), value: TITLE, reveal: TITLE_REVEAL })}
  ${text({ name: 'Subtitle', x: BLOCK_WIDTH - TEXT_INSET - SUBTITLE_WIDTH, y: 31, width: SUBTITLE_WIDTH, height: 28, font: FONT_REGULAR, size: 22, spacing: 2, color: 'A6FFFFFF', styleId: id(105), value: SUBTITLE, property: SUBTITLE_PROPERTY, reveal: SUBTITLE_REVEAL, align: 'right' })}
  </Node>
  ${stripGlass('Title', BLOCK_WIDTH, TITLE_RADII)}
  ${backing('Title', 0, 0, BLOCK_WIDTH, TITLE_HEIGHT + GAP / 2, [OUTER_RADIUS, OUTER_RADIUS, 0, 0])}
</Node>`;

// --- cells ----------------------------------------------------------------------------

/**
 * A champion: year, school and logo over the champion's tint, and the title game on the
 * strip below. The logo stands in the standings card's shade, so a logo on its own colour
 * still reads.
 */
const cellMarkup = (c: Cell) => {
  const reach = sideReach(c.index);
  return `<Node name="${c.name}" id="${c.node}" x="${c.x}" y="${CELLS_Y}">
<Node name="${c.name} Panel" id="${c.panel}" x="0" y="0">
  <ClippingShape name="${c.name} Panel Reveal Clip" sourceId="${c.mask}"/>
  <Node name="${c.name} Panel Content" id="${c.panelContent}">
  ${text({ name: `${c.name} Year`, x: TEXT_INSET, y: 58, width: YEAR_WIDTH, height: 36, font: FONT_REGULAR, size: 30, spacing: 2, color: 'B3FFFFFF', styleId: c.yearStyle, value: c.data.year, property: c.property.year, reveal: c.yearReveal })}
  ${text({ name: `${c.name} School`, x: NAME_X, y: 60, width: NAME_WIDTH, height: 56, font: FONT_BOLD, size: 50, spacing: 0.5, color: 'FFFFFFFF', styleId: c.nameStyle, value: c.data.name, property: c.property.name, reveal: c.nameReveal })}
  </Node>
  <Node name="${c.name} Logo Group" id="${c.logoGroup}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}">
    <Image name="${c.name} Logo" x="0" y="0" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${logoAsset(c.data.logo)}">${bound(c.property.logo, IMAGE)}</Image>
  </Node>
  ${panelGlaze(c.name, CELL_WIDTH, PANEL_HEIGHT, PANEL_RADII)}
  <Shape name="${c.name} Logo Shade" id="${c.shade}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}" scaleY="${PANEL_HEIGHT / SHADE_WIDTH}" opacity="${TINT_OPACITY}">
    <Ellipse width="${SHADE_WIDTH}" height="${SHADE_WIDTH}"/>
    <Fill><RadialGradient startX="0" startY="0" endX="${SHADE_WIDTH / 2}" endY="0"><GradientStop colorValue="73000000" position="0"/><GradientStop colorValue="2E000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
    <ClippingShape name="${c.name} Logo Shade Clip" sourceId="${c.underlay}"/>
  </Shape>
  <Shape name="${c.name} Tint" id="${c.tint}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(CELL_WIDTH, PANEL_HEIGHT, PANEL_RADII)}
    <Fill><SolidColor colorValue="${c.data.primary}">${bound(c.property.primary, COLOR)}</SolidColor></Fill>
  </Shape>
  <Shape name="${c.name} Underlay" id="${c.underlay}" x="0" y="0">
    ${rectangle(CELL_WIDTH, PANEL_HEIGHT, PANEL_RADII)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
  ${backing(c.name, -reach.left, -GAP / 2, CELL_WIDTH + reach.left + reach.right, PANEL_HEIGHT + GAP + GAP / 2, [0, 0, 0, 0])}
</Node>
<Node name="${c.name} Strip" id="${c.strip}" x="0" y="${STRIP_Y}">
  <ClippingShape name="${c.name} Strip Reveal Clip" sourceId="${c.stripMask}"/>
  <ClippingShape name="${c.name} Strip Wipe Clip" sourceId="${c.mask}"/>
  <Node name="${c.name} Strip Sliding Content" id="${c.stripContent}">
  ${text({ name: `${c.name} Result`, x: TEXT_INSET, y: 32, width: CELL_WIDTH - 2 * TEXT_INSET, height: 34, font: FONT_BOLD, size: 28, spacing: 1, color: 'FFFFFFFF', styleId: c.resultStyle, value: c.data.result, property: c.property.result, reveal: c.resultReveal })}
  ${stripGlass(`${c.name} Strip`, CELL_WIDTH, stripRadii(c.index))}
  ${backing(`${c.name} Strip`, -reach.left, 0, CELL_WIDTH + reach.left + reach.right, STRIP_HEIGHT, [0, 0, c.index === 0 ? OUTER_RADIUS : 0, c.index === CELL_COUNT - 1 ? OUTER_RADIUS : 0])}
  </Node>
</Node>
<Shape name="${c.name} Strip Reveal Mask" id="${c.stripMask}" x="${-GAP}" y="${STRIP_Y}"><Rectangle width="${CELL_WIDTH + 2 * GAP}" height="${STRIP_HEIGHT}" originX="0" originY="0"/></Shape>
</Node>`;
};

// --- leading edges --------------------------------------------------------------------

// A part's leading edge starts at its left end and wipes right; the mask trails it, so
// everything left of the edge shows. The light rides the edge with its glow behind it.
const leadingEdge = (name: string, edgeId: string, maskId: string, lightId: string, x: number, y: number, height: number) => `<Node name="${name} Leading Edge" id="${edgeId}" x="${x}" y="0">
  <Shape name="${name} Reveal Mask" id="${maskId}" y="${y - 8}"><Rectangle width="${BLOCK_WIDTH + 16}" height="${height + 16}" originX="1" originY="0"/></Shape>
  <Node name="${name} Edge Light" id="${lightId}" y="${y + height / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="${-height / 2}"><Rectangle width="2" height="${height}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="${-height / 2}"><Rectangle width="44" height="${height}" originX="1" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="-44" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>
</Node>`;

const EDGES = [
  { edge: TITLE_EDGE, light: TITLE_EDGE_LIGHT, from: 0, to: BLOCK_WIDTH + 8, start: TITLE_WIPE.start, end: TITLE_WIPE.end },
  ...CELLS.map((c) => ({ edge: c.edge, light: c.light, from: c.x, to: c.x + CELL_WIDTH + 8, start: c.start, end: c.start + CELL_WIPE_LENGTH })),
];

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

const hold = (objectId: string, propertyKey: number, value: number): Track => ({ objectId, propertyKey, keys: [{ frame: 0, value }] });
/** A move from `from` to `to` over frames start..end, holding before and after. */
const move = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number, ease: string): Track => ({
  objectId, propertyKey,
  keys: start > 0
    ? [{ frame: 0, value: from }, { frame: start, value: from, ease }, { frame: end, value: to }]
    : [{ frame: 0, value: from, ease }, { frame: end, value: to }],
});
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, 0, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0.4, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];

const GROUPS = [TITLE_STRIP, ...CELLS.flatMap((c) => [c.panel, c.strip])];
const RANGES = [TITLE_REVEAL, SUBTITLE_REVEAL, ...CELLS.flatMap((c) => [c.yearReveal, c.nameReveal, c.resultReveal])];

/** The light flares as its edge sets off and fades once the edge is under way. */
const edgeFlare = (start: number): Key[] => {
  const ignite = Math.max(start - 6, 0);
  return [
    ...(ignite > 0 ? [{ frame: 0, value: 0 }] : []),
    { frame: ignite, value: 0, linear: true }, { frame: ignite + 2, value: 1, linear: true },
    { frame: start + 12, value: 1, ease: EASE_OUT }, { frame: start + 34, value: 0, linear: true },
  ];
};
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];

const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  ...EDGES.flatMap(({ edge, light, from, to, start, end }): Track[] => [
    move(edge, X, from, to, start, end, EASE_WIPE),
    move(light, SCALE_Y, 0, 1, Math.max(start - 6, 0), start + 6, EASE_OUT),
    { objectId: light, propertyKey: OPACITY, keys: edgeFlare(start) },
  ]),
  move(MARKER, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  move(TITLE_CONTENT, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  ...reveal(TITLE_REVEAL, 18, 42),
  ...reveal(SUBTITLE_REVEAL, 28, 50),
  ...CELLS.flatMap((c): Track[] => [
    move(c.panelContent, X, -CONTENT_DRIFT, 0, c.start + 2, c.start + 38, EASE_OUT),
    ...scale(c.logoGroup, 1.12, 1, c.start + 2, c.start + 42, EASE_OUT),
    move(c.logoGroup, OPACITY, 0, 1, c.start + 2, c.start + 24, EASE_OUT),
    move(c.shade, OPACITY, 0, TINT_OPACITY, c.start + 2, c.start + 30, EASE_OUT),
    ...reveal(c.yearReveal, c.start + 10, c.start + 30),
    ...reveal(c.nameReveal, c.start + 14, c.start + 38),
    move(c.stripContent, Y, -STRIP_HEIGHT, 0, c.start + 16, c.start + 40, EASE_OUT),
    ...reveal(c.resultReveal, c.start + 22, c.start + 44),
  ]),
  move(SWEEP, X, SWEEP_START, SWEEP_END, 44, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: 44, value: 0, linear: true }, { frame: 50, value: 0.65, linear: true },
      { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
    ],
  },
];

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  ...EDGES.flatMap(({ edge, light, to }) => [hold(edge, X, to), hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKER, SCALE_Y, 1),
  hold(TITLE_CONTENT, X, 0),
  ...CELLS.flatMap((c) => [
    hold(c.panelContent, X, 0),
    hold(c.logoGroup, SCALE_X, 1), hold(c.logoGroup, SCALE_Y, 1), hold(c.logoGroup, OPACITY, 1),
    hold(c.shade, OPACITY, TINT_OPACITY),
    hold(c.stripContent, Y, 0),
  ]),
  ...RANGES.flatMap(revealed),
  hold(SWEEP, X, SWEEP_END),
  hold(SWEEP, OPACITY, 0),
];

const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  ...EDGES.flatMap(({ edge, light, from, to }, index): Track[] => [
    closing(edge, X, to, from, index === 0 ? 4 : 2, OUTRO_FRAMES),
    hold(light, SCALE_Y, 1),
    { objectId: light, propertyKey: OPACITY, keys: edgeClosing },
  ]),
  closing(MARKER, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(TITLE_CONTENT, X, 0, -18, 0, OUTRO_FRAMES),
  ...CELLS.flatMap((c) => [
    closing(c.panelContent, X, 0, -18, 0, OUTRO_FRAMES),
    closing(c.logoGroup, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
    closing(c.logoGroup, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
    closing(c.logoGroup, OPACITY, 1, 0, 0, 20),
    closing(c.shade, OPACITY, TINT_OPACITY, 0, 0, 20),
    closing(c.stripContent, Y, 0, -STRIP_HEIGHT, 0, 18),
  ]),
  ...RANGES.flatMap(revealed),
  hold(SWEEP, X, SWEEP_END),
  hold(SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...EDGES.map(({ light }) => hold(light, OPACITY, 0)),
  hold(SWEEP, OPACITY, 0),
];

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(IS_PLAYING, 634)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const stateMachine = `<StateMachine name="Big 5 Champions" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(43)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(43)}" animationId="${id(33)}"><StateTransition stateToId="${id(41)}" duration="0">${onAir('equal')}</StateTransition></AnimationState>
  <AnimationState x="180" y="0" id="${id(41)}" animationId="${id(31)}" reset="true">
    <StateTransition stateToId="${id(40)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(42)}" duration="0">${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="0" id="${id(40)}" animationId="${id(30)}"><StateTransition stateToId="${id(42)}" duration="0">${onAir('notEqual')}</StateTransition></AnimationState>
  <AnimationState x="660" y="0" id="${id(42)}" animationId="${id(32)}" reset="true"><StateTransition stateToId="${id(43)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/></AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const viewModelProperties = [
  `<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>`,
  `<ViewModelPropertyString name="subtitle" id="${id(SUBTITLE_PROPERTY)}" componentProps="1"/>`,
  ...CELLS.flatMap((c) => {
    const prefix = `champion${c.index + 1}`;
    return [
      `<ViewModelPropertyString name="${prefix}Year" id="${id(c.property.year)}" componentProps="1"/>`,
      `<ViewModelPropertyString name="${prefix}Name" id="${id(c.property.name)}" componentProps="1"/>`,
      `<ViewModelPropertyString name="${prefix}Result" id="${id(c.property.result)}" componentProps="1"/>`,
      `<ViewModelPropertyAssetImage name="${prefix}Logo" id="${id(c.property.logo)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${prefix}PrimaryColor" id="${id(c.property.primary)}" componentProps="1"/>`,
    ];
  }),
];

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>`,
  `<ViewModelInstanceString viewModelPropertyId="${id(SUBTITLE_PROPERTY)}" propertyValue="${SUBTITLE}"/>`,
  ...CELLS.flatMap((c) => [
    `<ViewModelInstanceString viewModelPropertyId="${id(c.property.year)}" propertyValue="${c.data.year}"/>`,
    `<ViewModelInstanceString viewModelPropertyId="${id(c.property.name)}" propertyValue="${c.data.name}"/>`,
    `<ViewModelInstanceString viewModelPropertyId="${id(c.property.result)}" propertyValue="${c.data.result}"/>`,
    `<ViewModelInstanceAssetImage viewModelPropertyId="${id(c.property.logo)}" propertyValue="${logoAsset(c.data.logo)}"/>`,
    `<ViewModelInstanceColor viewModelPropertyId="${id(c.property.primary)}" propertyValue="${c.data.primary}"/>`,
  ]),
];

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_big5_champions.ts; edit that file, not this one.
     Basketball Big 5 Champions lower third v2: a glass block, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, beside the
     scorebug at the bottom of a transparent 1920 x 1080 canvas (origin ${BLOCK_X}, ${BLOCK_Y}). A title
     strip over three champion cells, oldest first. Sibling draw order is front to back. -->
<Artboard name="Basketball Big 5 Champions v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Big 5 Champions v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Lower Third" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

${leadingEdge('Title', TITLE_EDGE, TITLE_MASK, TITLE_EDGE_LIGHT, 0, 0, TITLE_HEIGHT)}
${CELLS.map((c) => leadingEdge(c.name, c.edge, c.mask, c.light, c.x, CELLS_Y, CELL_HEIGHT)).join('\n')}
<Shape name="Glass Specular Sweep" id="${SWEEP}" x="${SWEEP_END}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="340"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Glass Specular Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>

${titleStrip}

${CELLS.map(cellMarkup).join('\n\n')}

<Shape name="Block Silhouette" id="${SILHOUETTE}">${rectangle(BLOCK_WIDTH, BLOCK_HEIGHT, [OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS], ' x="0" y="0"')}</Shape>
</Node>

<!-- Intro: the light ignites at the left end, the title strip and then each cell wipe open
     left to right, the strips slide down, type rises and one sheen finishes; ${INTRO_FRAMES / 60} s.
     Hold and Outro explicitly restore every animated property for repeat takes. -->
${animation('Intro', 31, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', 30, 1, 'loop', settled)}

${animation('Outro', 32, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', 33, 1, 'oneShot', hidden)}

${stateMachine}
</Artboard>

<FontAsset name="Big 5 Champions v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Big 5 Champions v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
${LOGO_FILES.map((file) => `<ImageAsset name="Big 5 Champions v2 ${file.name}" id="${logoAsset(file.key)}" file="assets/images/big5/${file.key}.png"/>`).join('\n')}

<ViewModel name="BasketballBig5ChampionsV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'big5_champions.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
