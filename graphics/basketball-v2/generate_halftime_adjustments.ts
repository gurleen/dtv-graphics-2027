/**
 * Generates the halftime adjustments lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_halftime_adjustments.ts
 *
 * writes halftime_adjustments.rml beside this file. Edit this file, not the output.
 *
 * The graphic shows one team's two halftime adjustments at a time and changes team without
 * leaving air, as the starting five lower third does. Its state machine has two layers:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *            It animates the shell: wipes, edge lights, drifts, the sponsor chip, shadow and
 *            sheen, and the letter-by-letter rise of both teams' text.
 *   Team     Away Shown <-> Home Shown, gated on `step` (0 = away, 1 = home). On air it
 *            plays a change animation; off air it switches instantly. It animates only
 *            the per-team nodes (school, lines, tints, marker, logo), so the layers never
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
// left on the action-safe margin, its foot on the lower thirds' foot (890 + 132).
const BLOCK_X = 96;
const GAP = 4;
const PANEL_HEIGHT = 172;
const BLOCK_HEIGHT = PANEL_HEIGHT;
const BLOCK_Y = 890 + 132 - BLOCK_HEIGHT;
const HEADER_WIDTH = 340;
const LINES_X = HEADER_WIDTH + GAP;
const LINES_WIDTH = 480;
const SPONSOR_X = LINES_X + LINES_WIDTH + GAP;
const SPONSOR_WIDTH = 200;
const BLOCK_WIDTH = SPONSOR_X + SPONSOR_WIDTH;
const SEAM = HEADER_WIDTH + GAP / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const LOGO_X = 72;
const LOGO_SCALE = 0.1;
const SCHOOL_X = 136;
const SCHOOL_BASELINE = 90;
const MASCOT_BASELINE = 124;
const TEXT_INSET = 24;
const BULLET_X = TEXT_INSET + 6;
const LINE_TEXT_X = 50;
const TITLE_BASELINE = 44;
const LINE_BASELINES = [98, 144] as const;
const LINE_FONT_SIZE = 36;
// The light chip holds the vertical Rothman lockup; the logo frame fits any sponsor inside it.
const CHIP_INSET = 14;
const CHIP_Y = 42;
const CHIP_WIDTH = SPONSOR_WIDTH - 2 * CHIP_INSET;
const CHIP_HEIGHT = BLOCK_HEIGHT - CHIP_Y - CHIP_INSET;
const CHIP_PADDING = 8;
const CHIP_COLOR = 'FFF0E5C8';
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;
const CHANGE_RISE = 14;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const CHANGE_FRAMES = 48;
const HEADER_WIPE_END = 34;
const LINES_WIPE_END = 44;
const WIPE_START = 6;
const CHANGE_STAGGER = 6;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

// Property keys used by the timelines.
const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const SHADOW = id(20);
const HEADER_PANEL = id(100);
const HEADER_CONTENT = id(101);
const LOGO_GROUP = id(102);
const LOGO_BLOOM = id(103);
const HEADER_UNDERLAY = id(104);
const MARKERS = id(105);
const LINES_PANEL = id(200);
const LINES_CONTENT = id(201);
const TITLE_REVEAL = id(202);
const TITLE_STYLE = id(203);
const SPONSOR_CELL = id(400);
const SPONSOR_LABEL_REVEAL = id(402);
const SPONSOR_LABEL_STYLE = id(403);
const CHIP = id(404);
const SPONSOR_FRAME = id(405);
const SPONSOR_FRAME_STYLE = id(406);
const HEADER_EDGE = id(500);
const HEADER_MASK = id(501);
const HEADER_EDGE_LIGHT = id(502);
const LINES_EDGE = id(505);
const LINES_MASK = id(506);
const LINES_EDGE_LIGHT = id(507);
const INTRO_SWEEP = id(600);
const CHANGE_SWEEP = id(601);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const SPONSOR_ASSET = id(913);

// Per-team header elements, 110-119 away and 120-129 home.
const teamHeader = (team: number) => {
  const base = 110 + team * 10;
  return {
    school: id(base), logo: id(base + 1), marker: id(base + 2), tint: id(base + 3),
    schoolReveal: id(base + 4), schoolStyle: id(base + 5),
    mascotReveal: id(base + 6), mascotStyle: id(base + 7),
  };
};

// Per-team lines elements, 210-229 away and 230-249 home; each line takes four.
const teamLines = (team: number) => {
  const base = 210 + team * 20;
  return {
    tint: id(base),
    line: (index: number) => {
      const own = base + 2 + index * 4;
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

const rectangle = (width: number, height: number, radii: Radii, position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const panelGlaze = (name: string, width: number, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
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

const teamTint = (name: string, tintId: string, width: number, height: number, radii: Radii, team: number) =>
  `<Shape name="${name}" id="${tintId}" x="0" y="0" opacity="${team === 0 ? TINT_OPACITY : 0}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="${TEAMS[team]!.primary}">${bound(teamProperty(team).primary, 37)}</SolidColor></Fill>
  </Shape>`;

const underlay = (name: string, underlayId: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" id="${underlayId}" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

// Corner radii: the block's outer corners take 12, every seam 3.
const HEADER_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS];
const LINES_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const SPONSOR_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS];
const MARKER_RADII: Radii = [OUTER_RADIUS, 0, OUTER_RADIUS, 0];

// Away draws beneath home in every stack, so each team's elements are listed home first.
const TEAM_ORDER = [1, 0] as const;
const teamOpacity = (team: number) => (team === 0 ? 1 : 0);

// --- header ---------------------------------------------------------------------------

const markers = `<Node name="Markers" id="${MARKERS}" x="0" y="0">
  <ClippingShape name="Markers Reveal Clip" sourceId="${HEADER_MASK}"/>
${TEAM_ORDER.map((team) => `  <Shape name="${TEAMS[team]!.title} Marker" id="${teamHeader(team).marker}" x="0" y="0" scaleY="${teamOpacity(team)}">
    ${rectangle(MARKER_WIDTH, BLOCK_HEIGHT, MARKER_RADII)}
    <Fill><SolidColor colorValue="${TEAMS[team]!.secondary}">${bound(teamProperty(team).secondary, 37)}</SolidColor></Fill>
  </Shape>`).join('\n')}
</Node>`;

const schoolText = (team: number) => {
  const header = teamHeader(team);
  const title = TEAMS[team]!.title;
  return `  <Node name="${title} School" id="${header.school}" opacity="${teamOpacity(team)}"${team === 0 ? '' : ` y="${CHANGE_RISE}"`}>
  <Text name="${title} School Name" x="${SCHOOL_X}" y="${SCHOOL_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${HEADER_WIDTH - SCHOOL_X - 18}" height="54" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${header.schoolStyle}" fontAssetId="${FONT_BOLD}" fontSize="48" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${title} School Value" styleId="${header.schoolStyle}" text="${TEAMS[team]!.school}">${bound(teamProperty(team).school, 268)}</TextValueRun>${rise(`${title} School`, header.schoolReveal)}</Text>
  <Text name="${title} Mascot Name" x="${SCHOOL_X}" y="${MASCOT_BASELINE}" originValue="baseline" wrapValue="noWrap" width="${HEADER_WIDTH - SCHOOL_X - 18}" height="34" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${header.mascotStyle}" fontAssetId="${FONT_REGULAR}" fontSize="30" letterSpacing="2"><Fill><SolidColor colorValue="D9FFFFFF"/></Fill></TextStylePaint><TextValueRun name="${title} Mascot Value" styleId="${header.mascotStyle}" text="${TEAMS[team]!.mascot}">${bound(teamProperty(team).mascot, 268)}</TextValueRun>${rise(`${title} Mascot`, header.mascotReveal)}</Text>
  </Node>`;
};

const headerPanel = `<Node name="Header Panel" id="${HEADER_PANEL}" x="0" y="0">
  <ClippingShape name="Header Reveal Clip" sourceId="${HEADER_MASK}"/>
  <Node name="Header Content" id="${HEADER_CONTENT}">
${TEAM_ORDER.map(schoolText).join('\n')}
  </Node>
  <!-- ${1024 * LOGO_SCALE} units square (the 1024 source at ${LOGO_SCALE}), right of the marker, so it scales in place. -->
  <Node name="Logo Group" id="${LOGO_GROUP}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}">
${TEAM_ORDER.map((team) => `    <Node name="${TEAMS[team]!.title} Logo" id="${teamHeader(team).logo}" opacity="${teamOpacity(team)}" scaleX="${team === 0 ? 1 : 1.12}" scaleY="${team === 0 ? 1 : 1.12}"><Image name="${TEAMS[team]!.title} Logo Image" x="0" y="0" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${logoAsset(team)}">${bound(teamProperty(team).logo, 206)}</Image></Node>`).join('\n')}
  </Node>
  <!-- A soft light bloom behind the logo, as if the glass were lit from behind. -->
  <Shape name="Logo Bloom" id="${LOGO_BLOOM}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}">
    <Ellipse width="150" height="150"/>
    <Fill><RadialGradient startX="0" startY="0" endX="75" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="Logo Bloom Clip" sourceId="${HEADER_UNDERLAY}"/>
  </Shape>
  ${panelGlaze('Header', HEADER_WIDTH, PANEL_HEIGHT, HEADER_RADII)}
${TEAM_ORDER.map((team) => `  ${teamTint(`${TEAMS[team]!.title} Header Tint`, teamHeader(team).tint, HEADER_WIDTH, PANEL_HEIGHT, HEADER_RADII, team)}`).join('\n')}
  ${underlay('Header Underlay', HEADER_UNDERLAY, HEADER_WIDTH, PANEL_HEIGHT, HEADER_RADII)}
</Node>`;

// --- lines ----------------------------------------------------------------------------

const lineNode = (team: number, index: number) => {
  const own = teamLines(team).line(index);
  const title = `${TEAMS[team]!.title} Line ${index + 1}`;
  const baseline = LINE_BASELINES[index]!;
  return `    <Node name="${title}" id="${own.node}" opacity="${teamOpacity(team)}"${team === 0 ? '' : ` y="${CHANGE_RISE}"`}>
    <!-- A right-pointing bullet in the team's secondary colour, centred on the capitals. -->
    <Shape name="${title} Bullet" id="${own.bullet}" x="${BULLET_X}" y="${baseline - 13}" rotation="1.5707963">
      <Triangle width="14" height="12"/>
      <Fill><SolidColor colorValue="${TEAMS[team]!.secondary}">${bound(teamProperty(team).secondary, 37)}</SolidColor></Fill>
    </Shape>
    <Text name="${title} Text" x="${LINE_TEXT_X}" y="${baseline}" originValue="baseline" wrapValue="noWrap" width="${LINES_WIDTH - LINE_TEXT_X - TEXT_INSET}" height="${LINE_FONT_SIZE + 8}" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${own.style}" fontAssetId="${FONT_BOLD}" fontSize="${LINE_FONT_SIZE}" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${title} Value" styleId="${own.style}" text="${TEAMS[team]!.lines[index]}">${bound(teamProperty(team).line(index), 268)}</TextValueRun>${rise(title, own.reveal)}</Text>
    </Node>`;
};

const linesPanel = `<Node name="Lines Panel" id="${LINES_PANEL}" x="${LINES_X}" y="0">
  <ClippingShape name="Lines Reveal Clip" sourceId="${LINES_MASK}"/>
  <Node name="Lines Content" id="${LINES_CONTENT}">
  <Text name="Title" x="${TEXT_INSET}" y="${TITLE_BASELINE}" originValue="baseline" wrapValue="noWrap" sizingValue="autoWidth"><TextStylePaint id="${TITLE_STYLE}" fontAssetId="${FONT_REGULAR}" fontSize="24" letterSpacing="2"><Fill><SolidColor colorValue="D9FFFFFF"/></Fill></TextStylePaint><TextValueRun name="Title Value" styleId="${TITLE_STYLE}" text="HALFTIME ADJUSTMENTS"></TextValueRun>${rise('Title', TITLE_REVEAL)}</Text>
${TEAM_ORDER.flatMap((team) => LINE_INDICES.map((index) => lineNode(team, index))).join('\n')}
  </Node>
  ${panelGlaze('Lines', LINES_WIDTH, PANEL_HEIGHT, LINES_RADII)}
${TEAM_ORDER.map((team) => `  ${teamTint(`${TEAMS[team]!.title} Lines Tint`, teamLines(team).tint, LINES_WIDTH, PANEL_HEIGHT, LINES_RADII, team)}`).join('\n')}
  ${underlay('Lines Underlay', id(204), LINES_WIDTH, PANEL_HEIGHT, LINES_RADII)}
</Node>`;

// --- sponsor cell ---------------------------------------------------------------------

const sponsorCell = `<Node name="Sponsor Cell" id="${SPONSOR_CELL}" x="${SPONSOR_X}" y="0">
  <ClippingShape name="Sponsor Reveal Clip" sourceId="${LINES_MASK}"/>
  <Text name="Sponsor Label" x="0" y="29" originValue="baseline" wrapValue="noWrap" width="${SPONSOR_WIDTH}" height="22" sizingValue="fixed" alignValue="center"><TextStylePaint id="${SPONSOR_LABEL_STYLE}" fontAssetId="${FONT_REGULAR}" fontSize="18" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint><TextValueRun name="Sponsor Label Value" styleId="${SPONSOR_LABEL_STYLE}" text="PRESENTED BY"></TextValueRun>${rise('Sponsor Label', SPONSOR_LABEL_REVEAL)}</Text>
  <!-- The light chip, centred so it settles in place; the sponsor's own colours need a light ground. -->
  <Node name="Sponsor Chip" id="${CHIP}" x="${SPONSOR_WIDTH / 2}" y="${CHIP_Y + CHIP_HEIGHT / 2}">
    <!-- The frame contains any sponsor logo within the chip's padding. Every layout component
         joins the artboard's flow through plain nodes, so the frame is pinned absolute; the
         pin, not x/y (which it adds to), places the frame within this node. -->
    <LayoutComponent name="Sponsor Logo Frame" id="${SPONSOR_FRAME}" x="0" y="0" width="${CHIP_WIDTH - 2 * CHIP_PADDING}" height="${CHIP_HEIGHT - 2 * CHIP_PADDING}" styleId="${SPONSOR_FRAME_STYLE}">
      <LayoutComponentStyle name="Sponsor Logo Frame Style" id="${SPONSOR_FRAME_STYLE}" positionTypeValue="absolute" positionLeft="${-CHIP_WIDTH / 2 + CHIP_PADDING}" positionLeftUnitsValue="points" positionTop="${-CHIP_HEIGHT / 2 + CHIP_PADDING}" positionTopUnitsValue="points"/>
      <Image name="Sponsor Logo" fit="contain" assetId="${SPONSOR_ASSET}">${bound(SPONSOR_LOGO, 206)}</Image>
    </LayoutComponent>
    <Shape name="Sponsor Chip Plate" x="${-CHIP_WIDTH / 2}" y="${-CHIP_HEIGHT / 2}">
      ${rectangle(CHIP_WIDTH, CHIP_HEIGHT, [6, 6, 6, OUTER_RADIUS - 6])}
      <Fill><SolidColor colorValue="${CHIP_COLOR}"/></Fill>
    </Shape>
  </Node>
  ${darkGlass('Sponsor Cell', SPONSOR_WIDTH, BLOCK_HEIGHT, SPONSOR_RADII)}
</Node>`;

const silhouette = [
  rectangle(HEADER_WIDTH, PANEL_HEIGHT, HEADER_RADII, ' x="0" y="0"'),
  rectangle(LINES_WIDTH, PANEL_HEIGHT, LINES_RADII, ` x="${LINES_X}" y="0"`),
  rectangle(SPONSOR_WIDTH, BLOCK_HEIGHT, SPONSOR_RADII, ` x="${SPONSOR_X}" y="0"`),
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
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, 0, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0.4, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];

/** The frame at which a wipe eased with EASE_WIPE over start..end has covered `progress`. */
const wipeFrame = (progress: number, start: number, end: number) => {
  // Cubic Bezier (0,0) (0.6,0) (0.1,1) (1,1); sample the parameter densely.
  const bezier = (s: number, p1: number, p2: number) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s ** 2 * p2 + s ** 3;
  for (let step = 0; step <= 1000; step++) {
    const s = step / 1000;
    if (bezier(s, 0, 1) >= progress) return Math.round(start + bezier(s, 0.6, 0.1) * (end - start));
  }
  return end;
};
// The frame the lines' leading edge reaches the sponsor cell's left edge.
const SPONSOR_REVEAL = wipeFrame((SPONSOR_X - SEAM) / (BLOCK_WIDTH + 8 - SEAM), WIPE_START, LINES_WIPE_END);

const allRanges = (team: number) => [
  teamHeader(team).schoolReveal,
  teamHeader(team).mascotReveal,
  ...LINE_INDICES.map((index) => teamLines(team).line(index).reveal),
];
const SHARED_RANGES = [TITLE_REVEAL, SPONSOR_LABEL_REVEAL];
const GROUPS = [MARKERS, HEADER_PANEL, LINES_PANEL, SPONSOR_CELL];
const EDGE_LIGHTS = [HEADER_EDGE_LIGHT, LINES_EDGE_LIGHT];

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
  move(HEADER_EDGE, X, SEAM, -8, WIPE_START, HEADER_WIPE_END, EASE_WIPE),
  move(LINES_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, LINES_WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  { objectId: HEADER_EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(18, 40) },
  { objectId: LINES_EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(26, 48) },
  move(MARKERS, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...scale(LOGO_GROUP, 1.12, 1, 8, 48, EASE_OUT),
  move(LOGO_GROUP, OPACITY, 0, 1, 8, 30, EASE_OUT),
  ...scale(LOGO_BLOOM, 0.7, 1, 10, 50, EASE_OUT),
  move(LOGO_BLOOM, OPACITY, 0, 1, 10, 44, EASE_OUT),
  move(HEADER_CONTENT, X, CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  move(LINES_CONTENT, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  ...[0, 1].flatMap((team) => [
    ...reveal(teamHeader(team).schoolReveal, 20, 44),
    ...reveal(teamHeader(team).mascotReveal, 26, 50),
    ...reveal(teamLines(team).line(0).reveal, 22, 44),
    ...reveal(teamLines(team).line(1).reveal, 26, 48),
  ]),
  ...reveal(TITLE_REVEAL, 16, 38),
  ...reveal(SPONSOR_LABEL_REVEAL, SPONSOR_REVEAL + 6, SPONSOR_REVEAL + 26),
  ...scale(CHIP, 0.9, 1, SPONSOR_REVEAL + 2, SPONSOR_REVEAL + 34, EASE_OUT),
  move(CHIP, OPACITY, 0, 1, SPONSOR_REVEAL + 2, SPONSOR_REVEAL + 22, EASE_OUT),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, 34, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: 34, value: 0, linear: true }, { frame: 40, value: 0.65, linear: true },
      { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
    ],
  },
];

const settledRanges = [...allRanges(0), ...allRanges(1), ...SHARED_RANGES].flatMap(revealed);

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(HEADER_EDGE, X, -8),
  hold(LINES_EDGE, X, BLOCK_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKERS, SCALE_Y, 1),
  hold(LOGO_GROUP, SCALE_X, 1), hold(LOGO_GROUP, SCALE_Y, 1), hold(LOGO_GROUP, OPACITY, 1),
  hold(LOGO_BLOOM, SCALE_X, 1), hold(LOGO_BLOOM, SCALE_Y, 1), hold(LOGO_BLOOM, OPACITY, 1),
  hold(HEADER_CONTENT, X, 0),
  hold(LINES_CONTENT, X, 0),
  ...settledRanges,
  hold(CHIP, SCALE_X, 1), hold(CHIP, SCALE_Y, 1), hold(CHIP, OPACITY, 1),
  hold(SHADOW, OPACITY, 0.6),
  hold(INTRO_SWEEP, X, SWEEP_END),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(HEADER_EDGE, X, -8, SEAM, 4, OUTRO_FRAMES),
  closing(LINES_EDGE, X, BLOCK_WIDTH + 8, SEAM, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKERS, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, OPACITY, 1, 0, 0, 20),
  hold(LOGO_BLOOM, SCALE_X, 1), hold(LOGO_BLOOM, SCALE_Y, 1),
  closing(LOGO_BLOOM, OPACITY, 1, 0, 0, 20),
  closing(HEADER_CONTENT, X, 0, 18, 0, OUTRO_FRAMES),
  closing(LINES_CONTENT, X, 0, -18, 0, OUTRO_FRAMES),
  ...settledRanges,
  hold(CHIP, SCALE_X, 1), hold(CHIP, SCALE_Y, 1),
  closing(CHIP, OPACITY, 1, 0, 0, 16),
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

// --- team layer -----------------------------------------------------------------------

/** Every per-team node that fades, and its place in the change's stagger (0 = header). */
const teamNodes = (team: number) => [
  { order: 0, id: teamHeader(team).school },
  ...LINE_INDICES.map((index) => ({ order: index + 1, id: teamLines(team).line(index).node })),
];
const teamTints = (team: number) => [
  { order: 0, id: teamHeader(team).tint },
  { order: 1, id: teamLines(team).tint },
];

const shownTeam = (team: number, shown: boolean): Track[] => [
  ...teamNodes(team).flatMap(({ id: node }) => [hold(node, OPACITY, shown ? 1 : 0), hold(node, Y, shown ? 0 : CHANGE_RISE)]),
  ...teamTints(team).map(({ id: tint }) => hold(tint, OPACITY, shown ? TINT_OPACITY : 0)),
  hold(teamHeader(team).marker, SCALE_Y, shown ? 1 : 0),
  hold(teamHeader(team).logo, SCALE_X, shown ? 1 : 1.12),
  hold(teamHeader(team).logo, SCALE_Y, shown ? 1 : 1.12),
  hold(teamHeader(team).logo, OPACITY, shown ? 1 : 0),
];

const teamShown = (team: number): Track[] => [
  ...shownTeam(team, true),
  ...shownTeam(1 - team, false),
  hold(CHANGE_SWEEP, X, SWEEP_START),
  hold(CHANGE_SWEEP, OPACITY, 0),
];

/**
 * The change from one team to the other, 0.8 s. Panels stay up; the header, then each
 * line, six frames apart, sinks away; the tints crossfade to the new team and the new
 * school and lines rise in letter by letter, while one light sweeps the glass.
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
    ...teamTints(from).map(({ order, id: tint }) => move(tint, OPACITY, TINT_OPACITY, 0, stagger(order) + 12, stagger(order) + 26, EASE_OUT)),
    ...teamTints(to).map(({ order, id: tint }) => move(tint, OPACITY, 0, TINT_OPACITY, stagger(order) + 2, stagger(order) + 22, EASE_OUT)),
    ...allRanges(from).flatMap(revealed),
    ...reveal(teamHeader(to).schoolReveal, 12, 34),
    ...reveal(teamHeader(to).mascotReveal, 18, 40),
    ...LINE_INDICES.flatMap((index) => reveal(teamLines(to).line(index).reveal, stagger(index + 1) + 12, stagger(index + 1) + 34)),
    closing(teamHeader(from).marker, SCALE_Y, 1, 0, 0, 12),
    move(teamHeader(to).marker, SCALE_Y, 0, 1, 12, 30, EASE_OUT),
    closing(teamHeader(from).logo, SCALE_X, 1, 1.06, 0, 14),
    closing(teamHeader(from).logo, SCALE_Y, 1, 1.06, 0, 14),
    closing(teamHeader(from).logo, OPACITY, 1, 0, 0, 12),
    ...scale(teamHeader(to).logo, 1.12, 1, 10, 40, EASE_OUT),
    move(teamHeader(to).logo, OPACITY, 0, 1, 10, 28, EASE_OUT),
    move(CHANGE_SWEEP, X, SWEEP_START, SWEEP_END, 0, CHANGE_FRAMES - 4, EASE_SWEEP),
    {
      objectId: CHANGE_SWEEP, propertyKey: OPACITY, keys: [
        { frame: 0, value: 0, linear: true }, { frame: 6, value: 0.8, linear: true },
        { frame: CHANGE_FRAMES - 12, value: 0.8, linear: true }, { frame: CHANGE_FRAMES - 4, value: 0, linear: true },
      ],
    },
  ];
};

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(IS_PLAYING, 634)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
// Step 1 is the home team; any other value shows the away team.
const showsHome = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyNumber>${bound(STEP, 636)}</BindablePropertyNumber></TransitionPropertyViewModelComparator><TransitionValueNumberComparator value="1"/></TransitionViewModelCondition>`;

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
      `<ViewModelInstanceString viewModelPropertyId="${id(property.school)}" propertyValue="${team.school}"/>`,
      `<ViewModelInstanceString viewModelPropertyId="${id(property.mascot)}" propertyValue="${team.mascot}"/>`,
      `<ViewModelInstanceAssetImage viewModelPropertyId="${id(property.logo)}" propertyValue="${logoAsset(index)}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.primary)}" propertyValue="${team.primary}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.secondary)}" propertyValue="${team.secondary}"/>`,
      ...LINE_INDICES.map((line) => `<ViewModelInstanceString viewModelPropertyId="${id(property.line(line))}" propertyValue="${team.lines[line]}"/>`),
    ];
  }),
  `<ViewModelInstanceAssetImage viewModelPropertyId="${id(SPONSOR_LOGO)}" propertyValue="${SPONSOR_ASSET}"/>`,
];

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" y="${PANEL_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${PANEL_HEIGHT / 2}"><Rectangle width="2" height="${PANEL_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${PANEL_HEIGHT / 2}"><Rectangle width="44" height="${PANEL_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const sweep = (name: string, sweepId: string, peak: string) => `<Shape name="${name}" id="${sweepId}" x="${sweepId === INTRO_SWEEP ? SWEEP_END : SWEEP_START}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="400"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="${peak}" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="${name} Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_halftime_adjustments.ts; edit that file, not this one.
     Basketball halftime adjustments v2, presented by Rothman Orthopaedics: a tinted-glass
     block, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, in the bottom-left corner of a transparent 1920 x 1080
     canvas (origin ${BLOCK_X}, ${BLOCK_Y}); it takes the scorebug's place and never shares the screen
     with it. A header panel (logo, school over mascot) and a lines panel (HALFTIME ADJUSTMENTS over two
     bulleted lines), then the sponsor cell. One team shows
     at a time; the view model's step (0 away, 1 home) selects it.
     Sibling draw order is front to back; within one shape the last paint declared
     is on top. -->
<Artboard name="Basketball Halftime Adjustments v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Halftime Adjustments v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Halftime Adjustments" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition between the header and the lines; the edges wipe outward. -->
<Node name="Header Leading Edge" id="${HEADER_EDGE}" x="-8">
  <Shape name="Header Reveal Mask" id="${HEADER_MASK}" y="-8"><Rectangle width="900" height="${BLOCK_HEIGHT + 16}" originX="0" originY="0"/></Shape>
  ${edgeLight('Header', HEADER_EDGE_LIGHT, 1)}
</Node>
<Node name="Lines Leading Edge" id="${LINES_EDGE}" x="${BLOCK_WIDTH + 8}">
  <Shape name="Lines Reveal Mask" id="${LINES_MASK}" y="-8"><Rectangle width="1600" height="${BLOCK_HEIGHT + 16}" originX="1" originY="0"/></Shape>
  ${edgeLight('Lines', LINES_EDGE_LIGHT, -1)}
</Node>
${sweep('Glass Specular Sweep', INTRO_SWEEP, '20FFFFFF')}
${sweep('Team Change Sweep', CHANGE_SWEEP, '2EFFFFFF')}

<!-- ============================== Header =================================== -->
${markers}
${headerPanel}

<!-- ============================== Lines ==================================== -->
${linesPanel}

<!-- ============================== Sponsor ================================== -->
${sponsorCell}

<!-- Separation from bright video: a feathered dark stroke around the block. -->
<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <Rectangle width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>
<Shape name="Block Silhouette" id="${SILHOUETTE}">${silhouette}</Shape>
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
