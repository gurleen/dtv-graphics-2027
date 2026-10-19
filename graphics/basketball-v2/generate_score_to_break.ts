/**
 * Generates the Score to Break scene from one description:
 *
 *   bun graphics/basketball-v2/generate_score_to_break.ts
 *
 * writes score_to_break.rml beside this file. Edit this file, not the output.
 *
 * The score going into a commercial break. It takes the scorebug's corner and is never on
 * air with it: two stacked team rows (away over home), each a team-tinted glass panel with
 * the marker, the logo and the score, and a dark-glass clock cell at the inner end with one
 * line of status over the sponsor. It stands bottom-left or bottom-right, mirrored.
 *
 * The block is laid out once, for the left. The mirror is a transform: everything sits in
 * a "Side" node at the frame's centre, so scaleX -1 reflects the block onto the right
 * action-safe margin, and every leaf that must read the right way round (logos, scores,
 * status, sponsor) sits in a flip node at its own centre that is scaled -1 with it. Text
 * builds from the seam outward, so each text carries a forward and a backward reveal and
 * the side picks one by its strength. The state machine has two layers that never key the
 * same property:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *   Side     Left <-> Right, gated on `alignRight`. One-frame poses; it keys only the Side
 *            node, the flip nodes and the reveal strengths.
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

// Test data: the Drexel Dragons at home (see the package README), Campbell away. Campbell's
// orange camel on Campbell orange is the case the logo shade exists for.
const TEAMS: readonly Team[] = [
  {
    key: 'away', title: 'Away', score: 58,
    logoFile: 'assets/images/caa/campbell.png', logoName: 'Campbell',
    primary: 'FFF58025', secondary: 'FF000000',
  },
  {
    key: 'home', title: 'Home', score: 61,
    logoFile: 'assets/images/caa/drexel.png', logoName: 'Drexel',
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
const BLOCK_HEIGHT = 2 * ROW_HEIGHT + GAP;
const BLOCK_Y = FOOT_Y - BLOCK_HEIGHT;
const ROW_WIDTH = 272;
const CELL_WIDTH = 244;
const CELL_X = ROW_WIDTH + GAP;
const BLOCK_WIDTH = CELL_X + CELL_WIDTH;
const SEAM = ROW_WIDTH + GAP / 2;
// Mirroring about the midpoint of the two margins puts either edge on its margin.
const PIVOT_X = (BLOCK_X + FRAME_RIGHT_SAFE) / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const OUTRO_DRIFT = 18;
// The logo is contained in a box, so square and wide marks carry the same weight.
const LOGO_BOX_WIDTH = 96;
const LOGO_BOX_HEIGHT = 64;
const LOGO_X = MARKER_WIDTH + 16 + LOGO_BOX_WIDTH / 2;
const SHADE_WIDTH = 120;
const SCORE_LEFT = LOGO_X + LOGO_BOX_WIDTH / 2 + 8;
const SCORE_WIDTH = ROW_WIDTH - 12 - SCORE_LEFT;
const SCORE_X = SCORE_LEFT + SCORE_WIDTH / 2;
const SCORE_SIZE = 68;
const SCORE_BASELINE = 66;
// The status centres over the sponsor strip, as the scorebug's clock does.
const CELL_CENTRE = CELL_WIDTH / 2;
const STATUS_WIDTH = CELL_WIDTH - 28;
const STATUS_SIZE = 48;
const STATUS_BASELINE = 87;
const DIVIDER_Y = BLOCK_HEIGHT - 32;
const DIVIDER_INSET = 14;
const SPONSOR_Y = BLOCK_HEIGHT - 15.5;
const SPONSOR_WIDTH = 168;
const SPONSOR_HEIGHT = 22;
const SPONSOR_DROP = 8;
const SWEEP_LEFT = -120;
const SWEEP_RIGHT = BLOCK_WIDTH + 120;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const WIPE_START = 6;
const ROWS_WIPE_END = 40;
const CELL_WIPE_END = 34;

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
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;
const MODIFY_TO = 336;
const FALLOFF_TO = 318;
const STRENGTH = 334;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const SIDE = id(11);
const PRESENCE = id(12);
const SHADOW = id(20);
const LEFT_EDGE = id(500);
const LEFT_MASK = id(501);
const LEFT_LIGHT = id(502);
const RIGHT_EDGE = id(505);
const RIGHT_MASK = id(506);
const RIGHT_LIGHT = id(507);
const SWEEP = id(600);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const SPONSOR_ASSET = id(913);
const SCORE_TO_TEXT = id(960);

/** A text's two reveals: forward builds from its first glyph, backward from its last. */
type Reveal = { forward: string; backward: string };

// Each row in its own hundred: away 100, home 200.
const row = (team: number) => {
  const base = 100 * (team + 1);
  return {
    panel: id(base), content: id(base + 1), marker: id(base + 2),
    logoFlip: id(base + 3), logoSettle: id(base + 4), logoFrame: id(base + 5), logoFrameStyle: id(base + 6),
    logo: id(base + 7), shade: id(base + 8),
    scoreFlip: id(base + 9), scoreStyle: id(base + 10),
    scoreReveal: { forward: id(base + 11), backward: id(base + 12) } satisfies Reveal,
    tint: id(base + 13), underlay: id(base + 14),
  };
};

const CELL = {
  panel: id(300), content: id(301), statusFlip: id(302), statusStyle: id(303),
  statusReveal: { forward: id(304), backward: id(305) } satisfies Reveal,
  sponsorRise: id(306), sponsorFlip: id(307), sponsorFrame: id(308), sponsorFrameStyle: id(309),
  divider: id(310),
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

// --- the two sides --------------------------------------------------------------------

type Side = 'Left' | 'Right';

/**
 * Everything the side decides. Text builds from the seam outward: on the left the rows'
 * seam is at their right, so the scores build from their last glyph and the status, whose
 * seam is at its left, from its first. The mirror reverses both.
 */
const SIDES: Record<Side, { scaleX: 1 | -1; rowsBuildBackward: boolean }> = {
  Left: { scaleX: 1, rowsBuildBackward: true },
  Right: { scaleX: -1, rowsBuildBackward: false },
};

const FLIPS = [...TEAM_INDICES.flatMap((team) => [row(team).logoFlip, row(team).scoreFlip]), CELL.statusFlip, CELL.sponsorFlip];

/** Which reveal of each text the side uses, at strength 1; the other is off. */
const revealStrengths = (side: Side): { range: string; strength: number }[] => {
  const { rowsBuildBackward } = SIDES[side];
  const pick = (reveal: Reveal, backward: boolean) => [
    { range: reveal.forward, strength: backward ? 0 : 1 },
    { range: reveal.backward, strength: backward ? 1 : 0 },
  ];
  return [
    ...TEAM_INDICES.flatMap((team) => pick(row(team).scoreReveal, rowsBuildBackward)),
    ...pick(CELL.statusReveal, !rowsBuildBackward),
  ];
};
const strengthOf = (range: string) => revealStrengths('Left').find((entry) => entry.range === range)!.strength;

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

/** `attributes` carries an id or a position for a rectangle that is placed. */
const rectangle = (width: number, height: number, radii: Radii, attributes = '') =>
  `<Rectangle${attributes} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number, converterId = '') =>
  `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"${converterId ? ` converterId="${converterId}"` : ''}/>`;

const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const glaze = (name: string, width: number, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="73FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const darkGlass = (name: string, width: number, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="40000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>
  <Shape name="${name} Body" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

// At rest each range lies wholly off the line (forward past the last glyph, backward
// before the first), so the side's choice of strength changes nothing once text is up.
const rises = (name: string, reveal: Reveal) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${reveal.forward}" unitsValue="1" strength="${strengthOf(reveal.forward)}" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>
  <TextModifierGroup name="${name} Rise Back" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal Back" id="${reveal.backward}" unitsValue="1" strength="${strengthOf(reveal.backward)}" modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"/></TextModifierGroup>`;

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

// Corner radii: the block's outer corners take 12, every seam 3.
const ROW_RADII: readonly Radii[] = [
  [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS],
  [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS],
];
const CELL_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS];
const rowY = (team: number) => team * (ROW_HEIGHT + GAP);

/** Both leading edges' masks: a panel shows only between the two edges. */
const wipeClips = (name: string) =>
  `<ClippingShape name="${name} Left Wipe Clip" sourceId="${LEFT_MASK}"/><ClippingShape name="${name} Right Wipe Clip" sourceId="${RIGHT_MASK}"/>`;

// --- team rows ------------------------------------------------------------------------

const teamRow = (team: number) => {
  const own = row(team);
  const { title, score, primary, secondary } = TEAMS[team]!;
  const property = teamProperty(team);
  const radii = ROW_RADII[team]!;
  // The markers draw away from the gap between the rows: away upward, home downward.
  const markerOriginY = team === 0 ? 1 : 0;
  return `<Node name="${title} Row" id="${own.panel}" x="0" y="${rowY(team)}">
  ${wipeClips(`${title} Row`)}
  <!-- On the outer edge, clipped to the row's corners. -->
  <Shape name="${title} Marker" id="${own.marker}" x="0" y="${markerOriginY * ROW_HEIGHT}">
    <Rectangle width="${MARKER_WIDTH}" height="${ROW_HEIGHT}" originX="0" originY="${markerOriginY}"/>
    <Fill><SolidColor colorValue="${secondary}">${bound(property.secondary, COLOR)}</SolidColor></Fill>
    <ClippingShape name="${title} Marker Clip" sourceId="${own.underlay}"/>
  </Shape>
  <Node name="${title} Content" id="${own.content}" x="0" y="0">
    <Node name="${title} Score Flip" id="${own.scoreFlip}" x="${SCORE_X}" y="0">
      <Text name="${title} Score" x="${-SCORE_WIDTH / 2}" y="${SCORE_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${SCORE_WIDTH}" height="${SCORE_SIZE + 8}" sizingValue="fixed" alignValue="center" overflowValue="fitFontSize">
        <TextStylePaint id="${own.scoreStyle}" fontAssetId="${FONT_BOLD}" fontSize="${SCORE_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
        <TextValueRun name="${title} Score Value" styleId="${own.scoreStyle}" text="${score}">${bound(property.score, TEXT, SCORE_TO_TEXT)}</TextValueRun>
      ${rises(`${title} Score`, own.scoreReveal)}</Text>
    </Node>
    <!-- The logo in full colour; the flip keeps it the right way round on the right. -->
    <Node name="${title} Logo Flip" id="${own.logoFlip}" x="${LOGO_X}" y="${ROW_HEIGHT / 2}">
      <Node name="${title} Logo Settle" id="${own.logoSettle}" x="0" y="0">
        ${containedImage(`${title} Logo`, own.logoFrame, own.logoFrameStyle, LOGO_BOX_WIDTH, LOGO_BOX_HEIGHT,
          `<Image name="${title} Logo" id="${own.logo}" fit="contain" assetId="${logoAsset(team)}">${bound(property.logo, IMAGE)}</Image>`)}
      </Node>
    </Node>
    <!-- Parts the logo from a tint of its own colour. -->
    <Shape name="${title} Logo Shade" id="${own.shade}" x="${LOGO_X}" y="${ROW_HEIGHT / 2}" scaleY="${ROW_HEIGHT / SHADE_WIDTH}">
      <Ellipse width="${SHADE_WIDTH}" height="${SHADE_WIDTH}"/>
      <Fill><RadialGradient startX="0" startY="0" endX="${SHADE_WIDTH / 2}" endY="0"><GradientStop colorValue="73000000" position="0"/><GradientStop colorValue="2E000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
      <ClippingShape name="${title} Logo Shade Clip" sourceId="${own.underlay}"/>
    </Shape>
  </Node>
  ${glaze(`${title} Row`, ROW_WIDTH, ROW_HEIGHT, radii)}
  <Shape name="${title} Tint" id="${own.tint}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(ROW_WIDTH, ROW_HEIGHT, radii)}
    <Fill><SolidColor colorValue="${primary}">${bound(property.primary, COLOR)}</SolidColor></Fill>
  </Shape>
  <Shape name="${title} Underlay" id="${own.underlay}" x="0" y="0">
    ${rectangle(ROW_WIDTH, ROW_HEIGHT, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
</Node>`;
};

// --- clock cell -----------------------------------------------------------------------

const clockCell = `<Node name="Clock Cell" id="${CELL.panel}" x="${CELL_X}" y="0">
  ${wipeClips('Clock Cell')}
  <Node name="Clock Content" id="${CELL.content}" x="0" y="0">
    <Node name="Status Flip" id="${CELL.statusFlip}" x="${CELL_CENTRE}" y="0">
      <Text name="Status" x="${-STATUS_WIDTH / 2}" y="${STATUS_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${STATUS_WIDTH}" height="${STATUS_SIZE + 8}" sizingValue="fixed" alignValue="center" overflowValue="fitFontSize">
        <TextStylePaint id="${CELL.statusStyle}" fontAssetId="${FONT_BOLD}" fontSize="${STATUS_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
        <TextValueRun name="Status Value" styleId="${CELL.statusStyle}" text="${xml(STATUS)}">${bound(STATUS_PROPERTY, TEXT)}</TextValueRun>
      ${rises('Status', CELL.statusReveal)}</Text>
    </Node>
    <!-- The sponsor along the foot, as on the scorebug's clock cell: contained in its box. -->
    <Node name="Sponsor Rise" id="${CELL.sponsorRise}" x="${CELL_CENTRE}" y="${SPONSOR_Y}">
      <Node name="Sponsor Flip" id="${CELL.sponsorFlip}" x="0" y="0">
        ${containedImage('Sponsor Logo', CELL.sponsorFrame, CELL.sponsorFrameStyle, SPONSOR_WIDTH, SPONSOR_HEIGHT,
          `<Image name="Sponsor Logo" fit="contain" assetId="${SPONSOR_ASSET}">${bound(SPONSOR_LOGO, IMAGE)}</Image>`)}
      </Node>
    </Node>
    <!-- Anchored at its seam end, so the intro draws it outward. -->
    <Shape name="Sponsor Divider" id="${CELL.divider}" x="${DIVIDER_INSET}" y="${DIVIDER_Y}">
      <Rectangle width="${CELL_WIDTH - 2 * DIVIDER_INSET}" height="1" originX="0" originY="0"/>
      <Fill><SolidColor colorValue="26FFFFFF"/></Fill>
    </Shape>
  </Node>
  ${darkGlass('Clock Cell', CELL_WIDTH, BLOCK_HEIGHT, CELL_RADII)}
</Node>`;

// --- leading edges, sweep, silhouette -------------------------------------------------

// Each edge carries a mask (the left one reaches right of it, the right one left of it,
// so a panel shows between the two) and a light that ignites (scaleY from its centre)
// and fades.
const edge = (side: Side, edgeId: string, maskId: string, lightId: string) => {
  const left = side === 'Left';
  const glowToward = left ? 1 : -1;
  return `<Node name="${side} Leading Edge" id="${edgeId}" x="${left ? -8 : BLOCK_WIDTH + 8}">
  <Shape name="${side} Reveal Mask" id="${maskId}" y="-8"><Rectangle width="2400" height="${BLOCK_HEIGHT + 16}" originX="${left ? 0 : 1}" originY="0"/></Shape>
  <Node name="${side} Edge Light" id="${lightId}" y="${BLOCK_HEIGHT / 2}" opacity="0">
    <Shape name="${side} Edge Line" y="${-BLOCK_HEIGHT / 2}"><Rectangle width="2" height="${BLOCK_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${side} Edge Glow" y="${-BLOCK_HEIGHT / 2}"><Rectangle width="44" height="${BLOCK_HEIGHT}" originX="${left ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>
</Node>`;
};

// The sheen crosses from the outer edge inward and lights only glass that is open: the
// silhouette, between the leading edges.
const sweep = `<Shape name="Glass Specular Sweep" id="${SWEEP}" x="${SWEEP_LEFT}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="480"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
  ${wipeClips('Sweep')}
</Shape>`;

const silhouette = `<Shape name="Block Silhouette" id="${SILHOUETTE}">
  ${TEAM_INDICES.map((team) => rectangle(ROW_WIDTH, ROW_HEIGHT, ROW_RADII[team]!, ` x="0" y="${rowY(team)}"`)).join('\n  ')}
  ${rectangle(CELL_WIDTH, BLOCK_HEIGHT, CELL_RADII, ` x="${CELL_X}" y="0"`)}
</Shape>`;

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

// Both reveals sweep in step; the side's strengths decide which one shows. Each starts
// with its ramp wholly off the line, so nothing shows before its turn.
const reveal = ({ forward, backward }: Reveal, start: number, end: number): Track[] => [
  move(forward, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT),
  move(forward, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT),
  move(backward, MODIFY_TO, 1.4, 0, start, end, EASE_OUT),
  move(backward, FALLOFF_TO, 1, -0.4, start, end, EASE_OUT),
];
const revealed = ({ forward, backward }: Reveal): Track[] => [
  hold(forward, MODIFY_FROM, 1), hold(forward, FALLOFF_FROM, 1.4),
  hold(backward, MODIFY_TO, 0), hold(backward, FALLOFF_TO, -0.4),
];

// The presence node fades with the glass, so `_onScreen` reads 0 only once the outro ends.
const GROUPS = [row(0).panel, row(1).panel, CELL.panel, PRESENCE];
const LIGHTS = [LEFT_LIGHT, RIGHT_LIGHT];
const ROW_CONTENTS = TEAM_INDICES.map((team) => row(team).content);
const MARKERS = TEAM_INDICES.map((team) => row(team).marker);
const LOGOS = TEAM_INDICES.map((team) => row(team).logoSettle);
const SCORE_REVEALS = TEAM_INDICES.map((team) => row(team).scoreReveal);
const settledRanges = [...SCORE_REVEALS, CELL.statusReveal].flatMap(revealed);

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sheen = (start: number, end: number, peak: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: start, value: 0, linear: true }, { frame: start + 6, value: peak, linear: true },
  { frame: end - 10, value: peak, linear: true }, { frame: end, value: 0, linear: true },
];

// The light ignites at the seam between the rows and the clock cell and splits: the left
// edge wipes the rows open toward the outer edge, the right edge the clock cell. Content
// drifts with its edge, and text rises from the seam outward.
const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(LEFT_EDGE, X, SEAM, -8, WIPE_START, ROWS_WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, CELL_WIPE_END, EASE_WIPE),
  ...LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  { objectId: LEFT_LIGHT, propertyKey: OPACITY, keys: edgeFlare(24, 44) },
  { objectId: RIGHT_LIGHT, propertyKey: OPACITY, keys: edgeFlare(18, 38) },
  ...MARKERS.map((marker) => move(marker, SCALE_Y, 0, 1, 18, 38, EASE_OUT)),
  ...LOGOS.flatMap((logo) => [...scale(logo, 1.12, 1, 8, 48, EASE_OUT), move(logo, OPACITY, 0, 1, 8, 36, EASE_OUT)]),
  ...ROW_CONTENTS.map((content) => move(content, X, CONTENT_DRIFT, 0, 8, 44, EASE_OUT)),
  move(CELL.content, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  ...SCORE_REVEALS.flatMap((scoreReveal) => reveal(scoreReveal, 18, 46)),
  ...reveal(CELL.statusReveal, 20, 44),
  move(CELL.divider, SCALE_X, 0, 1, 16, 40, EASE_OUT),
  move(CELL.sponsorRise, Y, SPONSOR_Y + SPONSOR_DROP, SPONSOR_Y, 20, 44, EASE_OUT),
  move(CELL.sponsorRise, OPACITY, 0, 1, 22, 36, EASE_OUT),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  move(SWEEP, X, SWEEP_LEFT, SWEEP_RIGHT, 34, INTRO_FRAMES, EASE_SWEEP),
  { objectId: SWEEP, propertyKey: OPACITY, keys: sheen(34, INTRO_FRAMES, 0.65) },
];

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(LEFT_EDGE, X, -8),
  hold(RIGHT_EDGE, X, BLOCK_WIDTH + 8),
  ...LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  ...MARKERS.map((marker) => hold(marker, SCALE_Y, 1)),
  ...LOGOS.flatMap((logo) => [hold(logo, SCALE_X, 1), hold(logo, SCALE_Y, 1), hold(logo, OPACITY, 1)]),
  ...ROW_CONTENTS.map((content) => hold(content, X, 0)),
  hold(CELL.content, X, 0),
  ...settledRanges,
  hold(CELL.divider, SCALE_X, 1),
  hold(CELL.sponsorRise, Y, SPONSOR_Y),
  hold(CELL.sponsorRise, OPACITY, 1),
  hold(SHADOW, OPACITY, 0.6),
  hold(SWEEP, X, SWEEP_RIGHT),
  hold(SWEEP, OPACITY, 0),
];

// The edges close the glass toward the seam; the content drifts toward it.
const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(LEFT_EDGE, X, -8, SEAM, 2, OUTRO_FRAMES),
  closing(RIGHT_EDGE, X, BLOCK_WIDTH + 8, SEAM, 8, OUTRO_FRAMES),
  ...LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  ...MARKERS.map((marker) => closing(marker, SCALE_Y, 1, 0, 8, OUTRO_FRAMES)),
  ...LOGOS.flatMap((logo) => [
    closing(logo, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
    closing(logo, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
    closing(logo, OPACITY, 1, 0, 0, 20),
  ]),
  ...ROW_CONTENTS.map((content) => closing(content, X, 0, OUTRO_DRIFT, 0, OUTRO_FRAMES)),
  closing(CELL.content, X, 0, -OUTRO_DRIFT, 0, OUTRO_FRAMES),
  ...settledRanges,
  closing(CELL.divider, SCALE_X, 1, 0, 4, 20),
  closing(CELL.sponsorRise, Y, SPONSOR_Y, SPONSOR_Y + SPONSOR_DROP, 0, 18),
  closing(CELL.sponsorRise, OPACITY, 1, 0, 0, 16),
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  hold(SWEEP, X, SWEEP_RIGHT),
  hold(SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(SHADOW, OPACITY, 0),
  hold(SWEEP, OPACITY, 0),
];

/** A side's one-frame pose: the mirror, the counter-flips and the reveal directions. */
const sidePose = (side: Side): Track[] => [
  hold(SIDE, SCALE_X, SIDES[side].scaleX),
  ...FLIPS.map((flip) => hold(flip, SCALE_X, SIDES[side].scaleX)),
  ...revealStrengths(side).map(({ range, strength }) => hold(range, STRENGTH, strength)),
];

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
     (away over home: marker, logo, score) beside a dark-glass clock cell (status over the
     sponsor). Sibling draw order is front to back. -->
<Artboard name="Basketball Score to Break v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Score to Break v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<!-- Draws nothing. The Display layer keys its opacity with the glass's, and the bind writes
     it out (target to source) as _onScreen, so a host can tell when the outro has ended. -->
<Node name="Presence" id="${PRESENCE}" opacity="0"><DataBindContext sourcePathIds="${pathTo(ON_SCREEN)}" propertyKey="${OPACITY}" direction="true"/></Node>

<!-- The mirror: scaleX -1 (the Side layer) reflects the block about x ${PIVOT_X}. -->
<Node name="Side" id="${SIDE}" x="${PIVOT_X}" y="${BLOCK_Y}">
<Node name="Score to Break" id="${ROOT}" x="${BLOCK_X - PIVOT_X}" y="0">

<!-- Seam ignition between the rows and the clock cell; the edges wipe outward. -->
${edge('Left', LEFT_EDGE, LEFT_MASK, LEFT_LIGHT)}
${edge('Right', RIGHT_EDGE, RIGHT_MASK, RIGHT_LIGHT)}
${sweep}

<!-- ============================== Team rows ================================ -->
${TEAM_INDICES.map(teamRow).join('\n')}

<!-- ============================== Clock cell =============================== -->
${clockCell}

<!-- Separation from bright video: a feathered dark stroke around the block. -->
<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <Rectangle width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>
${silhouette}
</Node>
</Node>

<!-- Intro: seam ignition, outward glass wipes, rising type and one sheen; ${INTRO_FRAMES / 60} s.
     Hold and Outro explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Side layer: the left and right poses. They key only the Side node, the flips and the
     reveal strengths, none of which the Display layer touches. -->
${animation('Side Left', ID.left, 1, 'loop', sidePose('Left'))}

${animation('Side Right', ID.right, 1, 'loop', sidePose('Right'))}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses it
     (Outro then Hidden). Side: alignRight mirrors the block to the bottom right; it snaps,
     and the OGraf package changes it only off air. Both default off/left. -->
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
