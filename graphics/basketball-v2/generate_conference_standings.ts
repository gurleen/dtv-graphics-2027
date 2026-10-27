/**
 * Generates the Conference Standings card scene from one description:
 *
 *   bun graphics/basketball-v2/generate_conference_standings.ts
 *
 * writes conference_standings.rml beside this file. Edit this file, not the output.
 *
 * A full-frame card listing the CAA's teams in order, one row per place. It is centred
 * across the canvas and ends on the halftime card's bottom line, above the scorebug; from
 * there it rises nearly to the top of the safe area.
 *
 *   Title panel  the CAA wordmark and STANDINGS, with the sport at the right.
 *   Table panel  one dark glass panel: a header row of column labels, then a row per
 *                place (rank, logo and school, conference record, overall record,
 *                streak), divided by hairlines, with the rank column set off in a
 *                lighter tone.
 *
 * Each row names its team, one of conference_teams.ts. On a game night the rows of the
 * away and home teams take those teams' tints. conference_standings_controller.luau finds
 * each row's team and writes the `_`-prefixed view model properties bound below: the
 * row's logo, its tint colour and whether it is tinted.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro -> Hidden,
 * gated on `isPlaying`). The intro ignites a seam at the centre of the card and wipes the
 * glass open both ways; the type rises row by row in rank order, and the rows of the
 * night's teams light last.
 */

import { join } from 'node:path';
import { CONFERENCE_TEAMS, NON_CONFERENCE, type ConferenceTeam } from './conference_teams';

const PREFIX = 41;
const ARTBOARD_Y = 15800;

// Test data: the 2025-26 final regular-season standings, with Campbell at Drexel (see the
// package README).
type Standing = { team: string; conferenceRecord: string; overallRecord: string; streak: string };
const STANDINGS: Standing[] = [
  { team: 'UNCW', conferenceRecord: '15-3', overallRecord: '27-7', streak: 'L1' },
  { team: 'CHARLESTON', conferenceRecord: '14-4', overallRecord: '21-11', streak: 'L1' },
  { team: 'HOFSTRA', conferenceRecord: '12-6', overallRecord: '24-11', streak: 'L1' },
  { team: 'MONMOUTH', conferenceRecord: '11-7', overallRecord: '19-15', streak: 'L1' },
  { team: 'DREXEL', conferenceRecord: '10-8', overallRecord: '17-16', streak: 'L1' },
  { team: 'WILLIAM & MARY', conferenceRecord: '10-8', overallRecord: '20-12', streak: 'L1' },
  { team: 'TOWSON', conferenceRecord: '9-9', overallRecord: '19-15', streak: 'L1' },
  { team: 'STONY BROOK', conferenceRecord: '9-9', overallRecord: '17-15', streak: 'L4' },
  { team: 'CAMPBELL', conferenceRecord: '8-10', overallRecord: '16-18', streak: 'L1' },
  { team: 'HAMPTON', conferenceRecord: '7-11', overallRecord: '13-19', streak: 'L2' },
  { team: 'ELON', conferenceRecord: '6-12', overallRecord: '14-18', streak: 'L5' },
  { team: 'N.C. A&T', conferenceRecord: '4-14', overallRecord: '11-19', streak: 'L4' },
  { team: 'NORTHEASTERN', conferenceRecord: '2-16', overallRecord: '7-24', streak: 'L1' },
];
const AWAY_TEAM = 'CAMPBELL';
const HOME_TEAM = 'DREXEL';
const SPORT = "MEN'S BASKETBALL";

// Geometry. The title panel sits over the table panel, GAP apart. In the table, the
// header and the rows line up in five columns (rank, team, conference record, overall
// record, streak); a hairline in each gap between rows divides them.
const GAP = 4;
const CARD_WIDTH = 1100;
const TITLE_HEIGHT = 70;
const TABLE_Y = TITLE_HEIGHT + GAP;
const HEADER_HEIGHT = 38;
const ROWS_Y = HEADER_HEIGHT + GAP;
const ROW_HEIGHT = 48;
const rowY = (index: number) => ROWS_Y + index * (ROW_HEIGHT + GAP);
const TABLE_HEIGHT = rowY(STANDINGS.length - 1) + ROW_HEIGHT;
const CARD_HEIGHT = TABLE_Y + TABLE_HEIGHT;
// Centred across the canvas, the card ends at y 858, clear of the scorebug at y 890; its
// top, at y 70, keeps inside the safe area.
const CARD_BOTTOM = 858;
const CARD_X = (1920 - CARD_WIDTH) / 2;
const CARD_Y = CARD_BOTTOM - CARD_HEIGHT;
const OUTER_RADIUS = 24;
const INNER_RADIUS = 6;
const TEXT_INSET = 30;
// Columns, as x within the table.
const RANK_WIDTH = 80;
const LOGO_INSET = 16;
// Each logo source is its mark fitted, centred, into 176 x 120, drawn at 0.3125: a
// 55 x 37.5 box, so wide and tall marks carry the same weight.
const LOGO_SCALE = 0.3125;
const LOGO_WIDTH = 176 * LOGO_SCALE;
const LOGO_X = RANK_WIDTH + LOGO_INSET + LOGO_WIDTH / 2;
const NAME_X = RANK_WIDTH + LOGO_INSET + LOGO_WIDTH + 18;
// A tinted row's logo stands in a soft shade, an ellipse the height of the tint: it parts
// a logo from a tint of its own colour (Campbell's orange camel on Campbell orange).
const SHADE_WIDTH = 120;
const RECORD_WIDTH = 155;
const CONFERENCE_X = CARD_WIDTH - 15 - 3 * RECORD_WIDTH;
const OVERALL_X = CONFERENCE_X + RECORD_WIDTH;
const STREAK_X = OVERALL_X + RECORD_WIDTH;
const NAME_WIDTH = CONFERENCE_X - 20 - NAME_X;
// The table's dividers: a hairline in each gap between rows, and a lighter band behind
// the rank column from the first hairline to the foot of the table.
const DIVIDER_YS = [HEADER_HEIGHT, ...STANDINGS.slice(0, -1).map((_, index) => rowY(index) + ROW_HEIGHT)]
  .map((y) => y + GAP / 2);
const HAIRLINE_COLOR = '1FFFFFFF';
const RANK_BAND_Y = DIVIDER_YS[0]!;
const RANK_BAND_COLOR = '0AFFFFFF';
// The trimmed white CAA wordmark is 768 x 246; it stands as tall as the title's capitals.
const WORDMARK_HEIGHT = 35;
const WORDMARK_SCALE = WORDMARK_HEIGHT / 246;
const WORDMARK_WIDTH = 768 * WORDMARK_SCALE;
const TITLE_X = Math.round(TEXT_INSET + WORDMARK_WIDTH + 20);
const SPORT_X = CARD_WIDTH / 2;
// The intro opens the card from a seam at its centre.
const SEAM_X = CARD_WIDTH / 2;
const MASK_WIDTH = CARD_WIDTH + 16;
// The sheen's band, tilted 20 degrees, spans about 240 either side of its centre over the
// card's height, so it starts and ends clear of the card.
const SWEEP_START = -250;
const SWEEP_END = CARD_WIDTH + 250;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 90;
const OUTRO_FRAMES = 24;
const WIPE_START = 8;
const WIPE_END = 46;
// The rows rise in rank order, ROW_STAGGER frames apart, once the wipe has opened most of
// the card; each row's tint lights after its type has risen.
const ROW_START = 24;
const ROW_STAGGER = 2;
const rowStart = (index: number) => ROW_START + index * ROW_STAGGER;
const GATE_START = 26;
const GATE_END = 42;
const SWEEP_BEGIN = 50;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

// Property keys used by the binds and the timelines.
const X = 13;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const PATH_WIDTH = 20;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const FALLOFF_FROM = 317;
const MODIFY_FROM = 327;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;
/** Text for an attribute value: team names carry ampersands. */
const escaped = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// --- teams ----------------------------------------------------------------------------

// The lookup conference_standings_controller.luau makes, repeated here so the default
// instance opens with each row's logo and the right rows tinted.
const memberNamed = (name: string) => CONFERENCE_TEAMS.find((team) => team.name === name.trim().toUpperCase());
const playing = (name: string) =>
  memberNamed(name) !== undefined && [AWAY_TEAM, HOME_TEAM].includes(name.trim().toUpperCase());

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const CONTENT = id(11);
const TITLE_PANEL = id(100);
const TITLE_CONTENT = id(101);
const WORDMARK = id(102);
const TITLE_STYLE = id(103);
const TITLE_REVEAL = id(104);
const SPORT_STYLE = id(105);
const SPORT_REVEAL = id(106);
const WORDMARK_GROUP = id(107);
const TABLE_PANEL = id(200);
const TABLE_BODY = id(201);
const HEADER_ROW = id(210);
const LEFT_EDGE = id(500);
const LEFT_EDGE_LIGHT = id(501);
const RIGHT_EDGE = id(502);
const RIGHT_EDGE_LIGHT = id(503);
const REVEAL_MASK = id(505);
const REVEAL_MASK_RECTANGLE = id(506);
const INTRO_SWEEP = id(600);
const TABLE_SILHOUETTE = id(610);
const CARD_SILHOUETTE = id(611);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const WORDMARK_ASSET = id(910);
const logoAsset = (index: number) => id(920 + index);
const CONTROLLER_ASSET = id(950);

// View model properties. Underscored ones are written by the controller script, or hold
// the roster it reads; operators never set them.
const P = {
  isPlaying: 1002, sport: 1010, awayTeam: 1011, homeTeam: 1012,
  member: (index: number) => {
    const base = 1020 + index * 3;
    return { name: base, color: base + 1, logo: base + 2 };
  },
  row: (index: number) => {
    const base = 1100 + index * 10;
    return {
      team: base, conferenceRecord: base + 1, overallRecord: base + 2, streak: base + 3,
      logo: base + 5, color: base + 6, highlight: base + 7, logoOpacity: base + 8,
    };
  },
} as const;

// Header labels, 210-219: the label at +1..+4 and its reveal at +5..+8.
const HEADER_LABELS = [
  { name: 'Team', text: 'TEAM', x: NAME_X, width: NAME_WIDTH, align: undefined },
  { name: 'Conference', text: 'CONF', x: CONFERENCE_X, width: RECORD_WIDTH, align: 'center' },
  { name: 'Overall', text: 'OVERALL', x: OVERALL_X, width: RECORD_WIDTH, align: 'center' },
  { name: 'Streak', text: 'STREAK', x: STREAK_X, width: RECORD_WIDTH, align: 'center' },
].map((label, index) => ({ ...label, style: id(211 + index), reveal: id(215 + index) }));

// Per-row elements, 3000 + 100 per row.
const rowElements = (index: number) => {
  const base = 3000 + index * 100;
  const standing = STANDINGS[index]!;
  return {
    index, name: `Row ${index + 1}`, standing, member: memberNamed(standing.team), playing: playing(standing.team),
    property: P.row(index),
    node: id(base), gate: id(base + 1), tint: id(base + 2), logo: id(base + 3), shade: id(base + 9),
    logoGroup: id(base + 15),
    rankStyle: id(base + 4), nameStyle: id(base + 5), conferenceStyle: id(base + 6),
    overallStyle: id(base + 7), streakStyle: id(base + 8),
    rankReveal: id(base + 10), nameReveal: id(base + 11), conferenceReveal: id(base + 12),
    overallReveal: id(base + 13), streakReveal: id(base + 14),
  };
};
const ROWS = STANDINGS.map((_, index) => rowElements(index));
type Row = (typeof ROWS)[number];

type Radii = [number, number, number, number];

// Corner radii: the card's outer corners take 24, the seam between the panels 6; the
// table's inner parts (row tints, dividers) are square.
const TITLE_RADII: Radii = [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const TABLE_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];
const SQUARE_RADII: Radii = [0, 0, 0, 0];

// --- markup helpers -------------------------------------------------------------------

const rectangle = (width: number, height: number, radii: Radii, position = '', children = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"${children ? `>${children}</Rectangle>` : '/>'}`;

const bound = (property: number, key: number) =>
  `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

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

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

/** One-run text with a fixed box; without a property the text is fixed copy. */
const text = (o: {
  name: string; x: number; y: number; width: number; height: number; font: string; size: number; spacing: number;
  color: string; styleId: string; value: string; property?: number; reveal: string; align?: 'center' | 'right';
}) => `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.height}" sizingValue="fixed" overflowValue="fitFontSize"${o.align ? ` alignValue="${o.align}"` : ''}><TextStylePaint id="${o.styleId}" fontAssetId="${o.font}" fontSize="${o.size}" letterSpacing="${o.spacing}"><Fill><SolidColor colorValue="${o.color}"/></Fill></TextStylePaint><TextValueRun name="${o.name} Value" styleId="${o.styleId}" text="${escaped(o.value)}">${o.property === undefined ? '' : bound(o.property, TEXT)}</TextValueRun>${rise(o.name, o.reveal)}</Text>`;

// --- title panel ----------------------------------------------------------------------

// The wordmark's centre is its anchor, and its group's, so the intro settles it in place;
// STANDINGS shares the height of its capitals.
const titlePanel = `<Node name="Title Panel" id="${TITLE_PANEL}" x="0" y="0">
  <Node name="Title Content" id="${TITLE_CONTENT}" x="0" y="0">
    <Node name="Conference Wordmark Group" id="${WORDMARK_GROUP}" x="${TEXT_INSET + WORDMARK_WIDTH / 2}" y="${TITLE_HEIGHT / 2}">
      <Image name="Conference Wordmark" id="${WORDMARK}" x="0" y="0" scaleX="${WORDMARK_SCALE}" scaleY="${WORDMARK_SCALE}" assetId="${WORDMARK_ASSET}"/>
    </Node>
    ${text({ name: 'Title', x: TITLE_X, y: 52, width: SPORT_X - TITLE_X, height: 58, font: FONT_BOLD, size: 50, spacing: 1.25, color: 'FFFFFFFF', styleId: TITLE_STYLE, value: 'STANDINGS', reveal: TITLE_REVEAL })}
    ${text({ name: 'Sport', x: SPORT_X, y: 46, width: CARD_WIDTH - TEXT_INSET - SPORT_X, height: 38, font: FONT_REGULAR, size: 32, spacing: 2.5, color: 'B3FFFFFF', styleId: SPORT_STYLE, value: SPORT, property: P.sport, reveal: SPORT_REVEAL, align: 'right' })}
  </Node>
  ${darkGlass('Title', CARD_WIDTH, TITLE_HEIGHT, TITLE_RADII)}
</Node>`;

// --- table panel ----------------------------------------------------------------------

const headerRow = `<Node name="Header Row" id="${HEADER_ROW}" x="0" y="0">
  ${HEADER_LABELS.map((label) => text({ name: `${label.name} Label`, x: label.x, y: 27, width: label.width, height: 30, font: FONT_REGULAR, size: 24, spacing: 2.5, color: 'A6FFFFFF', styleId: label.style, value: label.text, reveal: label.reveal, align: label.align as 'center' | undefined })).join('\n  ')}
</Node>`;

/**
 * A place in the standings: the rank, the team's logo and name, and its records, over the
 * team's tint on a game night. The tint's own opacity is the controller's highlight (1
 * when the row's team is playing); the gate around it carries the resting tint opacity.
 * The tint spans the row out to the hairlines, which draw over it, and darkens toward its
 * foot as the glass does, so tinted rows side by side still read as two. The logo's shade
 * rides in the gate with the tint and follows the same highlight. The logo's group carries
 * the intro's settle, the logo itself the controller's opacity.
 */
const standingRow = (r: Row) => {
  const s = r.standing;
  const member: ConferenceTeam | undefined = r.member;
  const assetIndex = member ? CONFERENCE_TEAMS.indexOf(member) : 0;
  const record = (name: string, x: number, value: string, property: number, styleId: string, reveal: string) =>
    text({ name: `${r.name} ${name}`, x, y: 37, width: RECORD_WIDTH, height: 46, font: FONT_BOLD, size: 38, spacing: 0.6, color: 'FFFFFFFF', styleId, value, property, reveal, align: 'center' });
  return `<Node name="${r.name}" id="${r.node}" x="0" y="${rowY(r.index)}">
  ${text({ name: `${r.name} Rank`, x: 0, y: 37, width: RANK_WIDTH, height: 40, font: FONT_BOLD, size: 35, spacing: 0.6, color: 'B3FFFFFF', styleId: r.rankStyle, value: `${r.index + 1}`, reveal: r.rankReveal, align: 'center' })}
  <Node name="${r.name} Logo Group" id="${r.logoGroup}" x="${LOGO_X}" y="${ROW_HEIGHT / 2}">
    <Image name="${r.name} Logo" id="${r.logo}" x="0" y="0" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" opacity="${member ? 1 : 0}" assetId="${logoAsset(assetIndex)}">${bound(r.property.logo, IMAGE)}${bound(r.property.logoOpacity, OPACITY)}</Image>
  </Node>
  ${text({ name: `${r.name} School`, x: NAME_X, y: 37, width: NAME_WIDTH, height: 46, font: FONT_BOLD, size: 38, spacing: 0.6, color: 'FFFFFFFF', styleId: r.nameStyle, value: s.team, property: r.property.team, reveal: r.nameReveal })}
  ${record('Conference Record', CONFERENCE_X, s.conferenceRecord, r.property.conferenceRecord, r.conferenceStyle, r.conferenceReveal)}
  ${record('Overall Record', OVERALL_X, s.overallRecord, r.property.overallRecord, r.overallStyle, r.overallReveal)}
  ${record('Streak', STREAK_X, s.streak, r.property.streak, r.streakStyle, r.streakReveal)}
  <Node name="${r.name} Tint Gate" id="${r.gate}" x="0" y="0" opacity="${TINT_OPACITY}">
    <Shape name="${r.name} Logo Shade" id="${r.shade}" x="${LOGO_X}" y="${ROW_HEIGHT / 2}" scaleY="${(ROW_HEIGHT + GAP) / SHADE_WIDTH}" opacity="${r.playing ? 1 : 0}">${bound(r.property.highlight, OPACITY)}
      <Ellipse width="${SHADE_WIDTH}" height="${SHADE_WIDTH}"/>
      <Fill><RadialGradient startX="0" startY="0" endX="${SHADE_WIDTH / 2}" endY="0"><GradientStop colorValue="73000000" position="0"/><GradientStop colorValue="2E000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
    </Shape>
    <Shape name="${r.name} Tint" id="${r.tint}" x="0" y="${-GAP / 2}" opacity="${r.playing ? 1 : 0}">${bound(r.property.highlight, OPACITY)}
      ${rectangle(CARD_WIDTH, ROW_HEIGHT + GAP, SQUARE_RADII)}
      <Fill><SolidColor colorValue="${member?.color ?? CONFERENCE_TEAMS[0]!.color}">${bound(r.property.color, COLOR)}</SolidColor></Fill>
      <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${ROW_HEIGHT + GAP}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    </Shape>
  </Node>
</Node>`;
};

// Every row sits on the table's one panel of dark glass. The hairlines are one-unit rules
// on whole units, so they stay sharp at 1080; they draw over the row tints.
const tableHairlines = `<Shape name="Table Hairlines" x="0" y="0">
  ${DIVIDER_YS.map((y) => rectangle(CARD_WIDTH, 1, SQUARE_RADII, ` x="0" y="${y}"`)).join('\n  ')}
  <Fill><SolidColor colorValue="${HAIRLINE_COLOR}"/></Fill>
</Shape>`;

const rankBand = `<Shape name="Table Rank Band" x="0" y="${RANK_BAND_Y}">
  ${rectangle(RANK_WIDTH, TABLE_HEIGHT - RANK_BAND_Y, SQUARE_RADII)}
  <Fill><SolidColor colorValue="${RANK_BAND_COLOR}"/></Fill>
</Shape>`;

// The rows and the band are clipped to the table's outline, so the last row's tint and
// the band follow its rounded foot.
const tablePanel = `<Node name="Table Panel" id="${TABLE_PANEL}" x="0" y="${TABLE_Y}">
  ${tableHairlines}
  ${headerRow}
  <Node name="Table Body" id="${TABLE_BODY}" x="0" y="0">
    <ClippingShape name="Table Body Clip" sourceId="${TABLE_SILHOUETTE}"/>
${ROWS.map(standingRow).join('\n')}
    ${rankBand}
  </Node>
  ${darkGlass('Table', CARD_WIDTH, TABLE_HEIGHT, TABLE_RADII)}
</Node>`;

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
// A reveal starts with its ramp wholly before the text (modifyFrom -0.4, falloffFrom 0), so
// no glyph shows early: the lower rows wait on open glass, not behind the reveal mask, and
// a ramp starting at 0 would show their first glyphs half risen.
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const RANGES = [
  TITLE_REVEAL, SPORT_REVEAL, ...HEADER_LABELS.map((label) => label.reveal),
  ...ROWS.flatMap((r) => [r.rankReveal, r.nameReveal, r.conferenceReveal, r.overallReveal, r.streakReveal]),
];
const GATES = ROWS.map((r) => r.gate);
const EDGE_LIGHTS = [LEFT_EDGE_LIGHT, RIGHT_EDGE_LIGHT];
// The wordmark and the row logos settle from 112% as they arrive.
const MARKS = [WORDMARK_GROUP, ...ROWS.map((r) => r.logoGroup)];

if (rowStart(ROWS.length - 1) + GATE_END > INTRO_FRAMES) {
  throw new Error('The last row lights after the intro ends: lengthen INTRO_FRAMES or shorten ROW_STAGGER.');
}

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
  move(LEFT_EDGE, X, SEAM_X, -8, WIPE_START, WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE, X, SEAM_X, CARD_WIDTH + 8, WIPE_START, WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [
    move(light, SCALE_Y, 0, 1, 0, 16, EASE_OUT),
    { objectId: light, propertyKey: OPACITY, keys: edgeFlare(18, 42) },
  ]),
  ...scale(WORDMARK_GROUP, 1.12, 1, 16, 56, EASE_OUT),
  move(WORDMARK_GROUP, OPACITY, 0, 1, 16, 36, EASE_OUT),
  ...reveal(TITLE_REVEAL, 16, 40),
  ...reveal(SPORT_REVEAL, 18, 42),
  ...HEADER_LABELS.flatMap((label, index) => reveal(label.reveal, 20 + 2 * index, 42 + 2 * index)),
  // In each row the rank rises first, then the logo settles and the name and records
  // follow; the tint lights once the row has risen.
  ...ROWS.flatMap((r): Track[] => {
    const start = rowStart(r.index);
    return [
      ...reveal(r.rankReveal, start, start + 22),
      ...scale(r.logoGroup, 1.12, 1, start, start + 36, EASE_OUT),
      move(r.logoGroup, OPACITY, 0, 1, start, start + 18, EASE_OUT),
      ...reveal(r.nameReveal, start + 2, start + 24),
      ...[r.conferenceReveal, r.overallReveal, r.streakReveal].flatMap((range) => reveal(range, start + 4, start + 26)),
      move(r.gate, OPACITY, 0, TINT_OPACITY, start + GATE_START, start + GATE_END, EASE_OUT),
    ];
  }),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, SWEEP_BEGIN, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: SWEEP_BEGIN, value: 0, linear: true }, { frame: SWEEP_BEGIN + 6, value: 0.65, linear: true },
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
  hold(LEFT_EDGE, X, -8),
  hold(RIGHT_EDGE, X, CARD_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  ...MARKS.flatMap((mark) => [hold(mark, SCALE_X, 1), hold(mark, SCALE_Y, 1), hold(mark, OPACITY, 1)]),
  ...settledGates,
  ...settledRanges,
  ...settledSweep,
];

const outro: Track[] = [
  { objectId: CONTENT, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] },
  closing(REVEAL_MASK_RECTANGLE, PATH_WIDTH, MASK_WIDTH, 0, 2, OUTRO_FRAMES),
  closing(LEFT_EDGE, X, -8, SEAM_X, 2, OUTRO_FRAMES),
  closing(RIGHT_EDGE, X, CARD_WIDTH + 8, SEAM_X, 2, OUTRO_FRAMES),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  ...MARKS.flatMap((mark): Track[] => [
    closing(mark, SCALE_X, 1, 1.06, 0, 16), closing(mark, SCALE_Y, 1, 1.06, 0, 16),
    closing(mark, OPACITY, 1, 0, 0, 16),
  ]),
  ...settledGates,
  ...settledRanges,
  ...settledSweep,
];

const hidden: Track[] = [
  hold(CONTENT, OPACITY, 0),
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

const stateMachine = `<StateMachine name="Conference Standings" id="${id(7)}">
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
  string('sport', P.sport),
  string('awayTeam', P.awayTeam),
  string('homeTeam', P.homeTeam),
  ...ROWS.flatMap((r) => {
    const row = `row${r.index + 1}`;
    return [
      string(`${row}Team`, r.property.team),
      string(`${row}ConferenceRecord`, r.property.conferenceRecord),
      string(`${row}OverallRecord`, r.property.overallRecord),
      string(`${row}Streak`, r.property.streak),
    ];
  }),
  ...CONFERENCE_TEAMS.flatMap((_, index) => {
    const member = `_team${index + 1}`;
    return [
      string(`${member}Name`, P.member(index).name),
      color(`${member}Color`, P.member(index).color),
      image(`${member}Logo`, P.member(index).logo),
    ];
  }),
  ...ROWS.flatMap((r) => {
    const row = `_row${r.index + 1}`;
    return [
      image(`${row}Logo`, r.property.logo),
      color(`${row}Color`, r.property.color),
      number(`${row}Highlight`, r.property.highlight),
      number(`${row}LogoOpacity`, r.property.logoOpacity),
    ];
  }),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${escaped(value)}"/>`;
const numberValue = (local: number, value: number) => `<ViewModelInstanceNumber viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const imageValue = (local: number, asset: string) => `<ViewModelInstanceAssetImage viewModelPropertyId="${id(local)}" propertyValue="${asset}"/>`;
const colorValue = (local: number, value: string) => `<ViewModelInstanceColor viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.sport, SPORT),
  stringValue(P.awayTeam, AWAY_TEAM),
  stringValue(P.homeTeam, HOME_TEAM),
  ...ROWS.flatMap((r) => [
    stringValue(r.property.team, r.standing.team),
    stringValue(r.property.conferenceRecord, r.standing.conferenceRecord),
    stringValue(r.property.overallRecord, r.standing.overallRecord),
    stringValue(r.property.streak, r.standing.streak),
  ]),
  ...CONFERENCE_TEAMS.flatMap((team, index) => [
    stringValue(P.member(index).name, team.name),
    colorValue(P.member(index).color, team.color),
    imageValue(P.member(index).logo, logoAsset(index)),
  ]),
  ...ROWS.flatMap((r) => {
    const index = r.member ? CONFERENCE_TEAMS.indexOf(r.member) : 0;
    return [
      imageValue(r.property.logo, logoAsset(index)),
      colorValue(r.property.color, CONFERENCE_TEAMS[index]!.color),
      numberValue(r.property.highlight, r.playing ? 1 : 0),
      numberValue(r.property.logoOpacity, r.member ? 1 : 0),
    ];
  }),
];

// --- document -------------------------------------------------------------------------

if (![AWAY_TEAM, HOME_TEAM].every((team) => team === NON_CONFERENCE || memberNamed(team))) {
  throw new Error('The test away and home teams must be conference teams or NONE.');
}

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" y="${CARD_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${CARD_HEIGHT / 2}"><Rectangle width="2" height="${CARD_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${CARD_HEIGHT / 2}"><Rectangle width="44" height="${CARD_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_conference_standings.ts; edit that file, not this one.
     Basketball conference standings v2: a card, ${CARD_WIDTH} x ${CARD_HEIGHT}, centred on a transparent
     1920 x 1080 canvas (origin ${CARD_X}, ${CARD_Y}), clear of the scorebug. A title panel carries the
     CAA wordmark, STANDINGS and the sport; under it a dark glass table lists the teams in
     order, one row per place. The rows of the night's away and home teams take those
     teams' tints. Sibling draw order is front to back; within one shape the last paint
     declared is on top. -->
<Artboard name="Basketball Conference Standings v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Conference Standings v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- Finds each row's team: its logo, its tint, and whether it is playing tonight. -->
<ScriptedDrawable name="Conference Standings Controller" scriptAssetId="${CONTROLLER_ASSET}"/>

<Node name="Conference Standings Card" id="${ROOT}" x="${CARD_X}" y="${CARD_Y}">

<!-- Seam ignition at the centre of the card; the two edges ride the reveal mask outward. -->
<Node name="Left Leading Edge" id="${LEFT_EDGE}" x="-8">
  ${edgeLight('Left', LEFT_EDGE_LIGHT, 1)}
</Node>
<Node name="Right Leading Edge" id="${RIGHT_EDGE}" x="${CARD_WIDTH + 8}">
  ${edgeLight('Right', RIGHT_EDGE_LIGHT, -1)}
</Node>
<!-- The intro's closing flourish: one soft diagonal sheen crosses the glass, clipped to
     the card silhouette. Invisible at rest. -->
<Shape name="Card Specular Sweep" id="${INTRO_SWEEP}" x="${SWEEP_END}" y="${CARD_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="180" height="${Math.round(CARD_HEIGHT * 1.7)}" originX="0.5" originY="0.5"/>
  <Fill><LinearGradient startX="-90" startY="0" endX="90" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="24FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${CARD_SILHOUETTE}"/>
</Shape>

<Node name="Card Content" id="${CONTENT}" x="0" y="0">
<ClippingShape name="Card Reveal Clip" sourceId="${REVEAL_MASK}"/>
<!-- ============================== Title panel =============================== -->
${titlePanel}

<!-- ============================== Table panel =============================== -->
${tablePanel}
</Node>


<!-- ============================= Clip sources ============================= -->
<!-- Unpainted, so they contribute geometry and draw nothing. The reveal mask is centred
     on the seam and opens both ways at once; at rest it covers the card. -->
<Shape name="Card Reveal Mask" id="${REVEAL_MASK}" x="${SEAM_X}" y="-8"><Rectangle id="${REVEAL_MASK_RECTANGLE}" width="${MASK_WIDTH}" height="${CARD_HEIGHT + 16}" originX="0.5" originY="0"/></Shape>
<Shape name="Card Silhouette" id="${CARD_SILHOUETTE}">
  ${rectangle(CARD_WIDTH, TITLE_HEIGHT, TITLE_RADII, ' x="0" y="0"')}
  ${rectangle(CARD_WIDTH, TABLE_HEIGHT, TABLE_RADII, ` x="0" y="${TABLE_Y}"`)}
</Shape>
<Shape name="Table Silhouette" id="${TABLE_SILHOUETTE}" x="0" y="${TABLE_Y}">${rectangle(CARD_WIDTH, TABLE_HEIGHT, TABLE_RADII)}</Shape>
</Node>

<!-- Intro: seam ignition, one wipe opening outward both ways, the wordmark settling and
     the title rising, then the rows rising in rank order as their logos settle, the
     night's teams lighting and one sheen; ${(INTRO_FRAMES / 60).toFixed(2)} s. Hold and Outro
     explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses
     it (Outro then Hidden). Defaults off. -->
${stateMachine}
</Artboard>

<FontAsset name="Conference Standings v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Conference Standings v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ImageAsset name="Conference Standings v2 CAA Wordmark" id="${WORDMARK_ASSET}" file="assets/images/CAAWhite.png"/>
${CONFERENCE_TEAMS.map((team, index) => `<ImageAsset name="Conference Standings v2 ${escaped(team.name)}" id="${logoAsset(index)}" file="${team.logo}"/>`).join('\n')}
<ScriptAsset name="conference_standings_controller" folderPath="graphics/basketball-v2" id="${CONTROLLER_ASSET}" file="graphics/basketball-v2/conference_standings_controller.luau"/>

<ViewModel name="BasketballConferenceStandingsV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'conference_standings.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
