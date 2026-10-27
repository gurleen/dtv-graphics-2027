/**
 * Generates the Team lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_team_lower_third.ts
 *
 * writes team_lower_third.rml beside this file. Edit this file, not the output.
 *
 * The staff lower third's counterpart for a team as a whole: the same block, panels and
 * intro/outro, with the person's name replaced by the school and mascot and the title
 * strip replaced by a body of one of two modes, chosen by `bodyMode`:
 *
 *   STATS  up to four cells, each a value followed by a muted label on one line; a blank
 *          value hides its cell and the rest re-space evenly across the strip.
 *   TEXT   one line of copy, shrunk to fit when longer.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro, gated on
 * `isPlaying`). The cell layout, the mode crossfade and the cell dividers are computed by
 * team_lower_third_controller.luau, which writes the `_`-prefixed view model properties
 * bound below.
 */

import { join } from 'node:path';

const PREFIX = 40;
const ARTBOARD_Y = 14600;

// Test data: the Drexel Dragons (see the package README).
const TEAM = {
  school: 'DREXEL', mascot: 'DRAGONS', logoFile: 'assets/images/scorebug/drexel.png',
  primary: 'FF07294D', secondary: 'FFFFC600',
  text: 'PICKED THIRD IN THE CAA PRESEASON POLL',
};
const STATS = [
  { value: '14-3', label: 'OVERALL' },
  { value: '8-1', label: 'CAA' },
  { value: '78.4', label: 'PPG' },
  { value: '66.9', label: 'OPP PPG' },
];
const CELL_COUNT = STATS.length;

// Geometry. Centred at the bottom of the frame on the scorebug's baseline, 820 wide so it
// keeps 24 clear of the scorebug (right edge x 526).
const BLOCK_X = 550;
const BLOCK_Y = 890;
const GAP = 4;
const LOGO_SIZE = 132;
const NAME_HEIGHT = 84;
const BODY_HEIGHT = 44;
const BLOCK_HEIGHT = NAME_HEIGHT + GAP + BODY_HEIGHT;
const COLUMN_X = LOGO_SIZE + GAP;
const COLUMN_WIDTH = 684;
const BLOCK_WIDTH = COLUMN_X + COLUMN_WIDTH;
const BODY_Y = NAME_HEIGHT + GAP;
const SEAM = LOGO_SIZE + GAP / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const TEXT_INSET = 24;
const CELL_INSET = 12;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;
const CELL_WIDTH = COLUMN_WIDTH / CELL_COUNT;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const LOGO_WIPE_END = 36;
const COLUMN_WIPE_END = 40;
const WIPE_START = 6;

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
const TEXT_WIDTH = 285;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const LOGO_PANEL = id(100);
const MARKER = id(101);
const LOGO_TINT = id(130);
const LOGO_GROUP = id(140);
const LOGO_BLOOM = id(154);
const NAME_PANEL = id(200);
const NAME_CONTENT = id(210);
const NAME_REVEAL = id(242);
const NAME_TINT = id(230);
const BODY = id(300);
const BODY_SLIDE = id(310);
const STATS_NODE = id(320);
const COPY_NODE = id(330);
const COPY_REVEAL = id(340);
const LOGO_EDGE = id(500);
const LOGO_MASK = id(501);
const LOGO_EDGE_LIGHT = id(502);
const NAME_EDGE = id(505);
const NAME_MASK = id(506);
const NAME_EDGE_LIGHT = id(507);
const INTRO_SWEEP = id(600);
const SILHOUETTE = id(610);
const BODY_MASK = id(620);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const LOGO_ASSET = id(911);
const CONTROLLER_ASSET = id(950);

// Per-cell elements, 3000 + 100 per cell.
const cell = (index: number) => {
  const base = 3000 + index * 100;
  return {
    index, node: id(base), divider: id(base + 1),
    valueStyle: id(base + 2), gapStyle: id(base + 3), labelStyle: id(base + 4), reveal: id(base + 5),
  };
};
const CELLS = Array.from({ length: CELL_COUNT }, (_, index) => cell(index));

// View model properties. Underscored ones are written by the controller script; operators
// never set them.
const P = {
  isPlaying: 1002, bodyMode: 1003,
  school: 1010, mascot: 1011, bodyText: 1012,
  teamLogo: 1021, teamPrimaryColor: 1022, teamSecondaryColor: 1023,
  statValue: (index: number) => 1030 + index * 2,
  statLabel: (index: number) => 1031 + index * 2,
  statX: (index: number) => 1050 + index * 5,
  statWidth: (index: number) => 1051 + index * 5,
  statOpacity: (index: number) => 1052 + index * 5,
  statDivider: (index: number) => 1053 + index * 5,
  statGap: (index: number) => 1054 + index * 5,
  statsOpacity: 1080, textOpacity: 1081,
} as const;

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

const rectangle = (width: number, height: number, radii: Radii, position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF', bottom = '4D000000') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="${bottom}" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
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

// Corner radii: the block's outer corners take 12, every seam 3.
const LOGO_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS];
const NAME_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const BODY_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS];

// --- logo panel -----------------------------------------------------------------------

// The logo box is 118 units square (the 1024 source at 0.115), so a logo draws at about
// 84. The group is centred right of the marker so it scales in place; the bloom is a soft
// light behind it, as if the glass were lit from behind.
const logoPanel = `<Node name="Logo Panel" id="${LOGO_PANEL}" x="0" y="0">
  <ClippingShape name="Logo Reveal Clip" sourceId="${LOGO_MASK}"/>
  <Shape name="Logo Marker" id="${MARKER}" x="0" y="0">
    ${rectangle(MARKER_WIDTH, LOGO_SIZE, [OUTER_RADIUS, 0, OUTER_RADIUS, 0])}
    <Fill><SolidColor colorValue="${TEAM.secondary}">${bound(P.teamSecondaryColor, COLOR)}</SolidColor></Fill>
  </Shape>
  ${glaze('Logo', LOGO_SIZE, LOGO_SIZE, LOGO_RADII)}
  <Node name="Logo Group" id="${LOGO_GROUP}" x="70" y="${LOGO_SIZE / 2}">
    <Image name="Team Logo" x="0" y="0" scaleX="0.115" scaleY="0.115" assetId="${LOGO_ASSET}">${bound(P.teamLogo, IMAGE)}</Image>
  </Node>
  <Shape name="Logo Bloom" id="${LOGO_BLOOM}" x="70" y="${LOGO_SIZE / 2}">
    <Ellipse width="176" height="176"/>
    <Fill><RadialGradient startX="0" startY="0" endX="88" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="Logo Bloom Clip" sourceId="${LOGO_TINT}"/>
  </Shape>
  ${teamTint('Logo Tint', LOGO_TINT, LOGO_SIZE, LOGO_SIZE, LOGO_RADII)}
  ${underlay('Logo Underlay', LOGO_SIZE, LOGO_SIZE, LOGO_RADII)}
</Node>`;

// --- name panel -----------------------------------------------------------------------

// School in Regular (slightly muted), mascot in Bold, on one line that shrinks to fit.
const namePanel = `<Node name="Name Panel" id="${NAME_PANEL}" x="${COLUMN_X}" y="0">
  <ClippingShape name="Name Reveal Clip" sourceId="${NAME_MASK}"/>
  <Node name="Name Content" id="${NAME_CONTENT}">
  <Text name="Team Name" x="${TEXT_INSET}" y="60" originValue="baseline" wrapValue="noWrap" width="${COLUMN_WIDTH - 2 * TEXT_INSET}" height="60" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${id(222)}" fontAssetId="${FONT_REGULAR}" fontSize="54" letterSpacing="0.5"><Fill><SolidColor colorValue="D9FFFFFF"/></Fill></TextStylePaint><TextStylePaint id="${id(223)}" fontAssetId="${FONT_BOLD}" fontSize="54" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="School Value" styleId="${id(222)}" text="${TEAM.school}">${bound(P.school, TEXT)}</TextValueRun><TextValueRun name="Name Gap" styleId="${id(222)}" text=" "></TextValueRun><TextValueRun name="Mascot Value" styleId="${id(223)}" text="${TEAM.mascot}">${bound(P.mascot, TEXT)}</TextValueRun>${rise('Name', NAME_REVEAL)}</Text>
  </Node>
  ${glaze('Name', COLUMN_WIDTH, NAME_HEIGHT, NAME_RADII)}
  ${teamTint('Name Tint', NAME_TINT, COLUMN_WIDTH, NAME_HEIGHT, NAME_RADII)}
  ${underlay('Name Underlay', COLUMN_WIDTH, NAME_HEIGHT, NAME_RADII)}
</Node>`;

// --- body strip -----------------------------------------------------------------------

// One dark glass panel under every cell. A cell is a value then a muted label, centred in
// its slot; the controller writes the slot's x, the text width, the opacity, the gap
// between value and label (empty when the label is blank) and whether the divider on the
// slot's left edge shows (every shown cell but the first).
const statCell = (c: (typeof CELLS)[number]) => {
  const label = `Stat ${c.index + 1}`;
  return `<Node name="${label} Cell" id="${c.node}" x="${c.index * CELL_WIDTH}" y="0">${bound(P.statX(c.index), X)}${bound(P.statOpacity(c.index), OPACITY)}
    <Text name="${label} Line" x="${CELL_INSET}" y="32" originValue="baseline" wrapValue="noWrap" width="${CELL_WIDTH - 2 * CELL_INSET}" height="34" sizingValue="fixed" overflowValue="fitFontSize" alignValue="center">${bound(P.statWidth(c.index), TEXT_WIDTH)}<TextStylePaint id="${c.valueStyle}" fontAssetId="${FONT_BOLD}" fontSize="28" letterSpacing="1"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextStylePaint id="${c.gapStyle}" fontAssetId="${FONT_REGULAR}" fontSize="22" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint><TextStylePaint id="${c.labelStyle}" fontAssetId="${FONT_REGULAR}" fontSize="22" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint><TextValueRun name="${label} Value" styleId="${c.valueStyle}" text="${STATS[c.index]!.value}">${bound(P.statValue(c.index), TEXT)}</TextValueRun><TextValueRun name="${label} Gap" styleId="${c.gapStyle}" text="  ">${bound(P.statGap(c.index), TEXT)}</TextValueRun><TextValueRun name="${label} Label" styleId="${c.labelStyle}" text="${STATS[c.index]!.label}">${bound(P.statLabel(c.index), TEXT)}</TextValueRun>${rise(`${label} Line`, c.reveal)}</Text>
    <Shape name="${label} Divider" id="${c.divider}" x="0" y="10">${bound(P.statDivider(c.index), OPACITY)}
      <Rectangle width="1" height="24" originX="0" originY="0"/>
      <Fill><SolidColor colorValue="33FFFFFF"/></Fill>
    </Shape>
  </Node>`;
};

const body = `<Node name="Body Strip" id="${BODY}" x="${COLUMN_X}" y="${BODY_Y}">
  <ClippingShape name="Body Reveal Clip" sourceId="${BODY_MASK}"/>
  <Node name="Body Sliding Content" id="${BODY_SLIDE}">
  <Node name="Stats" id="${STATS_NODE}" x="0" y="0">${bound(P.statsOpacity, OPACITY)}
${CELLS.map(statCell).join('\n')}
  </Node>
  <Node name="Copy" id="${COPY_NODE}" x="0" y="0" opacity="0">${bound(P.textOpacity, OPACITY)}
  <Text name="Body Copy" x="${TEXT_INSET}" y="32" originValue="baseline" wrapValue="noWrap" width="${COLUMN_WIDTH - 2 * TEXT_INSET}" height="34" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${id(305)}" fontAssetId="${FONT_BOLD}" fontSize="28" letterSpacing="1"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="Body Copy Value" styleId="${id(305)}" text="${TEAM.text}">${bound(P.bodyText, TEXT)}</TextValueRun>${rise('Body Copy', COPY_REVEAL)}</Text>
  </Node>
  ${glaze('Body', COLUMN_WIDTH, BODY_HEIGHT, BODY_RADII, '59FFFFFF', '40000000')}
  <Shape name="Body Panel" x="0" y="0">
    ${rectangle(COLUMN_WIDTH, BODY_HEIGHT, BODY_RADII)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>
  </Node>
</Node>`;

const silhouette = [
  rectangle(LOGO_SIZE, LOGO_SIZE, LOGO_RADII, ' x="0" y="0"'),
  rectangle(COLUMN_WIDTH, NAME_HEIGHT, NAME_RADII, ` x="${COLUMN_X}" y="0"`),
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

const RANGES = [NAME_REVEAL, COPY_REVEAL, ...CELLS.map((c) => c.reveal)];
const GROUPS = [LOGO_PANEL, NAME_PANEL, BODY];
const EDGE_LIGHTS = [LOGO_EDGE_LIGHT, NAME_EDGE_LIGHT];

const edgeFlare: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: 18, value: 1, ease: EASE_OUT }, { frame: 40, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];

const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(LOGO_EDGE, X, SEAM, -8, WIPE_START, LOGO_WIPE_END, EASE_WIPE),
  move(NAME_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, COLUMN_WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  ...EDGE_LIGHTS.map((light): Track => ({ objectId: light, propertyKey: OPACITY, keys: edgeFlare })),
  move(MARKER, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  move(LOGO_GROUP, SCALE_X, 1.12, 1, 8, 48, EASE_OUT),
  move(LOGO_GROUP, SCALE_Y, 1.12, 1, 8, 48, EASE_OUT),
  move(LOGO_GROUP, OPACITY, 0, 1, 8, 30, EASE_OUT),
  move(LOGO_BLOOM, SCALE_X, 0.7, 1, 10, 50, EASE_OUT),
  move(LOGO_BLOOM, SCALE_Y, 0.7, 1, 10, 50, EASE_OUT),
  move(LOGO_BLOOM, OPACITY, 0, 1, 10, 44, EASE_OUT),
  move(NAME_CONTENT, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  move(BODY_SLIDE, Y, -BODY_HEIGHT, 0, 22, 46, EASE_OUT),
  ...reveal(NAME_REVEAL, 20, 44),
  ...reveal(COPY_REVEAL, 28, 46),
  ...CELLS.flatMap((c) => reveal(c.reveal, 28 + c.index * 3, 46 + c.index * 3)),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, 34, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: 34, value: 0, linear: true }, { frame: 40, value: 0.65, linear: true },
      { frame: 62, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
    ],
  },
];

const settledRanges = RANGES.flatMap(revealed);

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(LOGO_EDGE, X, -8),
  hold(NAME_EDGE, X, BLOCK_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKER, SCALE_Y, 1),
  hold(LOGO_GROUP, SCALE_X, 1), hold(LOGO_GROUP, SCALE_Y, 1), hold(LOGO_GROUP, OPACITY, 1),
  hold(LOGO_BLOOM, SCALE_X, 1), hold(LOGO_BLOOM, SCALE_Y, 1), hold(LOGO_BLOOM, OPACITY, 1),
  hold(NAME_CONTENT, X, 0),
  hold(BODY_SLIDE, Y, 0),
  ...settledRanges,
  hold(INTRO_SWEEP, X, SWEEP_END),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(LOGO_EDGE, X, -8, SEAM, 4, OUTRO_FRAMES),
  closing(NAME_EDGE, X, BLOCK_WIDTH + 8, SEAM, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKER, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, OPACITY, 1, 0, 0, 20),
  hold(LOGO_BLOOM, SCALE_X, 1), hold(LOGO_BLOOM, SCALE_Y, 1),
  closing(LOGO_BLOOM, OPACITY, 1, 0, 0, 20),
  closing(NAME_CONTENT, X, 0, -18, 0, OUTRO_FRAMES),
  closing(BODY_SLIDE, Y, 0, -BODY_HEIGHT, 0, 18),
  ...settledRanges,
  hold(INTRO_SWEEP, X, SWEEP_END),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
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

const stateMachine = `<StateMachine name="Team Lower Third" id="${id(7)}">
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
  string('school', P.school),
  string('mascot', P.mascot),
  string('bodyText', P.bodyText),
  image('teamLogo', P.teamLogo),
  color('teamPrimaryColor', P.teamPrimaryColor),
  color('teamSecondaryColor', P.teamSecondaryColor),
  ...CELLS.flatMap((c) => [string(`stat${c.index + 1}Value`, P.statValue(c.index)), string(`stat${c.index + 1}Label`, P.statLabel(c.index))]),
  ...CELLS.flatMap((c) => [
    number(`_stat${c.index + 1}X`, P.statX(c.index)),
    number(`_stat${c.index + 1}Width`, P.statWidth(c.index)),
    number(`_stat${c.index + 1}Opacity`, P.statOpacity(c.index)),
    number(`_stat${c.index + 1}Divider`, P.statDivider(c.index)),
    string(`_stat${c.index + 1}Gap`, P.statGap(c.index)),
  ]),
  number('_statsOpacity', P.statsOpacity),
  number('_textOpacity', P.textOpacity),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const numberValue = (local: number, value: number) => `<ViewModelInstanceNumber viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.bodyMode, 'STATS'),
  stringValue(P.school, TEAM.school),
  stringValue(P.mascot, TEAM.mascot),
  stringValue(P.bodyText, TEAM.text),
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(P.teamLogo)}" propertyValue="${LOGO_ASSET}"/>`,
  `<ViewModelInstanceColor viewModelPropertyId="${id(P.teamPrimaryColor)}" propertyValue="${TEAM.primary}"/>`,
  `<ViewModelInstanceColor viewModelPropertyId="${id(P.teamSecondaryColor)}" propertyValue="${TEAM.secondary}"/>`,
  ...CELLS.flatMap((c) => [stringValue(P.statValue(c.index), STATS[c.index]!.value), stringValue(P.statLabel(c.index), STATS[c.index]!.label)]),
  ...CELLS.flatMap((c) => [
    numberValue(P.statX(c.index), c.index * CELL_WIDTH),
    numberValue(P.statWidth(c.index), CELL_WIDTH - 2 * CELL_INSET),
    numberValue(P.statOpacity(c.index), 1),
    numberValue(P.statDivider(c.index), c.index === 0 ? 0 : 1),
    stringValue(P.statGap(c.index), '  '),
  ]),
  numberValue(P.statsOpacity, 1),
  numberValue(P.textOpacity, 0),
];

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1, height: number) => `<Node name="${name} Edge Light" id="${lightId}" y="${height / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${height / 2}"><Rectangle width="2" height="${height}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${height / 2}"><Rectangle width="44" height="${height}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_team_lower_third.ts; edit that file, not this one.
     Basketball team lower third v2: a tinted-glass block, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, centred at the
     bottom of a transparent 1920 x 1080 canvas (origin ${BLOCK_X}, ${BLOCK_Y}), on the same baseline as the
     scorebug. Team logo panel on the left; the name panel (school and mascot on one line) and
     the dark glass body strip (stat cells or a line of copy) stack to its right. For a team as a
     whole. Sibling draw order is front to back; within one shape the last paint declared is on
     top. -->
<Artboard name="Basketball Team Lower Third v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Team Lower Third v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- Lays out the stat cells, crossfades the body mode and sets the cell dividers. -->
<ScriptedDrawable name="Team Lower Third Controller" scriptAssetId="${CONTROLLER_ASSET}"/>

<Node name="Lower Third" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition, outward reveal edges and a finishing glass sheen. -->
<Node name="Logo Leading Edge" id="${LOGO_EDGE}" x="-8">
  <Shape name="Logo Reveal Mask" id="${LOGO_MASK}" y="-8"><Rectangle width="900" height="${BLOCK_HEIGHT + 16}" originX="0" originY="0"/></Shape>
  ${edgeLight('Logo', LOGO_EDGE_LIGHT, 1, LOGO_SIZE)}
</Node>
<Node name="Name Leading Edge" id="${NAME_EDGE}" x="${BLOCK_WIDTH + 8}">
  <Shape name="Name Reveal Mask" id="${NAME_MASK}" y="-8"><Rectangle width="900" height="${NAME_HEIGHT + 16}" originX="1" originY="0"/></Shape>
  ${edgeLight('Name', NAME_EDGE_LIGHT, -1, NAME_HEIGHT)}
</Node>
<Shape name="Glass Specular Sweep" id="${INTRO_SWEEP}" x="${SWEEP_END}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="340"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>

<!-- ============================== Logo panel ============================== -->
${logoPanel}

<!-- ============================== Name panel ============================== -->
${namePanel}

<!-- ============================== Body strip ============================== -->
${body}

<Shape name="Block Silhouette" id="${SILHOUETTE}">${silhouette}</Shape>
<Shape name="Body Slide Mask" id="${BODY_MASK}" x="${COLUMN_X}" y="${BODY_Y}"><Rectangle width="${COLUMN_WIDTH}" height="${BODY_HEIGHT}" originX="0" originY="0"/></Shape>
</Node>

<!-- Intro: seam ignition, outward glass wipes, a body strip sliding out from under the name
     panel, rising type and one sheen; ${INTRO_FRAMES / 60} s. Hold and Outro explicitly restore every
     animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- isPlaying drives the graphic: true takes it on air (Intro then Hold), false
     dismisses it (Outro then Hidden). It defaults to false, so nothing shows
     until the host raises it. -->
${stateMachine}
</Artboard>

<FontAsset name="Team Lower Third v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Team Lower Third v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Team Lower Third v2 Drexel" id="${LOGO_ASSET}" file="${TEAM.logoFile}"/>
<ScriptAsset name="team_lower_third_controller" folderPath="graphics/basketball-v2" id="${CONTROLLER_ASSET}" file="graphics/basketball-v2/team_lower_third_controller.luau"/>

<ViewModel name="BasketballTeamLowerThirdV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'team_lower_third.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
