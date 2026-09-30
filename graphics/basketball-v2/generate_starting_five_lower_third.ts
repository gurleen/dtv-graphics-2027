/**
 * Generates the starting five lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_starting_five_lower_third.ts
 *
 * writes starting_five_lower_third.rml beside this file. Edit this file, not the output.
 *
 * The graphic shows one team's starting five at a time and changes team without leaving
 * air. Its state machine has two layers:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *            It animates the shell: wipes, edge lights, drifts, strips, shadow and sheen,
 *            and the letter-by-letter rise of both teams' text.
 *   Team     Away Shown <-> Home Shown, gated on `step` (0 = away, 1 = home). On air it
 *            plays a change animation; off air it switches instantly. It animates only
 *            the per-team nodes (content, tints, markers, logos), so the layers never
 *            key the same property, except the text reveal ranges, which the change
 *            animations key and the later layer wins.
 */

import { join } from 'node:path';

const PREFIX = 37;
const ARTBOARD_Y = 11000;

type Player = { number: string; lastName: string; position: string };
type Team = {
  key: 'away' | 'home';
  title: 'Away' | 'Home';
  school: string;
  logoFile: string;
  logoName: string;
  primary: string;
  secondary: string;
  players: readonly Player[];
};

// Test data: the Drexel Dragons at home (see the package README), Saint Joseph's away.
const TEAMS: readonly Team[] = [
  {
    key: 'away', title: 'Away', school: "SAINT JOSEPH'S",
    logoFile: 'assets/images/scorebug/saint-josephs.png', logoName: "Saint Joseph's",
    primary: 'FFC2071B', secondary: 'FFA7A9AC',
    players: [
      { number: '0', lastName: 'CAREY', position: 'G' },
      { number: '1', lastName: 'JOHNSON', position: 'G' },
      { number: '11', lastName: 'GLOVER-TOSCANO', position: 'G' },
      { number: '15', lastName: 'LOGAN', position: 'F' },
      { number: '23', lastName: 'MARRS', position: 'F' },
    ],
  },
  {
    key: 'home', title: 'Home', school: 'DREXEL',
    logoFile: 'assets/images/scorebug/drexel.png', logoName: 'Drexel',
    primary: 'FF07294D', secondary: 'FFFFC600',
    players: [
      { number: '5', lastName: 'REED', position: 'G' },
      { number: '0', lastName: 'HIPPS', position: 'G' },
      { number: '23', lastName: 'TINGLER', position: 'G' },
      { number: '6', lastName: 'EDOMWONYIN', position: 'F' },
      { number: '11', lastName: 'DE LAPORTERIE', position: 'F' },
    ],
  },
];
const PLAYER_COUNT = 5;

// Geometry. The block stands on the scorebug's baseline, 24 clear of its right edge
// (x 526), and ends on the right action-safe margin (x 1824).
const BLOCK_X = 550;
const BLOCK_Y = 890;
const GAP = 4;
const PANEL_HEIGHT = 84;
const STRIP_HEIGHT = 44;
const STRIP_Y = PANEL_HEIGHT + GAP;
const BLOCK_HEIGHT = PANEL_HEIGHT + GAP + STRIP_HEIGHT;
const HEADER_WIDTH = 304;
const COLUMN_WIDTH = 190;
const COLUMN_STEP = COLUMN_WIDTH + GAP;
const PLAYERS_X = HEADER_WIDTH + GAP;
const BLOCK_WIDTH = PLAYERS_X + PLAYER_COUNT * COLUMN_WIDTH + (PLAYER_COUNT - 1) * GAP;
const SEAM = HEADER_WIDTH + GAP / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const HEADSHOT_X = 84;
const TEXT_INSET = 14;
const LOGO_X = 54;
const LOGO_SCALE = 0.082;
const SPONSOR_SCALE = 0.095;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;
const CHANGE_RISE = 14;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 84;
const OUTRO_FRAMES = 24;
const CHANGE_FRAMES = 60;
const HEADER_WIPE_END = 34;
const PLAYERS_WIPE_END = 48;
const WIPE_START = 6;
const CHANGE_STAGGER = 4;

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
const TITLE_REVEAL = id(130);
const HEADER_STRIP = id(150);
const HEADER_STRIP_CONTENT = id(151);
const SPONSOR_LABEL_REVEAL = id(152);
const HEADER_EDGE = id(500);
const HEADER_MASK = id(501);
const HEADER_EDGE_LIGHT = id(502);
const PLAYERS_EDGE = id(505);
const PLAYERS_MASK = id(506);
const PLAYERS_EDGE_LIGHT = id(507);
const INTRO_SWEEP = id(600);
const CHANGE_SWEEP = id(601);
const SILHOUETTE = id(610);
const STRIP_MASK = id(620);
const PLAYER_STRIPS = id(700);
const PLAYER_STRIPS_CONTENT = id(701);
const PLAYER_PANELS = id(800);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const HEADSHOT_ASSET = id(910);
const SPONSOR_ASSET = id(913);

// Per-team header elements, 110-119 away and 120-129 home.
const teamHeader = (team: number) => {
  const base = 110 + team * 10;
  return {
    school: id(base), logo: id(base + 1), marker: id(base + 2), tint: id(base + 3),
    schoolReveal: id(base + 4), schoolStyle: id(base + 5),
  };
};

// Per-player elements, 2000 + 100 per column; each team's own within 20 of +10.
const column = (index: number) => {
  const base = 2000 + index * 100;
  return {
    index, base,
    x: index * COLUMN_STEP,
    panel: id(base), content: id(base + 1), underlay: id(base + 2),
    team: (team: number) => {
      const own = base + 10 + team * 20;
      return {
        panelContent: id(own), stripContent: id(own + 1), tint: id(own + 2),
        numberReveal: id(own + 3), nameReveal: id(own + 4), positionReveal: id(own + 5),
        signStyle: id(own + 6), numberStyle: id(own + 7), nameStyle: id(own + 8), positionStyle: id(own + 9),
        headshotFrame: id(own + 10), headshotFrameStyle: id(own + 11),
      };
    },
  };
};
const COLUMNS = Array.from({ length: PLAYER_COUNT }, (_, index) => column(index));

// View model properties: 1010 + 50 per team, then four per player.
const teamProperty = (team: number) => {
  const base = 1010 + team * 50;
  return {
    school: base, logo: base + 1, primary: base + 2, secondary: base + 3,
    player: (index: number) => ({
      number: base + 10 + index * 4, lastName: base + 11 + index * 4,
      position: base + 12 + index * 4, headshot: base + 13 + index * 4,
    }),
  };
};
const IS_PLAYING = 1002;
const STEP = 1003;
const SPONSOR_LOGO = 1100;
const logoAsset = (team: number) => id(911 + team);

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

const stripGlass = (name: string, width: number, radii: Radii, x = 0) => `<Shape name="${name} Glaze" x="${x}" y="0">
    ${rectangle(width, STRIP_HEIGHT, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${STRIP_HEIGHT}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="40000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${STRIP_HEIGHT}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>
  <Shape name="${name} Body" x="${x}" y="0">
    ${rectangle(width, STRIP_HEIGHT, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

const teamTint = (name: string, tintId: string, width: number, height: number, radii: Radii, team: number, opacity: number) =>
  `<Shape name="${name}" id="${tintId}" x="0" y="0" opacity="${opacity}">
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
const HEADER_PANEL_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const HEADER_STRIP_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS];
const MARKER_RADII: Radii = [OUTER_RADIUS, 0, OUTER_RADIUS, 0];
const panelRadii = (index: number): Radii =>
  [INNER_RADIUS, index === PLAYER_COUNT - 1 ? OUTER_RADIUS : INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const stripRadii = (index: number): Radii =>
  [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, index === PLAYER_COUNT - 1 ? OUTER_RADIUS : INNER_RADIUS];

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
  return `  <Node name="${title} School" id="${header.school}" opacity="${teamOpacity(team)}">
  <Text name="${title} School Name" x="100" y="44" originValue="baseline" wrapValue="noWrap" width="${HEADER_WIDTH - 100 - 16}" height="46" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${header.schoolStyle}" fontAssetId="${FONT_BOLD}" fontSize="40" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${title} School Value" styleId="${header.schoolStyle}" text="${TEAMS[team]!.school}">${bound(teamProperty(team).school, 268)}</TextValueRun>${rise(`${title} School`, header.schoolReveal)}</Text>
  </Node>`;
};

const headerPanel = `<Node name="Header Panel" id="${HEADER_PANEL}" x="0" y="0">
  <ClippingShape name="Header Reveal Clip" sourceId="${HEADER_MASK}"/>
  <Node name="Header Content" id="${HEADER_CONTENT}">
${TEAM_ORDER.map(schoolText).join('\n')}
  <Text name="Title" x="100" y="71" originValue="baseline" wrapValue="noWrap" width="${HEADER_WIDTH - 100 - 16}" height="28" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${id(131)}" fontAssetId="${FONT_REGULAR}" fontSize="24" letterSpacing="2"><Fill><SolidColor colorValue="D9FFFFFF"/></Fill></TextStylePaint><TextValueRun name="Title Value" styleId="${id(131)}" text="STARTING FIVE"></TextValueRun>${rise('Title', TITLE_REVEAL)}</Text>
  </Node>
  <!-- ${PANEL_HEIGHT} units square (the 1024 source at ${LOGO_SCALE}), right of the marker, so it scales in place. -->
  <Node name="Logo Group" id="${LOGO_GROUP}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}">
${TEAM_ORDER.map((team) => `    <Node name="${TEAMS[team]!.title} Logo" id="${teamHeader(team).logo}" opacity="${teamOpacity(team)}" scaleX="${team === 0 ? 1 : 1.12}" scaleY="${team === 0 ? 1 : 1.12}"><Image name="${TEAMS[team]!.title} Logo Image" x="0" y="0" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${logoAsset(team)}">${bound(teamProperty(team).logo, 206)}</Image></Node>`).join('\n')}
  </Node>
  <!-- A soft light bloom behind the logo, as if the glass were lit from behind. -->
  <Shape name="Logo Bloom" id="${LOGO_BLOOM}" x="${LOGO_X}" y="${PANEL_HEIGHT / 2}">
    <Ellipse width="128" height="128"/>
    <Fill><RadialGradient startX="0" startY="0" endX="64" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="Logo Bloom Clip" sourceId="${HEADER_UNDERLAY}"/>
  </Shape>
  ${panelGlaze('Header', HEADER_WIDTH, PANEL_HEIGHT, HEADER_PANEL_RADII)}
${TEAM_ORDER.map((team) => `  ${teamTint(`${TEAMS[team]!.title} Header Tint`, teamHeader(team).tint, HEADER_WIDTH, PANEL_HEIGHT, HEADER_PANEL_RADII, team, team === 0 ? TINT_OPACITY : 0)}`).join('\n')}
  ${underlay('Header Underlay', HEADER_UNDERLAY, HEADER_WIDTH, PANEL_HEIGHT, HEADER_PANEL_RADII)}
</Node>`;

const sponsorLogoWidth = 1600 * SPONSOR_SCALE;
const headerStrip = `<Node name="Header Strip" id="${HEADER_STRIP}" x="0" y="${STRIP_Y}">
  <ClippingShape name="Header Strip Reveal Clip" sourceId="${STRIP_MASK}"/>
  <ClippingShape name="Header Strip Wipe Clip" sourceId="${HEADER_MASK}"/>
  <Node name="Header Strip Sliding Content" id="${HEADER_STRIP_CONTENT}">
  <Text name="Sponsor Label" x="22" y="29" originValue="baseline" wrapValue="noWrap" sizingValue="autoWidth"><TextStylePaint id="${id(153)}" fontAssetId="${FONT_REGULAR}" fontSize="18" letterSpacing="2"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint><TextValueRun name="Sponsor Label Value" styleId="${id(153)}" text="PRESENTED BY"></TextValueRun>${rise('Sponsor Label', SPONSOR_LABEL_REVEAL)}</Text>
  <Image name="Sponsor Logo" id="${id(154)}" x="${HEADER_WIDTH - 16 - sponsorLogoWidth / 2}" y="${STRIP_HEIGHT / 2}" scaleX="${SPONSOR_SCALE}" scaleY="${SPONSOR_SCALE}" assetId="${SPONSOR_ASSET}">${bound(SPONSOR_LOGO, 206)}</Image>
  ${stripGlass('Header Strip', HEADER_WIDTH, HEADER_STRIP_RADII)}
  </Node>
</Node>`;

// --- players --------------------------------------------------------------------------

const playerPanel = (col: (typeof COLUMNS)[number]) => {
  const radii = panelRadii(col.index);
  const label = `Player ${col.index + 1}`;
  const teams = TEAM_ORDER.map((team) => {
    const own = col.team(team);
    const player = TEAMS[team]!.players[col.index]!;
    const property = teamProperty(team).player(col.index);
    const name = `${TEAMS[team]!.title} ${label}`;
    return `    <Node name="${name} Panel Content" id="${own.panelContent}" opacity="${teamOpacity(team)}"${team === 0 ? '' : ` y="${CHANGE_RISE}"`}>
    <Text name="${name} Number" x="${TEXT_INSET}" y="66" originValue="baseline" wrapValue="noWrap" sizingValue="autoWidth">
      <TextStylePaint id="${own.signStyle}" fontAssetId="${FONT_REGULAR}" fontSize="28" letterSpacing="0"><Fill><SolidColor colorValue="99FFFFFF"/></Fill></TextStylePaint>
      <TextStylePaint id="${own.numberStyle}" fontAssetId="${FONT_BOLD}" fontSize="60" letterSpacing="0"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
      <TextValueRun name="${name} Number Sign" styleId="${own.signStyle}" text="#"></TextValueRun>
      <TextValueRun name="${name} Number Value" styleId="${own.numberStyle}" text="${player.number}">${bound(property.number, 268)}</TextValueRun>
    ${rise(`${name} Number`, own.numberReveal)}</Text>
    <!-- The frame covers its cell with any headshot, aligned to the top, and the
         panel shape crops it to the rounded corners. Every layout component joins
         the artboard's flow through plain nodes, so the frames are pinned absolute;
         the pin, not x/y (which it adds to), places the frame within this node. -->
    <LayoutComponent name="${name} Headshot Frame" id="${own.headshotFrame}" x="0" y="0" width="${COLUMN_WIDTH - HEADSHOT_X}" height="${PANEL_HEIGHT}" styleId="${own.headshotFrameStyle}">
      <LayoutComponentStyle name="${name} Headshot Frame Style" id="${own.headshotFrameStyle}" positionTypeValue="absolute" positionLeft="${HEADSHOT_X}" positionLeftUnitsValue="points" positionTop="0" positionTopUnitsValue="points"/>
      <ClippingShape name="${name} Headshot Clip" sourceId="${col.underlay}"/>
      <Image name="${name} Headshot" fit="cover" alignmentX="0" alignmentY="-1" assetId="${HEADSHOT_ASSET}">${bound(property.headshot, 206)}</Image>
    </LayoutComponent>
    </Node>`;
  });
  return `<Node name="${label} Panel" id="${col.panel}" x="${col.x}" y="0">
  <Node name="${label} Content" id="${col.content}">
${teams.join('\n')}
  </Node>
  ${panelGlaze(label, COLUMN_WIDTH, PANEL_HEIGHT, radii)}
${TEAM_ORDER.map((team) => `  ${teamTint(`${TEAMS[team]!.title} ${label} Tint`, col.team(team).tint, COLUMN_WIDTH, PANEL_HEIGHT, radii, team, team === 0 ? TINT_OPACITY : 0)}`).join('\n')}
  ${underlay(`${label} Underlay`, col.underlay, COLUMN_WIDTH, PANEL_HEIGHT, radii)}
</Node>`;
};

const POSITION_WIDTH = 34;
const NAME_WIDTH = COLUMN_WIDTH - 2 * TEXT_INSET - POSITION_WIDTH - 6;

const playerStrip = (col: (typeof COLUMNS)[number]) => {
  const label = `Player ${col.index + 1}`;
  const teams = TEAM_ORDER.map((team) => {
    const own = col.team(team);
    const player = TEAMS[team]!.players[col.index]!;
    const property = teamProperty(team).player(col.index);
    const name = `${TEAMS[team]!.title} ${label}`;
    return `  <Node name="${name} Strip Content" id="${own.stripContent}" opacity="${teamOpacity(team)}">
  <Text name="${name} Last Name" x="${col.x + TEXT_INSET}" y="31" originValue="baseline" wrapValue="noWrap" width="${NAME_WIDTH}" height="32" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${own.nameStyle}" fontAssetId="${FONT_BOLD}" fontSize="28" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${name} Last Name Value" styleId="${own.nameStyle}" text="${player.lastName}">${bound(property.lastName, 268)}</TextValueRun>${rise(`${name} Last Name`, own.nameReveal)}</Text>
  <Text name="${name} Position" x="${col.x + COLUMN_WIDTH - TEXT_INSET - POSITION_WIDTH}" y="31" originValue="baseline" wrapValue="noWrap" width="${POSITION_WIDTH}" height="30" sizingValue="fixed" overflowValue="fitFontSize" alignValue="right"><TextStylePaint id="${own.positionStyle}" fontAssetId="${FONT_REGULAR}" fontSize="24" letterSpacing="1"><Fill><SolidColor colorValue="B3FFFFFF"/></Fill></TextStylePaint><TextValueRun name="${name} Position Value" styleId="${own.positionStyle}" text="${player.position}">${bound(property.position, 268)}</TextValueRun>${rise(`${name} Position`, own.positionReveal)}</Text>
  </Node>`;
  });
  return `${teams.join('\n')}
  ${stripGlass(label + ' Strip', COLUMN_WIDTH, stripRadii(col.index), col.x)}`;
};

const silhouette = [
  rectangle(HEADER_WIDTH, PANEL_HEIGHT, HEADER_PANEL_RADII, ' x="0" y="0"'),
  rectangle(HEADER_WIDTH, STRIP_HEIGHT, HEADER_STRIP_RADII, ` x="0" y="${STRIP_Y}"`),
  ...COLUMNS.flatMap((col) => [
    rectangle(COLUMN_WIDTH, PANEL_HEIGHT, panelRadii(col.index), ` x="${PLAYERS_X + col.x}" y="0"`),
    rectangle(COLUMN_WIDTH, STRIP_HEIGHT, stripRadii(col.index), ` x="${PLAYERS_X + col.x}" y="${STRIP_Y}"`),
  ]),
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
// The frame the players' leading edge reaches each column's left edge.
const columnReveal = COLUMNS.map((col) =>
  wipeFrame((PLAYERS_X + col.x - SEAM) / (BLOCK_WIDTH + 8 - SEAM), WIPE_START, PLAYERS_WIPE_END));

const allRanges = (team: number) => [
  teamHeader(team).schoolReveal,
  ...COLUMNS.flatMap((col) => [col.team(team).numberReveal, col.team(team).nameReveal, col.team(team).positionReveal]),
];
const SHARED_RANGES = [TITLE_REVEAL, SPONSOR_LABEL_REVEAL];
const GROUPS = [MARKERS, HEADER_PANEL, HEADER_STRIP, PLAYER_PANELS, PLAYER_STRIPS];
const EDGE_LIGHTS = [HEADER_EDGE_LIGHT, PLAYERS_EDGE_LIGHT];

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
  move(PLAYERS_EDGE, X, SEAM, BLOCK_WIDTH + 8, WIPE_START, PLAYERS_WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.map((light) => move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT)),
  { objectId: HEADER_EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(18, 40) },
  { objectId: PLAYERS_EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare(30, 52) },
  move(MARKERS, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...scale(LOGO_GROUP, 1.12, 1, 8, 48, EASE_OUT),
  move(LOGO_GROUP, OPACITY, 0, 1, 8, 30, EASE_OUT),
  ...scale(LOGO_BLOOM, 0.7, 1, 10, 50, EASE_OUT),
  move(LOGO_BLOOM, OPACITY, 0, 1, 10, 44, EASE_OUT),
  move(HEADER_CONTENT, X, CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  ...[0, 1].flatMap((team) => reveal(teamHeader(team).schoolReveal, 20, 44)),
  ...reveal(TITLE_REVEAL, 24, 46),
  ...reveal(SPONSOR_LABEL_REVEAL, 28, 46),
  ...COLUMNS.flatMap((col): Track[] => {
    const at = columnReveal[col.index]!;
    return [
      move(col.content, X, -CONTENT_DRIFT, 0, at + 2, at + 38, EASE_OUT),
      ...[0, 1].flatMap((team) => [
        ...reveal(col.team(team).numberReveal, at + 10, at + 30),
        ...reveal(col.team(team).nameReveal, Math.max(at + 16, 26), Math.max(at + 16, 26) + 20),
        ...reveal(col.team(team).positionReveal, Math.max(at + 20, 30), Math.max(at + 20, 30) + 18),
      ]),
    ];
  }),
  move(HEADER_STRIP_CONTENT, Y, -STRIP_HEIGHT, 0, 22, 46, EASE_OUT),
  move(PLAYER_STRIPS_CONTENT, Y, -STRIP_HEIGHT, 0, 22, 46, EASE_OUT),
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
  hold(PLAYERS_EDGE, X, BLOCK_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKERS, SCALE_Y, 1),
  hold(LOGO_GROUP, SCALE_X, 1), hold(LOGO_GROUP, SCALE_Y, 1), hold(LOGO_GROUP, OPACITY, 1),
  hold(LOGO_BLOOM, SCALE_X, 1), hold(LOGO_BLOOM, SCALE_Y, 1), hold(LOGO_BLOOM, OPACITY, 1),
  hold(HEADER_CONTENT, X, 0),
  ...COLUMNS.map((col) => hold(col.content, X, 0)),
  ...settledRanges,
  hold(HEADER_STRIP_CONTENT, Y, 0),
  hold(PLAYER_STRIPS_CONTENT, Y, 0),
  hold(SHADOW, OPACITY, 0.6),
  hold(INTRO_SWEEP, X, SWEEP_END),
  hold(INTRO_SWEEP, OPACITY, 0),
];

const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(HEADER_EDGE, X, -8, SEAM, 4, OUTRO_FRAMES),
  closing(PLAYERS_EDGE, X, BLOCK_WIDTH + 8, SEAM, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKERS, SCALE_Y, 1, 0, 8, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES),
  closing(LOGO_GROUP, OPACITY, 1, 0, 0, 20),
  hold(LOGO_BLOOM, SCALE_X, 1), hold(LOGO_BLOOM, SCALE_Y, 1),
  closing(LOGO_BLOOM, OPACITY, 1, 0, 0, 20),
  closing(HEADER_CONTENT, X, 0, 18, 0, OUTRO_FRAMES),
  ...COLUMNS.map((col) => closing(col.content, X, 0, -18, 0, OUTRO_FRAMES)),
  ...settledRanges,
  closing(HEADER_STRIP_CONTENT, Y, 0, -STRIP_HEIGHT, 0, 18),
  closing(PLAYER_STRIPS_CONTENT, Y, 0, -STRIP_HEIGHT, 0, 18),
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

/** Every per-team node that fades, and the parts of the block it belongs to (0 = header). */
const teamNodes = (team: number) => [
  { panel: 0, id: teamHeader(team).school },
  ...COLUMNS.flatMap((col) => [
    { panel: col.index + 1, id: col.team(team).panelContent },
    { panel: col.index + 1, id: col.team(team).stripContent },
  ]),
];
const teamTints = (team: number) => [
  { panel: 0, id: teamHeader(team).tint },
  ...COLUMNS.map((col) => ({ panel: col.index + 1, id: col.team(team).tint })),
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
 * The change from one team to the other, 1 s. Panels stay up; left to right, four frames
 * apart, each panel's old content sinks away, its tint crossfades to the new team and the
 * new content rises in letter by letter, while one light sweeps the glass.
 */
const change = (from: number, to: number): Track[] => {
  const stagger = (panel: number) => panel * CHANGE_STAGGER;
  const incomingText = (rangeId: string, start: number, length: number) => reveal(rangeId, start, start + length);
  return [
    ...teamNodes(from).flatMap(({ panel, id: node }) => [
      closing(node, OPACITY, 1, 0, stagger(panel), stagger(panel) + 12),
      closing(node, Y, 0, CHANGE_RISE, stagger(panel), stagger(panel) + 14),
    ]),
    ...teamNodes(to).flatMap(({ panel, id: node }) => [
      move(node, OPACITY, 0, 1, stagger(panel) + 10, stagger(panel) + 22, EASE_OUT),
      move(node, Y, CHANGE_RISE, 0, stagger(panel) + 10, stagger(panel) + 34, EASE_OUT),
    ]),
    ...teamTints(from).map(({ panel, id: tint }) => move(tint, OPACITY, TINT_OPACITY, 0, stagger(panel) + 12, stagger(panel) + 26, EASE_OUT)),
    ...teamTints(to).map(({ panel, id: tint }) => move(tint, OPACITY, 0, TINT_OPACITY, stagger(panel) + 2, stagger(panel) + 22, EASE_OUT)),
    ...allRanges(from).flatMap(revealed),
    ...incomingText(teamHeader(to).schoolReveal, 12, 22),
    ...COLUMNS.flatMap((col) => {
      const start = stagger(col.index + 1);
      return [
        ...incomingText(col.team(to).numberReveal, start + 12, 20),
        ...incomingText(col.team(to).nameReveal, start + 14, 20),
        ...incomingText(col.team(to).positionReveal, start + 18, 18),
      ];
    }),
    closing(teamHeader(from).marker, SCALE_Y, 1, 0, 0, 12),
    move(teamHeader(to).marker, SCALE_Y, 0, 1, 12, 30, EASE_OUT),
    closing(teamHeader(from).logo, SCALE_X, 1, 1.06, 0, 14),
    closing(teamHeader(from).logo, SCALE_Y, 1, 1.06, 0, 14),
    closing(teamHeader(from).logo, OPACITY, 1, 0, 0, 12),
    ...scale(teamHeader(to).logo, 1.12, 1, 10, 40, EASE_OUT),
    move(teamHeader(to).logo, OPACITY, 0, 1, 10, 28, EASE_OUT),
    move(CHANGE_SWEEP, X, SWEEP_START, SWEEP_END, 0, 54, EASE_SWEEP),
    {
      objectId: CHANGE_SWEEP, propertyKey: OPACITY, keys: [
        { frame: 0, value: 0, linear: true }, { frame: 6, value: 0.8, linear: true },
        { frame: 46, value: 0.8, linear: true }, { frame: 54, value: 0, linear: true },
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

const stateMachine = `<StateMachine name="Starting Five Lower Third" id="${id(7)}">
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
      `<ViewModelPropertyAssetImage name="${team.key}Logo" id="${id(property.logo)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${team.key}PrimaryColor" id="${id(property.primary)}" componentProps="1"/>`,
      `<ViewModelPropertyColor name="${team.key}SecondaryColor" id="${id(property.secondary)}" componentProps="1"/>`,
      ...COLUMNS.flatMap(({ index: player }) => {
        const own = property.player(player);
        const prefix = `${team.key}Player${player + 1}`;
        return [
          `<ViewModelPropertyString name="${prefix}Number" id="${id(own.number)}" componentProps="1"/>`,
          `<ViewModelPropertyString name="${prefix}LastName" id="${id(own.lastName)}" componentProps="1"/>`,
          `<ViewModelPropertyString name="${prefix}Position" id="${id(own.position)}" componentProps="1"/>`,
          `<ViewModelPropertyAssetImage name="${prefix}Headshot" id="${id(own.headshot)}" componentProps="1"/>`,
        ];
      }),
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
      `<ViewModelInstanceAssetImage viewModelPropertyId="${id(property.logo)}" propertyValue="${logoAsset(index)}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.primary)}" propertyValue="${team.primary}"/>`,
      `<ViewModelInstanceColor viewModelPropertyId="${id(property.secondary)}" propertyValue="${team.secondary}"/>`,
      ...team.players.flatMap((player, playerIndex) => {
        const own = property.player(playerIndex);
        return [
          `<ViewModelInstanceString viewModelPropertyId="${id(own.number)}" propertyValue="${player.number}"/>`,
          `<ViewModelInstanceString viewModelPropertyId="${id(own.lastName)}" propertyValue="${player.lastName}"/>`,
          `<ViewModelInstanceString viewModelPropertyId="${id(own.position)}" propertyValue="${player.position}"/>`,
          `<ViewModelInstanceAssetImage viewModelPropertyId="${id(own.headshot)}" propertyValue="${HEADSHOT_ASSET}"/>`,
        ];
      }),
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
  <Rectangle width="110" height="340"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="${peak}" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="${name} Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_starting_five_lower_third.ts; edit that file, not this one.
     Basketball starting five lower third v2: a tinted-glass block, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, beside
     the scorebug at the bottom of a transparent 1920 x 1080 canvas (origin ${BLOCK_X}, ${BLOCK_Y}).
     A header panel (logo, school, STARTING FIVE) over the sponsor strip, then five
     player columns: number and headshot over a strip with last name and position.
     One team shows at a time; the view model's step (0 away, 1 home) selects it.
     Sibling draw order is front to back; within one shape the last paint declared
     is on top. -->
<Artboard name="Basketball Starting Five Lower Third v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Starting Five Lower Third v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Lower Third" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition between the header and the first player; the edges wipe outward. -->
<Node name="Header Leading Edge" id="${HEADER_EDGE}" x="-8">
  <Shape name="Header Reveal Mask" id="${HEADER_MASK}" y="-8"><Rectangle width="900" height="${BLOCK_HEIGHT + 16}" originX="0" originY="0"/></Shape>
  ${edgeLight('Header', HEADER_EDGE_LIGHT, 1)}
</Node>
<Node name="Players Leading Edge" id="${PLAYERS_EDGE}" x="${BLOCK_WIDTH + 8}">
  <Shape name="Players Reveal Mask" id="${PLAYERS_MASK}" y="-8"><Rectangle width="1600" height="${BLOCK_HEIGHT + 16}" originX="1" originY="0"/></Shape>
  ${edgeLight('Players', PLAYERS_EDGE_LIGHT, -1)}
</Node>
${sweep('Glass Specular Sweep', INTRO_SWEEP, '20FFFFFF')}
${sweep('Team Change Sweep', CHANGE_SWEEP, '2EFFFFFF')}

<!-- ============================== Header =================================== -->
${markers}
${headerPanel}
${headerStrip}

<!-- ============================== Players ================================== -->
<Node name="Player Panels" id="${PLAYER_PANELS}" x="${PLAYERS_X}" y="0">
<ClippingShape name="Player Panels Reveal Clip" sourceId="${PLAYERS_MASK}"/>
${COLUMNS.map(playerPanel).join('\n')}
</Node>
<Node name="Player Strips" id="${PLAYER_STRIPS}" x="${PLAYERS_X}" y="${STRIP_Y}">
<ClippingShape name="Player Strips Reveal Clip" sourceId="${STRIP_MASK}"/>
<ClippingShape name="Player Strips Wipe Clip" sourceId="${PLAYERS_MASK}"/>
<Node name="Player Strips Sliding Content" id="${PLAYER_STRIPS_CONTENT}">
${COLUMNS.map(playerStrip).join('\n')}
</Node>
</Node>

<!-- Separation from bright video: a feathered dark stroke around the block. -->
<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <Rectangle width="${BLOCK_WIDTH}" height="${BLOCK_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>
<Shape name="Block Silhouette" id="${SILHOUETTE}">${silhouette}</Shape>
<Shape name="Strip Reveal Mask" id="${STRIP_MASK}" x="0" y="${STRIP_Y}"><Rectangle width="${BLOCK_WIDTH}" height="${STRIP_HEIGHT}" originX="0" originY="0"/></Shape>
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

<FontAsset name="Starting Five Lower Third v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Starting Five Lower Third v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Starting Five Lower Third v2 Headshot Placeholder" id="${HEADSHOT_ASSET}" file="assets/images/headshots/placeholder.png"/>
${TEAMS.map((team, index) => `<ImageAsset name="Starting Five Lower Third v2 ${team.logoName}" id="${logoAsset(index)}" file="${team.logoFile}"/>`).join('\n')}
<ImageAsset name="Starting Five Lower Third v2 Independence Blue Cross" id="${SPONSOR_ASSET}" file="assets/images/sponsors/independence_blue_cross.png"/>

<ViewModel name="BasketballStartingFiveLowerThirdV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'starting_five_lower_third.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
