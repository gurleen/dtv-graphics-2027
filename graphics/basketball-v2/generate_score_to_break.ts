/**
 * Generates the Score to Break scene from one description:
 *
 *   bun graphics/basketball-v2/generate_score_to_break.ts
 *
 * writes score_to_break.rml beside this file. Edit this file, not the output.
 *
 * The score going into a commercial break. It takes the scorebug's corner and is never on
 * air with it: two stacked team rows (away over home), each a team-tinted glass panel with
 * the logo large at its outer end, cropped by the row as on the matchup locator lower
 * third, and the score at its inner end; under them a dark-glass strip with the status at
 * the outer end and the sponsor at the inner end. It stands bottom-left or bottom-right,
 * mirrored.
 *
 * The block is laid out once, for the left. The mirror is a transform: everything sits in
 * a "Side" node at the frame's centre, so scaleX -1 reflects the block onto the right
 * action-safe margin, and every leaf that must read the right way round (logos, scores,
 * status, sponsor) sits in a flip node at its own centre that is scaled -1 with it. Text
 * that hugs one end of the block cannot be keyed to change its alignment, so it is a pair
 * of twins, one aligned for each side, and the side shows one. The state machine has two
 * layers that never key the same property:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *   Side     Left <-> Right, gated on `alignRight`. One-frame poses; it keys only the Side
 *            node, the flip nodes and the twins' opacity.
 */

import { join } from 'node:path';

const PREFIX = 46;
const ARTBOARD_Y = 21800;

type Team = {
  key: 'away' | 'home';
  title: 'Away' | 'Home';
  score: number;
  logoFile: string;
  logoName: string;
  primary: string;
  secondary: string;
};

// Test data: the Drexel Dragons at home (see the package README), Campbell away. The logos
// are 1024 squares, as the team logo host serves them.
const TEAMS: readonly Team[] = [
  {
    key: 'away', title: 'Away', score: 58,
    logoFile: 'assets/images/scorebug/campbell.png', logoName: 'Campbell',
    primary: 'FFF58025', secondary: 'FF000000',
  },
  {
    key: 'home', title: 'Home', score: 61,
    logoFile: 'assets/images/scorebug/drexel.png', logoName: 'Drexel',
    primary: 'FF07294D', secondary: 'FFFFC600',
  },
];
const STATUS = '8:42 2ND HALF';

// Geometry, laid out for the left; the Side node mirrors it for the right. The block's
// left edge is on the action-safe margin and its foot on the lower thirds' foot.
const BLOCK_X = 96;
const FRAME_RIGHT_SAFE = 1920 - 96;
const FOOT_Y = 890 + 132;
const GAP = 4;
const ROW_HEIGHT = 84;
const ROWS_HEIGHT = 2 * ROW_HEIGHT + GAP;
const STRIP_Y = ROWS_HEIGHT + GAP;
const STRIP_HEIGHT = 52;
const BLOCK_HEIGHT = STRIP_Y + STRIP_HEIGHT;
const BLOCK_Y = FOOT_Y - BLOCK_HEIGHT;
const BLOCK_WIDTH = 432;
// Mirroring about the midpoint of the two margins puts either edge on its margin.
const PIVOT_X = (BLOCK_X + FRAME_RIGHT_SAFE) / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const TEXT_INSET = 24;
const CONTENT_DRIFT = 22;
const OUTRO_DRIFT = 18;
// The logo sits at the row's outer end, larger than the row, so the row crops it at the
// outer edge, top and bottom: the matchup locator lower third's treatment, scaled from its
// 136 band to the 84 row. A 1024 source holds about 680 x 515 of visible mark; at 0.21 that
// is about 143 x 108, so the row crops a little at the outer edge and the mark still reads.
// LOGO_CENTRE is the distance of its centre from the outer edge.
const LOGO_SCALE = 0.21;
const LOGO_CENTRE = 56;
const LOGO_DRIFT = 16;
const BLOOM_SIZE = 236;
// The score hugs the row's inner end; the box holds three digits at full size.
const SCORE_SIZE = 68;
const SCORE_BASELINE = 66;
const SCORE_WIDTH = 120;
const SCORE_X = BLOCK_WIDTH - TEXT_INSET - SCORE_WIDTH / 2;
// The strip: the status at the outer end, the sponsor at the inner end. The sponsor is
// contained in its box (the Independence Blue Cross export is 1600 x 204: 192 x 24.5).
const SPONSOR_WIDTH = 192;
const SPONSOR_HEIGHT = 26;
const SPONSOR_X = BLOCK_WIDTH - TEXT_INSET - SPONSOR_WIDTH / 2;
const SPONSOR_Y = STRIP_HEIGHT / 2;
const SPONSOR_DROP = 8;
const STATUS_WIDTH = BLOCK_WIDTH - 2 * TEXT_INSET - SPONSOR_WIDTH - 20;
const STATUS_X = TEXT_INSET + STATUS_WIDTH / 2;
const STATUS_SIZE = 30;
const STATUS_BASELINE = 37;
// The strip starts wholly behind its slide mask, under the home row.
const STRIP_DROP = STRIP_HEIGHT + GAP;
// The leading edge rests REVEAL_OVERHANG past the outer edge; the masks reach MASK_MARGIN
// past the block so the shadow is not cut off.
const REVEAL_OVERHANG = 24;
const MASK_MARGIN = 60;
const EDGE_REST = -REVEAL_OVERHANG;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const WIPE_START = 6;
const WIPE_END = 40;
const SWEEP_FROM = 34;

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
const VERTEX_Y = 25;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;
const MODIFY_TO = 336;
const FALLOFF_TO = 318;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const SIDE = id(11);
const PRESENCE = id(12);
const SHADOW = id(20);
const SHADOW_PATH = id(50);
const EDGE = id(500);
const REVEAL_MASK = id(501);
const EDGE_LIGHT = id(502);
const STRIP_MASK = id(512);
const SWEEP = id(600);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const SPONSOR_ASSET = id(913);
const SCORE_TO_TEXT = id(960);

type Side = 'Left' | 'Right';
const SIDE_NAMES: readonly Side[] = ['Left', 'Right'];
type Direction = 'forward' | 'backward';

/** One of a pair of texts that hug one end of the block, the one shown on `side`. */
type Twin = { side: Side; text: string; style: string; reveal: string; align: 'left' | 'right'; direction: Direction };

/**
 * The pair for a text at the block's inner end (`inner`) or outer end. On the left the
 * inner end is at the right. The counter-flip keeps each twin's alignment as written, so
 * the right side's twin is aligned the other way. A score builds from the inner end
 * outward, from its last glyph on the left; the status reads forward on both sides.
 */
const twins = (base: number, end: 'inner' | 'outer', reads: 'outward' | 'forward'): Twin[] =>
  SIDE_NAMES.map((side, index) => {
    const leftSide = side === 'Left';
    const hugsRight = (end === 'inner') === leftSide;
    const backward = reads === 'outward' && leftSide;
    return {
      side,
      text: id(base + 3 * index), style: id(base + 3 * index + 1), reveal: id(base + 3 * index + 2),
      align: hugsRight ? 'right' : 'left',
      direction: backward ? 'backward' : 'forward',
    };
  });

// Each row in its own hundred: away 100, home 200.
const row = (team: number) => {
  const base = 100 * (team + 1);
  return {
    panel: id(base), content: id(base + 1), marker: id(base + 2),
    logoSettle: id(base + 3), logoFlip: id(base + 4), bloom: id(base + 5), scoreFlip: id(base + 6),
    scores: twins(base + 10, 'inner', 'outward'),
    tint: id(base + 20), underlay: id(base + 21),
  };
};

const STRIP = {
  panel: id(300), slide: id(301), statusFlip: id(302),
  sponsorRise: id(303), sponsorFlip: id(304), sponsorFrame: id(305), sponsorFrameStyle: id(306),
  statuses: twins(310, 'outer', 'forward'),
};

// View model properties.
const IS_PLAYING = 1002;
const ALIGN_RIGHT = 1003;
const ON_SCREEN = 1004;
const STATUS_PROPERTY = 1010;
const teamProperty = (team: number) => {
  const base = 1020 + team * 10;
  return { score: base, logo: base + 1, primary: base + 2, secondary: base + 3 };
};
const SPONSOR_LOGO = 1100;
const logoAsset = (team: number) => id(911 + team);
const TEAM_INDICES = [0, 1] as const;

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

/** `attributes` carries an id or a position for a rectangle that is placed. */
const rectangle = (width: number, height: number, radii: Radii, attributes = '') =>
  `<Rectangle${attributes} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number, converterId = '') =>
  `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"${converterId ? ` converterId="${converterId}"` : ''}/>`;

const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF', bottom = '4D000000') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="${bottom}" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const darkGlass = (name: string, width: number, height: number, radii: Radii) => `${glaze(name, width, height, radii, '59FFFFFF', '40000000')}
  <Shape name="${name} Body" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

// Text reveals. Each glyph rises 14 into place as it fades in, one after another. The
// range starts wholly before the first glyph (forward) or past the last (backward), so no
// glyph shows before its turn, and rests wholly clear of the text.
const RANGE_AT_REST: Record<Direction, string> = {
  forward: 'modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"',
  backward: 'modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"',
};

/** A twin: a fixed box, shrunk to fit when its value is longer. Authored showing the left twin. */
const twinText = (o: { name: string; twin: Twin; width: number; baseline: number; size: number; spacing: number; value: string; binding: string }) =>
  `<Text name="${o.name} ${o.twin.side}" id="${o.twin.text}" x="${-o.width / 2}" y="${o.baseline}" opacity="${o.twin.side === 'Left' ? 1 : 0}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.size + 8}" sizingValue="fixed" alignValue="${o.twin.align}" overflowValue="fitFontSize">
        <TextStylePaint id="${o.twin.style}" fontAssetId="${FONT_BOLD}" fontSize="${o.size}" letterSpacing="${o.spacing}"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
        <TextValueRun name="${o.name} ${o.twin.side} Value" styleId="${o.twin.style}" text="${xml(o.value)}">${o.binding}</TextValueRun>
        <TextModifierGroup name="${o.name} ${o.twin.side} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${o.name} ${o.twin.side} Reveal" id="${o.twin.reveal}" unitsValue="1" ${RANGE_AT_REST[o.twin.direction]}/></TextModifierGroup>
      </Text>`;

/**
 * A full-colour image contained in a box centred on its node. Every layout component joins
 * the artboard's flow through plain nodes, so the frame is pinned absolute; the pin, not
 * x/y (which it adds to), places the frame within the node.
 */
const containedImage = (name: string, frameId: string, styleId: string, width: number, height: number, image: string) =>
  `<LayoutComponent name="${name} Frame" id="${frameId}" x="0" y="0" width="${width}" height="${height}" styleId="${styleId}">
      <LayoutComponentStyle name="${name} Frame Style" id="${styleId}" positionTypeValue="absolute" positionLeft="${-width / 2}" positionLeftUnitsValue="points" positionTop="${-height / 2}" positionTopUnitsValue="points"/>
      ${image}
    </LayoutComponent>`;

// Corner radii: the block's four outer corners take 12, every seam 3.
const ROW_RADII: readonly Radii[] = [
  [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS],
  [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS],
];
const STRIP_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];
const rowY = (team: number) => team * (ROW_HEIGHT + GAP);

const wipeClip = (name: string) => `<ClippingShape name="${name} Wipe Clip" sourceId="${REVEAL_MASK}"/>`;

// --- team rows ------------------------------------------------------------------------

const teamRow = (team: number) => {
  const own = row(team);
  const { title, score, primary, secondary } = TEAMS[team]!;
  const property = teamProperty(team);
  const radii = ROW_RADII[team]!;
  // The markers draw away from the gap between the rows: away upward, home downward.
  const markerOriginY = team === 0 ? 1 : 0;
  return `<Node name="${title} Row" id="${own.panel}" x="0" y="${rowY(team)}">
  ${wipeClip(`${title} Row`)}
  <!-- On the outer edge, over the logo, clipped to the row's corners. -->
  <Shape name="${title} Marker" id="${own.marker}" x="0" y="${markerOriginY * ROW_HEIGHT}">
    <Rectangle width="${MARKER_WIDTH}" height="${ROW_HEIGHT}" originX="0" originY="${markerOriginY}"/>
    <Fill><SolidColor colorValue="${secondary}">${bound(property.secondary, COLOR)}</SolidColor></Fill>
    <ClippingShape name="${title} Marker Clip" sourceId="${own.underlay}"/>
  </Shape>
  <Node name="${title} Content" id="${own.content}" x="0" y="0">
    <Node name="${title} Score Flip" id="${own.scoreFlip}" x="${SCORE_X}" y="0">
      ${own.scores.map((twin) => twinText({
        name: `${title} Score`, twin, width: SCORE_WIDTH, baseline: SCORE_BASELINE, size: SCORE_SIZE, spacing: 0.5,
        value: String(score), binding: bound(property.score, TEXT, SCORE_TO_TEXT),
      })).join('\n      ')}
    </Node>
  </Node>
  <!-- Larger than the row: the tint crops it at the outer edge, top and bottom. The flip
       keeps it the right way round on the right. -->
  <Node name="${title} Logo" id="${own.logoSettle}" x="${LOGO_CENTRE}" y="${ROW_HEIGHT / 2}">
    <ClippingShape name="${title} Logo Clip" sourceId="${own.tint}"/>
    <Node name="${title} Logo Flip" id="${own.logoFlip}" x="0" y="0">
      <Image name="${title} Logo Image" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${logoAsset(team)}">${bound(property.logo, IMAGE)}</Image>
    </Node>
  </Node>
  <Shape name="${title} Logo Bloom" id="${own.bloom}" x="${LOGO_CENTRE}" y="${ROW_HEIGHT / 2}">
    <Ellipse width="${BLOOM_SIZE}" height="${BLOOM_SIZE}"/>
    <Fill><RadialGradient startX="0" startY="0" endX="${BLOOM_SIZE / 2}" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="${title} Logo Bloom Clip" sourceId="${own.tint}"/>
  </Shape>
  ${glaze(`${title} Row`, BLOCK_WIDTH, ROW_HEIGHT, radii)}
  <Shape name="${title} Tint" id="${own.tint}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(BLOCK_WIDTH, ROW_HEIGHT, radii)}
    <Fill><SolidColor colorValue="${primary}">${bound(property.primary, COLOR)}</SolidColor></Fill>
  </Shape>
  <Shape name="${title} Underlay" id="${own.underlay}" x="0" y="0">
    ${rectangle(BLOCK_WIDTH, ROW_HEIGHT, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
</Node>`;
};

// --- strip ----------------------------------------------------------------------------

// It slides down from under the home row; its mask ends at the gap above it.
const strip = `<Node name="Strip" id="${STRIP.panel}" x="0" y="${STRIP_Y}">
  ${wipeClip('Strip')}
  <ClippingShape name="Strip Slide Clip" sourceId="${STRIP_MASK}"/>
  <Node name="Strip Slide" id="${STRIP.slide}" x="0" y="0">
    <Node name="Status Flip" id="${STRIP.statusFlip}" x="${STATUS_X}" y="0">
      ${STRIP.statuses.map((twin) => twinText({
        name: 'Status', twin, width: STATUS_WIDTH, baseline: STATUS_BASELINE, size: STATUS_SIZE, spacing: 1,
        value: STATUS, binding: bound(STATUS_PROPERTY, TEXT),
      })).join('\n      ')}
    </Node>
    <Node name="Sponsor Rise" id="${STRIP.sponsorRise}" x="${SPONSOR_X}" y="${SPONSOR_Y}">
      <Node name="Sponsor Flip" id="${STRIP.sponsorFlip}" x="0" y="0">
        ${containedImage('Sponsor Logo', STRIP.sponsorFrame, STRIP.sponsorFrameStyle, SPONSOR_WIDTH, SPONSOR_HEIGHT,
          `<Image name="Sponsor Logo" fit="contain" assetId="${SPONSOR_ASSET}">${bound(SPONSOR_LOGO, IMAGE)}</Image>`)}
      </Node>
    </Node>
    ${darkGlass('Strip', BLOCK_WIDTH, STRIP_HEIGHT, STRIP_RADII)}
  </Node>
</Node>`;

// --- leading edge, sweep, shadow, silhouette ------------------------------------------

// One edge: its mask reaches toward the inner end, so the glass shows between the edge and
// the inner end. The light spans the rows only (the strip arrives after the wipe), ignites
// (scaleY from its centre) at the inner end and fades as the edge reaches the outer end.
// It is clipped to the block, so it never burns beyond the glass: the line sits just ahead
// of the edge, and the glow trails over the open glass.
const edge = `<Node name="Leading Edge" id="${EDGE}" x="${EDGE_REST}">
  <Shape name="Reveal Mask" id="${REVEAL_MASK}" y="${-MASK_MARGIN}"><Rectangle width="2400" height="${BLOCK_HEIGHT + 2 * MASK_MARGIN}" originX="0" originY="0"/></Shape>
  <Node name="Edge Light" id="${EDGE_LIGHT}" y="${ROWS_HEIGHT / 2}" opacity="0">
    <ClippingShape name="Edge Light Clip" sourceId="${SILHOUETTE}"/>
    <Shape name="Edge Line" y="${-ROWS_HEIGHT / 2}"><Rectangle width="2" height="${ROWS_HEIGHT}" originX="1" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="Edge Glow" y="${-ROWS_HEIGHT / 2}"><Rectangle width="44" height="${ROWS_HEIGHT}" originX="0" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="44" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>
</Node>`;

// The sheen crosses the open glass once, from the outer edge inward.
const sweep = `<Shape name="Glass Specular Sweep" id="${SWEEP}" x="${SWEEP_END}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="${BLOCK_HEIGHT * 2}"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
  ${wipeClip('Sweep')}
</Shape>`;

// The outline runs round the rows and the strip. Its base drops with the strip.
const outline = [
  { local: 51, x: 0, y: 0, base: false },
  { local: 52, x: BLOCK_WIDTH, y: 0, base: false },
  { local: 53, x: BLOCK_WIDTH, y: BLOCK_HEIGHT, base: true },
  { local: 54, x: 0, y: BLOCK_HEIGHT, base: true },
] as const;
const BASE = outline.filter((vertex) => vertex.base).map((vertex) => id(vertex.local));

const blockShadow = `<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  ${wipeClip('Block Shadow')}
  <PointsPath name="Block Outline" id="${SHADOW_PATH}" isClosed="true">
    ${outline.map((vertex) => `<StraightVertex id="${id(vertex.local)}" x="${vertex.x}" y="${vertex.y}" radius="${OUTER_RADIUS}"/>`).join('\n    ')}
  </PointsPath>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>`;

const silhouette = `<Shape name="Block Silhouette" id="${SILHOUETTE}">
  ${TEAM_INDICES.map((team) => rectangle(BLOCK_WIDTH, ROW_HEIGHT, ROW_RADII[team]!, ` x="0" y="${rowY(team)}"`)).join('\n  ')}
  ${rectangle(BLOCK_WIDTH, STRIP_HEIGHT, STRIP_RADII, ` x="0" y="${STRIP_Y}"`)}
</Shape>`;

const stripMask = `<Shape name="Strip Slide Mask" id="${STRIP_MASK}" x="${-MASK_MARGIN}" y="${STRIP_Y - GAP / 2}"><Rectangle width="${BLOCK_WIDTH + 2 * MASK_MARGIN}" height="${STRIP_HEIGHT + GAP / 2 + MASK_MARGIN}" originX="0" originY="0"/></Shape>`;

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

// A forward reveal moves the range's leading edge from before the first glyph to past the
// last; a backward one moves its trailing edge from past the last to before the first.
// Both twins sweep in step; the side shows one.
const reveal = (twin: Twin, start: number, end: number): Track[] => twin.direction === 'forward'
  ? [move(twin.reveal, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT), move(twin.reveal, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT)]
  : [move(twin.reveal, MODIFY_TO, 1.4, 0, start, end, EASE_OUT), move(twin.reveal, FALLOFF_TO, 1, -0.4, start, end, EASE_OUT)];
const revealed = (twin: Twin): Track[] => twin.direction === 'forward'
  ? [hold(twin.reveal, MODIFY_FROM, 1), hold(twin.reveal, FALLOFF_FROM, 1.4)]
  : [hold(twin.reveal, MODIFY_TO, 0), hold(twin.reveal, FALLOFF_TO, -0.4)];

// The presence node fades with the glass, so `_onScreen` reads 0 only once the outro ends.
const GROUPS = [row(0).panel, row(1).panel, STRIP.panel, PRESENCE];
const ROWS = TEAM_INDICES.map(row);
const SCORE_TWINS = ROWS.flatMap((own) => own.scores);
const settledRanges = [...SCORE_TWINS, ...STRIP.statuses].flatMap(revealed);

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sheen: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: SWEEP_FROM, value: 0, linear: true }, { frame: SWEEP_FROM + 6, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

// The light ignites at the rows' inner end and one edge wipes the rows open toward the
// logos. The scores ride in behind it; the logos settle as it reaches the outer end, then
// the markers draw and the strip slides down from under the home row.
const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(EDGE, X, BLOCK_WIDTH, EDGE_REST, WIPE_START, WIPE_END, EASE_WIPE),
  move(EDGE_LIGHT, SCALE_Y, 0, 1, 0, 12, EASE_OUT),
  { objectId: EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(24, 44) },
  ...ROWS.flatMap((own): Track[] => [
    move(own.content, X, CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
    ...own.scores.flatMap((twin) => reveal(twin, 14, 40)),
    move(own.logoSettle, X, LOGO_CENTRE + LOGO_DRIFT, LOGO_CENTRE, 22, 60, EASE_OUT),
    ...scale(own.logoSettle, 1.12, 1, 22, 60, EASE_OUT),
    move(own.logoSettle, OPACITY, 0, 1, 22, 42, EASE_OUT),
    ...scale(own.bloom, 0.7, 1, 26, 62, EASE_OUT),
    move(own.bloom, OPACITY, 0, 1, 26, 56, EASE_OUT),
    move(own.marker, SCALE_Y, 0, 1, 30, 50, EASE_OUT),
  ]),
  move(STRIP.slide, Y, -STRIP_DROP, 0, 22, 46, EASE_OUT),
  ...BASE.map((vertex) => move(vertex, VERTEX_Y, ROWS_HEIGHT, BLOCK_HEIGHT, 22, 46, EASE_OUT)),
  ...STRIP.statuses.flatMap((twin) => reveal(twin, 28, 52)),
  move(STRIP.sponsorRise, Y, SPONSOR_Y + SPONSOR_DROP, SPONSOR_Y, 32, 56, EASE_OUT),
  move(STRIP.sponsorRise, OPACITY, 0, 1, 32, 50, EASE_OUT),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  move(SWEEP, X, SWEEP_START, SWEEP_END, SWEEP_FROM, INTRO_FRAMES, EASE_SWEEP),
  { objectId: SWEEP, propertyKey: OPACITY, keys: sheen },
];

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(EDGE, X, EDGE_REST),
  hold(EDGE_LIGHT, SCALE_Y, 1),
  hold(EDGE_LIGHT, OPACITY, 0),
  ...ROWS.flatMap((own): Track[] => [
    hold(own.content, X, 0),
    hold(own.logoSettle, X, LOGO_CENTRE), ...holdScale(own.logoSettle, 1), hold(own.logoSettle, OPACITY, 1),
    ...holdScale(own.bloom, 1), hold(own.bloom, OPACITY, 1),
    hold(own.marker, SCALE_Y, 1),
  ]),
  hold(STRIP.slide, Y, 0),
  ...BASE.map((vertex) => hold(vertex, VERTEX_Y, BLOCK_HEIGHT)),
  ...settledRanges,
  hold(STRIP.sponsorRise, Y, SPONSOR_Y),
  hold(STRIP.sponsorRise, OPACITY, 1),
  hold(SHADOW, OPACITY, 0.6),
  hold(SWEEP, X, SWEEP_END),
  hold(SWEEP, OPACITY, 0),
];

// The strip withdraws behind the rows and the edge closes the rows toward the inner end.
const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(EDGE, X, EDGE_REST, BLOCK_WIDTH, 2, OUTRO_FRAMES - 2),
  hold(EDGE_LIGHT, SCALE_Y, 1),
  { objectId: EDGE_LIGHT, propertyKey: OPACITY, keys: edgeClosing },
  ...ROWS.flatMap((own): Track[] => [
    closing(own.content, X, 0, OUTRO_DRIFT, 0, OUTRO_FRAMES),
    hold(own.logoSettle, X, LOGO_CENTRE),
    ...[SCALE_X, SCALE_Y].map((key) => closing(own.logoSettle, key, 1, 1.06, 0, OUTRO_FRAMES)),
    closing(own.logoSettle, OPACITY, 1, 0, 0, 12),
    ...holdScale(own.bloom, 1),
    closing(own.bloom, OPACITY, 1, 0, 0, 14),
    closing(own.marker, SCALE_Y, 1, 0, 0, 12),
  ]),
  closing(STRIP.slide, Y, 0, -STRIP_DROP, 0, 16),
  ...BASE.map((vertex) => closing(vertex, VERTEX_Y, BLOCK_HEIGHT, ROWS_HEIGHT, 0, 16)),
  ...settledRanges,
  hold(STRIP.sponsorRise, Y, SPONSOR_Y),
  closing(STRIP.sponsorRise, OPACITY, 1, 0, 0, 12),
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  hold(SWEEP, X, SWEEP_END),
  hold(SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  hold(EDGE_LIGHT, OPACITY, 0),
  hold(SHADOW, OPACITY, 0),
  hold(SWEEP, OPACITY, 0),
];

const FLIPS = [...ROWS.flatMap((own) => [own.logoFlip, own.scoreFlip]), STRIP.statusFlip, STRIP.sponsorFlip];
const TWINS = [...SCORE_TWINS, ...STRIP.statuses];

/** A side's one-frame pose: the mirror, the counter-flips and which twin of each text shows. */
const sidePose = (side: Side): Track[] => {
  const mirror = side === 'Left' ? 1 : -1;
  return [
    hold(SIDE, SCALE_X, mirror),
    ...FLIPS.map((flip) => hold(flip, SCALE_X, mirror)),
    ...TWINS.map((twin) => hold(twin.text, OPACITY, twin.side === side ? 1 : 0)),
  ];
};

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const isTrue = (property: number, value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(property, BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const ID = { hold: 30, intro: 31, outro: 32, hidden: 33, left: 34, right: 35 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43, left: 44, right: 45 } as const;

const stateMachine = `<StateMachine name="Score to Break" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.hidden)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.hidden)}" animationId="${id(ID.hidden)}"><StateTransition stateToId="${id(STATE.intro)}" duration="0">${isTrue(IS_PLAYING, 'equal')}</StateTransition></AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.intro)}" animationId="${id(ID.intro)}" reset="true">
    <StateTransition stateToId="${id(STATE.hold)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.outro)}" duration="0">${isTrue(IS_PLAYING, 'notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.hold)}" animationId="${id(ID.hold)}"><StateTransition stateToId="${id(STATE.outro)}" duration="0">${isTrue(IS_PLAYING, 'notEqual')}</StateTransition></AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.outro)}" animationId="${id(ID.outro)}" reset="true"><StateTransition stateToId="${id(STATE.hidden)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/></AnimationState>
</StateMachineLayer>
<StateMachineLayer name="Side">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.left)}"/></EntryState>
  <AnimationState x="180" y="0" id="${id(STATE.left)}" animationId="${id(ID.left)}"><StateTransition stateToId="${id(STATE.right)}" duration="0">${isTrue(ALIGN_RIGHT, 'equal')}</StateTransition></AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.right)}" animationId="${id(ID.right)}"><StateTransition stateToId="${id(STATE.left)}" duration="0">${isTrue(ALIGN_RIGHT, 'notEqual')}</StateTransition></AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const viewModelProperties = [
  `<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>`,
  `<ViewModelPropertyBoolean name="alignRight" id="${id(ALIGN_RIGHT)}" componentProps="1"/>`,
  `<ViewModelPropertyNumber name="_onScreen" id="${id(ON_SCREEN)}"/>`,
  ...TEAMS.flatMap((team, index) => {
    const property = teamProperty(index);
    return [
      `<ViewModelPropertyNumber name="${team.key}Score" id="${id(property.score)}" componentProps="1"/>`,
      `<ViewModelPropertyAssetImage name="${team.key}Logo" id="${id(property.logo)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${team.key}PrimaryColor" id="${id(property.primary)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${team.key}SecondaryColor" id="${id(property.secondary)}" componentProps="1"/>`,
    ];
  }),
  `<ViewModelPropertyString name="status" id="${id(STATUS_PROPERTY)}" componentProps="1"/>`,
  `<ViewModelPropertyAssetImage name="sponsorLogo" id="${id(SPONSOR_LOGO)}" componentProps="1"/>`,
];

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>`,
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(ALIGN_RIGHT)}" propertyValue="false"/>`,
  `<ViewModelInstanceNumber viewModelPropertyId="${id(ON_SCREEN)}" propertyValue="0"/>`,
  ...TEAMS.flatMap((team, index) => {
    const property = teamProperty(index);
    return [
      `<ViewModelInstanceNumber viewModelPropertyId="${id(property.score)}" propertyValue="${team.score}"/>`,
      `<ViewModelInstanceAssetImage viewModelPropertyId="${id(property.logo)}" propertyValue="${logoAsset(index)}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.primary)}" propertyValue="${team.primary}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.secondary)}" propertyValue="${team.secondary}"/>`,
    ];
  }),
  `<ViewModelInstanceString viewModelPropertyId="${id(STATUS_PROPERTY)}" propertyValue="${xml(STATUS)}"/>`,
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(SPONSOR_LOGO)}" propertyValue="${SPONSOR_ASSET}"/>`,
];

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_score_to_break.ts; edit that file, not this one.
     Basketball score to break v2: the score going into a commercial break, in the
     scorebug's corner of a transparent 1920 x 1080 canvas (it never shares the screen with
     the scorebug). ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, bottom-left at (${BLOCK_X}, ${BLOCK_Y}) or, with
     alignRight, mirrored to bottom-right with its right edge on x ${FRAME_RIGHT_SAFE}. Two team rows
     (away over home: marker, logo cropped at the outer end, score at the inner end) over a
     dark-glass strip (status, sponsor). Sibling draw order is front to back. -->
<Artboard name="Basketball Score to Break v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Score to Break v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<!-- Draws nothing. The Display layer keys its opacity with the glass's, and the bind writes
     it out (target to source) as _onScreen, so a host can tell when the outro has ended. -->
<Node name="Presence" id="${PRESENCE}" opacity="0"><DataBindContext sourcePathIds="${pathTo(ON_SCREEN)}" propertyKey="${OPACITY}" direction="true"/></Node>

<!-- The mirror: scaleX -1 (the Side layer) reflects the block about x ${PIVOT_X}. -->
<Node name="Side" id="${SIDE}" x="${PIVOT_X}" y="${BLOCK_Y}">
<Node name="Score to Break" id="${ROOT}" x="${BLOCK_X - PIVOT_X}" y="0">

<!-- Ignition at the rows' inner end; the edge wipes outward to the logos. -->
${edge}
${sweep}

<!-- ============================== Team rows ================================ -->
${TEAM_INDICES.map(teamRow).join('\n')}

<!-- ============================== Strip ==================================== -->
${strip}

<!-- Separation from bright video: a feathered dark stroke around the block. -->
${blockShadow}

<!-- Unpainted shapes: the clip sources. -->
${stripMask}
${silhouette}
</Node>
</Node>

<!-- Intro: ignition at the inner end, one outward wipe, rising type, the logos settling
     at the outer end, the strip sliding out and one sheen; ${INTRO_FRAMES / 60} s. Hold and Outro
     explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Side layer: the left and right poses. They key only the Side node, the flips and the
     twins' opacity, none of which the Display layer touches. -->
${animation('Side Left', ID.left, 1, 'loop', sidePose('Left'))}

${animation('Side Right', ID.right, 1, 'loop', sidePose('Right'))}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses it
     (Outro then Hidden). Side: alignRight mirrors the block to the bottom right; it snaps,
     and the renderer writes it only before the intro. Both default off/left. -->
${stateMachine}
</Artboard>

<FontAsset name="Score to Break v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
${TEAMS.map((team, index) => `<ImageAsset name="Score to Break v2 ${team.logoName}" id="${logoAsset(index)}" file="${team.logoFile}"/>`).join('\n')}
<ImageAsset name="Score to Break v2 Independence Blue Cross" id="${SPONSOR_ASSET}" file="assets/images/sponsors/independence_blue_cross.png"/>

<ViewModel name="BasketballScoreToBreakV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>

<!-- Scores reach text as whole numbers. -->
<DataConverterToString name="Whole Number" id="${SCORE_TO_TEXT}" decimals="0" round="true"/>
</Rive>
`;

const file = join(import.meta.dir, 'score_to_break.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
