/**
 * Generates the halftime adjustments lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_halftime_adjustments.ts
 *
 * writes halftime_adjustments.rml beside this file. Edit this file, not the output.
 *
 * The graphic shows one team's two halftime adjustments at a time and changes team without
 * leaving air, as the starting five lower third does. It takes the Burning Question's form,
 * mirrored onto the left action-safe margin: a title row (the sponsor chip on the outer
 * edge, the fixed title on dark glass) over a team-tinted panel, its text left-aligned and
 * the team marker on the panel's outer (left) edge. Its state machine has two layers:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *            It animates the shell: wipes, edge lights, drifts, the logos, shadow and
 *            sheen, and the rise of both teams' text.
 *   Team     Away Shown <-> Home Shown, gated on `step` (0 = away, 1 = home). On air it
 *            plays a change animation; off air it switches instantly. It animates only
 *            the per-team nodes (team name, lines, tint, marker, logo), so the layers never
 *            key the same property, except the text reveal ranges, which the change
 *            animations key and the later layer wins.
 */

import { join } from 'node:path';

const PREFIX = 44;
const ARTBOARD_Y = 19400;

type Team = {
  key: 'away' | 'home';
  title: 'Away' | 'Home';
  school: string;
  mascot: string;
  logoFile: string;
  logoName: string;
  primary: string;
  secondary: string;
  lines: readonly [string, string];
};

// Test data: the Drexel Dragons at home (see the package README), Saint Joseph's away.
const TEAMS: readonly Team[] = [
  {
    key: 'away', title: 'Away', school: "SAINT JOSEPH'S", mascot: 'HAWKS',
    logoFile: 'assets/images/scorebug/saint-josephs.png', logoName: "Saint Joseph's",
    primary: 'FFC2071B', secondary: 'FFA7A9AC',
    lines: ['PUSH THE PACE IN TRANSITION', 'LIMIT SECOND-CHANCE POINTS'],
  },
  {
    key: 'home', title: 'Home', school: 'DREXEL', mascot: 'DRAGONS',
    logoFile: 'assets/images/scorebug/drexel.png', logoName: 'Drexel',
    primary: 'FF07294D', secondary: 'FFFFC600',
    lines: ['ATTACK THE PAINT EARLY', 'CLOSE OUT ON THREE-POINT SHOOTERS'],
  },
];
const LINE_COUNT = 2;

// Geometry. The block sits in the scorebug's corner (it is never on air with the bug):
// left on the action-safe margin, its foot on the lower thirds' foot (890 + 132). The
// sponsor chip is on the outer (left) end of the title row, the title beside it.
const BLOCK_X = 96;
const FOOT_Y = 890 + 132;
const BLOCK_WIDTH = 760;
const GAP = 4;
const TITLE_HEIGHT = 84;
const PANEL_HEIGHT = 172;
const PANEL_Y = TITLE_HEIGHT + GAP;
const BLOCK_HEIGHT = PANEL_Y + PANEL_HEIGHT;
const BLOCK_Y = FOOT_Y - BLOCK_HEIGHT;
const CHIP_WIDTH = 112;
const TITLE_X = CHIP_WIDTH + GAP;
const TITLE_WIDTH = BLOCK_WIDTH - TITLE_X;
const SEAM = CHIP_WIDTH + GAP / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const TEXT_INSET = 24;
// The team name and the lines share a left edge, inside the marker.
const TEXT_LEFT = MARKER_WIDTH + TEXT_INSET;
const TEXT_RIGHT = BLOCK_WIDTH - TEXT_INSET;
const TITLE_SIZE = 54;
const TITLE_BASELINE = 60;
const TEAM_BASELINE = 48;
const BULLET_X = TEXT_LEFT + 6;
const LINE_TEXT_X = TEXT_LEFT + 26;
const LINE_BASELINES = [102, 150] as const;
const LINE_SIZE = 40;
const CHANGE_RISE = 14;
// The 1024 team logo as a large faded mark at the panel's inner end.
const LOGO_X = BLOCK_WIDTH - 120;
const LOGO_SCALE = 0.36;
const LOGO_OPACITY = 0.16;
// The sponsor frame contains any sponsor image within the chip's padding.
const CHIP_PADDING = 6;
const FRAME_WIDTH = CHIP_WIDTH - 2 * CHIP_PADDING;
const FRAME_HEIGHT = TITLE_HEIGHT - 2 * CHIP_PADDING;
// Sweeps cross the glass left to right, away from the outer edge.
const SWEEP_LEFT = -120;
const SWEEP_RIGHT = BLOCK_WIDTH + 120;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const CHANGE_FRAMES = 48;
const WIPE_START = 6;
const LEFT_WIPE_END = 28;
const RIGHT_WIPE_END = 42;
const CHANGE_STAGGER = 6;

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
const NUMBER = 636;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const SHADOW = id(20);
const TITLE_PANEL = id(100);
const TITLE_CONTENT = id(101);
const TITLE_REVEAL = id(102);
const TITLE_STYLE = id(104);
const CHIP_PANEL = id(150);
const CHIP_LOGO = id(151);
const SPONSOR_FRAME = id(152);
const SPONSOR_FRAME_STYLE = id(153);
const TEAM_PANEL = id(200);
const PANEL_CONTENT = id(201);
const MARKERS = id(202);
const LOGO_GROUP = id(203);
const PANEL_UNDERLAY = id(204);
const LEFT_EDGE = id(500);
const LEFT_MASK = id(501);
const LEFT_LIGHT = id(502);
const RIGHT_EDGE = id(505);
const RIGHT_MASK = id(506);
const RIGHT_LIGHT = id(507);
const INTRO_SWEEP = id(600);
const CHANGE_SWEEP = id(601);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const SPONSOR_ASSET = id(913);

// Per-team panel elements, 210-229 away and 230-249 home; each line takes four.
const teamPanel = (team: number) => {
  const base = 210 + team * 20;
  return {
    tint: id(base), marker: id(base + 1), logo: id(base + 2),
    name: id(base + 3), nameReveal: id(base + 4), schoolStyle: id(base + 5), mascotStyle: id(base + 6),
    line: (index: number) => {
      const own = base + 8 + index * 4;
      return { node: id(own), reveal: id(own + 1), style: id(own + 2), bullet: id(own + 3) };
    },
  };
};

// View model properties: 1010 + 20 per team.
const teamProperty = (team: number) => {
  const base = 1010 + team * 20;
  return {
    school: base, logo: base + 1, primary: base + 2, secondary: base + 3,
    line: (index: number) => base + 4 + index,
    mascot: base + 4 + LINE_COUNT,
  };
};
const IS_PLAYING = 1002;
const STEP = 1003;
const SPONSOR_LOGO = 1100;
const logoAsset = (team: number) => id(911 + team);
const LINE_INDICES = Array.from({ length: LINE_COUNT }, (_, index) => index);

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

/** `attributes` carries an id or a position for a rectangle that is placed. */
const rectangle = (width: number, height: number, radii: Radii, attributes = '') =>
  `<Rectangle${attributes} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

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

// A range starts wholly before the first glyph, so nothing shows before its turn; every
// text builds from its first glyph, beside the seam.
const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

// Corner radii: the block's outer corners take 12, every seam 3.
const CHIP_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const TITLE_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const PANEL_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];

/** Both leading edges' masks: a panel shows only between the two edges. */
const wipeClips = (name: string) =>
  `<ClippingShape name="${name} Left Wipe Clip" sourceId="${LEFT_MASK}"/><ClippingShape name="${name} Right Wipe Clip" sourceId="${RIGHT_MASK}"/>`;

// Away draws beneath home in every stack, so each team's elements are listed home first.
const TEAM_ORDER = [1, 0] as const;
const teamOpacity = (team: number) => (team === 0 ? 1 : 0);
const restingRise = (team: number) => (team === 0 ? '' : ` y="${CHANGE_RISE}"`);

// --- title row ------------------------------------------------------------------------

const chipPanel = `<Node name="Sponsor Chip" id="${CHIP_PANEL}" x="0" y="0">
  ${wipeClips('Sponsor Chip')}
  <!-- The sponsor in full colour, centred so it settles in place. The frame contains any
       sponsor image within the chip's padding. Every layout component joins the artboard's
       flow through plain nodes, so the frame is pinned absolute; the pin, not x/y (which
       it adds to), places the frame within this node. -->
  <Node name="Sponsor Logo" id="${CHIP_LOGO}" x="${CHIP_WIDTH / 2}" y="${TITLE_HEIGHT / 2}">
    <LayoutComponent name="Sponsor Logo Frame" id="${SPONSOR_FRAME}" x="0" y="0" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" styleId="${SPONSOR_FRAME_STYLE}">
      <LayoutComponentStyle name="Sponsor Logo Frame Style" id="${SPONSOR_FRAME_STYLE}" positionTypeValue="absolute" positionLeft="${-FRAME_WIDTH / 2}" positionLeftUnitsValue="points" positionTop="${-FRAME_HEIGHT / 2}" positionTopUnitsValue="points"/>
      <Image name="Sponsor Logo Image" fit="contain" assetId="${SPONSOR_ASSET}">${bound(SPONSOR_LOGO, IMAGE)}</Image>
    </LayoutComponent>
  </Node>
  <Shape name="Sponsor Chip Plate" x="0" y="0">
    ${rectangle(CHIP_WIDTH, TITLE_HEIGHT, CHIP_RADII)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${TITLE_HEIGHT}"><GradientStop colorValue="FFFFFFFF" position="0"/><GradientStop colorValue="FFE9ECF0" position="1"/></LinearGradient></Fill>
  </Shape>
</Node>`;

const titlePanel = `<Node name="Title Panel" id="${TITLE_PANEL}" x="${TITLE_X}" y="0">
  ${wipeClips('Title')}
  <Node name="Title Content" id="${TITLE_CONTENT}" x="0" y="0">
  <!-- Fixed, all in Bold, set against the chip. -->
  <Text name="Title" x="${TEXT_INSET}" y="${TITLE_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${TITLE_WIDTH - 2 * TEXT_INSET}" height="64" sizingValue="fixed" overflowValue="fitFontSize">
    <TextStylePaint id="${TITLE_STYLE}" fontAssetId="${FONT_BOLD}" fontSize="${TITLE_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
    <TextValueRun name="Title Value" styleId="${TITLE_STYLE}" text="HALFTIME ADJUSTMENTS"></TextValueRun>
  ${rise('Title', TITLE_REVEAL)}</Text>
  </Node>
  ${darkGlass('Title', TITLE_WIDTH, TITLE_HEIGHT, TITLE_RADII)}
</Node>`;

// --- team panel -----------------------------------------------------------------------

const teamName = (team: number) => {
  const own = teamPanel(team);
  const { title, school, mascot } = TEAMS[team]!;
  return `  <Node name="${title} Team Name" id="${own.name}" opacity="${teamOpacity(team)}"${restingRise(team)}>
  <!-- The school in the team's secondary colour, then the mascot, muted. -->
  <Text name="${title} Team Name Text" x="${TEXT_LEFT}" y="${TEAM_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${TEXT_RIGHT - TEXT_LEFT}" height="40" sizingValue="fixed" overflowValue="fitFontSize">
    <TextStylePaint id="${own.schoolStyle}" fontAssetId="${FONT_BOLD}" fontSize="32" letterSpacing="0.5"><Fill><SolidColor colorValue="${TEAMS[team]!.secondary}">${bound(teamProperty(team).secondary, COLOR)}</SolidColor></Fill></TextStylePaint>
    <TextStylePaint id="${own.mascotStyle}" fontAssetId="${FONT_REGULAR}" fontSize="26" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint>
    <TextValueRun name="${title} School Value" styleId="${own.schoolStyle}" text="${xml(school)}">${bound(teamProperty(team).school, TEXT)}</TextValueRun>
    <TextValueRun name="${title} Name Gap" styleId="${own.mascotStyle}" text="  "></TextValueRun>
    <TextValueRun name="${title} Mascot Value" styleId="${own.mascotStyle}" text="${xml(mascot)}">${bound(teamProperty(team).mascot, TEXT)}</TextValueRun>
  ${rise(`${title} Team Name`, own.nameReveal)}</Text>
  </Node>`;
};

const lineNode = (team: number, index: number) => {
  const own = teamPanel(team).line(index);
  const title = `${TEAMS[team]!.title} Line ${index + 1}`;
  const baseline = LINE_BASELINES[index]!;
  return `  <Node name="${title}" id="${own.node}" opacity="${teamOpacity(team)}"${restingRise(team)}>
    <!-- A right-pointing bullet in the team's secondary colour, centred on the capitals. -->
    <Shape name="${title} Bullet" id="${own.bullet}" x="${BULLET_X}" y="${baseline - 14}" rotation="1.5707963">
      <Triangle width="14" height="12"/>
      <Fill><SolidColor colorValue="${TEAMS[team]!.secondary}">${bound(teamProperty(team).secondary, COLOR)}</SolidColor></Fill>
    </Shape>
    <Text name="${title} Text" x="${LINE_TEXT_X}" y="${baseline}" originValue="baseline" wrapValue="noWrap" width="${TEXT_RIGHT - LINE_TEXT_X}" height="${LINE_SIZE + 8}" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${own.style}" fontAssetId="${FONT_BOLD}" fontSize="${LINE_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${title} Value" styleId="${own.style}" text="${xml(TEAMS[team]!.lines[index])}">${bound(teamProperty(team).line(index), TEXT)}</TextValueRun>${rise(title, own.reveal)}</Text>
  </Node>`;
};

const panel = `<Node name="Team Panel" id="${TEAM_PANEL}" x="0" y="${PANEL_Y}">
  ${wipeClips('Team Panel')}
  <!-- On the outer edge, clipped to the panel's corners. -->
  <Node name="Markers" id="${MARKERS}" x="0" y="0">
    <ClippingShape name="Markers Clip" sourceId="${PANEL_UNDERLAY}"/>
${TEAM_ORDER.map((team) => `    <Shape name="${TEAMS[team]!.title} Marker" id="${teamPanel(team).marker}" x="0" y="0" scaleY="${teamOpacity(team)}">
      <Rectangle width="${MARKER_WIDTH}" height="${PANEL_HEIGHT}" originX="0" originY="0"/>
      <Fill><SolidColor colorValue="${TEAMS[team]!.secondary}">${bound(teamProperty(team).secondary, COLOR)}</SolidColor></Fill>
    </Shape>`).join('\n')}
  </Node>
  <Node name="Panel Content" id="${PANEL_CONTENT}" x="0" y="0">
${TEAM_ORDER.map(teamName).join('\n')}
${TEAM_ORDER.flatMap((team) => LINE_INDICES.map((index) => lineNode(team, index))).join('\n')}
  </Node>
  ${glaze('Panel', BLOCK_WIDTH, PANEL_HEIGHT, PANEL_RADII)}
  <!-- The team logo as a large faded mark at the inner end, cropped by the panel. -->
  <Node name="Logo Group" id="${LOGO_GROUP}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}">
    <ClippingShape name="Logo Clip" sourceId="${PANEL_UNDERLAY}"/>
${TEAM_ORDER.map((team) => `    <Image name="${TEAMS[team]!.title} Logo" id="${teamPanel(team).logo}" x="0" y="0" opacity="${team === 0 ? LOGO_OPACITY : 0}" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${logoAsset(team)}">${bound(teamProperty(team).logo, IMAGE)}</Image>`).join('\n')}
  </Node>
${TEAM_ORDER.map((team) => `  <Shape name="${TEAMS[team]!.title} Tint" id="${teamPanel(team).tint}" x="0" y="0" opacity="${team === 0 ? TINT_OPACITY : 0}">
    ${rectangle(BLOCK_WIDTH, PANEL_HEIGHT, PANEL_RADII)}
    <Fill><SolidColor colorValue="${TEAMS[team]!.primary}">${bound(teamProperty(team).primary, COLOR)}</SolidColor></Fill>
  </Shape>`).join('\n')}
  <Shape name="Panel Underlay" id="${PANEL_UNDERLAY}" x="0" y="0">
    ${rectangle(BLOCK_WIDTH, PANEL_HEIGHT, PANEL_RADII)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
</Node>`;

// --- leading edges, sweeps, silhouette ------------------------------------------------

// Each edge carries a mask (the left one reaches right of it, the right one left of it,
// so a panel shows between the two) and a light that ignites (scaleY from its centre)
// and fades.
const edge = (side: 'Left' | 'Right', edgeId: string, maskId: string, lightId: string) => {
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

// A sweep lights only glass that is open: the silhouette, between the leading edges.
const sweep = (name: string, sweepId: string, peak: string) => `<Shape name="${name}" id="${sweepId}" x="${SWEEP_LEFT}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="480"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="${peak}" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="${name} Silhouette Clip" sourceId="${SILHOUETTE}"/>
  ${wipeClips(name)}
</Shape>`;

const silhouette = `<Shape name="Block Silhouette" id="${SILHOUETTE}">
  ${rectangle(CHIP_WIDTH, TITLE_HEIGHT, CHIP_RADII, ' x="0" y="0"')}
  ${rectangle(TITLE_WIDTH, TITLE_HEIGHT, TITLE_RADII, ` x="${TITLE_X}" y="0"`)}
  ${rectangle(BLOCK_WIDTH, PANEL_HEIGHT, PANEL_RADII, ` x="0" y="${PANEL_Y}"`)}
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

// A reveal moves the range's leading edge from before the first glyph to past the last.
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];

const teamRanges = (team: number) => [
  teamPanel(team).nameReveal,
  ...LINE_INDICES.map((index) => teamPanel(team).line(index).reveal),
];
const GROUPS = [CHIP_PANEL, TITLE_PANEL, TEAM_PANEL];
const LIGHTS = [LEFT_LIGHT, RIGHT_LIGHT];
const CONTENTS = [TITLE_CONTENT, PANEL_CONTENT];
const settledRanges = [TITLE_REVEAL, ...teamRanges(0), ...teamRanges(1)].flatMap(revealed);

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

// The light ignites at the chip/title seam and splits: the left edge opens the chip and
// the panel's outer end, the right edge wipes the title and panel open toward the inner
// end. Text rises from the seam outward.
const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(LEFT_EDGE, X, SEAM, -8, WIPE_START, LEFT_WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, RIGHT_WIPE_END, EASE_WIPE),
  ...LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  { objectId: LEFT_LIGHT, propertyKey: OPACITY, keys: edgeFlare(16, 36) },
  { objectId: RIGHT_LIGHT, propertyKey: OPACITY, keys: edgeFlare(26, 48) },
  move(MARKERS, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...scale(LOGO_GROUP, 1.12, 1, 8, 48, EASE_OUT),
  move(LOGO_GROUP, OPACITY, 0, 1, 8, 36, EASE_OUT),
  ...CONTENTS.map((content) => move(content, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT)),
  ...scale(CHIP_LOGO, 1.12, 1, 10, 44, EASE_OUT),
  move(CHIP_LOGO, OPACITY, 0, 1, 10, 30, EASE_OUT),
  ...reveal(TITLE_REVEAL, 14, 40),
  ...[0, 1].flatMap((team) => [
    ...reveal(teamPanel(team).nameReveal, 18, 44),
    ...reveal(teamPanel(team).line(0).reveal, 22, 48),
    ...reveal(teamPanel(team).line(1).reveal, 26, 52),
  ]),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  move(INTRO_SWEEP, X, SWEEP_LEFT, SWEEP_RIGHT, 34, INTRO_FRAMES, EASE_SWEEP),
  { objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: sheen(34, INTRO_FRAMES, 0.65) },
];

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(LEFT_EDGE, X, -8),
  hold(RIGHT_EDGE, X, BLOCK_WIDTH + 8),
  ...LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKERS, SCALE_Y, 1),
  hold(LOGO_GROUP, SCALE_X, 1), hold(LOGO_GROUP, SCALE_Y, 1), hold(LOGO_GROUP, OPACITY, 1),
  ...CONTENTS.map((content) => hold(content, X, 0)),
  hold(CHIP_LOGO, SCALE_X, 1), hold(CHIP_LOGO, SCALE_Y, 1), hold(CHIP_LOGO, OPACITY, 1),
  ...settledRanges,
  hold(SHADOW, OPACITY, 0.6),
  hold(INTRO_SWEEP, X, SWEEP_RIGHT),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(LEFT_EDGE, X, -8, SEAM, 8, OUTRO_FRAMES),
  closing(RIGHT_EDGE, X, BLOCK_WIDTH + 8, SEAM, 2, OUTRO_FRAMES),
  ...LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKERS, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, OPACITY, 1, 0, 0, 20),
  ...CONTENTS.map((content) => closing(content, X, 0, -18, 0, OUTRO_FRAMES)),
  closing(CHIP_LOGO, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(CHIP_LOGO, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  // The chip beside the seam is the last glass the left edge closes, so its logo holds
  // until the edge reaches it rather than leaving an empty plate.
  closing(CHIP_LOGO, OPACITY, 1, 0, 12, OUTRO_FRAMES),
  ...settledRanges,
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  hold(INTRO_SWEEP, X, SWEEP_RIGHT),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(SHADOW, OPACITY, 0),
  hold(INTRO_SWEEP, OPACITY, 0),
];

// --- team layer -----------------------------------------------------------------------

/** Every per-team node that fades, and its place in the change's stagger (0 = name). */
const teamNodes = (team: number) => [
  { order: 0, id: teamPanel(team).name },
  ...LINE_INDICES.map((index) => ({ order: index + 1, id: teamPanel(team).line(index).node })),
];

const shownTeam = (team: number, shown: boolean): Track[] => [
  ...teamNodes(team).flatMap(({ id: node }) => [hold(node, OPACITY, shown ? 1 : 0), hold(node, Y, shown ? 0 : CHANGE_RISE)]),
  hold(teamPanel(team).tint, OPACITY, shown ? TINT_OPACITY : 0),
  hold(teamPanel(team).marker, SCALE_Y, shown ? 1 : 0),
  hold(teamPanel(team).logo, SCALE_X, shown ? LOGO_SCALE : LOGO_SCALE * 1.12),
  hold(teamPanel(team).logo, SCALE_Y, shown ? LOGO_SCALE : LOGO_SCALE * 1.12),
  hold(teamPanel(team).logo, OPACITY, shown ? LOGO_OPACITY : 0),
];

const teamShown = (team: number): Track[] => [
  ...shownTeam(team, true),
  ...shownTeam(1 - team, false),
  hold(CHANGE_SWEEP, X, SWEEP_LEFT),
  hold(CHANGE_SWEEP, OPACITY, 0),
];

/**
 * The change from one team to the other, 0.8 s. The glass stays up; the team name, then
 * each line, six frames apart, sinks away; the tint crossfades to the new team and the new
 * name and lines rise in letter by letter, while one light sweeps the glass.
 */
const change = (from: number, to: number): Track[] => {
  const stagger = (order: number) => order * CHANGE_STAGGER;
  return [
    ...teamNodes(from).flatMap(({ order, id: node }) => [
      closing(node, OPACITY, 1, 0, stagger(order), stagger(order) + 12),
      closing(node, Y, 0, CHANGE_RISE, stagger(order), stagger(order) + 14),
    ]),
    ...teamNodes(to).flatMap(({ order, id: node }) => [
      move(node, OPACITY, 0, 1, stagger(order) + 10, stagger(order) + 22, EASE_OUT),
      move(node, Y, CHANGE_RISE, 0, stagger(order) + 10, stagger(order) + 34, EASE_OUT),
    ]),
    move(teamPanel(from).tint, OPACITY, TINT_OPACITY, 0, 12, 30, EASE_OUT),
    move(teamPanel(to).tint, OPACITY, 0, TINT_OPACITY, 2, 26, EASE_OUT),
    ...teamRanges(from).flatMap(revealed),
    ...teamNodes(to).flatMap(({ order }, index) => reveal(teamRanges(to)[index]!, stagger(order) + 12, stagger(order) + 34)),
    closing(teamPanel(from).marker, SCALE_Y, 1, 0, 0, 12),
    move(teamPanel(to).marker, SCALE_Y, 0, 1, 12, 30, EASE_OUT),
    closing(teamPanel(from).logo, SCALE_X, LOGO_SCALE, LOGO_SCALE * 1.06, 0, 14),
    closing(teamPanel(from).logo, SCALE_Y, LOGO_SCALE, LOGO_SCALE * 1.06, 0, 14),
    closing(teamPanel(from).logo, OPACITY, LOGO_OPACITY, 0, 0, 12),
    ...scale(teamPanel(to).logo, LOGO_SCALE * 1.12, LOGO_SCALE, 10, 40, EASE_OUT),
    move(teamPanel(to).logo, OPACITY, 0, LOGO_OPACITY, 10, 28, EASE_OUT),
    move(CHANGE_SWEEP, X, SWEEP_LEFT, SWEEP_RIGHT, 0, CHANGE_FRAMES - 4, EASE_SWEEP),
    { objectId: CHANGE_SWEEP, propertyKey: OPACITY, keys: sheen(0, CHANGE_FRAMES - 4, 0.8) },
  ];
};

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(IS_PLAYING, BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
// Step 1 is the home team; any other value shows the away team.
const showsHome = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyNumber>${bound(STEP, NUMBER)}</BindablePropertyNumber></TransitionPropertyViewModelComparator><TransitionValueNumberComparator value="1"/></TransitionViewModelCondition>`;

const ID = {
  hold: 30, intro: 31, outro: 32, hidden: 33, awayShown: 34, homeShown: 35, awayToHome: 36, homeToAway: 37,
} as const;
const STATE = {
  hold: 40, intro: 41, outro: 42, hidden: 43, awayShown: 44, homeShown: 45, awayToHome: 46, homeToAway: 47,
} as const;

const stateMachine = `<StateMachine name="Halftime Adjustments" id="${id(7)}">
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
<StateMachineLayer name="Team">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.awayShown)}"/></EntryState>
  <AnimationState x="180" y="0" id="${id(STATE.awayShown)}" animationId="${id(ID.awayShown)}">
    <StateTransition stateToId="${id(STATE.awayToHome)}" duration="0">${showsHome('equal')}${onAir('equal')}</StateTransition>
    <StateTransition stateToId="${id(STATE.homeShown)}" duration="0">${showsHome('equal')}${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="-120" id="${id(STATE.awayToHome)}" animationId="${id(ID.awayToHome)}" reset="true">
    <StateTransition stateToId="${id(STATE.homeShown)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.homeToAway)}" duration="0">${showsHome('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.homeShown)}" animationId="${id(ID.homeShown)}">
    <StateTransition stateToId="${id(STATE.homeToAway)}" duration="0">${showsHome('notEqual')}${onAir('equal')}</StateTransition>
    <StateTransition stateToId="${id(STATE.awayShown)}" duration="0">${showsHome('notEqual')}${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="140" id="${id(STATE.homeToAway)}" animationId="${id(ID.homeToAway)}" reset="true">
    <StateTransition stateToId="${id(STATE.awayShown)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.awayToHome)}" duration="0">${showsHome('equal')}</StateTransition>
  </AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const viewModelProperties = [
  `<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>`,
  `<ViewModelPropertyNumber name="step" id="${id(STEP)}" componentProps="1"/>`,
  ...TEAMS.flatMap((team, index) => {
    const property = teamProperty(index);
    return [
      `<ViewModelPropertyString name="${team.key}School" id="${id(property.school)}" componentProps="1"/>`,
      `<ViewModelPropertyString name="${team.key}Mascot" id="${id(property.mascot)}" componentProps="1"/>`,
      `<ViewModelPropertyAssetImage name="${team.key}Logo" id="${id(property.logo)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${team.key}PrimaryColor" id="${id(property.primary)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${team.key}SecondaryColor" id="${id(property.secondary)}" componentProps="1"/>`,
      ...LINE_INDICES.map((line) => `<ViewModelPropertyString name="${team.key}Line${line + 1}" id="${id(property.line(line))}" componentProps="1"/>`),
    ];
  }),
  `<ViewModelPropertyAssetImage name="sponsorLogo" id="${id(SPONSOR_LOGO)}" componentProps="1"/>`,
];

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>`,
  `<ViewModelInstanceNumber viewModelPropertyId="${id(STEP)}" propertyValue="0"/>`,
  ...TEAMS.flatMap((team, index) => {
    const property = teamProperty(index);
    return [
      `<ViewModelInstanceString viewModelPropertyId="${id(property.school)}" propertyValue="${xml(team.school)}"/>`,
      `<ViewModelInstanceString viewModelPropertyId="${id(property.mascot)}" propertyValue="${xml(team.mascot)}"/>`,
      `<ViewModelInstanceAssetImage viewModelPropertyId="${id(property.logo)}" propertyValue="${logoAsset(index)}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.primary)}" propertyValue="${team.primary}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.secondary)}" propertyValue="${team.secondary}"/>`,
      ...LINE_INDICES.map((line) => `<ViewModelInstanceString viewModelPropertyId="${id(property.line(line))}" propertyValue="${xml(team.lines[line]!)}"/>`),
    ];
  }),
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(SPONSOR_LOGO)}" propertyValue="${SPONSOR_ASSET}"/>`,
];

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_halftime_adjustments.ts; edit that file, not this one.
     Basketball halftime adjustments v2, presented by Rothman Orthopaedics: the Burning
     Question's form, mirrored, in the bottom-left corner of a transparent 1920 x 1080 canvas,
     ${BLOCK_WIDTH} x ${BLOCK_HEIGHT} (origin ${BLOCK_X}, ${BLOCK_Y}); it takes the scorebug's place and never shares the
     screen with it. A title row (the sponsor on a white chip at the outer end, the fixed
     title on dark glass) over a team-tinted panel: the school and mascot over two bulleted
     lines. One team shows at a time; the view model's step (0 away, 1 home) selects it.
     Sibling draw order is front to back; within one shape the last paint declared is on top. -->
<Artboard name="Basketball Halftime Adjustments v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Halftime Adjustments v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Halftime Adjustments" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition between the chip and the title; the edges wipe outward. -->
${edge('Left', LEFT_EDGE, LEFT_MASK, LEFT_LIGHT)}
${edge('Right', RIGHT_EDGE, RIGHT_MASK, RIGHT_LIGHT)}
${sweep('Glass Specular Sweep', INTRO_SWEEP, '20FFFFFF')}
${sweep('Team Change Sweep', CHANGE_SWEEP, '2EFFFFFF')}

<!-- ============================== Title row ================================ -->
${chipPanel}
${titlePanel}

<!-- ============================== Team panel =============================== -->
${panel}

<!-- Separation from bright video: a feathered dark stroke around the block. -->
<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <Rectangle width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
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

<!-- Team layer: the resting poses and the two changes between them (${CHANGE_FRAMES / 60} s). -->
${animation('Away Shown', ID.awayShown, 1, 'loop', teamShown(0))}

${animation('Home Shown', ID.homeShown, 1, 'loop', teamShown(1))}

${animation('Away To Home', ID.awayToHome, CHANGE_FRAMES, 'oneShot', change(0, 1))}

${animation('Home To Away', ID.homeToAway, CHANGE_FRAMES, 'oneShot', change(1, 0))}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Team: step 1 shows the home team, anything else the away
     team; on air the change animates, off air it is immediate. Both default off/away. -->
${stateMachine}
</Artboard>

<FontAsset name="Halftime Adjustments v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Halftime Adjustments v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
${TEAMS.map((team, index) => `<ImageAsset name="Halftime Adjustments v2 ${team.logoName}" id="${logoAsset(index)}" file="${team.logoFile}"/>`).join('\n')}
<ImageAsset name="Halftime Adjustments v2 Rothman Orthopaedics" id="${SPONSOR_ASSET}" file="assets/images/sponsors/rothman_orthopaedics.png"/>

<ViewModel name="BasketballHalftimeAdjustmentsV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'halftime_adjustments.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
