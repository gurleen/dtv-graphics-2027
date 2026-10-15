/**
 * Generates the Burning Question lower third from one description:
 *
 *   bun graphics/basketball-v2/generate_burning_question.ts
 *
 * writes burning_question.rml beside this file. Edit this file, not the output.
 *
 * A trivia question presented by Steamfitters Local 420, in the bottom-right corner so it
 * can share the screen with the scorebug. The block mirrors the other lower thirds: it
 * stands on the right action-safe margin, its text is right-aligned, and the sponsor chip
 * and the team marker sit on its outer (right) edge. Its state machine has two layers:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *            It animates the shell: wipes, edge lights, drifts, the logos, shadow and
 *            sheen, and the rise of all three texts.
 *   Answer   Answer Hidden <-> Answer Shown, gated on `showAnswer`. On air it plays the
 *            reveal, in which the title and question lift to uncover the answer strip
 *            beneath them, so the block's foot stays on the scorebug's baseline, or the
 *            conceal; off air it switches instantly, so the intro builds whichever is set.
 *            It keys the lift and everything that follows it (the question's lower
 *            corners, the shadow, the silhouette and the edge-light spans), the answer's
 *            fade and its own sweep, so the layers never key the same property, except
 *            the answer's reveal range, which the reveal keys and the later layer wins.
 */

import { join } from 'node:path';

const PREFIX = 45;
const ARTBOARD_Y = 20600;

// Test data: a Drexel question, in Drexel's colours (see the package README).
const QUESTION = "WHAT DREXEL WOMEN'S BASKETBALL PLAYER SCORED HER 1000TH POINT IN THE 2013 WNIT CHAMPIONSHIP GAME?";
const ANSWER = 'TAYLOR WOOTTON';
const TEAM = { logoFile: 'assets/images/scorebug/drexel.png', logoName: 'Drexel', primary: 'FF07294D', secondary: 'FFFFC600' };
const SPONSOR = { name: 'Steamfitters Local 420', file: 'assets/images/sponsors/steamfitters_local_420_logo.png' };

// Geometry. The block stands on the right action-safe margin with its foot on the
// scorebug's baseline, clear of the scorebug (which ends at x 526). The root node is the
// block's top-left corner with the answer hidden; showing the answer lifts the title and
// question by LIFT, so the block grows upward.
const SAFE_RIGHT = 1920 - 96;
const FOOT_Y = 890 + 132;
const BLOCK_WIDTH = 760;
const BLOCK_X = SAFE_RIGHT - BLOCK_WIDTH;
const GAP = 4;
const TITLE_HEIGHT = 84;
const QUESTION_HEIGHT = 160;
const ANSWER_HEIGHT = 56;
const LIFT = ANSWER_HEIGHT + GAP;
const QUESTION_Y = TITLE_HEIGHT + GAP;
const HIDDEN_HEIGHT = QUESTION_Y + QUESTION_HEIGHT;
const SHOWN_HEIGHT = HIDDEN_HEIGHT + LIFT;
const BLOCK_Y = FOOT_Y - HIDDEN_HEIGHT;
// The strip never moves: with the answer hidden it lies behind the question panel's foot.
const ANSWER_Y = HIDDEN_HEIGHT - ANSWER_HEIGHT;
const CHIP_WIDTH = 112;
const TITLE_WIDTH = BLOCK_WIDTH - GAP - CHIP_WIDTH;
const CHIP_X = TITLE_WIDTH + GAP;
const SEAM = TITLE_WIDTH + GAP / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const TEXT_INSET = 24;
// The question and the answer share a right edge, inside the marker.
const TEXT_RIGHT = BLOCK_WIDTH - MARKER_WIDTH - TEXT_INSET;
const TITLE_SIZE = 54;
const TITLE_BASELINE = 60;
const QUESTION_SIZE = 40;
const QUESTION_TEXT_HEIGHT = 132;
const ANSWER_SIZE = 38;
const ANSWER_BASELINE = 40;
// The 1024 team logo as a large faded mark at the question panel's inner end.
const LOGO_X = 120;
const LOGO_SCALE = 0.36;
const LOGO_OPACITY = 0.16;
// The sponsor frame contains any sponsor image within the chip's padding.
const CHIP_PADDING = 6;
const FRAME_WIDTH = CHIP_WIDTH - 2 * CHIP_PADDING;
const FRAME_HEIGHT = TITLE_HEIGHT - 2 * CHIP_PADDING;
// Sweeps cross the glass right to left, mirroring the other lower thirds.
const SWEEP_LEFT = -120;
const SWEEP_RIGHT = BLOCK_WIDTH + 120;
const SWEEP_Y = (HIDDEN_HEIGHT - LIFT) / 2;

// The ignition and edge lights burn ember orange, a nod to the title; the sheen stays white.
const EMBER_LINE = 'F2FFB066';
const EMBER_GLOW = '4DFF7A1F';
const EMBER_GLOW_END = '00FF7A1F';

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const REVEAL_FRAMES = 36;
const CONCEAL_FRAMES = 24;
const WIPE_START = 6;
const LEFT_WIPE_END = 42;
const RIGHT_WIPE_END = 28;

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
const HEIGHT = 21;
const CORNER_BL = 162;
const CORNER_BR = 163;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const MODIFY_TO = 336;
const FALLOFF_FROM = 317;
const FALLOFF_TO = 318;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const LIFT_NODE = id(11);
const SHADOW = id(20);
const SHADOW_OUTLINE = id(21);
const TITLE_PANEL = id(100);
const TITLE_CONTENT = id(101);
const TITLE_REVEAL = id(102);
const TITLE_STYLE = id(104);
const CHIP_PANEL = id(150);
const CHIP_LOGO = id(151);
const SPONSOR_FRAME = id(152);
const SPONSOR_FRAME_STYLE = id(153);
const QUESTION_PANEL = id(200);
const QUESTION_CONTENT = id(201);
const QUESTION_REVEAL = id(202);
const QUESTION_STYLE = id(203);
const QUESTION_TINT = id(204);
const MARKER = id(205);
const TEAM_LOGO = id(206);
const QUESTION_GLAZE_PATH = id(207);
const QUESTION_TINT_PATH = id(208);
const QUESTION_UNDERLAY_PATH = id(209);
const ANSWER_STRIP = id(300);
const ANSWER_CONTENT = id(301);
const ANSWER_FADE = id(302);
const ANSWER_REVEAL = id(303);
const ANSWER_LABEL_STYLE = id(304);
const ANSWER_STYLE = id(305);
const ANSWER_MASK = id(306);
const LEFT_EDGE = id(500);
const LEFT_MASK = id(501);
const LEFT_SPAN = id(502);
const LEFT_LIGHT = id(503);
const RIGHT_EDGE = id(505);
const RIGHT_MASK = id(506);
const RIGHT_SPAN = id(507);
const RIGHT_LIGHT = id(508);
const INTRO_SWEEP = id(600);
const ANSWER_SWEEP = id(601);
const SILHOUETTE = id(610);
const SILHOUETTE_TITLE = id(611);
const SILHOUETTE_CHIP = id(612);
const SILHOUETTE_QUESTION = id(613);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const LOGO_ASSET = id(911);
const SPONSOR_ASSET = id(913);

// View model properties.
const P = {
  isPlaying: 1002, showAnswer: 1003,
  question: 1010, answer: 1011,
  teamLogo: 1020, teamPrimaryColor: 1021, teamSecondaryColor: 1022, sponsorLogo: 1023,
} as const;

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

/** `attributes` carries an id or a position for a rectangle that is keyed or placed. */
const rectangle = (width: number, height: number, radii: Radii, attributes = '') =>
  `<Rectangle${attributes} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const glaze = (name: string, width: number, height: number, radii: Radii, pathAttributes = '') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii, pathAttributes)}
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

// Text reveals. A forward range starts wholly before the first unit, a backward one
// wholly past the last, so nothing shows before its turn. The title and answer build from
// their last glyph, beside the seam; the question rises line by line from the top.
type Direction = 'forward' | 'backward';
const CHARACTERS = 1;
const LINES = 3;

const RANGE_AT_REST: Record<Direction, string> = {
  forward: 'modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"',
  backward: 'modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"',
};

const rise = (name: string, rangeId: string, direction: Direction, units = CHARACTERS) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="${units}" ${RANGE_AT_REST[direction]}/></TextModifierGroup>`;

// Corner radii: the block's outer corners take 12, every seam 3. The question panel's
// lower corners are outer corners until the answer strip opens beneath it.
const TITLE_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const CHIP_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const QUESTION_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];
const ANSWER_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];

/** Both leading edges' masks: a panel shows only between the two edges. */
const wipeClips = (name: string) =>
  `<ClippingShape name="${name} Left Wipe Clip" sourceId="${LEFT_MASK}"/><ClippingShape name="${name} Right Wipe Clip" sourceId="${RIGHT_MASK}"/>`;

// --- title row ------------------------------------------------------------------------

const titlePanel = `<Node name="Title Panel" id="${TITLE_PANEL}" x="0" y="0">
  ${wipeClips('Title')}
  <Node name="Title Content" id="${TITLE_CONTENT}" x="0" y="0">
  <!-- Fixed, all in Bold, set against the chip. -->
  <Text name="Title" x="${TEXT_INSET}" y="${TITLE_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${TITLE_WIDTH - 2 * TEXT_INSET}" height="64" sizingValue="fixed" overflowValue="fitFontSize" alignValue="right">
    <TextStylePaint id="${TITLE_STYLE}" fontAssetId="${FONT_BOLD}" fontSize="${TITLE_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
    <TextValueRun name="Title Value" styleId="${TITLE_STYLE}" text="THE BURNING QUESTION"></TextValueRun>
  ${rise('Title', TITLE_REVEAL, 'backward')}</Text>
  </Node>
  ${darkGlass('Title', TITLE_WIDTH, TITLE_HEIGHT, TITLE_RADII)}
</Node>`;

const chipPanel = `<Node name="Sponsor Chip" id="${CHIP_PANEL}" x="${CHIP_X}" y="0">
  ${wipeClips('Sponsor Chip')}
  <!-- The sponsor in full colour, centred so it settles in place. The frame contains any
       sponsor image within the chip's padding. Every layout component joins the artboard's
       flow through plain nodes, so the frame is pinned absolute; the pin, not x/y (which
       it adds to), places the frame within this node. -->
  <Node name="Sponsor Logo" id="${CHIP_LOGO}" x="${CHIP_WIDTH / 2}" y="${TITLE_HEIGHT / 2}">
    <LayoutComponent name="Sponsor Logo Frame" id="${SPONSOR_FRAME}" x="0" y="0" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" styleId="${SPONSOR_FRAME_STYLE}">
      <LayoutComponentStyle name="Sponsor Logo Frame Style" id="${SPONSOR_FRAME_STYLE}" positionTypeValue="absolute" positionLeft="${-FRAME_WIDTH / 2}" positionLeftUnitsValue="points" positionTop="${-FRAME_HEIGHT / 2}" positionTopUnitsValue="points"/>
      <Image name="Sponsor Logo Image" fit="contain" assetId="${SPONSOR_ASSET}">${bound(P.sponsorLogo, IMAGE)}</Image>
    </LayoutComponent>
  </Node>
  <Shape name="Sponsor Chip Plate" x="0" y="0">
    ${rectangle(CHIP_WIDTH, TITLE_HEIGHT, CHIP_RADII)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${TITLE_HEIGHT}"><GradientStop colorValue="FFFFFFFF" position="0"/><GradientStop colorValue="FFE9ECF0" position="1"/></LinearGradient></Fill>
  </Shape>
</Node>`;

// --- question panel -------------------------------------------------------------------

const questionPanel = `<Node name="Question Panel" id="${QUESTION_PANEL}" x="0" y="${QUESTION_Y}">
  ${wipeClips('Question')}
  <!-- On the outer edge. The tint clips it, so it takes the panel's corners as they change. -->
  <Shape name="Marker" id="${MARKER}" x="${BLOCK_WIDTH - MARKER_WIDTH}" y="0">
    <Rectangle width="${MARKER_WIDTH}" height="${QUESTION_HEIGHT}" originX="0" originY="0"/>
    <Fill><SolidColor colorValue="${TEAM.secondary}">${bound(P.teamSecondaryColor, COLOR)}</SolidColor></Fill>
    <ClippingShape name="Marker Clip" sourceId="${QUESTION_TINT}"/>
  </Shape>
  <Node name="Question Content" id="${QUESTION_CONTENT}" x="0" y="0">
  <!-- Up to three lines at full size, right-aligned and centred in the panel; longer copy
       shrinks to fit. A word is never broken. -->
  <Text name="Question" x="${TEXT_INSET}" y="${(QUESTION_HEIGHT - QUESTION_TEXT_HEIGHT) / 2}" originValue="top" wrapValue="wrap" wordBreakValue="normal" width="${TEXT_RIGHT - TEXT_INSET}" height="${QUESTION_TEXT_HEIGHT}" sizingValue="fixed" overflowValue="fitFontSize" alignValue="right" verticalAlignValue="middle"><TextStylePaint id="${QUESTION_STYLE}" fontAssetId="${FONT_BOLD}" fontSize="${QUESTION_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="Question Value" styleId="${QUESTION_STYLE}" text="${xml(QUESTION)}">${bound(P.question, TEXT)}</TextValueRun>${rise('Question', QUESTION_REVEAL, 'forward', LINES)}</Text>
  </Node>
  ${glaze('Question', BLOCK_WIDTH, QUESTION_HEIGHT, QUESTION_RADII, ` id="${QUESTION_GLAZE_PATH}"`)}
  <!-- The team logo as a large faded mark at the inner end, cropped by the panel. -->
  <Image name="Team Logo" id="${TEAM_LOGO}" x="${LOGO_X}" y="${QUESTION_HEIGHT / 2}" opacity="${LOGO_OPACITY}" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${LOGO_ASSET}">${bound(P.teamLogo, IMAGE)}<ClippingShape name="Team Logo Clip" sourceId="${QUESTION_TINT}"/></Image>
  <Shape name="Question Tint" id="${QUESTION_TINT}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(BLOCK_WIDTH, QUESTION_HEIGHT, QUESTION_RADII, ` id="${QUESTION_TINT_PATH}"`)}
    <Fill><SolidColor colorValue="${TEAM.primary}">${bound(P.teamPrimaryColor, COLOR)}</SolidColor></Fill>
  </Shape>
  <Shape name="Question Underlay" x="0" y="0">
    ${rectangle(BLOCK_WIDTH, QUESTION_HEIGHT, QUESTION_RADII, ` id="${QUESTION_UNDERLAY_PATH}"`)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
</Node>`;

// --- answer strip ---------------------------------------------------------------------

// The strip stands still at the block's foot. Its third clip rides with the question
// panel, its top edge one gap below the panel's foot, so the strip shows only where the
// lift has uncovered it.
const answerStrip = `<Node name="Answer Strip" id="${ANSWER_STRIP}" x="0" y="${ANSWER_Y}">
  ${wipeClips('Answer')}
  <ClippingShape name="Answer Lift Clip" sourceId="${ANSWER_MASK}"/>
  <Node name="Answer Content" id="${ANSWER_CONTENT}" x="0" y="0">
  <Node name="Answer Fade" id="${ANSWER_FADE}" x="0" y="0" opacity="0">
  <!-- A muted label, then the answer in the team's secondary colour, right-aligned with the question. -->
  <Text name="Answer" x="${TEXT_INSET}" y="${ANSWER_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${TEXT_RIGHT - TEXT_INSET}" height="46" sizingValue="fixed" overflowValue="fitFontSize" alignValue="right">
    <TextStylePaint id="${ANSWER_LABEL_STYLE}" fontAssetId="${FONT_REGULAR}" fontSize="24" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint>
    <TextStylePaint id="${ANSWER_STYLE}" fontAssetId="${FONT_BOLD}" fontSize="${ANSWER_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="${TEAM.secondary}">${bound(P.teamSecondaryColor, COLOR)}</SolidColor></Fill></TextStylePaint>
    <TextValueRun name="Answer Label" styleId="${ANSWER_LABEL_STYLE}" text="ANSWER"></TextValueRun>
    <TextValueRun name="Answer Gap" styleId="${ANSWER_LABEL_STYLE}" text="   "></TextValueRun>
    <TextValueRun name="Answer Value" styleId="${ANSWER_STYLE}" text="${xml(ANSWER)}">${bound(P.answer, TEXT)}</TextValueRun>
  ${rise('Answer', ANSWER_REVEAL, 'backward')}</Text>
  </Node>
  </Node>
  ${darkGlass('Answer', BLOCK_WIDTH, ANSWER_HEIGHT, ANSWER_RADII)}
</Node>`;

// --- leading edges, sweeps, silhouette ------------------------------------------------

// Each edge carries a mask (the left one reaches right of it, the right one left of it,
// so a panel shows between the two) and an ember light, drawn the height of the block
// with the answer hidden. The span node, keyed by the Answer layer, stretches the light
// over the taller block when the answer shows; the light node, keyed by the Display
// layer, ignites (scaleY from its centre) and fades.
const edge = (side: 'Left' | 'Right', edgeId: string, maskId: string, spanId: string, lightId: string) => {
  const left = side === 'Left';
  const glowToward = left ? 1 : -1;
  return `<Node name="${side} Leading Edge" id="${edgeId}" x="${left ? -8 : BLOCK_WIDTH + 8}">
  <Shape name="${side} Reveal Mask" id="${maskId}" y="${-LIFT - 8}"><Rectangle width="2400" height="${SHOWN_HEIGHT + 16}" originX="${left ? 0 : 1}" originY="0"/></Shape>
  <Node name="${side} Edge Span" id="${spanId}" y="${HIDDEN_HEIGHT / 2}">
    <Node name="${side} Edge Light" id="${lightId}" opacity="0">
      <Shape name="${side} Edge Line" y="${-HIDDEN_HEIGHT / 2}"><Rectangle width="2" height="${HIDDEN_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="${EMBER_LINE}"/></Fill></Shape>
      <Shape name="${side} Edge Glow" y="${-HIDDEN_HEIGHT / 2}"><Rectangle width="44" height="${HIDDEN_HEIGHT}" originX="${left ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="${EMBER_GLOW}" position="0"/><GradientStop colorValue="${EMBER_GLOW_END}" position="1"/></LinearGradient></Fill></Shape>
    </Node>
  </Node>
</Node>`;
};

// A sweep lights only glass that is open: the silhouette, between the leading edges, so
// an answer revealed during the intro cannot paint panels the wipe has not reached.
const sweep = (name: string, sweepId: string, peak: string) => `<Shape name="${name}" id="${sweepId}" x="${SWEEP_LEFT}" y="${SWEEP_Y}" rotation="-0.3490659" opacity="0">
  <Rectangle width="110" height="480"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="${peak}" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="${name} Silhouette Clip" sourceId="${SILHOUETTE}"/>
  ${wipeClips(name)}
</Shape>`;

// The panels' outline for the sweeps. The title, chip and question rectangles follow the
// lift; the answer strip's stands still and lies inside the question's while it is hidden.
const silhouette = `<Shape name="Block Silhouette" id="${SILHOUETTE}">
  ${rectangle(TITLE_WIDTH, TITLE_HEIGHT, TITLE_RADII, ` id="${SILHOUETTE_TITLE}" x="0" y="0"`)}
  ${rectangle(CHIP_WIDTH, TITLE_HEIGHT, CHIP_RADII, ` id="${SILHOUETTE_CHIP}" x="${CHIP_X}" y="0"`)}
  ${rectangle(BLOCK_WIDTH, QUESTION_HEIGHT, QUESTION_RADII, ` id="${SILHOUETTE_QUESTION}" x="0" y="${QUESTION_Y}"`)}
  ${rectangle(BLOCK_WIDTH, ANSWER_HEIGHT, ANSWER_RADII, ` x="0" y="${ANSWER_Y}"`)}
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

// A forward reveal moves the range's leading edge from before the first unit to past the
// last; a backward one moves its trailing edge from past the last to before the first.
const reveal = (rangeId: string, direction: Direction, start: number, end: number): Track[] => direction === 'forward'
  ? [move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT), move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT)]
  : [move(rangeId, MODIFY_TO, 1.4, 0, start, end, EASE_OUT), move(rangeId, FALLOFF_TO, 1, -0.4, start, end, EASE_OUT)];
const revealed = (rangeId: string, direction: Direction): Track[] => direction === 'forward'
  ? [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)]
  : [hold(rangeId, MODIFY_TO, 0), hold(rangeId, FALLOFF_TO, -0.4)];

const GROUPS = [TITLE_PANEL, CHIP_PANEL, QUESTION_PANEL, ANSWER_STRIP];
const LIGHTS = [LEFT_LIGHT, RIGHT_LIGHT];
const CONTENTS = [TITLE_CONTENT, QUESTION_CONTENT, ANSWER_CONTENT];
const RANGES: [string, Direction][] = [[TITLE_REVEAL, 'backward'], [QUESTION_REVEAL, 'forward'], [ANSWER_REVEAL, 'backward']];
const settledRanges = RANGES.flatMap(([range, direction]) => revealed(range, direction));

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

// The light ignites at the title/chip seam and splits: the left edge wipes the title,
// question and answer open toward the inner end, the right edge opens the chip and the
// question's outer end. Text rises from the seam outward.
const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(LEFT_EDGE, X, SEAM, -8, WIPE_START, LEFT_WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, RIGHT_WIPE_END, EASE_WIPE),
  ...LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  { objectId: LEFT_LIGHT, propertyKey: OPACITY, keys: edgeFlare(26, 48) },
  { objectId: RIGHT_LIGHT, propertyKey: OPACITY, keys: edgeFlare(16, 36) },
  move(MARKER, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...scale(TEAM_LOGO, 1.12, 1, 8, 48, EASE_OUT),
  move(TEAM_LOGO, OPACITY, 0, LOGO_OPACITY, 8, 36, EASE_OUT),
  ...CONTENTS.map((content) => move(content, X, CONTENT_DRIFT, 0, 8, 44, EASE_OUT)),
  ...scale(CHIP_LOGO, 1.12, 1, 10, 44, EASE_OUT),
  move(CHIP_LOGO, OPACITY, 0, 1, 10, 30, EASE_OUT),
  ...reveal(TITLE_REVEAL, 'backward', 14, 40),
  ...reveal(QUESTION_REVEAL, 'forward', 18, 50),
  ...reveal(ANSWER_REVEAL, 'backward', 22, 46),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  move(INTRO_SWEEP, X, SWEEP_RIGHT, SWEEP_LEFT, 34, INTRO_FRAMES, EASE_SWEEP),
  { objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: sheen(34, INTRO_FRAMES, 0.65) },
];

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(LEFT_EDGE, X, -8),
  hold(RIGHT_EDGE, X, BLOCK_WIDTH + 8),
  ...LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKER, SCALE_Y, 1),
  hold(TEAM_LOGO, SCALE_X, 1), hold(TEAM_LOGO, SCALE_Y, 1), hold(TEAM_LOGO, OPACITY, LOGO_OPACITY),
  ...CONTENTS.map((content) => hold(content, X, 0)),
  hold(CHIP_LOGO, SCALE_X, 1), hold(CHIP_LOGO, SCALE_Y, 1), hold(CHIP_LOGO, OPACITY, 1),
  ...settledRanges,
  hold(SHADOW, OPACITY, 0.6),
  hold(INTRO_SWEEP, X, SWEEP_LEFT),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(LEFT_EDGE, X, -8, SEAM, 2, OUTRO_FRAMES),
  closing(RIGHT_EDGE, X, BLOCK_WIDTH + 8, SEAM, 8, OUTRO_FRAMES),
  ...LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKER, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(TEAM_LOGO, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(TEAM_LOGO, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  closing(TEAM_LOGO, OPACITY, LOGO_OPACITY, 0, 0, 20),
  ...CONTENTS.map((content) => closing(content, X, 0, 18, 0, OUTRO_FRAMES)),
  closing(CHIP_LOGO, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(CHIP_LOGO, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  // The chip beside the seam is the last glass the right edge closes, so its logo holds
  // until the edge reaches it rather than leaving an empty plate.
  closing(CHIP_LOGO, OPACITY, 1, 0, 12, OUTRO_FRAMES),
  ...settledRanges,
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  hold(INTRO_SWEEP, X, SWEEP_LEFT),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(SHADOW, OPACITY, 0),
  hold(INTRO_SWEEP, OPACITY, 0),
];

// --- answer layer ---------------------------------------------------------------------

/** A property that follows the lift, at its value with the answer hidden and shown. */
type Lifted = { objectId: string; propertyKey: number; hidden: number; shown: number };

const LIFTED: Lifted[] = [
  { objectId: LIFT_NODE, propertyKey: Y, hidden: 0, shown: -LIFT },
  { objectId: SILHOUETTE_TITLE, propertyKey: Y, hidden: 0, shown: -LIFT },
  { objectId: SILHOUETTE_CHIP, propertyKey: Y, hidden: 0, shown: -LIFT },
  { objectId: SILHOUETTE_QUESTION, propertyKey: Y, hidden: QUESTION_Y, shown: QUESTION_Y - LIFT },
  { objectId: SHADOW_OUTLINE, propertyKey: Y, hidden: 0, shown: -LIFT },
  { objectId: SHADOW_OUTLINE, propertyKey: HEIGHT, hidden: HIDDEN_HEIGHT, shown: SHOWN_HEIGHT },
  ...[LEFT_SPAN, RIGHT_SPAN].flatMap((span): Lifted[] => [
    { objectId: span, propertyKey: Y, hidden: HIDDEN_HEIGHT / 2, shown: (HIDDEN_HEIGHT - LIFT) / 2 },
    { objectId: span, propertyKey: SCALE_Y, hidden: 1, shown: SHOWN_HEIGHT / HIDDEN_HEIGHT },
  ]),
];

// The question panel's lower corners: the block's outer corners while the answer is
// hidden, seams once the strip opens beneath them.
const CORNERS: Lifted[] = [QUESTION_GLAZE_PATH, QUESTION_TINT_PATH, QUESTION_UNDERLAY_PATH, SILHOUETTE_QUESTION].flatMap((path) =>
  [CORNER_BL, CORNER_BR].map((propertyKey) => ({ objectId: path, propertyKey, hidden: OUTER_RADIUS, shown: INNER_RADIUS })));

const answerPose = (shown: boolean): Track[] => [
  ...[...LIFTED, ...CORNERS].map((p) => hold(p.objectId, p.propertyKey, shown ? p.shown : p.hidden)),
  hold(ANSWER_FADE, OPACITY, shown ? 1 : 0),
  hold(ANSWER_SWEEP, X, SWEEP_RIGHT),
  hold(ANSWER_SWEEP, OPACITY, 0),
];

/**
 * The reveal, 0.6 s. The title and question lift, uncovering the strip from beneath; the
 * question's lower corners tighten to seams as the strip appears; the answer rises in
 * from its last glyph; and one light sweeps the glass.
 */
const answerReveal: Track[] = [
  ...LIFTED.map((p) => move(p.objectId, p.propertyKey, p.hidden, p.shown, 0, 24, EASE_OUT)),
  ...CORNERS.map((p) => move(p.objectId, p.propertyKey, p.hidden, p.shown, 0, 8, EASE_OUT)),
  hold(ANSWER_FADE, OPACITY, 1),
  ...reveal(ANSWER_REVEAL, 'backward', 8, 32),
  move(ANSWER_SWEEP, X, SWEEP_RIGHT, SWEEP_LEFT, 4, REVEAL_FRAMES, EASE_SWEEP),
  { objectId: ANSWER_SWEEP, propertyKey: OPACITY, keys: sheen(4, REVEAL_FRAMES, 0.8) },
];

/**
 * The conceal, 0.4 s: the answer fades, then the title and question settle back over the
 * strip. The glass stays on screen, so it lands with the intro's ease-out; an ease-in
 * would stop it dead at the baseline.
 */
const answerConceal: Track[] = [
  closing(ANSWER_FADE, OPACITY, 1, 0, 0, 10),
  ...LIFTED.map((p) => move(p.objectId, p.propertyKey, p.shown, p.hidden, 6, CONCEAL_FRAMES, EASE_OUT)),
  ...CORNERS.map((p) => move(p.objectId, p.propertyKey, p.shown, p.hidden, 10, CONCEAL_FRAMES, EASE_OUT)),
  hold(ANSWER_SWEEP, X, SWEEP_RIGHT),
  hold(ANSWER_SWEEP, OPACITY, 0),
];

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const isTrue = (property: number, value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(property, BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
const onAir = (value: 'equal' | 'notEqual') => isTrue(P.isPlaying, value);
const showsAnswer = (value: 'equal' | 'notEqual') => isTrue(P.showAnswer, value);

const ID = {
  hold: 30, intro: 31, outro: 32, hidden: 33, answerHidden: 34, answerShown: 35, reveal: 36, conceal: 37,
} as const;
const STATE = {
  hold: 40, intro: 41, outro: 42, hidden: 43, answerHidden: 44, answerShown: 45, reveal: 46, conceal: 47,
} as const;

const stateMachine = `<StateMachine name="Burning Question" id="${id(7)}">
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
<StateMachineLayer name="Answer">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.answerHidden)}"/></EntryState>
  <AnimationState x="180" y="0" id="${id(STATE.answerHidden)}" animationId="${id(ID.answerHidden)}">
    <StateTransition stateToId="${id(STATE.reveal)}" duration="0">${showsAnswer('equal')}${onAir('equal')}</StateTransition>
    <StateTransition stateToId="${id(STATE.answerShown)}" duration="0">${showsAnswer('equal')}${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="-120" id="${id(STATE.reveal)}" animationId="${id(ID.reveal)}" reset="true">
    <StateTransition stateToId="${id(STATE.answerShown)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.conceal)}" duration="0">${showsAnswer('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.answerShown)}" animationId="${id(ID.answerShown)}">
    <StateTransition stateToId="${id(STATE.conceal)}" duration="0">${showsAnswer('notEqual')}${onAir('equal')}</StateTransition>
    <StateTransition stateToId="${id(STATE.answerHidden)}" duration="0">${showsAnswer('notEqual')}${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="140" id="${id(STATE.conceal)}" animationId="${id(ID.conceal)}" reset="true">
    <StateTransition stateToId="${id(STATE.answerHidden)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.reveal)}" duration="0">${showsAnswer('equal')}</StateTransition>
  </AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const viewModelProperties = [
  `<ViewModelPropertyBoolean name="isPlaying" id="${id(P.isPlaying)}" componentProps="1"/>`,
  `<ViewModelPropertyBoolean name="showAnswer" id="${id(P.showAnswer)}" componentProps="1"/>`,
  `<ViewModelPropertyString name="question" id="${id(P.question)}" componentProps="1"/>`,
  `<ViewModelPropertyString name="answer" id="${id(P.answer)}" componentProps="1"/>`,
  `<ViewModelPropertyAssetImage name="teamLogo" id="${id(P.teamLogo)}" componentProps="1"/>`,
  `<ViewModelPropertyColor name="teamPrimaryColor" id="${id(P.teamPrimaryColor)}" componentProps="1"/>`,
  `<ViewModelPropertyColor name="teamSecondaryColor" id="${id(P.teamSecondaryColor)}" componentProps="1"/>`,
  `<ViewModelPropertyAssetImage name="sponsorLogo" id="${id(P.sponsorLogo)}" componentProps="1"/>`,
];

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.showAnswer)}" propertyValue="false"/>`,
  `<ViewModelInstanceString viewModelPropertyId="${id(P.question)}" propertyValue="${xml(QUESTION)}"/>`,
  `<ViewModelInstanceString viewModelPropertyId="${id(P.answer)}" propertyValue="${xml(ANSWER)}"/>`,
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(P.teamLogo)}" propertyValue="${LOGO_ASSET}"/>`,
  `<ViewModelInstanceColor viewModelPropertyId="${id(P.teamPrimaryColor)}" propertyValue="${TEAM.primary}"/>`,
  `<ViewModelInstanceColor viewModelPropertyId="${id(P.teamSecondaryColor)}" propertyValue="${TEAM.secondary}"/>`,
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(P.sponsorLogo)}" propertyValue="${SPONSOR_ASSET}"/>`,
];

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_burning_question.ts; edit that file, not this one.
     Basketball Burning Question v2, presented by Steamfitters Local 420: a trivia question
     in the bottom-right corner of a transparent 1920 x 1080 canvas, ${BLOCK_WIDTH} wide, its right edge on
     the action-safe margin (x ${SAFE_RIGHT}) and its foot on the scorebug's baseline (y ${FOOT_Y}), so
     the two can share the screen. A title row (the fixed title on dark glass, the sponsor on a
     white chip at the outer end) over the question on team-tinted glass, and an answer strip
     the view model's showAnswer opens beneath them: ${HIDDEN_HEIGHT} high with the answer hidden
     (origin ${BLOCK_X}, ${BLOCK_Y}), ${SHOWN_HEIGHT} with it shown. Sibling draw order is front to back;
     within one shape the last paint declared is on top. -->
<Artboard name="Basketball Burning Question v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Burning Question v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Burning Question" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition between the title and the chip; the edges wipe outward. -->
${edge('Left', LEFT_EDGE, LEFT_MASK, LEFT_SPAN, LEFT_LIGHT)}
${edge('Right', RIGHT_EDGE, RIGHT_MASK, RIGHT_SPAN, RIGHT_LIGHT)}
${sweep('Glass Specular Sweep', INTRO_SWEEP, '20FFFFFF')}
${sweep('Answer Sweep', ANSWER_SWEEP, '2EFFFFFF')}

<!-- ============================== Lift ===================================== -->
<!-- The title row and the question, raised by ${LIFT} while the answer shows. -->
<Node name="Lift" id="${LIFT_NODE}" x="0" y="0">
${titlePanel}
${chipPanel}
${questionPanel}
<Shape name="Answer Reveal Mask" id="${ANSWER_MASK}" x="-40" y="${HIDDEN_HEIGHT + GAP}"><Rectangle width="${BLOCK_WIDTH + 80}" height="400" originX="0" originY="0"/></Shape>
</Node>

<!-- ============================== Answer =================================== -->
${answerStrip}

<!-- Separation from bright video: a feathered dark stroke around the block, its top
     following the lift. -->
<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <Rectangle id="${SHADOW_OUTLINE}" width="${BLOCK_WIDTH}" height="${HIDDEN_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>
${silhouette}
</Node>

<!-- Intro: seam ignition, outward glass wipes, rising type and one sheen; ${INTRO_FRAMES / 60} s.
     Hold and Outro explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Answer layer: the two resting poses, the reveal (${REVEAL_FRAMES / 60} s) and the conceal (${CONCEAL_FRAMES / 60} s). -->
${animation('Answer Hidden', ID.answerHidden, 1, 'loop', answerPose(false))}

${animation('Answer Shown', ID.answerShown, 1, 'loop', answerPose(true))}

${animation('Answer Reveal', ID.reveal, REVEAL_FRAMES, 'oneShot', answerReveal)}

${animation('Answer Conceal', ID.conceal, CONCEAL_FRAMES, 'oneShot', answerConceal)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Answer: showAnswer true opens the answer strip, false closes
     it; on air the change animates, off air it is immediate. Both default false. -->
${stateMachine}
</Artboard>

<FontAsset name="Burning Question v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Burning Question v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Burning Question v2 ${TEAM.logoName}" id="${LOGO_ASSET}" file="${TEAM.logoFile}"/>
<ImageAsset name="Burning Question v2 ${SPONSOR.name}" id="${SPONSOR_ASSET}" file="${SPONSOR.file}"/>

<ViewModel name="BasketballBurningQuestionV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'burning_question.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
