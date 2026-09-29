/**
 * Generates the Halftime Statistics card scene from one description:
 *
 *   bun graphics/basketball-v2/generate_halftime_statistics.ts
 *
 * writes halftime_statistics.rml beside this file. Edit this file, not the output.
 *
 * A full-frame card comparing the two teams' first halves, presented by a sponsor. It is
 * centred on the canvas and ends above the scorebug, so both can be on air together.
 *
 *   Team panels  full height at either end, tinted in the team colour: the school over
 *                the mascot, then the logo.
 *   Column       between them: the title, the score row, six statistic rows (away value,
 *                label, home value) and the sponsor strip.
 *
 * In the score row and each statistic row, the leading team's cell takes that team's
 * tint. The comparison is made by halftime_statistics_controller.luau, which writes the
 * `_`-prefixed view model properties bound below; each row's leadingValue says whether
 * the higher or the lower figure leads, or that neither is marked.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro, gated on
 * `isPlaying`).
 */

import { join } from 'node:path';

const PREFIX = 39;
const ARTBOARD_Y = 13400;

// Test data: Saint Joseph's at Drexel (see the package README).
const AWAY = {
  school: "SAINT JOSEPH'S", mascot: 'HAWKS', score: '31',
  logoFile: 'assets/images/scorebug/saint-josephs.png', primary: 'FFC2071B', secondary: 'FF101010',
};
const HOME = {
  school: 'DREXEL', mascot: 'DRAGONS', score: '34',
  logoFile: 'assets/images/scorebug/drexel.png', primary: 'FF07294D', secondary: 'FFFFC600',
};
const TITLE = 'HALFTIME STATS';

type LeadingValue = 'HIGHER' | 'LOWER' | 'NONE';
type Statistic = {
  label: string; awayValue: string; awayDetail: string; homeValue: string; homeDetail: string; leadingValue: LeadingValue;
};
const STATISTICS: Statistic[] = [
  { label: 'FG', awayValue: '12-28', awayDetail: '42.9%', homeValue: '13-27', homeDetail: '48.1%', leadingValue: 'HIGHER' },
  { label: '3PT', awayValue: '4-11', awayDetail: '36.4%', homeValue: '5-12', homeDetail: '41.7%', leadingValue: 'HIGHER' },
  { label: 'FT', awayValue: '3-4', awayDetail: '75.0%', homeValue: '3-5', homeDetail: '60.0%', leadingValue: 'HIGHER' },
  { label: 'REB', awayValue: '17', awayDetail: '', homeValue: '15', homeDetail: '', leadingValue: 'HIGHER' },
  { label: 'AST', awayValue: '8', awayDetail: '', homeValue: '10', homeDetail: '', leadingValue: 'HIGHER' },
  { label: 'TO', awayValue: '5', awayDetail: '', homeValue: '7', homeDetail: '', leadingValue: 'LOWER' },
];

// Geometry. Every piece is separated by GAP; the column's cells line up in three
// columns (away value, label, home value) from the score row down.
const GAP = 4;
const TEAM_WIDTH = 340;
const VALUE_WIDTH = 240;
const LABEL_WIDTH = 180;
const LABEL_X = VALUE_WIDTH + GAP;
const HOME_VALUE_X = LABEL_X + LABEL_WIDTH + GAP;
const COLUMN_WIDTH = HOME_VALUE_X + VALUE_WIDTH;
const COLUMN_X = TEAM_WIDTH + GAP;
const HOME_X = COLUMN_X + COLUMN_WIDTH + GAP;
const CARD_WIDTH = HOME_X + TEAM_WIDTH;
const TITLE_HEIGHT = 60;
const SCORE_Y = TITLE_HEIGHT + GAP;
const SCORE_HEIGHT = 100;
const ROWS_Y = SCORE_Y + SCORE_HEIGHT + GAP;
const ROW_HEIGHT = 60;
const rowY = (index: number) => ROWS_Y + index * (ROW_HEIGHT + GAP);
const STRIP_Y = rowY(STATISTICS.length);
const STRIP_HEIGHT = 84;
const CARD_HEIGHT = STRIP_Y + STRIP_HEIGHT;
// Centred on the canvas; the card ends at y 858, clear of the scorebug at y 890.
const CARD_X = (1920 - CARD_WIDTH) / 2;
const CARD_Y = (1080 - CARD_HEIGHT) / 2;
const SEAM_X = CARD_WIDTH / 2;
const OUTER_RADIUS = 24;
const INNER_RADIUS = 6;
const STRIPE_HEIGHT = 6;
const CONTENT_DRIFT = 40;
const LOGO_X = TEAM_WIDTH / 2;
const LOGO_Y = 396;
// The logo sources are 1024 square and a logo fills about 70% of its padded source,
// so it draws about 260 across.
const LOGO_SCALE = 0.36;
const BLOOM_SIZE = 460;
const CHIP_INSET = 10;
const CHIP_WIDTH = 216;
const CHIP_HEIGHT = STRIP_HEIGHT - 2 * CHIP_INSET;
// The label and chip are centred as a group on the strip.
const CHIP_X = 291;
const SPONSOR_LABEL_WIDTH = 200;
const SPONSOR_LABEL_X = CHIP_X - 18 - SPONSOR_LABEL_WIDTH;
// The trimmed Drexel Physical Therapy export is 1600 x 447; 48 units tall on the chip.
const SPONSOR_SCALE = 48 / 447;
const SPONSOR_SLIDE = STRIP_HEIGHT + GAP;
// Printed between a value and its detail; keep equal to SEPARATOR in detail_separator.luau.
const DETAIL_GAP = '  ';
const MASK_WIDTH = CARD_WIDTH + 16;
const SWEEP_START = -150;
const SWEEP_END = CARD_WIDTH + 150;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 86;
const OUTRO_FRAMES = 24;
const WIPE_START = 8;
const WIPE_END = 46;

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
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- leader ---------------------------------------------------------------------------

// The comparison halftime_statistics_controller.luau makes, repeated here so the default
// instance opens with the right cells marked. A row compares its details when both parse
// and its values otherwise; the figure is the first number in the text.
const figure = (text: string) => {
  const digits = text.match(/\d*\.?\d+/);
  return digits ? Number(digits[0]) : undefined;
};

const leaderOf = (s: Statistic): 'away' | 'home' | undefined => {
  let away = figure(s.awayDetail);
  let home = figure(s.homeDetail);
  if (away === undefined || home === undefined) {
    away = figure(s.awayValue);
    home = figure(s.homeValue);
  }
  const sense = s.leadingValue === 'LOWER' ? -1 : s.leadingValue === 'NONE' ? 0 : 1;
  if (away === undefined || home === undefined || away === home || sense === 0) return undefined;
  return (away - home) * sense > 0 ? 'away' : 'home';
};

const SCORE_LEADER = leaderOf({
  label: '', awayValue: AWAY.score, awayDetail: '', homeValue: HOME.score, homeDetail: '', leadingValue: 'HIGHER',
});

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const CONTENT = id(11);
const SHADOW = id(20);
const SHADOW_RECTANGLE = id(21);
const COLUMN = id(300);
const TITLE_STRIP = id(301);
const TITLE_STYLE = id(302);
const TITLE_REVEAL = id(303);
const SPONSOR_STRIP = id(400);
const SPONSOR_CONTENT = id(401);
const SPONSOR_LABEL_STYLE = id(402);
const SPONSOR_LABEL_REVEAL = id(403);
const SPONSOR_CHIP = id(404);
const SPONSOR_LOGO = id(405);
const AWAY_EDGE = id(500);
const AWAY_EDGE_LIGHT = id(501);
const HOME_EDGE = id(502);
const HOME_EDGE_LIGHT = id(503);
const REVEAL_MASK = id(505);
const REVEAL_MASK_RECTANGLE = id(506);
const INTRO_SWEEP = id(600);
const SILHOUETTE = id(610);
const SPONSOR_MASK = id(620);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const AWAY_LOGO_ASSET = id(910);
const HOME_LOGO_ASSET = id(911);
const SPONSOR_ASSET = id(912);
const CONTROLLER_ASSET = id(950);
const SEPARATOR_ASSET = id(951);
const DETAIL_SEPARATOR = id(960);

const SCORE_ROW = id(3000);
const SCORE_LABEL_STYLE = id(3005);
const SCORE_LABEL_REVEAL = id(3011);

// View model properties. Underscored ones are written by the controller script;
// operators never set them.
const P = {
  isPlaying: 1002, title: 1010,
  awaySchool: 1011, awayMascot: 1012, homeSchool: 1013, homeMascot: 1014, awayScore: 1015, homeScore: 1016,
  awayLogo: 1020, homeLogo: 1021, awayPrimaryColor: 1022, homePrimaryColor: 1023,
  awaySecondaryColor: 1024, homeSecondaryColor: 1025, sponsorLogo: 1026,
  row: (index: number) => {
    const base = 1030 + index * 10;
    return {
      label: base, awayValue: base + 1, awayDetail: base + 2, homeValue: base + 3, homeDetail: base + 4,
      leadingValue: base + 5, awayLeadOpacity: base + 6, homeLeadOpacity: base + 7,
    };
  },
  awayScoreLeadOpacity: 1100, homeScoreLeadOpacity: 1101,
} as const;

type Radii = [number, number, number, number];

// Corner radii: the card's outer corners take 24, every seam 6.
const AWAY_RADII: Radii = [OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS];
const HOME_RADII: Radii = [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, OUTER_RADIUS];
const INNER_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const CHIP_RADII: Radii = [4, 4, 4, 4];

// Per-team elements: the away panel at 100, the home panel at 200, and each team's
// score cell in the score row (3000).
const teamElements = (side: 'away' | 'home') => {
  const away = side === 'away';
  const base = away ? 100 : 200;
  return {
    side, name: away ? 'Away' : 'Home', data: away ? AWAY : HOME,
    x: away ? 0 : HOME_X, scoreX: away ? 0 : HOME_VALUE_X, radii: away ? AWAY_RADII : HOME_RADII,
    // +1 when the seam lies to the right. The content drifts outward from the seam.
    towardSeam: away ? 1 : -1,
    panel: id(base), content: id(base + 1), stripe: id(base + 2), hairline: id(base + 3), tint: id(base + 4),
    logo: id(base + 5), bloom: id(base + 6),
    schoolReveal: id(base + 10), mascotReveal: id(base + 11), schoolStyle: id(base + 20), mascotStyle: id(base + 21),
    logoAsset: away ? AWAY_LOGO_ASSET : HOME_LOGO_ASSET,
    scoreStyle: id(away ? 3004 : 3006), scoreReveal: id(away ? 3010 : 3012),
    scoreGate: id(away ? 3020 : 3022), scoreTint: id(away ? 3021 : 3023),
    leadsScore: SCORE_LEADER === side,
    property: away
      ? {
        school: P.awaySchool, mascot: P.awayMascot, score: P.awayScore, logo: P.awayLogo,
        primary: P.awayPrimaryColor, secondary: P.awaySecondaryColor, scoreLead: P.awayScoreLeadOpacity,
      }
      : {
        school: P.homeSchool, mascot: P.homeMascot, score: P.homeScore, logo: P.homeLogo,
        primary: P.homePrimaryColor, secondary: P.homeSecondaryColor, scoreLead: P.homeScoreLeadOpacity,
      },
  };
};
const TEAMS = [teamElements('away'), teamElements('home')] as const;
type Team = (typeof TEAMS)[number];

// Per-row elements, 3100 + 100 per row.
const rowElements = (index: number) => {
  const base = 3100 + index * 100;
  const statistic = STATISTICS[index]!;
  return {
    index, name: `Row ${index + 1}`, statistic, leader: leaderOf(statistic), property: P.row(index),
    node: id(base),
    awayValueStyle: id(base + 4), awayDetailStyle: id(base + 5), labelStyle: id(base + 6),
    homeValueStyle: id(base + 7), homeDetailStyle: id(base + 8),
    awayReveal: id(base + 10), labelReveal: id(base + 11), homeReveal: id(base + 12),
    awayGate: id(base + 20), awayTint: id(base + 21), homeGate: id(base + 22), homeTint: id(base + 23),
  };
};
const ROWS = STATISTICS.map((_, index) => rowElements(index));
type Row = (typeof ROWS)[number];

// --- markup helpers -------------------------------------------------------------------

const rectangle = (width: number, height: number, radii: Radii, position = '', children = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"${children ? `>${children}</Rectangle>` : '/>'}`;

const bound = (property: number, key: number, converterId = '') =>
  `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"${converterId ? ` converterId="${converterId}"` : ''}/>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const glassBody = (name: string, width: number, height: number, radii: Radii) => `<Shape name="${name} Body" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

/** Dark glass: a glaze over a near-black body, as on every v2 strip. */
const darkGlass = (name: string, width: number, height: number, radii: Radii) =>
  `${glaze(name, width, height, radii, '59FFFFFF')}
  ${glassBody(name, width, height, radii)}`;

const underlay = (name: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

/** One-run text with a fixed box; without a property the text is fixed copy. */
const text = (o: {
  name: string; x: number; y: number; width: number; height: number; font: string; size: number; spacing: number;
  color: string; styleId: string; value: string; property?: number; reveal: string; align?: 'center' | 'right';
}) => `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.height}" sizingValue="fixed" overflowValue="fitFontSize"${o.align ? ` alignValue="${o.align}"` : ''}><TextStylePaint id="${o.styleId}" fontAssetId="${o.font}" fontSize="${o.size}" letterSpacing="${o.spacing}"><Fill><SolidColor colorValue="${o.color}"/></Fill></TextStylePaint><TextValueRun name="${o.name} Value" styleId="${o.styleId}" text="${o.value}">${o.property === undefined ? '' : bound(o.property, TEXT)}</TextValueRun>${rise(o.name, o.reveal)}</Text>`;

// --- team panels ----------------------------------------------------------------------

const teamPanel = (t: Team) => {
  // The stripe is anchored at the seam end so the intro draws it outward.
  const stripeX = t.side === 'away' ? TEAM_WIDTH : 0;
  const stripeOrigin = t.side === 'away' ? 1 : 0;
  return `<Node name="${t.name} Panel" id="${t.panel}" x="${t.x}" y="0">
  <ClippingShape name="${t.name} Reveal Clip" sourceId="${REVEAL_MASK}"/>
  <!-- Clipped by the tint, so the stripe follows the rounded outer corner. -->
  <Shape name="${t.name} Stripe" id="${t.stripe}" x="${stripeX}" y="0">
    <Rectangle width="${TEAM_WIDTH}" height="${STRIPE_HEIGHT}" originX="${stripeOrigin}" originY="0"/>
    <Fill><SolidColor colorValue="${t.data.secondary}">${bound(t.property.secondary, COLOR)}</SolidColor></Fill>
    <ClippingShape name="${t.name} Stripe Clip" sourceId="${t.tint}"/>
  </Shape>
  <!-- A light hairline under the stripe keeps a dark secondary colour legible. -->
  <Shape name="${t.name} Stripe Hairline" id="${t.hairline}" x="${stripeX}" y="${STRIPE_HEIGHT}">
    <Rectangle width="${TEAM_WIDTH}" height="1" originX="${stripeOrigin}" originY="0"/>
    <Fill><SolidColor colorValue="59FFFFFF"/></Fill>
    <ClippingShape name="${t.name} Stripe Hairline Clip" sourceId="${t.tint}"/>
  </Shape>
  <!-- The intro drifts the content outward behind the leading edge, more slowly than
       the edge, so the glass appears to open over it. The mascot shares the score's
       baseline. -->
  <Node name="${t.name} Content" id="${t.content}" x="0" y="0">
    ${text({ name: `${t.name} School`, x: 20, y: 72, width: TEAM_WIDTH - 40, height: 36, font: FONT_REGULAR, size: 30, spacing: 2, color: 'B3FFFFFF', styleId: t.schoolStyle, value: t.data.school, property: t.property.school, reveal: t.schoolReveal, align: 'center' })}
    ${text({ name: `${t.name} Mascot`, x: 20, y: SCORE_Y + 79, width: TEAM_WIDTH - 40, height: 96, font: FONT_BOLD, size: 84, spacing: 0.5, color: 'FFFFFFFF', styleId: t.mascotStyle, value: t.data.mascot, property: t.property.mascot, reveal: t.mascotReveal, align: 'center' })}
    <!-- Centred on the group so it scales in place. -->
    <Node name="${t.name} Logo Group" id="${t.logo}" x="${LOGO_X}" y="${LOGO_Y}">
      <Image name="${t.name} Logo" x="0" y="0" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${t.logoAsset}">${bound(t.property.logo, IMAGE)}</Image>
    </Node>
    <!-- A soft light bloom behind the logo, as if the glass were lit from behind. -->
    <Shape name="${t.name} Logo Bloom" id="${t.bloom}" x="${LOGO_X}" y="${LOGO_Y}">
      <Ellipse width="${BLOOM_SIZE}" height="${BLOOM_SIZE}"/>
      <Fill><RadialGradient startX="0" startY="0" endX="${BLOOM_SIZE / 2}" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
      <ClippingShape name="${t.name} Logo Bloom Clip" sourceId="${t.tint}"/>
    </Shape>
  </Node>
  ${glaze(t.name, TEAM_WIDTH, CARD_HEIGHT, t.radii)}
  <Shape name="${t.name} Tint" id="${t.tint}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(TEAM_WIDTH, CARD_HEIGHT, t.radii)}
    <Fill><SolidColor colorValue="${t.data.primary}">${bound(t.property.primary, COLOR)}</SolidColor></Fill>
  </Shape>
  ${underlay(`${t.name} Underlay`, TEAM_WIDTH, CARD_HEIGHT, t.radii)}
</Node>`;
};

// --- column ---------------------------------------------------------------------------

/**
 * A team's value cell: dark glass under the team's tint. The tint's own opacity is the
 * controller's lead mark (1 when this team leads the row); the gate around it carries
 * the resting tint opacity and the intro's fade.
 */
const valueCell = (o: {
  name: string; x: number; height: number; content: string; gate: string; tint: string;
  team: Team; leadProperty: number; leads: boolean;
}) => `<Node name="${o.name} Cell" x="${o.x}" y="0">
  ${o.content}
  ${glaze(o.name, VALUE_WIDTH, o.height, INNER_RADII, '59FFFFFF')}
  <Node name="${o.name} Lead Gate" id="${o.gate}" x="0" y="0" opacity="${TINT_OPACITY}">
    <Shape name="${o.name} Lead Tint" id="${o.tint}" x="0" y="0" opacity="${o.leads ? 1 : 0}">${bound(o.leadProperty, OPACITY)}
      ${rectangle(VALUE_WIDTH, o.height, INNER_RADII)}
      <Fill><SolidColor colorValue="${o.team.data.primary}">${bound(o.team.property.primary, COLOR)}</SolidColor></Fill>
    </Shape>
  </Node>
  ${glassBody(o.name, VALUE_WIDTH, o.height, INNER_RADII)}
</Node>`;

const labelCell = (name: string, height: number, content: string) => `<Node name="${name} Cell" x="${LABEL_X}" y="0">
  ${content}
  ${darkGlass(name, LABEL_WIDTH, height, INNER_RADII)}
</Node>`;

const titleStrip = `<Node name="Title Strip" id="${TITLE_STRIP}" x="0" y="0">
  ${text({ name: 'Title', x: 24, y: 44, width: COLUMN_WIDTH - 48, height: 46, font: FONT_BOLD, size: 40, spacing: 1, color: 'FFFFFFFF', styleId: TITLE_STYLE, value: TITLE, property: P.title, reveal: TITLE_REVEAL, align: 'center' })}
  ${darkGlass('Title Strip', COLUMN_WIDTH, TITLE_HEIGHT, INNER_RADII)}
</Node>`;

const scoreCell = (t: Team) => valueCell({
  name: `${t.name} Score`, x: t.scoreX, height: SCORE_HEIGHT, gate: t.scoreGate, tint: t.scoreTint, team: t,
  leadProperty: t.property.scoreLead, leads: t.leadsScore,
  content: text({ name: `${t.name} Score`, x: 16, y: 79, width: VALUE_WIDTH - 32, height: 96, font: FONT_BOLD, size: 84, spacing: 0.5, color: 'FFFFFFFF', styleId: t.scoreStyle, value: t.data.score, property: t.property.score, reveal: t.scoreReveal, align: 'center' }),
});

const scoreRow = `<Node name="Score Row" id="${SCORE_ROW}" x="0" y="${SCORE_Y}">
  ${scoreCell(TEAMS[0])}
  ${labelCell('Score Label', SCORE_HEIGHT, text({ name: 'Score Label', x: 12, y: 59, width: LABEL_WIDTH - 24, height: 30, font: FONT_REGULAR, size: 26, spacing: 2, color: 'B3FFFFFF', styleId: SCORE_LABEL_STYLE, value: 'SCORE', reveal: SCORE_LABEL_REVEAL, align: 'center' }))}
  ${scoreCell(TEAMS[1])}
</Node>`;

/**
 * A statistic: the value in Bold, then its muted detail (a percentage, say). The gap
 * between them comes from the detail through detail_separator.luau, so a statistic
 * without a detail stays centred.
 */
const statisticText = (o: {
  name: string; value: string; detail: string; valueProperty: number; detailProperty: number;
  valueStyle: string; detailStyle: string; reveal: string;
}) => `<Text name="${o.name}" x="12" y="45" originValue="baseline" wrapValue="noWrap" width="${VALUE_WIDTH - 24}" height="52" sizingValue="fixed" overflowValue="fitFontSize" alignValue="center">
    <TextStylePaint id="${o.valueStyle}" fontAssetId="${FONT_BOLD}" fontSize="44" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
    <TextStylePaint id="${o.detailStyle}" fontAssetId="${FONT_REGULAR}" fontSize="30" letterSpacing="1"><Fill><SolidColor colorValue="A6FFFFFF"/></Fill></TextStylePaint>
    <TextValueRun name="${o.name} Figure" styleId="${o.valueStyle}" text="${o.value}">${bound(o.valueProperty, TEXT)}</TextValueRun>
    <TextValueRun name="${o.name} Detail Separator" styleId="${o.detailStyle}" text="${o.detail ? DETAIL_GAP : ''}">${bound(o.detailProperty, TEXT, DETAIL_SEPARATOR)}</TextValueRun>
    <TextValueRun name="${o.name} Detail" styleId="${o.detailStyle}" text="${o.detail}">${bound(o.detailProperty, TEXT)}</TextValueRun>
  ${rise(o.name, o.reveal)}</Text>`;

const statisticRow = (r: Row) => {
  const [away, home] = TEAMS;
  const s = r.statistic;
  return `<Node name="${r.name}" id="${r.node}" x="0" y="${rowY(r.index)}">
  ${valueCell({
    name: `${r.name} Away`, x: 0, height: ROW_HEIGHT, gate: r.awayGate, tint: r.awayTint, team: away,
    leadProperty: r.property.awayLeadOpacity, leads: r.leader === 'away',
    content: statisticText({ name: `${r.name} Away`, value: s.awayValue, detail: s.awayDetail, valueProperty: r.property.awayValue, detailProperty: r.property.awayDetail, valueStyle: r.awayValueStyle, detailStyle: r.awayDetailStyle, reveal: r.awayReveal }),
  })}
  ${labelCell(`${r.name} Label`, ROW_HEIGHT, text({ name: `${r.name} Label`, x: 12, y: 39, width: LABEL_WIDTH - 24, height: 30, font: FONT_REGULAR, size: 26, spacing: 2, color: 'B3FFFFFF', styleId: r.labelStyle, value: s.label, property: r.property.label, reveal: r.labelReveal, align: 'center' }))}
  ${valueCell({
    name: `${r.name} Home`, x: HOME_VALUE_X, height: ROW_HEIGHT, gate: r.homeGate, tint: r.homeTint, team: home,
    leadProperty: r.property.homeLeadOpacity, leads: r.leader === 'home',
    content: statisticText({ name: `${r.name} Home`, value: s.homeValue, detail: s.homeDetail, valueProperty: r.property.homeValue, detailProperty: r.property.homeDetail, valueStyle: r.homeValueStyle, detailStyle: r.homeDetailStyle, reveal: r.homeReveal }),
  })}
</Node>`;
};

// The label and the chip slide down together from under the last row, clipped to the
// strip; the strip's glass is revealed with the rest of the column.
const sponsorStrip = `<Node name="Sponsor Strip" id="${SPONSOR_STRIP}" x="0" y="${STRIP_Y}">
  <Node name="Sponsor Sliding Content" id="${SPONSOR_CONTENT}" x="0" y="0">
    <ClippingShape name="Sponsor Slide Clip" sourceId="${SPONSOR_MASK}"/>
    ${text({ name: 'Sponsor Label', x: SPONSOR_LABEL_X, y: 50, width: SPONSOR_LABEL_WIDTH, height: 26, font: FONT_REGULAR, size: 22, spacing: 2, color: 'A6FFFFFF', styleId: SPONSOR_LABEL_STYLE, value: 'PRESENTED BY', reveal: SPONSOR_LABEL_REVEAL, align: 'right' })}
    <!-- The sponsor in full colour on a white chip. -->
    <Node name="Sponsor Chip" id="${SPONSOR_CHIP}" x="${CHIP_X}" y="${CHIP_INSET}">
      <Image name="Sponsor Logo" id="${SPONSOR_LOGO}" x="${CHIP_WIDTH / 2}" y="${CHIP_HEIGHT / 2}" scaleX="${SPONSOR_SCALE}" scaleY="${SPONSOR_SCALE}" assetId="${SPONSOR_ASSET}">${bound(P.sponsorLogo, IMAGE)}</Image>
      <Shape name="Sponsor Chip Body" x="0" y="0">
        ${rectangle(CHIP_WIDTH, CHIP_HEIGHT, CHIP_RADII)}
        <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${CHIP_HEIGHT}"><GradientStop colorValue="FFFFFFFF" position="0"/><GradientStop colorValue="FFE9ECF0" position="1"/></LinearGradient></Fill>
      </Shape>
    </Node>
  </Node>
  ${darkGlass('Sponsor Strip', COLUMN_WIDTH, STRIP_HEIGHT, INNER_RADII)}
</Node>`;

const column = `<Node name="Statistics Column" id="${COLUMN}" x="${COLUMN_X}" y="0">
  <ClippingShape name="Column Reveal Clip" sourceId="${REVEAL_MASK}"/>
  ${titleStrip}
  ${scoreRow}
${ROWS.map(statisticRow).join('\n')}
  ${sponsorStrip}
</Node>`;

const CELL_COLUMNS: [number, number][] = [[0, VALUE_WIDTH], [LABEL_X, LABEL_WIDTH], [HOME_VALUE_X, VALUE_WIDTH]];
const silhouette = [
  rectangle(TEAM_WIDTH, CARD_HEIGHT, AWAY_RADII, ' x="0" y="0"'),
  rectangle(TEAM_WIDTH, CARD_HEIGHT, HOME_RADII, ` x="${HOME_X}" y="0"`),
  rectangle(COLUMN_WIDTH, TITLE_HEIGHT, INNER_RADII, ` x="${COLUMN_X}" y="0"`),
  ...CELL_COLUMNS.map(([x, width]) => rectangle(width, SCORE_HEIGHT, INNER_RADII, ` x="${COLUMN_X + x}" y="${SCORE_Y}"`)),
  ...ROWS.flatMap((r) => CELL_COLUMNS.map(([x, width]) => rectangle(width, ROW_HEIGHT, INNER_RADII, ` x="${COLUMN_X + x}" y="${rowY(r.index)}"`))),
  rectangle(COLUMN_WIDTH, STRIP_HEIGHT, INNER_RADII, ` x="${COLUMN_X}" y="${STRIP_Y}"`),
].join('\n  ');

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
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const RANGES = [
  TITLE_REVEAL, SCORE_LABEL_REVEAL, SPONSOR_LABEL_REVEAL,
  ...TEAMS.flatMap((t) => [t.schoolReveal, t.mascotReveal, t.scoreReveal]),
  ...ROWS.flatMap((r) => [r.awayReveal, r.labelReveal, r.homeReveal]),
];
const GATES = [...TEAMS.map((t) => t.scoreGate), ...ROWS.flatMap((r) => [r.awayGate, r.homeGate])];
const EDGE_LIGHTS = [AWAY_EDGE_LIGHT, HOME_EDGE_LIGHT];
const STRIPES = TEAMS.flatMap((t) => [t.stripe, t.hairline]);

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];

const intro: Track[] = [
  hold(CONTENT, OPACITY, 1),
  move(REVEAL_MASK_RECTANGLE, PATH_WIDTH, 0, MASK_WIDTH, WIPE_START, WIPE_END, EASE_WIPE),
  move(AWAY_EDGE, X, SEAM_X, -8, WIPE_START, WIPE_END, EASE_WIPE),
  move(HOME_EDGE, X, SEAM_X, CARD_WIDTH + 8, WIPE_START, WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [
    move(light, SCALE_Y, 0, 1, 0, 16, EASE_OUT),
    { objectId: light, propertyKey: OPACITY, keys: edgeFlare(18, 42) },
  ]),
  move(SHADOW_RECTANGLE, PATH_WIDTH, 0, CARD_WIDTH, WIPE_START, WIPE_END, EASE_WIPE),
  move(SHADOW, OPACITY, 0, 0.6, WIPE_START, 36, EASE_OUT),
  ...reveal(TITLE_REVEAL, 14, 40),
  ...reveal(SCORE_LABEL_REVEAL, 16, 36),
  ...TEAMS.flatMap((t): Track[] => [
    move(t.content, X, t.towardSeam * CONTENT_DRIFT, 0, 14, 64, EASE_OUT),
    ...scale(t.bloom, 0.6, 1, 18, 60, EASE_OUT),
    move(t.bloom, OPACITY, 0, 1, 18, 44, EASE_OUT),
    ...reveal(t.scoreReveal, 20, 44),
    ...scale(t.logo, 1.12, 1, 22, 70, EASE_OUT),
    move(t.logo, OPACITY, 0, 1, 22, 42, EASE_OUT),
    move(t.stripe, SCALE_X, 0, 1, 24, 50, EASE_WIPE),
    move(t.hairline, SCALE_X, 0, 1, 24, 50, EASE_WIPE),
    ...reveal(t.schoolReveal, 26, 48),
    ...reveal(t.mascotReveal, 28, 54),
    move(t.scoreGate, OPACITY, 0, TINT_OPACITY, 44, 60, EASE_OUT),
  ]),
  // The labels, then the values, rise row by row; the leaders light last.
  ...ROWS.flatMap((r): Track[] => {
    const i = r.index;
    return [
      ...reveal(r.labelReveal, 16 + 2 * i, 36 + 2 * i),
      ...reveal(r.awayReveal, 22 + 3 * i, 44 + 3 * i),
      ...reveal(r.homeReveal, 22 + 3 * i, 44 + 3 * i),
      move(r.awayGate, OPACITY, 0, TINT_OPACITY, 48 + 3 * i, 64 + 3 * i, EASE_OUT),
      move(r.homeGate, OPACITY, 0, TINT_OPACITY, 48 + 3 * i, 64 + 3 * i, EASE_OUT),
    ];
  }),
  move(SPONSOR_CONTENT, Y, -SPONSOR_SLIDE, 0, 30, 54, EASE_OUT),
  ...reveal(SPONSOR_LABEL_REVEAL, 36, 56),
  move(SPONSOR_LOGO, OPACITY, 0, 1, 30, 54, EASE_OUT),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, 44, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: 44, value: 0, linear: true }, { frame: 50, value: 0.65, linear: true },
      { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
    ],
  },
];

const settledRanges = RANGES.flatMap(revealed);
const settledGates = GATES.map((gate) => hold(gate, OPACITY, TINT_OPACITY));
const settledSweep = [hold(INTRO_SWEEP, X, SWEEP_END), hold(INTRO_SWEEP, OPACITY, 0)];

const settled: Track[] = [
  hold(CONTENT, OPACITY, 1),
  hold(REVEAL_MASK_RECTANGLE, PATH_WIDTH, MASK_WIDTH),
  hold(AWAY_EDGE, X, -8),
  hold(HOME_EDGE, X, CARD_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(SHADOW_RECTANGLE, PATH_WIDTH, CARD_WIDTH),
  hold(SHADOW, OPACITY, 0.6),
  ...TEAMS.flatMap((t) => [
    hold(t.content, X, 0),
    hold(t.bloom, SCALE_X, 1), hold(t.bloom, SCALE_Y, 1), hold(t.bloom, OPACITY, 1),
    hold(t.logo, SCALE_X, 1), hold(t.logo, SCALE_Y, 1), hold(t.logo, OPACITY, 1),
  ]),
  ...STRIPES.map((stripe) => hold(stripe, SCALE_X, 1)),
  ...settledGates,
  hold(SPONSOR_CONTENT, Y, 0),
  hold(SPONSOR_LOGO, OPACITY, 1),
  ...settledRanges,
  ...settledSweep,
];

const outro: Track[] = [
  { objectId: CONTENT, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] },
  closing(REVEAL_MASK_RECTANGLE, PATH_WIDTH, MASK_WIDTH, 0, 2, OUTRO_FRAMES),
  closing(AWAY_EDGE, X, -8, SEAM_X, 2, OUTRO_FRAMES),
  closing(HOME_EDGE, X, CARD_WIDTH + 8, SEAM_X, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  hold(SHADOW_RECTANGLE, PATH_WIDTH, CARD_WIDTH),
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  ...TEAMS.flatMap((t): Track[] => [
    closing(t.content, X, 0, t.towardSeam * 24, 0, OUTRO_FRAMES),
    hold(t.bloom, SCALE_X, 1), hold(t.bloom, SCALE_Y, 1),
    closing(t.bloom, OPACITY, 1, 0, 0, 16),
    closing(t.logo, SCALE_X, 1, 1.06, 0, 16), closing(t.logo, SCALE_Y, 1, 1.06, 0, 16),
    closing(t.logo, OPACITY, 1, 0, 0, 16),
  ]),
  ...STRIPES.map((stripe) => closing(stripe, SCALE_X, 1, 0, 6, 22)),
  ...settledGates,
  closing(SPONSOR_CONTENT, Y, 0, -SPONSOR_SLIDE, 0, 18),
  hold(SPONSOR_LOGO, OPACITY, 1),
  ...settledRanges,
  ...settledSweep,
];

const hidden: Track[] = [
  hold(CONTENT, OPACITY, 0),
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

const stateMachine = `<StateMachine name="Halftime Statistics" id="${id(7)}">
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
  string('title', P.title),
  string('awaySchool', P.awaySchool),
  string('awayMascot', P.awayMascot),
  string('homeSchool', P.homeSchool),
  string('homeMascot', P.homeMascot),
  string('awayScore', P.awayScore),
  string('homeScore', P.homeScore),
  image('awayLogo', P.awayLogo),
  image('homeLogo', P.homeLogo),
  color('awayPrimaryColor', P.awayPrimaryColor),
  color('homePrimaryColor', P.homePrimaryColor),
  color('awaySecondaryColor', P.awaySecondaryColor),
  color('homeSecondaryColor', P.homeSecondaryColor),
  image('sponsorLogo', P.sponsorLogo),
  ...ROWS.flatMap((r) => {
    const row = `row${r.index + 1}`;
    return [
      string(`${row}Label`, r.property.label),
      string(`${row}AwayValue`, r.property.awayValue),
      string(`${row}AwayDetail`, r.property.awayDetail),
      string(`${row}HomeValue`, r.property.homeValue),
      string(`${row}HomeDetail`, r.property.homeDetail),
      string(`${row}LeadingValue`, r.property.leadingValue),
    ];
  }),
  number('_awayScoreLeadOpacity', P.awayScoreLeadOpacity),
  number('_homeScoreLeadOpacity', P.homeScoreLeadOpacity),
  ...ROWS.flatMap((r) => [
    number(`_row${r.index + 1}AwayLeadOpacity`, r.property.awayLeadOpacity),
    number(`_row${r.index + 1}HomeLeadOpacity`, r.property.homeLeadOpacity),
  ]),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const numberValue = (local: number, value: number) => `<ViewModelInstanceNumber viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const imageValue = (local: number, asset: string) => `<ViewModelInstanceAssetImage viewModelPropertyId="${id(local)}" propertyValue="${asset}"/>`;
const colorValue = (local: number, value: string) => `<ViewModelInstanceColor viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.title, TITLE),
  stringValue(P.awaySchool, AWAY.school),
  stringValue(P.awayMascot, AWAY.mascot),
  stringValue(P.homeSchool, HOME.school),
  stringValue(P.homeMascot, HOME.mascot),
  stringValue(P.awayScore, AWAY.score),
  stringValue(P.homeScore, HOME.score),
  imageValue(P.awayLogo, AWAY_LOGO_ASSET),
  imageValue(P.homeLogo, HOME_LOGO_ASSET),
  colorValue(P.awayPrimaryColor, AWAY.primary),
  colorValue(P.homePrimaryColor, HOME.primary),
  colorValue(P.awaySecondaryColor, AWAY.secondary),
  colorValue(P.homeSecondaryColor, HOME.secondary),
  imageValue(P.sponsorLogo, SPONSOR_ASSET),
  ...ROWS.flatMap((r) => [
    stringValue(r.property.label, r.statistic.label),
    stringValue(r.property.awayValue, r.statistic.awayValue),
    stringValue(r.property.awayDetail, r.statistic.awayDetail),
    stringValue(r.property.homeValue, r.statistic.homeValue),
    stringValue(r.property.homeDetail, r.statistic.homeDetail),
    stringValue(r.property.leadingValue, r.statistic.leadingValue),
  ]),
  numberValue(P.awayScoreLeadOpacity, SCORE_LEADER === 'away' ? 1 : 0),
  numberValue(P.homeScoreLeadOpacity, SCORE_LEADER === 'home' ? 1 : 0),
  ...ROWS.flatMap((r) => [
    numberValue(r.property.awayLeadOpacity, r.leader === 'away' ? 1 : 0),
    numberValue(r.property.homeLeadOpacity, r.leader === 'home' ? 1 : 0),
  ]),
];

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" y="${CARD_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${CARD_HEIGHT / 2}"><Rectangle width="2" height="${CARD_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${CARD_HEIGHT / 2}"><Rectangle width="44" height="${CARD_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_halftime_statistics.ts; edit that file, not this one.
     Basketball halftime statistics v2: a card, ${CARD_WIDTH} x ${CARD_HEIGHT}, centred on a transparent
     1920 x 1080 canvas (origin ${CARD_X}, ${CARD_Y}), clear of the scorebug. Tinted team panels at either
     end carry the school, mascot and logo; between them a dark glass column holds the title,
     the score row, six statistic rows and the sponsor strip. The leading team's cell in each
     row takes that team's tint. Sibling draw order is front to back; within one shape the
     last paint declared is on top. -->
<Artboard name="Basketball Halftime Statistics v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Halftime Statistics v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- Compares each row's figures and marks the leading team's cell. -->
<ScriptedDrawable name="Halftime Statistics Controller" scriptAssetId="${CONTROLLER_ASSET}"/>

<Node name="Halftime Statistics Card" id="${ROOT}" x="${CARD_X}" y="${CARD_Y}">

<!-- Seam ignition at the centre of the card; the two edges ride the reveal mask outward. -->
<Node name="Away Leading Edge" id="${AWAY_EDGE}" x="-8">
  ${edgeLight('Away', AWAY_EDGE_LIGHT, 1)}
</Node>
<Node name="Home Leading Edge" id="${HOME_EDGE}" x="${CARD_WIDTH + 8}">
  ${edgeLight('Home', HOME_EDGE_LIGHT, -1)}
</Node>
<!-- The intro's closing flourish: one soft diagonal sheen crosses the glass, clipped to
     the card silhouette. Invisible at rest. -->
<Shape name="Card Specular Sweep" id="${INTRO_SWEEP}" x="${SWEEP_END}" y="${CARD_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="180" height="${Math.round(CARD_HEIGHT * 1.7)}" originX="0.5" originY="0.5"/>
  <Fill><LinearGradient startX="-90" startY="0" endX="90" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="24FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
</Shape>

<Node name="Card Content" id="${CONTENT}" x="0" y="0">
<!-- ============================== Away panel ================================ -->
${teamPanel(TEAMS[0])}

<!-- ============================== Column ==================================== -->
${column}

<!-- ============================== Home panel ================================ -->
${teamPanel(TEAMS[1])}
</Node>

<!-- Separation from bright video: a feathered dark stroke around the card. Its origin
     is the top centre, so the intro grows it with the revealed area. -->
<Shape name="Card Shadow" id="${SHADOW}" x="${SEAM_X}" y="4" opacity="0.6">
  <Rectangle id="${SHADOW_RECTANGLE}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" originX="0.5" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>

<!-- ============================= Clip sources ============================= -->
<!-- Unpainted, so they contribute geometry and draw nothing. The reveal mask is centred
     on the seam and opens both ways at once; at rest it covers the card. -->
<Shape name="Card Reveal Mask" id="${REVEAL_MASK}" x="${SEAM_X}" y="-8"><Rectangle id="${REVEAL_MASK_RECTANGLE}" width="${MASK_WIDTH}" height="${CARD_HEIGHT + 16}" originX="0.5" originY="0"/></Shape>
<Shape name="Card Silhouette" id="${SILHOUETTE}">
  ${silhouette}
</Shape>
<Shape name="Sponsor Slide Mask" id="${SPONSOR_MASK}" x="${COLUMN_X}" y="${STRIP_Y}">${rectangle(COLUMN_WIDTH, STRIP_HEIGHT, INNER_RADII)}</Shape>
</Node>

<!-- Intro: seam ignition, one wipe opening outward both ways, team content drifting out
     behind the edges as the logos settle, type rising row by row, the sponsor sliding down,
     the leaders lighting and one sheen; ${(INTRO_FRAMES / 60).toFixed(2)} s. Hold and Outro
     explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Defaults off. -->
${stateMachine}
</Artboard>

<FontAsset name="Halftime Statistics v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Halftime Statistics v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Halftime Statistics v2 Saint Joseph's" id="${AWAY_LOGO_ASSET}" file="${AWAY.logoFile}"/>
<ImageAsset name="Halftime Statistics v2 Drexel" id="${HOME_LOGO_ASSET}" file="${HOME.logoFile}"/>
<ImageAsset name="Halftime Statistics v2 Drexel Physical Therapy" id="${SPONSOR_ASSET}" file="assets/images/sponsors/drexel_physical_therapy_trimmed.png"/>
<ScriptAsset name="halftime_statistics_controller" folderPath="graphics/basketball-v2" id="${CONTROLLER_ASSET}" file="graphics/basketball-v2/halftime_statistics_controller.luau"/>
<ScriptAsset name="detail_separator" folderPath="graphics/basketball-v2" id="${SEPARATOR_ASSET}" file="graphics/basketball-v2/detail_separator.luau"/>
<ScriptedDataConverter name="Detail Separator" id="${DETAIL_SEPARATOR}" scriptAssetId="${SEPARATOR_ASSET}"/>

<ViewModel name="BasketballHalftimeStatisticsV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'halftime_statistics.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
