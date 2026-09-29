/**
 * Generates the Player to Watch lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_player_to_watch_lower_third.ts
 *
 * writes player_to_watch_lower_third.rml beside this file. Edit this file, not the output.
 *
 * A pre-game feature on one player, presented by a sponsor. The block is wider and
 * taller than the player lower third and stands on the scorebug's baseline, so it
 * overlaps the scorebug: take the scorebug off air before playing it.
 *
 *   Headshot   a full-height panel at the left; the cutout rises above the block.
 *   Header     PLAYER TO WATCH, an optional context tag, and PRESENTED BY over the chip.
 *   Name       jersey number, first over last name, position and class year, then the
 *              sponsor chip at the right, the full height of the row.
 *   Body       one of two modes, chosen by `bodyMode`:
 *                STATS  up to four value-over-label tiles; a blank value hides its tile
 *                       and the rest re-space evenly across the row.
 *                TEXT   one or two lines of copy, shrunk to fit when longer.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro, gated on
 * `isPlaying`). The tile layout, the mode crossfade and the context separator are
 * computed by player_to_watch_controller.luau, which writes the `_`-prefixed view
 * model properties bound below.
 */

import { join } from 'node:path';

const PREFIX = 38;
const ARTBOARD_Y = 12200;

// Test data: a Drexel guard (see the package README).
const PLAYER = {
  firstName: 'JORDAN', lastName: 'MITCHELL', number: '12', position: 'GUARD', classYear: 'JUNIOR',
  context: '2026-27 SEASON',
  text: 'LEADS THE CAA IN SCORING AND HAS REACHED 20 POINTS IN FIVE STRAIGHT GAMES, INCLUDING A CAREER-HIGH 31 AT HOFSTRA',
};
const STATS = [
  { value: '18.4', label: 'PPG' },
  { value: '7.2', label: 'RPG' },
  { value: '3.1', label: 'APG' },
  { value: '48.2%', label: 'FG%' },
];
const TEAM = { logoFile: 'assets/images/scorebug/drexel.png', primary: 'FF07294D', secondary: 'FFFFC600' };
const CELL_COUNT = STATS.length;

// Geometry. The block stands on the scorebug's baseline (y 1022) from x 260, and its
// headshot rises HEADSHOT_BREAKOUT above the block's top edge.
const BLOCK_X = 260;
const BLOCK_Y = 802;
const GAP = 4;
const HEADER_HEIGHT = 44;
const NAME_HEIGHT = 84;
const BODY_HEIGHT = 84;
const NAME_Y = HEADER_HEIGHT + GAP;
const BODY_Y = NAME_Y + NAME_HEIGHT + GAP;
const BLOCK_HEIGHT = BODY_Y + BODY_HEIGHT;
const HEADSHOT_WIDTH = 220;
const HEADSHOT_BREAKOUT = 84;
const COLUMN_X = HEADSHOT_WIDTH + GAP;
const COLUMN_WIDTH = 1176;
const BLOCK_WIDTH = COLUMN_X + COLUMN_WIDTH;
const SEAM = HEADSHOT_WIDTH + GAP / 2;
const CHIP_WIDTH = 200;
const NAME_WIDTH = COLUMN_WIDTH - GAP - CHIP_WIDTH;
const CHIP_X = NAME_WIDTH + GAP;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const HEADSHOT_RISE = 16;
const TEXT_INSET = 24;
const LOGO_SCALE = 0.3;
// The trimmed Belfor export is 1600 x 535; 50 units tall on the chip.
const SPONSOR_SCALE = 50 / 535;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;
const TILE_WIDTH = (COLUMN_WIDTH - (CELL_COUNT - 1) * GAP) / CELL_COUNT;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 84;
const OUTRO_FRAMES = 24;
const HEADSHOT_WIPE_END = 34;
const COLUMN_WIPE_END = 48;
const WIPE_START = 6;
const TILE_STAGGER = 4;

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
const PATH_WIDTH = 20;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const TEXT_WIDTH = 285;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const SHADOW = id(20);
const MARKER = id(100);
const HEADSHOT_PANEL = id(101);
const HEADSHOT_RISE_NODE = id(102);
const HEADSHOT_PLACEMENT = id(103);
const HEADSHOT_FRAME = id(104);
const HEADSHOT_FRAME_STYLE = id(105);
const HEADSHOT_CLIP = id(106);
const HEADER = id(150);
const HEADER_CONTENT = id(151);
const TITLE_REVEAL = id(152);
const SPONSOR_LABEL_REVEAL = id(153);
const SPONSOR_LOGO = id(171);
const NAME_PANEL = id(200);
const NAME_CONTENT = id(201);
const TEAM_LOGO = id(202);
const NAME_TINT = id(203);
const BODY = id(300);
const STATS_NODE = id(301);
const TEXT_NODE = id(302);
const TEXT_SLIDE = id(303);
const BODY_TEXT_REVEAL = id(304);
const HEADSHOT_EDGE = id(500);
const HEADSHOT_MASK = id(501);
const HEADSHOT_EDGE_LIGHT = id(502);
const COLUMN_EDGE = id(505);
const COLUMN_MASK = id(506);
const COLUMN_EDGE_LIGHT = id(507);
const INTRO_SWEEP = id(600);
const SILHOUETTE = id(610);
const HEADER_MASK = id(620);
const BODY_MASK = id(621);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const HEADSHOT_ASSET = id(910);
const LOGO_ASSET = id(911);
const SPONSOR_ASSET = id(913);
const CONTROLLER_ASSET = id(950);

const NAME_REVEAL = {
  number: id(240), firstName: id(241), lastName: id(242), position: id(243), classYear: id(244),
};

// Per-tile elements, 3000 + 100 per tile.
const tile = (index: number) => {
  const base = 3000 + index * 100;
  return {
    index,
    node: id(base), slide: id(base + 1), valueStyle: id(base + 2), labelStyle: id(base + 3),
    valueReveal: id(base + 4), labelReveal: id(base + 5),
  };
};
const TILES = Array.from({ length: CELL_COUNT }, (_, index) => tile(index));

// View model properties. Underscored ones are written by the controller script (and,
// for _headshotOpacity, by the OGraf component); operators never set them.
const P = {
  isPlaying: 1002, bodyMode: 1003,
  firstName: 1010, lastName: 1011, jerseyNumber: 1012, position: 1013, classYear: 1014,
  contextLabel: 1015, bodyText: 1016,
  headshot: 1020, teamLogo: 1021, teamPrimaryColor: 1022, teamSecondaryColor: 1023, sponsorLogo: 1024,
  statValue: (index: number) => 1030 + index * 2,
  statLabel: (index: number) => 1031 + index * 2,
  statX: (index: number) => 1050 + index * 4,
  statWidth: (index: number) => 1051 + index * 4,
  statOpacity: (index: number) => 1052 + index * 4,
  headshotOpacity: 1070, contextSeparator: 1071, statsOpacity: 1072, textOpacity: 1073,
} as const;

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

const rectangle = (width: number, height: number, radii: Radii, position = '', children = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"${children ? `>${children}</Rectangle>` : '/>'}`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF', widthBind = '') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii, '', widthBind)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

/** Dark glass: a glaze over a near-black body, as on every v2 strip. */
const darkGlass = (name: string, width: number, height: number, radii: Radii, widthBind = '') => `${glaze(name, width, height, radii, '59FFFFFF', widthBind)}
  <Shape name="${name} Body" x="0" y="0">
    ${rectangle(width, height, radii, '', widthBind)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

const teamTint = (name: string, tintId: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" id="${tintId}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="${TEAM.primary}">${bound(P.teamPrimaryColor, COLOR)}</SolidColor></Fill>
  </Shape>`;

const underlay = (name: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

/** One-run text with a fixed box; `extra` carries alignment, overflow and binds. */
const text = (o: {
  name: string; x: number; y: number; width: number; height: number; font: string; size: number;
  spacing: number; color: string; styleId: string; value: string; property: number; reveal: string; extra?: string; widthBind?: string;
}) => `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.height}" sizingValue="fixed" overflowValue="fitFontSize"${o.extra ?? ''}>${o.widthBind ?? ''}<TextStylePaint id="${o.styleId}" fontAssetId="${o.font}" fontSize="${o.size}" letterSpacing="${o.spacing}"><Fill><SolidColor colorValue="${o.color}"/></Fill></TextStylePaint><TextValueRun name="${o.name} Value" styleId="${o.styleId}" text="${o.value}">${bound(o.property, TEXT)}</TextValueRun>${rise(o.name, o.reveal)}</Text>`;

// Corner radii: the block's outer corners take 12, every seam 3.
const HEADSHOT_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS];
const MARKER_RADII: Radii = [OUTER_RADIUS, 0, OUTER_RADIUS, 0];
const HEADER_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const CHIP_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const NAME_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const BODY_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS];

// --- headshot -------------------------------------------------------------------------

const marker = `<Shape name="Marker" id="${MARKER}" x="0" y="0" scaleY="0">
  <ClippingShape name="Marker Reveal Clip" sourceId="${HEADSHOT_MASK}"/>
  ${rectangle(MARKER_WIDTH, BLOCK_HEIGHT, MARKER_RADII)}
  <Fill><SolidColor colorValue="${TEAM.secondary}">${bound(P.teamSecondaryColor, COLOR)}</SolidColor></Fill>
</Shape>`;

// The frame spans the panel right of the marker and HEADSHOT_BREAKOUT above it; the clip
// crops only its sides and bottom, so a cutout's head stands above the block. The OGraf
// component lays motion media over exactly this rectangle (see its graphic.ts).
const HEADSHOT_FRAME_X = MARKER_WIDTH;
const HEADSHOT_FRAME_WIDTH = HEADSHOT_WIDTH - MARKER_WIDTH;
const HEADSHOT_FRAME_HEIGHT = BLOCK_HEIGHT + HEADSHOT_BREAKOUT;

const headshotPanel = `<Node name="Headshot Panel" id="${HEADSHOT_PANEL}" x="0" y="0">
  <ClippingShape name="Headshot Reveal Clip" sourceId="${HEADSHOT_MASK}"/>
  <Node name="Headshot Rise" id="${HEADSHOT_RISE_NODE}" x="0" y="0">
  <!-- Hidden (opacity 0) by the OGraf component while motion media plays over it. -->
  <Node name="Headshot Placement" id="${HEADSHOT_PLACEMENT}" x="${HEADSHOT_FRAME_X}" y="${-HEADSHOT_BREAKOUT}">${bound(P.headshotOpacity, OPACITY)}
    <!-- Layout components join the artboard's flow through plain nodes, so the frame is
         pinned absolute at this node's origin. -->
    <LayoutComponent name="Headshot Frame" id="${HEADSHOT_FRAME}" x="0" y="0" width="${HEADSHOT_FRAME_WIDTH}" height="${HEADSHOT_FRAME_HEIGHT}" styleId="${HEADSHOT_FRAME_STYLE}">
      <LayoutComponentStyle name="Headshot Frame Style" id="${HEADSHOT_FRAME_STYLE}" positionTypeValue="absolute" positionLeft="0" positionLeftUnitsValue="points" positionTop="0" positionTopUnitsValue="points"/>
      <ClippingShape name="Headshot Clip" sourceId="${HEADSHOT_CLIP}"/>
      <Image name="Headshot" fit="cover" alignmentX="0" alignmentY="-1" assetId="${HEADSHOT_ASSET}">${bound(P.headshot, IMAGE)}</Image>
    </LayoutComponent>
  </Node>
  </Node>
  ${glaze('Headshot', HEADSHOT_WIDTH, BLOCK_HEIGHT, HEADSHOT_RADII)}
  ${teamTint('Headshot Tint', id(107), HEADSHOT_WIDTH, BLOCK_HEIGHT, HEADSHOT_RADII)}
  ${underlay('Headshot Underlay', HEADSHOT_WIDTH, BLOCK_HEIGHT, HEADSHOT_RADII)}
  <Shape name="Headshot Clip Shape" id="${HEADSHOT_CLIP}" x="${HEADSHOT_FRAME_X}" y="${-HEADSHOT_BREAKOUT}">${rectangle(HEADSHOT_FRAME_WIDTH, HEADSHOT_FRAME_HEIGHT, [0, 0, 0, INNER_RADIUS])}</Shape>
</Node>`;

// --- header ---------------------------------------------------------------------------

const header = `<Node name="Header" id="${HEADER}" x="${COLUMN_X}" y="0">
  <ClippingShape name="Header Slide Clip" sourceId="${HEADER_MASK}"/>
  <ClippingShape name="Header Wipe Clip" sourceId="${COLUMN_MASK}"/>
  <Node name="Header Sliding Content" id="${HEADER_CONTENT}" x="0" y="0">
  <!-- One text: the title, then a separator and the context tag, both empty when the tag is blank. -->
  <Text name="Title" x="20" y="32" originValue="baseline" wrapValue="noWrap" width="${CHIP_X - 20 - 24}" height="34" sizingValue="fixed" overflowValue="fitFontSize">
    <TextStylePaint id="${id(160)}" fontAssetId="${FONT_BOLD}" fontSize="28" letterSpacing="1"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
    <TextStylePaint id="${id(161)}" fontAssetId="${FONT_REGULAR}" fontSize="24" letterSpacing="0"><Fill><SolidColor colorValue="${TEAM.secondary}">${bound(P.teamSecondaryColor, COLOR)}</SolidColor></Fill></TextStylePaint>
    <TextStylePaint id="${id(162)}" fontAssetId="${FONT_REGULAR}" fontSize="24" letterSpacing="2"><Fill><SolidColor colorValue="BFFFFFFF"/></Fill></TextStylePaint>
    <TextValueRun name="Title Value" styleId="${id(160)}" text="PLAYER TO WATCH"></TextValueRun>
    <TextValueRun name="Context Separator" styleId="${id(161)}" text="   /   ">${bound(P.contextSeparator, TEXT)}</TextValueRun>
    <TextValueRun name="Context Value" styleId="${id(162)}" text="${PLAYER.context}">${bound(P.contextLabel, TEXT)}</TextValueRun>
  ${rise('Title', TITLE_REVEAL)}</Text>
  <!-- Centred over the sponsor chip in the name row below. -->
  <Text name="Sponsor Label" x="${CHIP_X}" y="29" originValue="baseline" wrapValue="noWrap" width="${CHIP_WIDTH}" height="24" sizingValue="fixed" alignValue="center"><TextStylePaint id="${id(163)}" fontAssetId="${FONT_REGULAR}" fontSize="18" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint><TextValueRun name="Sponsor Label Value" styleId="${id(163)}" text="PRESENTED BY"></TextValueRun>${rise('Sponsor Label', SPONSOR_LABEL_REVEAL)}</Text>
  ${darkGlass('Header', COLUMN_WIDTH, HEADER_HEIGHT, HEADER_RADII)}
  </Node>
</Node>`;

// --- name panel -----------------------------------------------------------------------

const POSITION_WIDTH = 260;
const POSITION_X = NAME_WIDTH - TEXT_INSET - POSITION_WIDTH;
const NAME_TEXT_WIDTH = POSITION_X - 108 - 24;

const namePanel = `<Node name="Name Panel" id="${NAME_PANEL}" x="${COLUMN_X}" y="${NAME_Y}">
  <ClippingShape name="Name Reveal Clip" sourceId="${COLUMN_MASK}"/>
  <Node name="Name Content" id="${NAME_CONTENT}" x="0" y="0">
  <Text name="Jersey Number" x="20" y="70" originValue="baseline" wrapValue="noWrap" sizingValue="autoWidth">
    <TextStylePaint id="${id(220)}" fontAssetId="${FONT_REGULAR}" fontSize="32" letterSpacing="0"><Fill><SolidColor colorValue="99FFFFFF"/></Fill></TextStylePaint>
    <TextStylePaint id="${id(221)}" fontAssetId="${FONT_BOLD}" fontSize="68" letterSpacing="0"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
    <TextValueRun name="Jersey Number Sign" styleId="${id(220)}" text="#"></TextValueRun>
    <TextValueRun name="Jersey Number Value" styleId="${id(221)}" text="${PLAYER.number}">${bound(P.jerseyNumber, TEXT)}</TextValueRun>
  ${rise('Jersey Number', NAME_REVEAL.number)}</Text>
  ${text({ name: 'First Name', x: 108, y: 30, width: NAME_TEXT_WIDTH, height: 30, font: FONT_REGULAR, size: 24, spacing: 2, color: 'D9FFFFFF', styleId: id(222), value: PLAYER.firstName, property: P.firstName, reveal: NAME_REVEAL.firstName })}
  ${text({ name: 'Last Name', x: 108, y: 70, width: NAME_TEXT_WIDTH, height: 60, font: FONT_BOLD, size: 50, spacing: 0.5, color: 'FFFFFFFF', styleId: id(223), value: PLAYER.lastName, property: P.lastName, reveal: NAME_REVEAL.lastName })}
  ${text({ name: 'Position', x: POSITION_X, y: 40, width: POSITION_WIDTH, height: 36, font: FONT_BOLD, size: 30, spacing: 1, color: 'FFFFFFFF', styleId: id(224), value: PLAYER.position, property: P.position, reveal: NAME_REVEAL.position, extra: ' alignValue="right"' })}
  ${text({ name: 'Class', x: POSITION_X, y: 68, width: POSITION_WIDTH, height: 26, font: FONT_REGULAR, size: 22, spacing: 2, color: 'B3FFFFFF', styleId: id(225), value: PLAYER.classYear, property: P.classYear, reveal: NAME_REVEAL.classYear, extra: ' alignValue="right"' })}
  </Node>
  ${glaze('Name', NAME_WIDTH, NAME_HEIGHT, NAME_RADII)}
  <!-- The logo sits behind the position and class as a large faded mark, cropped by the panel. -->
  <Image name="Team Logo" id="${TEAM_LOGO}" x="${NAME_WIDTH - 116}" y="${NAME_HEIGHT / 2}" opacity="0.18" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${LOGO_ASSET}">${bound(P.teamLogo, IMAGE)}<ClippingShape name="Team Logo Clip" sourceId="${NAME_TINT}"/></Image>
  ${teamTint('Name Tint', NAME_TINT, NAME_WIDTH, NAME_HEIGHT, NAME_RADII)}
  ${underlay('Name Underlay', NAME_WIDTH, NAME_HEIGHT, NAME_RADII)}
  <!-- The sponsor in full colour on a white chip, the full height of the row. -->
  <Node name="Sponsor Chip" id="${id(170)}" x="${CHIP_X}" y="0">
    <Image name="Sponsor Logo" id="${SPONSOR_LOGO}" x="${CHIP_WIDTH / 2}" y="${NAME_HEIGHT / 2}" scaleX="${SPONSOR_SCALE}" scaleY="${SPONSOR_SCALE}" assetId="${SPONSOR_ASSET}">${bound(P.sponsorLogo, IMAGE)}</Image>
    <Shape name="Sponsor Chip Body" x="0" y="0">
      ${rectangle(CHIP_WIDTH, NAME_HEIGHT, CHIP_RADII)}
      <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${NAME_HEIGHT}"><GradientStop colorValue="FFFFFFFF" position="0"/><GradientStop colorValue="FFE9ECF0" position="1"/></LinearGradient></Fill>
    </Shape>
  </Node>
</Node>`;

// --- body -----------------------------------------------------------------------------

// Each tile's x, width and opacity come from the controller, so the visible tiles always
// share the row evenly. The body mask carries the block's rounded corner, whichever tile
// ends the row.
const statTile = (t: (typeof TILES)[number]) => {
  const label = `Stat ${t.index + 1}`;
  const widthBind = bound(P.statWidth(t.index), PATH_WIDTH);
  const textWidth = bound(P.statWidth(t.index), TEXT_WIDTH);
  const centred = ' alignValue="center"';
  return `<Node name="${label} Tile" id="${t.node}" x="${t.index * (TILE_WIDTH + GAP)}" y="0">${bound(P.statX(t.index), X)}${bound(P.statOpacity(t.index), OPACITY)}
  <Node name="${label} Slide" id="${t.slide}" x="0" y="0">
  ${text({ name: `${label} Value`, x: 0, y: 51, width: TILE_WIDTH, height: 56, font: FONT_BOLD, size: 50, spacing: 0.5, color: 'FFFFFFFF', styleId: t.valueStyle, value: STATS[t.index]!.value, property: P.statValue(t.index), reveal: t.valueReveal, extra: centred, widthBind: textWidth })}
  ${text({ name: `${label} Label`, x: 0, y: 74, width: TILE_WIDTH, height: 22, font: FONT_REGULAR, size: 20, spacing: 2, color: 'B3FFFFFF', styleId: t.labelStyle, value: STATS[t.index]!.label, property: P.statLabel(t.index), reveal: t.labelReveal, extra: centred, widthBind: textWidth })}
  ${darkGlass(label, TILE_WIDTH, BODY_HEIGHT, NAME_RADII, widthBind)}
  </Node>
</Node>`;
};

const BODY_TEXT_HEIGHT = 72;
const body = `<Node name="Body" id="${BODY}" x="${COLUMN_X}" y="${BODY_Y}">
  <ClippingShape name="Body Slide Clip" sourceId="${BODY_MASK}"/>
  <ClippingShape name="Body Wipe Clip" sourceId="${COLUMN_MASK}"/>
  <Node name="Stats" id="${STATS_NODE}" x="0" y="0">${bound(P.statsOpacity, OPACITY)}
${TILES.map(statTile).join('\n')}
  </Node>
  <Node name="Copy" id="${TEXT_NODE}" x="0" y="0" opacity="0">${bound(P.textOpacity, OPACITY)}
  <Node name="Copy Slide" id="${TEXT_SLIDE}" x="0" y="0">
  <!-- Up to two lines; longer copy shrinks to fit the box, centred on the panel. -->
  <Text name="Body Copy" x="${TEXT_INSET}" y="${(BODY_HEIGHT - BODY_TEXT_HEIGHT) / 2}" originValue="top" wrapValue="wrap" width="${COLUMN_WIDTH - 2 * TEXT_INSET}" height="${BODY_TEXT_HEIGHT}" sizingValue="fixed" overflowValue="fitFontSize" verticalAlignValue="middle"><TextStylePaint id="${id(305)}" fontAssetId="${FONT_BOLD}" fontSize="32" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="Body Copy Value" styleId="${id(305)}" text="${PLAYER.text}">${bound(P.bodyText, TEXT)}</TextValueRun>${rise('Body Copy', BODY_TEXT_REVEAL)}</Text>
  ${darkGlass('Copy', COLUMN_WIDTH, BODY_HEIGHT, BODY_RADII)}
  </Node>
  </Node>
</Node>`;

const silhouette = [
  rectangle(HEADSHOT_WIDTH, BLOCK_HEIGHT, HEADSHOT_RADII, ' x="0" y="0"'),
  rectangle(COLUMN_WIDTH, HEADER_HEIGHT, HEADER_RADII, ` x="${COLUMN_X}" y="0"`),
  rectangle(NAME_WIDTH, NAME_HEIGHT, NAME_RADII, ` x="${COLUMN_X}" y="${NAME_Y}"`),
  rectangle(CHIP_WIDTH, NAME_HEIGHT, CHIP_RADII, ` x="${COLUMN_X + CHIP_X}" y="${NAME_Y}"`),
  rectangle(COLUMN_WIDTH, BODY_HEIGHT, BODY_RADII, ` x="${COLUMN_X}" y="${BODY_Y}"`),
].join('');

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
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, 0, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0.4, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const RANGES = [
  TITLE_REVEAL, SPONSOR_LABEL_REVEAL, ...Object.values(NAME_REVEAL), BODY_TEXT_REVEAL,
  ...TILES.flatMap((t) => [t.valueReveal, t.labelReveal]),
];
const GROUPS = [HEADSHOT_PANEL, HEADER, NAME_PANEL, BODY];
const EDGE_LIGHTS = [HEADSHOT_EDGE_LIGHT, COLUMN_EDGE_LIGHT];
const SLIDES = [TEXT_SLIDE, ...TILES.map((t) => t.slide)];

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];

const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(HEADSHOT_EDGE, X, SEAM, -8, WIPE_START, HEADSHOT_WIPE_END, EASE_WIPE),
  move(COLUMN_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, COLUMN_WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  { objectId: HEADSHOT_EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(18, 40) },
  { objectId: COLUMN_EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(30, 52) },
  move(MARKER, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  move(HEADSHOT_RISE_NODE, Y, HEADSHOT_RISE, 0, 8, 44, EASE_OUT),
  move(HEADSHOT_RISE_NODE, OPACITY, 0, 1, 8, 30, EASE_OUT),
  move(NAME_CONTENT, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  move(TEAM_LOGO, OPACITY, 0, 0.18, 24, 60, EASE_OUT),
  move(SPONSOR_LOGO, OPACITY, 0, 1, 30, 54, EASE_OUT),
  ...reveal(NAME_REVEAL.number, 14, 34),
  ...reveal(NAME_REVEAL.firstName, 18, 38),
  ...reveal(NAME_REVEAL.lastName, 20, 44),
  ...reveal(NAME_REVEAL.position, 32, 52),
  ...reveal(NAME_REVEAL.classYear, 36, 56),
  move(HEADER_CONTENT, Y, HEADER_HEIGHT, 0, 20, 44, EASE_OUT),
  ...reveal(TITLE_REVEAL, 26, 50),
  ...reveal(SPONSOR_LABEL_REVEAL, 34, 52),
  move(TEXT_SLIDE, Y, -BODY_HEIGHT, 0, 22, 48, EASE_OUT),
  ...reveal(BODY_TEXT_REVEAL, 30, 66),
  ...TILES.flatMap((t): Track[] => {
    const start = 22 + t.index * TILE_STAGGER;
    return [
      move(t.slide, Y, -BODY_HEIGHT, 0, start, start + 26, EASE_OUT),
      ...reveal(t.valueReveal, start + 8, start + 28),
      ...reveal(t.labelReveal, start + 12, start + 30),
    ];
  }),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, 40, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: 40, value: 0, linear: true }, { frame: 46, value: 0.65, linear: true },
      { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
    ],
  },
];

const settledRanges = RANGES.flatMap(revealed);

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(HEADSHOT_EDGE, X, -8),
  hold(COLUMN_EDGE, X, BLOCK_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKER, SCALE_Y, 1),
  hold(HEADSHOT_RISE_NODE, Y, 0), hold(HEADSHOT_RISE_NODE, OPACITY, 1),
  hold(NAME_CONTENT, X, 0),
  hold(TEAM_LOGO, OPACITY, 0.18),
  hold(SPONSOR_LOGO, OPACITY, 1),
  hold(HEADER_CONTENT, Y, 0),
  ...SLIDES.map((slide) => hold(slide, Y, 0)),
  ...settledRanges,
  hold(SHADOW, OPACITY, 0.6),
  hold(INTRO_SWEEP, X, SWEEP_END),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(HEADSHOT_EDGE, X, -8, SEAM, 4, OUTRO_FRAMES),
  closing(COLUMN_EDGE, X, BLOCK_WIDTH + 8, SEAM, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKER, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(HEADSHOT_RISE_NODE, Y, 0, HEADSHOT_RISE, 0, OUTRO_FRAMES),
  closing(HEADSHOT_RISE_NODE, OPACITY, 1, 0, 4, 20),
  closing(NAME_CONTENT, X, 0, -18, 0, OUTRO_FRAMES),
  closing(TEAM_LOGO, OPACITY, 0.18, 0, 0, 16),
  closing(SPONSOR_LOGO, OPACITY, 1, 0, 0, 16),
  closing(HEADER_CONTENT, Y, 0, HEADER_HEIGHT, 0, 18),
  ...SLIDES.map((slide) => closing(slide, Y, 0, -BODY_HEIGHT, 0, 18)),
  ...settledRanges,
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  hold(INTRO_SWEEP, X, SWEEP_END),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...EDGE_LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(SHADOW, OPACITY, 0),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(P.isPlaying, 634)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const ID = { hold: 30, intro: 31, outro: 32, hidden: 33 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43 } as const;

const stateMachine = `<StateMachine name="Player To Watch Lower Third" id="${id(7)}">
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
const number = (name: string, local: number) => `<ViewModelPropertyNumber name="${name}" id="${id(local)}" componentProps="1"/>`;
const image = (name: string, local: number) => `<ViewModelPropertyAssetImage name="${name}" id="${id(local)}" componentProps="1"/>`;
const color = (name: string, local: number) => `<ViewModelPropertyColor name="${name}" id="${id(local)}" componentProps="1"/>`;

const viewModelProperties = [
  `<ViewModelPropertyBoolean name="isPlaying" id="${id(P.isPlaying)}" componentProps="1"/>`,
  string('bodyMode', P.bodyMode),
  string('firstName', P.firstName),
  string('lastName', P.lastName),
  string('jerseyNumber', P.jerseyNumber),
  string('position', P.position),
  string('classYear', P.classYear),
  string('contextLabel', P.contextLabel),
  string('bodyText', P.bodyText),
  image('headshot', P.headshot),
  image('teamLogo', P.teamLogo),
  color('teamPrimaryColor', P.teamPrimaryColor),
  color('teamSecondaryColor', P.teamSecondaryColor),
  image('sponsorLogo', P.sponsorLogo),
  ...TILES.flatMap((t) => [string(`stat${t.index + 1}Value`, P.statValue(t.index)), string(`stat${t.index + 1}Label`, P.statLabel(t.index))]),
  ...TILES.flatMap((t) => [
    number(`_stat${t.index + 1}X`, P.statX(t.index)),
    number(`_stat${t.index + 1}Width`, P.statWidth(t.index)),
    number(`_stat${t.index + 1}Opacity`, P.statOpacity(t.index)),
  ]),
  number('_headshotOpacity', P.headshotOpacity),
  string('_contextSeparator', P.contextSeparator),
  number('_statsOpacity', P.statsOpacity),
  number('_textOpacity', P.textOpacity),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const numberValue = (local: number, value: number) => `<ViewModelInstanceNumber viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.bodyMode, 'STATS'),
  stringValue(P.firstName, PLAYER.firstName),
  stringValue(P.lastName, PLAYER.lastName),
  stringValue(P.jerseyNumber, PLAYER.number),
  stringValue(P.position, PLAYER.position),
  stringValue(P.classYear, PLAYER.classYear),
  stringValue(P.contextLabel, PLAYER.context),
  stringValue(P.bodyText, PLAYER.text),
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(P.headshot)}" propertyValue="${HEADSHOT_ASSET}"/>`,
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(P.teamLogo)}" propertyValue="${LOGO_ASSET}"/>`,
  `<ViewModelInstanceColor viewModelPropertyId="${id(P.teamPrimaryColor)}" propertyValue="${TEAM.primary}"/>`,
  `<ViewModelInstanceColor viewModelPropertyId="${id(P.teamSecondaryColor)}" propertyValue="${TEAM.secondary}"/>`,
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(P.sponsorLogo)}" propertyValue="${SPONSOR_ASSET}"/>`,
  ...TILES.flatMap((t) => [stringValue(P.statValue(t.index), STATS[t.index]!.value), stringValue(P.statLabel(t.index), STATS[t.index]!.label)]),
  ...TILES.flatMap((t) => [
    numberValue(P.statX(t.index), t.index * (TILE_WIDTH + GAP)),
    numberValue(P.statWidth(t.index), TILE_WIDTH),
    numberValue(P.statOpacity(t.index), 1),
  ]),
  numberValue(P.headshotOpacity, 1),
  stringValue(P.contextSeparator, '   /   '),
  numberValue(P.statsOpacity, 1),
  numberValue(P.textOpacity, 0),
];

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" y="${BLOCK_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${BLOCK_HEIGHT / 2}"><Rectangle width="2" height="${BLOCK_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${BLOCK_HEIGHT / 2}"><Rectangle width="44" height="${BLOCK_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

// The masks run from above the headshot's breakout to below the block.
const MASK_TOP = -HEADSHOT_BREAKOUT - 8;
const MASK_HEIGHT = BLOCK_HEIGHT + HEADSHOT_BREAKOUT + 16;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_player_to_watch_lower_third.ts; edit that file, not this one.
     Basketball Player to Watch lower third v2: a tinted-glass block, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, at the
     bottom of a transparent 1920 x 1080 canvas (origin ${BLOCK_X}, ${BLOCK_Y}), on the scorebug's
     baseline. A headshot panel whose cutout rises ${HEADSHOT_BREAKOUT} above the block; to its right
     the header (title, context, sponsor label), the name panel and sponsor chip, and the body: stat tiles
     or a line of copy. Sibling draw order is front to back; within one shape the last
     paint declared is on top. -->
<Artboard name="Basketball Player To Watch Lower Third v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Player To Watch Lower Third v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- Lays out the stat tiles, crossfades the body mode and sets the context separator. -->
<ScriptedDrawable name="Player To Watch Controller" scriptAssetId="${CONTROLLER_ASSET}"/>

<Node name="Lower Third" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition between the headshot and the column; the edges wipe outward. -->
<Node name="Headshot Leading Edge" id="${HEADSHOT_EDGE}" x="-8">
  <Shape name="Headshot Reveal Mask" id="${HEADSHOT_MASK}" y="${MASK_TOP}"><Rectangle width="900" height="${MASK_HEIGHT}" originX="0" originY="0"/></Shape>
  ${edgeLight('Headshot', HEADSHOT_EDGE_LIGHT, 1)}
</Node>
<Node name="Column Leading Edge" id="${COLUMN_EDGE}" x="${BLOCK_WIDTH + 8}">
  <Shape name="Column Reveal Mask" id="${COLUMN_MASK}" y="${MASK_TOP}"><Rectangle width="1800" height="${MASK_HEIGHT}" originX="1" originY="0"/></Shape>
  ${edgeLight('Column', COLUMN_EDGE_LIGHT, -1)}
</Node>
<Shape name="Glass Specular Sweep" id="${INTRO_SWEEP}" x="${SWEEP_END}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="130" height="${BLOCK_HEIGHT * 1.7}"/>
  <Fill><LinearGradient startX="-65" startY="0" endX="65" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>

<!-- ============================== Headshot ================================= -->
${marker}
${headshotPanel}

<!-- ============================== Column =================================== -->
${header}
${namePanel}
${body}

<!-- Separation from bright video: a feathered dark stroke around the block. -->
<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <Rectangle width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>
<Shape name="Block Silhouette" id="${SILHOUETTE}">${silhouette}</Shape>
<Shape name="Header Slide Mask" id="${HEADER_MASK}" x="${COLUMN_X}" y="0"><Rectangle width="${COLUMN_WIDTH}" height="${HEADER_HEIGHT}" originX="0" originY="0"/></Shape>
<Shape name="Body Slide Mask" id="${BODY_MASK}" x="${COLUMN_X}" y="${BODY_Y}">${rectangle(COLUMN_WIDTH, BODY_HEIGHT, BODY_RADII)}</Shape>
</Node>

<!-- Intro: seam ignition, outward glass wipes, a rising headshot, rows sliding out from
     behind the name panel, rising type and one sheen; ${INTRO_FRAMES / 60} s. Hold and Outro
     explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Defaults off. -->
${stateMachine}
</Artboard>

<FontAsset name="Player To Watch Lower Third v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Player To Watch Lower Third v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Player To Watch Lower Third v2 Headshot Placeholder" id="${HEADSHOT_ASSET}" file="assets/images/headshots/placeholder.png"/>
<ImageAsset name="Player To Watch Lower Third v2 Drexel" id="${LOGO_ASSET}" file="${TEAM.logoFile}"/>
<ImageAsset name="Player To Watch Lower Third v2 Belfor" id="${SPONSOR_ASSET}" file="assets/images/sponsors/belfor_trimmed.png"/>
<ScriptAsset name="player_to_watch_controller" folderPath="graphics/basketball-v2" id="${CONTROLLER_ASSET}" file="graphics/basketball-v2/player_to_watch_controller.luau"/>

<ViewModel name="BasketballPlayerToWatchLowerThirdV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'player_to_watch_lower_third.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
