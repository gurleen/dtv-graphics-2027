/**
 * Generates the matchup locator lower third scene from one description:
 *
 *   bun graphics/basketball-v2/generate_matchup_locator_lower_third.ts
 *
 * writes matchup_locator_lower_third.rml beside this file. Edit this file, not the output.
 *
 * A pre-game matchup banner: the full-screen matchup locator recast as a wide lower
 * third. The block spans the action-safe width and stands on the scorebug's baseline, so
 * it overlaps the scorebug: take the scorebug off air before playing it.
 *
 *   Band    a team panel at each end, its logo large at the outer end and cropped by the
 *           panel's edges, then the school, mascot and records; the VS panel between them.
 *   Tab     an optional event title above the VS panel; a blank title hides it.
 *   Strip   venue and location, then PRESENTED BY and the sponsor logo.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro, gated on
 * `isPlaying`). The title's presence and the separators between optional values are
 * computed by matchup_locator_lower_third_controller.luau, which writes the
 * `_`-prefixed view model properties bound below.
 */

import { join } from 'node:path';

const PREFIX = 42;
const ARTBOARD_Y = 17000;

// Test data: Saint Joseph's at Drexel, as on the full-screen locator (see the package README).
const AWAY = {
  school: "SAINT JOSEPH'S", mascot: 'HAWKS', overallRecord: '15-5', conferenceRecord: '7-2 A10',
  logoFile: 'assets/images/scorebug/saint-josephs.png', primary: 'FFC2071B', secondary: 'FF101010',
};
const HOME = {
  school: 'DREXEL', mascot: 'DRAGONS', overallRecord: '14-6', conferenceRecord: '6-3 CAA',
  logoFile: 'assets/images/scorebug/drexel.png', primary: 'FF07294D', secondary: 'FFFFC600',
};
const EVENT_TITLE = 'COLLEGE BASKETBALL';
const VENUE = { name: 'DASKALAKIS ATHLETIC CENTER', location: 'PHILADELPHIA, PA' };

// Geometry. The block spans the action-safe width (x 96 to 1824) and stands on the
// scorebug's baseline (y 1022). The event title tab sits above the middle of the band and
// the strip runs the full width below it; y 0 is the tab's top edge.
const BLOCK_X = 96;
const BLOCK_WIDTH = 1728;
const GAP = 4;
const TAB_WIDTH = 440;
const TAB_HEIGHT = 44;
const TAB_Y = 0;
const BAND_Y = TAB_Y + TAB_HEIGHT + GAP;
const BAND_HEIGHT = 136;
const BAND_BOTTOM = BAND_Y + BAND_HEIGHT;
const STRIP_Y = BAND_BOTTOM + GAP;
const STRIP_HEIGHT = 52;
const BLOCK_HEIGHT = STRIP_Y + STRIP_HEIGHT;
const BLOCK_Y = 1022 - BLOCK_HEIGHT;
const SEAM = BLOCK_WIDTH / 2;
const VERSUS_WIDTH = 136;
const VERSUS_X = SEAM - VERSUS_WIDTH / 2;
const AWAY_PANEL_X = 0;
const PANEL_WIDTH = VERSUS_X - GAP;
const HOME_PANEL_X = VERSUS_X + VERSUS_WIDTH + GAP;
const TAB_X = SEAM - TAB_WIDTH / 2;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 8;
const CONTENT_DRIFT = 22;
const TEXT_INSET = 24;
// The logo sits at its panel's outer end, larger than the band, so the panel crops it at
// the outer edge, top and bottom. A 1024 logo source holds about 600 x 430 of visible
// mark: at 0.44 that is about 264 x 189 against the band's 136. LOGO_CENTRE is the
// distance of the logo's centre from the panel's outer edge; the text starts TEXT_START
// from that edge, clear of the widest mark.
const LOGO_SCALE = 0.44;
const LOGO_CENTRE = 62;
const LOGO_DRIFT = 24;
const TEXT_START = 240;
const BLOOM_SIZE = 380;
// The Independence Blue Cross export is 1600 x 204; 26.5 units tall on the strip.
const SPONSOR_SCALE = 0.13;
const SPONSOR_WIDTH = 1600 * SPONSOR_SCALE;
const SPONSOR_X = BLOCK_WIDTH - TEXT_INSET - SPONSOR_WIDTH / 2;
const SPONSOR_LABEL_WIDTH = 200;
const SPONSOR_LABEL_X = SPONSOR_X - SPONSOR_WIDTH / 2 - 16 - SPONSOR_LABEL_WIDTH;
// How far the tab and strip travel: each starts wholly behind its slide mask.
const TAB_DROP = TAB_HEIGHT + GAP;
const STRIP_DROP = STRIP_HEIGHT + GAP;
// The reveal mask and edge lights run REVEAL_OVERHANG past each end of the block.
const REVEAL_OVERHANG = 24;
const SWEEP_START = -120;
const SWEEP_END = BLOCK_WIDTH + 120;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 84;
const OUTRO_FRAMES = 24;
const WIPE_START = 6;
const WIPE_END = 40;
const SWEEP_FROM = 44;

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
const FALLOFF_FROM = 317;
const FALLOFF_TO = 318;
const MODIFY_FROM = 327;
const MODIFY_TO = 336;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const SHADOW = id(20);
const SHADOW_PATH = id(50);
const BAND = id(300);
const VERSUS = id(310);
const VERSUS_STYLE = id(311);
const VERSUS_REVEAL = id(312);
const TAB = id(400);
const TAB_PRESENCE = id(401);
const TAB_RISE = id(402);
const TITLE_STYLE = id(403);
const TITLE_REVEAL = id(404);
const TAB_SWEEP = id(405);
const STRIP = id(450);
const STRIP_SLIDE = id(451);
const VENUE_NAME_STYLE = id(452);
const VENUE_LOCATION_STYLE = id(453);
const VENUE_REVEAL = id(454);
const SPONSOR_LABEL_STYLE = id(455);
const SPONSOR_LABEL_REVEAL = id(456);
const SPONSOR_LOGO = id(457);
const AWAY_EDGE_LIGHT = id(502);
const HOME_EDGE_LIGHT = id(507);
const REVEAL_MASK = id(510);
const TAB_MASK = id(512);
const STRIP_MASK = id(513);
const INTRO_SWEEP = id(600);
const SILHOUETTE = id(610);
const TAB_SILHOUETTE = id(611);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const AWAY_LOGO_ASSET = id(910);
const HOME_LOGO_ASSET = id(911);
const SPONSOR_ASSET = id(912);
const CONTROLLER_ASSET = id(950);

// View model properties. Underscored ones are written by the controller script;
// operators never set them.
const P = {
  isPlaying: 1002,
  awaySchool: 1010, homeSchool: 1011,
  awayOverallRecord: 1012, homeOverallRecord: 1013,
  awayConferenceRecord: 1014, homeConferenceRecord: 1015,
  awayMascot: 1016, homeMascot: 1017,
  eventTitle: 1018,
  awayLogo: 1020, homeLogo: 1021,
  awayPrimaryColor: 1022, homePrimaryColor: 1023,
  awaySecondaryColor: 1024, homeSecondaryColor: 1025,
  venueName: 1030, venueLocation: 1031,
  sponsorLogo: 1040,
  eventTitleOpacity: 1050,
  awayMascotGap: 1051, homeMascotGap: 1052,
  awayRecordSeparator: 1053, homeRecordSeparator: 1054,
  venueSeparator: 1055,
} as const;

const MASCOT_GAP = ' ';
const RECORD_SEPARATOR = '  ·  ';
const VENUE_SEPARATOR = '   ·   ';

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

const rectangle = (width: number, height: number, radii: Radii, position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const glaze = (name: string, width: number, height: number, radii: Radii, strokeTop = '73FFFFFF') => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="${strokeTop}" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

/** Dark glass: a glaze over a near-black body, as on every v2 strip. */
const darkGlass = (name: string, width: number, height: number, radii: Radii, bodyColor = 'D10E1116') => `${glaze(name, width, height, radii, '59FFFFFF')}
  <Shape name="${name} Body" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="${bodyColor}"/></Fill>
  </Shape>`;

const tint = (name: string, tintId: string, width: number, height: number, radii: Radii, color: string, property: number) =>
  `<Shape name="${name}" id="${tintId}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="${color}">${bound(property, COLOR)}</SolidColor></Fill>
  </Shape>`;

const underlay = (name: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>`;

const shadow = (name: string, width: number, height: number, radii: Radii) =>
  `<Shape name="${name}" x="0" y="4" opacity="0.6">
    ${rectangle(width, height, radii)}
    <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
  </Shape>`;

// Text reveals. Each glyph rises 14 into place as it fades in, one after another. The
// range starts wholly past the first glyph (a forward reveal) or the last (a backward
// one), so no glyph shows before its turn, and ends wholly clear of the text.
type Direction = 'forward' | 'backward';

const RANGE_AT_REST: Record<Direction, string> = {
  forward: 'modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"',
  backward: 'modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"',
};

const rise = (name: string, rangeId: string, direction: Direction) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" ${RANGE_AT_REST[direction]}/></TextModifierGroup>`;

const paint = (styleId: string, font: string, size: number, spacing: number, color: string) =>
  `<TextStylePaint id="${styleId}" fontAssetId="${font}" fontSize="${size}" letterSpacing="${spacing}"><Fill><SolidColor colorValue="${color}"/></Fill></TextStylePaint>`;

const run = (name: string, styleId: string, value: string, property?: number) =>
  `<TextValueRun name="${name}" styleId="${styleId}" text="${value}">${property === undefined ? '' : bound(property, TEXT)}</TextValueRun>`;

/** A fixed text box, shrunk to fit when its value is longer. */
const textBox = (o: { name: string; x: number; y: number; width: number; height: number; align?: string; body: string }) =>
  `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.height}" sizingValue="fixed" overflowValue="fitFontSize"${o.align ? ` alignValue="${o.align}"` : ''}>
    ${o.body}
  </Text>`;

// Corner radii: the block's outer corners take 12, every seam 3.
const PANEL_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const TAB_RADII: Radii = [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const STRIP_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];

// --- sides ----------------------------------------------------------------------------

// Each side is laid out from the seam outward: the away side's outer end is at the
// left, the home side's at the right. Per-side elements are numbered from a base.
const side = (o: { label: 'Away' | 'Home'; key: 'away' | 'home'; team: typeof AWAY; base: number; outward: -1 | 1; logoAsset: string }) => {
  const away = o.outward === -1;
  const p = away
    ? { school: P.awaySchool, mascot: P.awayMascot, overall: P.awayOverallRecord, conference: P.awayConferenceRecord, logo: P.awayLogo, primary: P.awayPrimaryColor, secondary: P.awaySecondaryColor, mascotGap: P.awayMascotGap, recordSeparator: P.awayRecordSeparator }
    : { school: P.homeSchool, mascot: P.homeMascot, overall: P.homeOverallRecord, conference: P.homeConferenceRecord, logo: P.homeLogo, primary: P.homePrimaryColor, secondary: P.homeSecondaryColor, mascotGap: P.homeMascotGap, recordSeparator: P.homeRecordSeparator };
  return {
    ...o, p,
    panelX: away ? AWAY_PANEL_X : HOME_PANEL_X,
    panelRadii: (away ? [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS] : [INNER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS]) as Radii,
    // The marker runs down the panel's outer edge, over the logo cropped there.
    markerX: away ? 0 : PANEL_WIDTH - MARKER_WIDTH,
    markerRadii: (away ? [OUTER_RADIUS, 0, INNER_RADIUS, 0] : [0, OUTER_RADIUS, 0, INNER_RADIUS]) as Radii,
    logoX: away ? LOGO_CENTRE : PANEL_WIDTH - LOGO_CENTRE,
    // Type reads away from the seam: the away side's is left-aligned and revealed from
    // its last glyph, the home side's right-aligned and revealed from its first.
    textX: away ? TEXT_START : TEXT_INSET,
    align: away ? undefined : 'right',
    direction: (away ? 'backward' : 'forward') as Direction,
    ids: {
      marker: id(o.base + 2), logo: id(o.base + 3), bloom: id(o.base + 4),
      panel: id(o.base + 10), content: id(o.base + 11), panelTint: id(o.base + 12),
      schoolStyle: id(o.base + 20), mascotStyle: id(o.base + 21), overallStyle: id(o.base + 22), conferenceStyle: id(o.base + 23),
      nameReveal: id(o.base + 30), recordReveal: id(o.base + 31),
    },
  };
};

const SIDES = [
  side({ label: 'Away', key: 'away', team: AWAY, base: 100, outward: -1, logoAsset: AWAY_LOGO_ASSET }),
  side({ label: 'Home', key: 'home', team: HOME, base: 200, outward: 1, logoAsset: HOME_LOGO_ASSET }),
];
type Side = (typeof SIDES)[number];

// --- band -----------------------------------------------------------------------------

const NAME_BASELINE = 71;
const RECORD_BASELINE = 107;
const PANEL_TEXT_WIDTH = PANEL_WIDTH - TEXT_START - TEXT_INSET;

const panel = (s: Side) => `<Node name="${s.label} Panel" id="${s.ids.panel}" x="${s.panelX}" y="${BAND_Y}">
  <Node name="${s.label} Content" id="${s.ids.content}" x="0" y="0">
  <!-- School and mascot on one line; the gap is empty when either is blank. -->
  ${textBox({
    name: `${s.label} Name`, x: s.textX, y: NAME_BASELINE, width: PANEL_TEXT_WIDTH, height: 66, align: s.align,
    body: [
      paint(s.ids.schoolStyle, FONT_REGULAR, 60, 0.5, 'D9FFFFFF'),
      paint(s.ids.mascotStyle, FONT_BOLD, 60, 0.5, 'FFFFFFFF'),
      run(`${s.label} School`, s.ids.schoolStyle, s.team.school, s.p.school),
      run(`${s.label} Mascot Gap`, s.ids.schoolStyle, MASCOT_GAP, s.p.mascotGap),
      run(`${s.label} Mascot`, s.ids.mascotStyle, s.team.mascot, s.p.mascot),
      rise(`${s.label} Name`, s.ids.nameReveal, s.direction),
    ].join('\n    '),
  })}
  <!-- Overall record, then the conference record; the dot is empty when either is blank. -->
  ${textBox({
    name: `${s.label} Record`, x: s.textX, y: RECORD_BASELINE, width: PANEL_TEXT_WIDTH, height: 38, align: s.align,
    body: [
      paint(s.ids.overallStyle, FONT_BOLD, 34, 1, 'FFFFFFFF'),
      paint(s.ids.conferenceStyle, FONT_REGULAR, 28, 2, 'B3FFFFFF'),
      run(`${s.label} Overall Record`, s.ids.overallStyle, s.team.overallRecord, s.p.overall),
      run(`${s.label} Record Separator`, s.ids.conferenceStyle, RECORD_SEPARATOR, s.p.recordSeparator),
      run(`${s.label} Conference Record`, s.ids.conferenceStyle, s.team.conferenceRecord, s.p.conference),
      rise(`${s.label} Record`, s.ids.recordReveal, s.direction),
    ].join('\n    '),
  })}
  </Node>
  <!-- Grows upward from the panel's bottom edge. -->
  <Shape name="${s.label} Marker" id="${s.ids.marker}" x="${s.markerX}" y="${BAND_HEIGHT}">
    ${rectangle(MARKER_WIDTH, BAND_HEIGHT, s.markerRadii, ` x="0" y="${-BAND_HEIGHT}"`)}
    <Fill><SolidColor colorValue="${s.team.secondary}">${bound(s.p.secondary, COLOR)}</SolidColor></Fill>
  </Shape>
  <!-- Larger than the band: the tint crops it at the outer edge, top and bottom. -->
  <Node name="${s.label} Logo" id="${s.ids.logo}" x="${s.logoX}" y="${BAND_HEIGHT / 2}">
    <ClippingShape name="${s.label} Logo Clip" sourceId="${s.ids.panelTint}"/>
    <Image name="${s.label} Logo Image" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${s.logoAsset}">${bound(s.p.logo, IMAGE)}</Image>
  </Node>
  <Shape name="${s.label} Logo Bloom" id="${s.ids.bloom}" x="${s.logoX}" y="${BAND_HEIGHT / 2}">
    <Ellipse width="${BLOOM_SIZE}" height="${BLOOM_SIZE}"/>
    <Fill><RadialGradient startX="0" startY="0" endX="${BLOOM_SIZE / 2}" endY="0"><GradientStop colorValue="2EFFFFFF" position="0"/><GradientStop colorValue="12FFFFFF" position="0.45"/><GradientStop colorValue="00FFFFFF" position="1"/></RadialGradient></Fill>
    <ClippingShape name="${s.label} Logo Bloom Clip" sourceId="${s.ids.panelTint}"/>
  </Shape>
  ${glaze(`${s.label} Panel`, PANEL_WIDTH, BAND_HEIGHT, s.panelRadii)}
  ${tint(`${s.label} Panel Tint`, s.ids.panelTint, PANEL_WIDTH, BAND_HEIGHT, s.panelRadii, s.team.primary, s.p.primary)}
  ${underlay(`${s.label} Panel Underlay`, PANEL_WIDTH, BAND_HEIGHT, s.panelRadii)}
</Node>`;

const versus = `<Node name="Versus Panel" id="${VERSUS}" x="${VERSUS_X}" y="${BAND_Y}">
  ${textBox({
    name: 'Versus', x: 0, y: 89, width: VERSUS_WIDTH, height: 66, align: 'center',
    body: [
      paint(VERSUS_STYLE, FONT_BOLD, 60, 1, 'E6FFFFFF'),
      run('Versus Value', VERSUS_STYLE, 'VS'),
      rise('Versus', VERSUS_REVEAL, 'forward'),
    ].join('\n    '),
  })}
  ${darkGlass('Versus', VERSUS_WIDTH, BAND_HEIGHT, PANEL_RADII, 'E00E1116')}
</Node>`;

const band = `<Node name="Band" id="${BAND}" x="0" y="0">
  <ClippingShape name="Band Reveal Clip" sourceId="${REVEAL_MASK}"/>
  ${versus}
  ${SIDES.map(panel).join('\n  ')}
</Node>`;

// --- event title ----------------------------------------------------------------------

const sweep = (name: string, sweepId: string, clipId: string) => `<Shape name="${name}" id="${sweepId}" x="${SWEEP_END}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="130" height="${BLOCK_HEIGHT * 1.7}"/>
  <Fill><LinearGradient startX="-65" startY="0" endX="65" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="${name} Clip" sourceId="${clipId}"/>
</Shape>`;

// The tab rises out from behind the band; its mask ends at the tab's bottom edge.
const eventTitle = `<Node name="Event Title" id="${TAB}" x="0" y="0">
  <ClippingShape name="Event Title Reveal Clip" sourceId="${REVEAL_MASK}"/>
  <ClippingShape name="Event Title Rise Clip" sourceId="${TAB_MASK}"/>
  <!-- Faded out by the controller when eventTitle is blank, sheen and all. -->
  <Node name="Event Title Presence" id="${TAB_PRESENCE}" x="0" y="0">${bound(P.eventTitleOpacity, OPACITY)}
  ${sweep('Event Title Specular Sweep', TAB_SWEEP, TAB_SILHOUETTE)}
  <Node name="Event Title Rise" id="${TAB_RISE}" x="${TAB_X}" y="${TAB_Y}">
  ${textBox({
    name: 'Event Title Text', x: TEXT_INSET, y: 32, width: TAB_WIDTH - 2 * TEXT_INSET, height: 34, align: 'center',
    body: [
      paint(TITLE_STYLE, FONT_BOLD, 28, 1, 'FFFFFFFF'),
      run('Event Title Value', TITLE_STYLE, EVENT_TITLE, P.eventTitle),
      rise('Event Title', TITLE_REVEAL, 'forward'),
    ].join('\n    '),
  })}
  ${darkGlass('Event Title', TAB_WIDTH, TAB_HEIGHT, TAB_RADII)}
  ${shadow('Event Title Shadow', TAB_WIDTH, TAB_HEIGHT, TAB_RADII)}
  </Node>
  </Node>
</Node>`;

// --- strip ----------------------------------------------------------------------------

const strip = `<Node name="Strip" id="${STRIP}" x="0" y="${STRIP_Y}">
  <ClippingShape name="Strip Reveal Clip" sourceId="${REVEAL_MASK}"/>
  <ClippingShape name="Strip Slide Clip" sourceId="${STRIP_MASK}"/>
  <Node name="Strip Slide" id="${STRIP_SLIDE}" x="0" y="0">
  <!-- Venue, then its location; the dot is empty when either is blank. -->
  ${textBox({
    name: 'Venue', x: TEXT_INSET, y: 37, width: SPONSOR_LABEL_X - 2 * TEXT_INSET, height: 36,
    body: [
      paint(VENUE_NAME_STYLE, FONT_BOLD, 30, 1, 'FFFFFFFF'),
      paint(VENUE_LOCATION_STYLE, FONT_REGULAR, 24, 2, 'B3FFFFFF'),
      run('Venue Name', VENUE_NAME_STYLE, VENUE.name, P.venueName),
      run('Venue Separator', VENUE_LOCATION_STYLE, VENUE_SEPARATOR, P.venueSeparator),
      run('Venue Location', VENUE_LOCATION_STYLE, VENUE.location, P.venueLocation),
      rise('Venue', VENUE_REVEAL, 'forward'),
    ].join('\n    '),
  })}
  ${textBox({
    name: 'Sponsor Label', x: SPONSOR_LABEL_X, y: 33, width: SPONSOR_LABEL_WIDTH, height: 24, align: 'right',
    body: [
      paint(SPONSOR_LABEL_STYLE, FONT_REGULAR, 20, 2, 'A6FFFFFF'),
      run('Sponsor Label Value', SPONSOR_LABEL_STYLE, 'PRESENTED BY'),
      rise('Sponsor Label', SPONSOR_LABEL_REVEAL, 'forward'),
    ].join('\n    '),
  })}
  <Image name="Sponsor Logo" id="${SPONSOR_LOGO}" x="${SPONSOR_X}" y="${STRIP_HEIGHT / 2}" scaleX="${SPONSOR_SCALE}" scaleY="${SPONSOR_SCALE}" assetId="${SPONSOR_ASSET}">${bound(P.sponsorLogo, IMAGE)}</Image>
  ${darkGlass('Strip', BLOCK_WIDTH, STRIP_HEIGHT, STRIP_RADII)}
  </Node>
</Node>`;

// --- block shadow ---------------------------------------------------------------------

// The outline runs round the band and the strip; the tab casts its own shadow. The
// bottom edge (the base) drops with the strip as it slides out.
const outline = [
  { local: 51, x: 0, y: BAND_Y, part: 'fixed' },
  { local: 52, x: BLOCK_WIDTH, y: BAND_Y, part: 'fixed' },
  { local: 53, x: BLOCK_WIDTH, y: BLOCK_HEIGHT, part: 'base' },
  { local: 54, x: 0, y: BLOCK_HEIGHT, part: 'base' },
] as const;
const BASE = outline.filter((vertex) => vertex.part === 'base').map((vertex) => id(vertex.local));

const blockShadow = `<Shape name="Block Shadow" id="${SHADOW}" x="0" y="4" opacity="0.6">
  <ClippingShape name="Block Shadow Reveal Clip" sourceId="${REVEAL_MASK}"/>
  <PointsPath name="Block Outline" id="${SHADOW_PATH}" isClosed="true">
    ${outline.map((vertex) => `<StraightVertex id="${id(vertex.local)}" x="${vertex.x}" y="${vertex.y}" radius="${OUTER_RADIUS}"/>`).join('\n    ')}
  </PointsPath>
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>`;

const silhouette = [
  ...SIDES.map((s) => rectangle(PANEL_WIDTH, BAND_HEIGHT, s.panelRadii, ` x="${s.panelX}" y="${BAND_Y}"`)),
  rectangle(VERSUS_WIDTH, BAND_HEIGHT, PANEL_RADII, ` x="${VERSUS_X}" y="${BAND_Y}"`),
  rectangle(BLOCK_WIDTH, STRIP_HEIGHT, STRIP_RADII, ` x="0" y="${STRIP_Y}"`),
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
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
const holdScale = (objectId: string, value: number): Track[] => [hold(objectId, SCALE_X, value), hold(objectId, SCALE_Y, value)];

// A forward reveal moves the range's leading edge from before the first glyph to past
// the last; a backward one moves its trailing edge from past the last to before the first.
const reveal = (rangeId: string, direction: Direction, start: number, end: number): Track[] => direction === 'forward'
  ? [move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT), move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT)]
  : [move(rangeId, MODIFY_TO, 1.4, 0, start, end, EASE_OUT), move(rangeId, FALLOFF_TO, 1, -0.4, start, end, EASE_OUT)];
const revealed = (rangeId: string, direction: Direction): Track[] => direction === 'forward'
  ? [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)]
  : [hold(rangeId, MODIFY_TO, 0), hold(rangeId, FALLOFF_TO, -0.4)];

const RANGES: [string, Direction][] = [
  [VERSUS_REVEAL, 'forward'], [TITLE_REVEAL, 'forward'], [VENUE_REVEAL, 'forward'], [SPONSOR_LABEL_REVEAL, 'forward'],
  ...SIDES.flatMap((s): [string, Direction][] => [[s.ids.nameReveal, s.direction], [s.ids.recordReveal, s.direction]]),
];
const GROUPS = [BAND, TAB, STRIP];
const EDGE_LIGHTS = [AWAY_EDGE_LIGHT, HOME_EDGE_LIGHT];
const SWEEPS = [INTRO_SWEEP, TAB_SWEEP];

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sweepOpacity: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: SWEEP_FROM, value: 0, linear: true }, { frame: SWEEP_FROM + 6, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

const AWAY_EDGE_END = -REVEAL_OVERHANG;
const HOME_EDGE_END = BLOCK_WIDTH + REVEAL_OVERHANG;

const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  // Seam ignition at the VS panel; the glass wipes outward to both ends.
  move(REVEAL_MASK, SCALE_X, 0, 1, WIPE_START, WIPE_END, EASE_WIPE),
  move(AWAY_EDGE_LIGHT, X, SEAM, AWAY_EDGE_END, WIPE_START, WIPE_END, EASE_WIPE),
  move(HOME_EDGE_LIGHT, X, SEAM, HOME_EDGE_END, WIPE_START, WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [
    move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT),
    { objectId: light, propertyKey: OPACITY, keys: edgeFlare(18, 42) },
  ]),
  ...reveal(VERSUS_REVEAL, 'forward', 8, 28),
  ...SIDES.flatMap((s): Track[] => [
    move(s.ids.content, X, -s.outward * CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
    ...reveal(s.ids.nameReveal, s.direction, 14, 40),
    ...reveal(s.ids.recordReveal, s.direction, 20, 46),
    // The logo settles in as the wipe reaches the outer end, drifting outward with it.
    move(s.ids.logo, X, s.logoX - s.outward * LOGO_DRIFT, s.logoX, 22, 60, EASE_OUT),
    ...scale(s.ids.logo, 1.12, 1, 22, 60, EASE_OUT),
    move(s.ids.logo, OPACITY, 0, 1, 22, 42, EASE_OUT),
    ...scale(s.ids.bloom, 0.7, 1, 26, 62, EASE_OUT),
    move(s.ids.bloom, OPACITY, 0, 1, 26, 56, EASE_OUT),
    move(s.ids.marker, SCALE_Y, 0, 1, 34, 54, EASE_OUT),
  ]),
  move(STRIP_SLIDE, Y, -STRIP_DROP, 0, 16, 42, EASE_OUT),
  ...BASE.map((vertex) => move(vertex, VERTEX_Y, BAND_BOTTOM, BLOCK_HEIGHT, 16, 42, EASE_OUT)),
  ...reveal(VENUE_REVEAL, 'forward', 26, 52),
  ...reveal(SPONSOR_LABEL_REVEAL, 'forward', 34, 54),
  move(SPONSOR_LOGO, OPACITY, 0, 1, 36, 58, EASE_OUT),
  move(TAB_RISE, Y, TAB_Y + TAB_DROP, TAB_Y, 30, 54, EASE_OUT),
  ...reveal(TITLE_REVEAL, 'forward', 36, 58),
  move(SHADOW, OPACITY, 0, 0.6, 12, 42, EASE_OUT),
  ...SWEEPS.flatMap((sweepId): Track[] => [
    move(sweepId, X, SWEEP_START, SWEEP_END, SWEEP_FROM, INTRO_FRAMES, EASE_SWEEP),
    { objectId: sweepId, propertyKey: OPACITY, keys: sweepOpacity },
  ]),
];

const settledRanges = RANGES.flatMap(([rangeId, direction]) => revealed(rangeId, direction));

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(REVEAL_MASK, SCALE_X, 1),
  hold(AWAY_EDGE_LIGHT, X, AWAY_EDGE_END),
  hold(HOME_EDGE_LIGHT, X, HOME_EDGE_END),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  ...SIDES.flatMap((s): Track[] => [
    hold(s.ids.content, X, 0),
    hold(s.ids.logo, X, s.logoX), ...holdScale(s.ids.logo, 1), hold(s.ids.logo, OPACITY, 1),
    ...holdScale(s.ids.bloom, 1), hold(s.ids.bloom, OPACITY, 1),
    hold(s.ids.marker, SCALE_Y, 1),
  ]),
  hold(STRIP_SLIDE, Y, 0),
  ...BASE.map((vertex) => hold(vertex, VERTEX_Y, BLOCK_HEIGHT)),
  hold(SPONSOR_LOGO, OPACITY, 1),
  hold(TAB_RISE, Y, TAB_Y),
  ...settledRanges,
  hold(SHADOW, OPACITY, 0.6),
  ...SWEEPS.flatMap((sweepId) => [hold(sweepId, X, SWEEP_END), hold(sweepId, OPACITY, 0)]),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  // The glass closes back into the seam.
  closing(REVEAL_MASK, SCALE_X, 1, 0, 2, OUTRO_FRAMES),
  closing(AWAY_EDGE_LIGHT, X, AWAY_EDGE_END, SEAM, 2, OUTRO_FRAMES),
  closing(HOME_EDGE_LIGHT, X, HOME_EDGE_END, SEAM, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  ...SIDES.flatMap((s): Track[] => [
    closing(s.ids.content, X, 0, -s.outward * 18, 0, OUTRO_FRAMES),
    hold(s.ids.logo, X, s.logoX),
    ...[SCALE_X, SCALE_Y].map((key) => closing(s.ids.logo, key, 1, 1.06, 0, OUTRO_FRAMES)),
    closing(s.ids.logo, OPACITY, 1, 0, 0, 12),
    ...holdScale(s.ids.bloom, 1),
    closing(s.ids.bloom, OPACITY, 1, 0, 0, 14),
    closing(s.ids.marker, SCALE_Y, 1, 0, 0, 12),
  ]),
  closing(STRIP_SLIDE, Y, 0, -STRIP_DROP, 0, 16),
  ...BASE.map((vertex) => closing(vertex, VERTEX_Y, BLOCK_HEIGHT, BAND_BOTTOM, 0, 16)),
  closing(SPONSOR_LOGO, OPACITY, 1, 0, 0, 12),
  closing(TAB_RISE, Y, TAB_Y, TAB_Y + TAB_DROP, 0, 16),
  ...settledRanges,
  closing(SHADOW, OPACITY, 0.6, 0, 0, 20),
  ...SWEEPS.flatMap((sweepId) => [hold(sweepId, X, SWEEP_END), hold(sweepId, OPACITY, 0)]),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...EDGE_LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(SHADOW, OPACITY, 0),
  ...SWEEPS.map((sweepId) => hold(sweepId, OPACITY, 0)),
];

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(P.isPlaying, 634)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const ID = { hold: 30, intro: 31, outro: 32, hidden: 33 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43 } as const;

const stateMachine = `<StateMachine name="Matchup Locator Lower Third" id="${id(7)}">
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
  string('eventTitle', P.eventTitle),
  ...SIDES.flatMap((s) => [
    string(`${s.key}School`, s.p.school),
    string(`${s.key}Mascot`, s.p.mascot),
    string(`${s.key}OverallRecord`, s.p.overall),
    string(`${s.key}ConferenceRecord`, s.p.conference),
    image(`${s.key}Logo`, s.p.logo),
    color(`${s.key}PrimaryColor`, s.p.primary),
    color(`${s.key}SecondaryColor`, s.p.secondary),
  ]),
  string('venueName', P.venueName),
  string('venueLocation', P.venueLocation),
  image('sponsorLogo', P.sponsorLogo),
  number('_eventTitleOpacity', P.eventTitleOpacity),
  ...SIDES.flatMap((s) => [string(`_${s.key}MascotGap`, s.p.mascotGap), string(`_${s.key}RecordSeparator`, s.p.recordSeparator)]),
  string('_venueSeparator', P.venueSeparator),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const numberValue = (local: number, value: number) => `<ViewModelInstanceNumber viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const imageValue = (local: number, asset: string) => `<ViewModelInstanceAssetImage viewModelPropertyId="${id(local)}" propertyValue="${asset}"/>`;
const colorValue = (local: number, value: string) => `<ViewModelInstanceColor viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.eventTitle, EVENT_TITLE),
  ...SIDES.flatMap((s) => [
    stringValue(s.p.school, s.team.school),
    stringValue(s.p.mascot, s.team.mascot),
    stringValue(s.p.overall, s.team.overallRecord),
    stringValue(s.p.conference, s.team.conferenceRecord),
    imageValue(s.p.logo, s.logoAsset),
    colorValue(s.p.primary, s.team.primary),
    colorValue(s.p.secondary, s.team.secondary),
  ]),
  stringValue(P.venueName, VENUE.name),
  stringValue(P.venueLocation, VENUE.location),
  imageValue(P.sponsorLogo, SPONSOR_ASSET),
  numberValue(P.eventTitleOpacity, 1),
  ...SIDES.flatMap((s) => [stringValue(s.p.mascotGap, MASCOT_GAP), stringValue(s.p.recordSeparator, RECORD_SEPARATOR)]),
  stringValue(P.venueSeparator, VENUE_SEPARATOR),
];

// --- document -------------------------------------------------------------------------

// The edge lights span the band only: the strip and the tab arrive after the wipe, so a
// taller light would hang in empty space beside them.
const LIGHT_HEIGHT = BAND_HEIGHT;
const edgeLight = (name: string, lightId: string, x: number, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" x="${x}" y="${BAND_Y + LIGHT_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${LIGHT_HEIGHT / 2}"><Rectangle width="2" height="${LIGHT_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${LIGHT_HEIGHT / 2}"><Rectangle width="44" height="${LIGHT_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

// The masks reach past the block on every side so the shadows are not cut off.
const MASK_MARGIN = 60;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_matchup_locator_lower_third.ts; edit that file, not this one.
     Basketball matchup locator lower third v2: a tinted-glass block, ${BLOCK_WIDTH} x ${BLOCK_HEIGHT}, at the
     bottom of a transparent 1920 x 1080 canvas (origin ${BLOCK_X}, ${BLOCK_Y}), on the scorebug's
     baseline. The band holds the away panel, the VS panel and the home panel; each team's
     logo sits at its panel's outer end, larger than the band and cropped by the panel. An
     optional event title tab sits above the VS panel and the venue and sponsor strip runs
     below. Sibling draw order is front to back; within one shape the last paint declared
     is on top. -->
<Artboard name="Basketball Matchup Locator Lower Third v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Matchup Locator Lower Third v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- Fades the event title and sets the separators between optional values. -->
<ScriptedDrawable name="Matchup Locator Lower Third Controller" scriptAssetId="${CONTROLLER_ASSET}"/>

<Node name="Lower Third" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">

<!-- Seam ignition at the VS panel; the two edges wipe outward to the ends. -->
${edgeLight('Away', AWAY_EDGE_LIGHT, AWAY_EDGE_END, 1)}
${edgeLight('Home', HOME_EDGE_LIGHT, HOME_EDGE_END, -1)}
${sweep('Glass Specular Sweep', INTRO_SWEEP, SILHOUETTE)}

<!-- ============================== Event title ============================== -->
${eventTitle}

<!-- ============================== Band ===================================== -->
${band}

<!-- ============================== Strip ==================================== -->
${strip}

<!-- Separation from bright video: a feathered dark stroke around the block. -->
${blockShadow}

<!-- Unpainted shapes: the clip sources. -->
<Shape name="Reveal Mask" id="${REVEAL_MASK}" x="${SEAM}" y="${-MASK_MARGIN}"><Rectangle width="${BLOCK_WIDTH + 2 * REVEAL_OVERHANG}" height="${BLOCK_HEIGHT + 2 * MASK_MARGIN}" originX="0.5" originY="0"/></Shape>
<Shape name="Event Title Rise Mask" id="${TAB_MASK}" x="${TAB_X - TEXT_INSET}" y="${TAB_Y - TEXT_INSET}"><Rectangle width="${TAB_WIDTH + 2 * TEXT_INSET}" height="${TAB_HEIGHT + TEXT_INSET}" originX="0" originY="0"/></Shape>
<Shape name="Strip Slide Mask" id="${STRIP_MASK}" x="${-MASK_MARGIN}" y="${STRIP_Y - GAP / 2}"><Rectangle width="${BLOCK_WIDTH + 2 * MASK_MARGIN}" height="${STRIP_HEIGHT + GAP / 2 + MASK_MARGIN}" originX="0" originY="0"/></Shape>
<Shape name="Block Silhouette" id="${SILHOUETTE}">${silhouette}</Shape>
<Shape name="Event Title Silhouette" id="${TAB_SILHOUETTE}">${rectangle(TAB_WIDTH, TAB_HEIGHT, TAB_RADII, ` x="${TAB_X}" y="${TAB_Y}"`)}</Shape>
</Node>

<!-- Intro: seam ignition at the VS panel, glass wiping outward, rising type, the logos
     settling in at the outer ends, the title tab and strip sliding out, and one sheen;
     ${INTRO_FRAMES / 60} s. Hold and Outro explicitly restore every animated property for
     repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Defaults off. -->
${stateMachine}
</Artboard>

<FontAsset name="Matchup Locator Lower Third v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Matchup Locator Lower Third v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Matchup Locator Lower Third v2 Saint Joseph's" id="${AWAY_LOGO_ASSET}" file="${AWAY.logoFile}"/>
<ImageAsset name="Matchup Locator Lower Third v2 Drexel" id="${HOME_LOGO_ASSET}" file="${HOME.logoFile}"/>
<ImageAsset name="Matchup Locator Lower Third v2 Independence Blue Cross" id="${SPONSOR_ASSET}" file="assets/images/sponsors/independence_blue_cross.png"/>
<ScriptAsset name="matchup_locator_lower_third_controller" folderPath="graphics/basketball-v2" id="${CONTROLLER_ASSET}" file="graphics/basketball-v2/matchup_locator_lower_third_controller.luau"/>

<ViewModel name="BasketballMatchupLocatorLowerThirdV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'matchup_locator_lower_third.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
