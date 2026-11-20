/**
 * Generates the Big 5 Pod Schedule card scene from one description:
 *
 *   bun graphics/basketball-v2/generate_big5_pod_schedule.ts
 *
 * writes big5_pod_schedule.rml beside this file. Edit this file, not the output.
 *
 * A full-frame card listing the six campus pod games of the Big 5 Classic, results and
 * games to come. It is the conference standings card's build, wider and from the top.
 *
 *   Title panel   BIG 5 CLASSIC, with POD PLAY · CAMPUS GAMES at the right and a marker.
 *   Table panel   one dark glass panel: a band naming pod 1, its three games, a band
 *                 naming pod 2, its three games, divided by hairlines.
 *   Footer panel  the Classic tripleheader's date and venue, and its three tip times.
 *
 * A game row reads date, away team (logo, name, score), AT, home team, status. It has
 * three states, drawn from two numbers per row:
 *
 *   gameNWinner  0 none, 1 away, 2 home. A final row dims its loser.
 *   gameNTonight 1 on the show's own game, while it has no score: the row grows, takes
 *                the home team's tint, shows TONIGHT for its date and each team's pod
 *                record where a score would be.
 *
 * The table is a fixed height. The tonight row takes TONIGHT_EXTRA from the other rows'
 * share; with no tonight row the six rows share it evenly. Each row's top is a linear
 * formula of the six tonight flags, so any row can be tonight with no script.
 *
 * The state machine has one layer, Display (Hidden -> Intro -> Hold -> Outro -> Hidden,
 * gated on `isPlaying`). The intro ignites a seam at the centre of the card and wipes the
 * glass open both ways; the rows rise in order and the tonight row lights last.
 */

import { join } from 'node:path';
import { CLASSIC, DREXEL, LA_SALLE, PENN, PODS, podStandings, SAINT_JOSEPHS, TEMPLE, VILLANOVA, type Pod, type PodGame } from './graphics/big5';

const PREFIX = 52;
const ARTBOARD_Y = 29000;

// Test data: the seed's names and brands for the six teams, and the show's game, Saint
// Joseph's at Drexel. The defaults below are what the entry binds from big5.ts.
const TEAMS = [
  { id: SAINT_JOSEPHS, name: "SAINT JOSEPH'S", color: 'FFC2071B', logo: 'saint-josephs' },
  { id: DREXEL, name: 'DREXEL', color: 'FF07294D', logo: 'drexel' },
  { id: PENN, name: 'PENNSYLVANIA', color: 'FF082A74', logo: 'pennsylvania' },
  { id: TEMPLE, name: 'TEMPLE', color: 'FFA80532', logo: 'temple' },
  { id: VILLANOVA, name: 'VILLANOVA', color: 'FF123D7C', logo: 'villanova' },
  { id: LA_SALLE, name: 'LA SALLE', color: 'FF003356', logo: 'la-salle' },
] as const;
const TONIGHT = { away: SAINT_JOSEPHS, home: DREXEL };
const HOME_PRIMARY = 'FF07294D';
const MARKER = 'FFFFC600';

// Geometry. Title, table and footer panels stack GAP apart. In the table, pod bands and
// game rows stack GAP apart, with a hairline in each gap.
const GAP = 4;
const CARD_WIDTH = 1488;
const CARD_X = 216;
const CARD_Y = 150;
const TITLE_HEIGHT = 92;
const FOOTER_HEIGHT = 56;
const BAND_HEIGHT = 44;
const ROW_HEIGHT = 66;
const TONIGHT_EXTRA = 36;
const GAME_COUNT = 6;
// With no tonight row the extra is shared, so every row is ROW_HEIGHT + SHARE.
const SHARE = TONIGHT_EXTRA / GAME_COUNT;
const TABLE_Y = TITLE_HEIGHT + GAP;
const TABLE_HEIGHT = 2 * (BAND_HEIGHT + GAP) + GAME_COUNT * ROW_HEIGHT + TONIGHT_EXTRA + (GAME_COUNT - 1) * GAP;
const FOOTER_Y = TABLE_Y + TABLE_HEIGHT + GAP;
const CARD_HEIGHT = FOOTER_Y + FOOTER_HEIGHT;
const OUTER_RADIUS = 24;
const INNER_RADIUS = 6;
const TEXT_INSET = 36;
// Row columns, as x within the card.
const DATE_X = TEXT_INSET;
const DATE_WIDTH = 150;
const TEAM_WIDTH = 400;
const AWAY_X = 196;
const AT_X = AWAY_X + TEAM_WIDTH + 4;
const AT_WIDTH = 52;
const HOME_X = AT_X + AT_WIDTH + 4;
const STATUS_X = HOME_X + TEAM_WIDTH + 16;
const STATUS_WIDTH = CARD_WIDTH - TEXT_INSET - STATUS_X;
// Within a team: the logo in a LOGO_BOX square, the name, the score at the right.
const LOGO_BOX = 52;
const LOGO_SCALE = 68 / 1024;
const NAME_OFFSET = LOGO_BOX + 14;
const SCORE_WIDTH = 76;
const NAME_WIDTH = TEAM_WIDTH - NAME_OFFSET - SCORE_WIDTH - 8;
const SHADE_WIDTH = 120;
const TALL_HEIGHT = ROW_HEIGHT + TONIGHT_EXTRA;
const HAIRLINE_COLOR = '1FFFFFFF';
const BAND_COLOR = '0AFFFFFF';
const MARKER_WIDTH = 8;
const LOSER_OPACITY = 0.55;
// The intro opens the card from a seam at its centre.
const SEAM_X = CARD_WIDTH / 2;
const MASK_WIDTH = CARD_WIDTH + 16;
const SWEEP_START = -250;
const SWEEP_END = CARD_WIDTH + 250;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 90;
const OUTRO_FRAMES = 24;
const WIPE_START = 8;
const WIPE_END = 46;
// The table's lines (bands and rows) rise in order, LINE_STAGGER frames apart.
const LINE_START = 22;
const LINE_STAGGER = 3;
const lineStart = (index: number) => LINE_START + index * LINE_STAGGER;
const GATE_START = 26;
const GATE_END = 42;
const SWEEP_BEGIN = 50;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

// Property keys used by the binds and the timelines.
const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const PATH_WIDTH = 20;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const FALLOFF_FROM = 317;
const MODIFY_FROM = 327;
const FORMULA_VALUE = 777;

const TINT_OPACITY = 0.78;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;
const escaped = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// --- data -----------------------------------------------------------------------------

const teamOf = (teamId: string) => TEAMS.find((team) => team.id === teamId) ?? fail(`No test team ${teamId}`);
function fail(message: string): never {
  throw new Error(message);
}

/** What the entry binds for one game, in capitals as the projector sends it. */
const gameValues = (pod: Pod, game: PodGame) => {
  const tonight = !game.score && game.away === TONIGHT.away && game.home === TONIGHT.home;
  const recordOf = (teamId: string) => {
    const row = podStandings(pod).find((standing) => standing.team === teamId)!;
    return tonight ? `${row.wins}-${row.losses}` : '';
  };
  return {
    date: game.date.toUpperCase(),
    away: teamOf(game.away), home: teamOf(game.home),
    awayScore: game.score ? String(game.score.away) : '',
    homeScore: game.score ? String(game.score.home) : '',
    awayRecord: recordOf(game.away), homeRecord: recordOf(game.home),
    status: `${game.score ? 'FINAL' : game.time} · ${game.venue}`.toUpperCase(),
    winner: game.score ? (game.score.away > game.score.home ? 1 : 2) : 0,
    tonight: tonight ? 1 : 0,
  };
};
const GAMES = PODS.flatMap((pod) => pod.games.map((game) => gameValues(pod, game)));
const CLASSIC_LINE = `BIG 5 CLASSIC TRIPLEHEADER · ${CLASSIC.date} · ${CLASSIC.venue}`.toUpperCase();
const CLASSIC_TIMES = CLASSIC.games.map((game) => game.time).join(' · ');

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const CONTENT = id(11);
const TITLE_PANEL = id(100);
const TITLE_STYLE = id(103);
const TITLE_REVEAL = id(104);
const LABEL_STYLE = id(105);
const LABEL_REVEAL = id(106);
const MARKER_NODE = id(107);
const MARKER_SHAPE = id(108);
const TABLE_PANEL = id(200);
const TABLE_BODY = id(201);
const FOOTER_PANEL = id(300);
const FOOTER_LINE_STYLE = id(301);
const FOOTER_LINE_REVEAL = id(302);
const FOOTER_TIMES_STYLE = id(303);
const FOOTER_TIMES_REVEAL = id(304);
const LEFT_EDGE = id(500);
const LEFT_EDGE_LIGHT = id(501);
const RIGHT_EDGE = id(502);
const RIGHT_EDGE_LIGHT = id(503);
const REVEAL_MASK = id(505);
const REVEAL_MASK_RECTANGLE = id(506);
const INTRO_SWEEP = id(600);
const TABLE_SILHOUETTE = id(610);
const CARD_SILHOUETTE = id(611);
const TITLE_SILHOUETTE = id(612);
const AWAY_OPACITY = id(700);
const HOME_PARITY = id(701);
const HOME_DIM = id(702);
const HOME_OPACITY = id(703);
const NOT_TONIGHT = id(704);
const rowTopFormula = (index: number) => id(710 + index);
const rowCentreFormula = (index: number) => id(720 + index);
const BAND2_FORMULA = id(730);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const logoAsset = (teamIndex: number) => id(920 + teamIndex);

const P = {
  isPlaying: 1002, pod1Name: 1010, pod2Name: 1011, classicLine: 1012, classicTimes: 1013,
  homePrimaryColor: 1020, markerColor: 1021,
  game: (index: number) => {
    const base = 1100 + index * 20;
    return {
      date: base, awayName: base + 1, awayScore: base + 2, awayRecord: base + 3, awayLogo: base + 4,
      homeName: base + 5, homeScore: base + 6, homeRecord: base + 7, homeLogo: base + 8,
      status: base + 9, winner: base + 10, tonight: base + 11,
    };
  },
} as const;

// Per-line elements: pod bands at 2000 + 100 per band, game rows at 3000 + 100 per row.
const bandElements = (index: 0 | 1) => {
  const base = 2000 + index * 100;
  return { index, name: `Pod ${index + 1} Band`, node: id(base), style: id(base + 1), reveal: id(base + 2), property: index === 0 ? P.pod1Name : P.pod2Name, value: PODS[index].name.toUpperCase() };
};
const BANDS = [bandElements(0), bandElements(1)];

const sideElements = (base: number) => ({
  node: id(base), logoGroup: id(base + 1), logo: id(base + 2), shade: id(base + 3),
  nameStyle: id(base + 4), nameReveal: id(base + 5), scoreStyle: id(base + 6), scoreReveal: id(base + 7),
  recordStyle: id(base + 8), recordReveal: id(base + 9),
});
const rowElements = (index: number) => {
  const base = 3000 + index * 100;
  return {
    index, name: `Game ${index + 1}`, game: GAMES[index]!, property: P.game(index),
    node: id(base), content: id(base + 1), gate: id(base + 2), tint: id(base + 3),
    dateStyle: id(base + 4), dateReveal: id(base + 5), tonightStyle: id(base + 6), tonightReveal: id(base + 7),
    atStyle: id(base + 8), atReveal: id(base + 9), statusStyle: id(base + 10), statusReveal: id(base + 11),
    away: sideElements(base + 20), home: sideElements(base + 40),
  };
};
const ROWS = GAMES.map((_, index) => rowElements(index));
type Row = (typeof ROWS)[number];
type Side = Row['away'];

// The order the table's lines rise in: band, three games, band, three games.
const LINES = [BANDS[0]!, ...ROWS.slice(0, 3), BANDS[1]!, ...ROWS.slice(3)];
const lineIndex = (line: (typeof LINES)[number]) => LINES.indexOf(line);

type Radii = [number, number, number, number];
const TITLE_RADII: Radii = [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const TABLE_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];
const FOOTER_RADII: Radii = [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS];
const SQUARE_RADII: Radii = [0, 0, 0, 0];

// --- row layout -----------------------------------------------------------------------

// A length as a constant plus a coefficient per tonight flag. Each row's height is
// ROW_HEIGHT + SHARE, less SHARE for every tonight flag, plus TONIGHT_EXTRA for its own:
// with one flag set the tonight row is TALL_HEIGHT and the rest ROW_HEIGHT; with none set
// all are ROW_HEIGHT + SHARE.
type Linear = { c: number; a: number[] };
const constant = (c: number): Linear => ({ c, a: Array(GAME_COUNT).fill(0) });
const plus = (x: Linear, y: Linear): Linear => ({ c: x.c + y.c, a: x.a.map((value, index) => value + y.a[index]!) });
const times = (x: Linear, k: number): Linear => ({ c: x.c * k, a: x.a.map((value) => value * k) });
const rowHeight = (index: number): Linear => ({ c: ROW_HEIGHT + SHARE, a: ROWS.map((_, other) => (other === index ? TONIGHT_EXTRA : 0) - SHARE) });
const sumHeights = (count: number) => ROWS.slice(0, count).reduce((sum, _, index) => plus(sum, plus(rowHeight(index), constant(GAP))), constant(0));
const bandSpan = BAND_HEIGHT + GAP;
const rowTop = (index: number) => plus(sumHeights(index), constant(bandSpan + (index >= 3 ? bandSpan : 0)));
const BAND2_TOP = plus(sumHeights(3), constant(bandSpan));
const evaluate = ({ c, a }: Linear) => c + a.reduce((sum, value, index) => sum + value * GAMES[index]!.tonight, 0);

if (evaluate(plus(rowTop(GAME_COUNT - 1), rowHeight(GAME_COUNT - 1))) !== TABLE_HEIGHT) {
  throw new Error('The rows do not fill the table');
}
if (GAMES.filter((game) => game.tonight).length > 1) throw new Error('Two rows are tonight');

const formula = (name: string, converterId: string, { c, a }: Linear) => {
  const terms = a.flatMap((value, index) =>
    value === 0
      ? []
      : [`<FormulaTokenOperation operationType="0"/><FormulaTokenParenthesisOpen/><FormulaTokenValue operationValue="${value}"/><FormulaTokenOperation operationType="2"/><FormulaTokenValue>${bound(ROWS[index]!.property.tonight, FORMULA_VALUE)}</FormulaTokenValue><FormulaTokenParenthesisClose/>`]);
  return `<DataConverterFormula name="${name}" id="${converterId}"><FormulaTokenValue operationValue="${c}"/>${terms.join('')}</DataConverterFormula>`;
};

// --- markup helpers -------------------------------------------------------------------

const rectangle = (width: number, height: number, radii: Radii, position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

function bound(property: number, key: number, converter?: string) {
  return `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"${converter ? ` converterId="${converter}"` : ''}/>`;
}

const glaze = (name: string, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(CARD_WIDTH, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

// The card's dark backing, one piece per panel, meeting mid-gap, so the gaps read as glass.
const backing = (name: string, y: number, height: number, radii: Radii) => `<Shape name="${name} Backing" x="0" y="${y}">
    ${rectangle(CARD_WIDTH, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

/** One-run text with a fixed box; without a property the text is fixed copy. */
const text = (o: {
  name: string; x: number; y: number; width: number; height: number; font: string; size: number; spacing: number;
  color: string; styleId: string; value: string; property?: number; reveal: string; align?: 'center' | 'right';
  colorProperty?: number; opacity?: { value: number; property: number; converter?: string };
}) => `<Text name="${o.name}" x="${o.x}" y="${o.y}"${o.opacity ? ` opacity="${o.opacity.value}"` : ''} originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${o.height}" sizingValue="fixed" overflowValue="fitFontSize"${o.align ? ` alignValue="${o.align}"` : ''}>${o.opacity ? bound(o.opacity.property, OPACITY, o.opacity.converter) : ''}<TextStylePaint id="${o.styleId}" fontAssetId="${o.font}" fontSize="${o.size}" letterSpacing="${o.spacing}"><Fill><SolidColor colorValue="${o.color}">${o.colorProperty === undefined ? '' : bound(o.colorProperty, COLOR)}</SolidColor></Fill></TextStylePaint><TextValueRun name="${o.name} Value" styleId="${o.styleId}" text="${escaped(o.value)}">${o.property === undefined ? '' : bound(o.property, TEXT)}</TextValueRun>${rise(o.name, o.reveal)}</Text>`;

// --- title panel ----------------------------------------------------------------------

// The marker is the panel's left edge in the home team's accent, clipped to the panel's
// rounded corners; it draws down from the centre.
const titlePanel = `<Node name="Title Panel" id="${TITLE_PANEL}" x="0" y="0">
  <Node name="Title Marker" id="${MARKER_NODE}" x="0" y="0">
    <ClippingShape name="Title Marker Clip" sourceId="${TITLE_SILHOUETTE}"/>
    <Shape name="Title Marker Bar" id="${MARKER_SHAPE}" x="0" y="${TITLE_HEIGHT / 2}">
      <Rectangle width="${MARKER_WIDTH}" height="${TITLE_HEIGHT}" originX="0" originY="0.5"/>
      <Fill><SolidColor colorValue="${MARKER}">${bound(P.markerColor, COLOR)}</SolidColor></Fill>
    </Shape>
  </Node>
  ${text({ name: 'Title', x: TEXT_INSET, y: 68, width: 760, height: 72, font: FONT_BOLD, size: 62, spacing: 1, color: 'FFFFFFFF', styleId: TITLE_STYLE, value: 'BIG 5 CLASSIC', reveal: TITLE_REVEAL })}
  ${text({ name: 'Title Label', x: 800, y: 59, width: CARD_WIDTH - TEXT_INSET - 800, height: 40, font: FONT_REGULAR, size: 32, spacing: 2, color: 'CCFFFFFF', styleId: LABEL_STYLE, value: 'POD PLAY · CAMPUS GAMES', reveal: LABEL_REVEAL, align: 'right' })}
  ${glaze('Title', TITLE_HEIGHT, TITLE_RADII)}
  ${backing('Title', 0, TITLE_HEIGHT + GAP / 2, [OUTER_RADIUS, OUTER_RADIUS, 0, 0])}
</Node>`;

// --- table panel ----------------------------------------------------------------------

const hairline = (name: string) => `<Shape name="${name} Hairline" x="0" y="${-GAP / 2}">
    ${rectangle(CARD_WIDTH, 1, SQUARE_RADII)}
    <Fill><SolidColor colorValue="${HAIRLINE_COLOR}"/></Fill>
  </Shape>`;

/** A pod's label band. The second band follows the rows above it, so it carries a hairline and a bound top. */
const podBand = (b: (typeof BANDS)[number]) => {
  const top = b.index === 0 ? 0 : evaluate(BAND2_TOP);
  return `<Node name="${b.name}" id="${b.node}" x="0" y="${top}">${b.index === 0 ? '' : bound(P.game(0).tonight, Y, BAND2_FORMULA)}
  ${b.index === 0 ? '' : hairline(b.name)}
  ${text({ name: `${b.name} Name`, x: TEXT_INSET, y: BAND_HEIGHT / 2 + 10, width: 400, height: 34, font: FONT_BOLD, size: 28, spacing: 2, color: 'E6FFFFFF', styleId: b.style, value: b.value, property: b.property, reveal: b.reveal })}
  <Shape name="${b.name} Fill" x="0" y="0">
    ${rectangle(CARD_WIDTH, BAND_HEIGHT, SQUARE_RADII)}
    <Fill><SolidColor colorValue="${BAND_COLOR}"/></Fill>
  </Shape>
</Node>`;
};

/**
 * One team in a game row: logo, name and score, with the pod record in the score's place
 * on the tonight row. The node's opacity dims the loser of a final.
 */
const teamCell = (r: Row, side: 'away' | 'home') => {
  const s: Side = r[side];
  const g = r.game;
  const team = g[side];
  const p = r.property;
  const name = `${r.name} ${side === 'away' ? 'Away' : 'Home'}`;
  const x = side === 'away' ? AWAY_X : HOME_X;
  const loser = g.winner !== 0 && g.winner !== (side === 'away' ? 1 : 2);
  const scoreX = TEAM_WIDTH - SCORE_WIDTH;
  return `<Node name="${name}" id="${s.node}" x="${x}" y="0" opacity="${loser ? LOSER_OPACITY : 1}">${bound(p.winner, OPACITY, side === 'away' ? AWAY_OPACITY : HOME_OPACITY)}
    <Node name="${name} Logo Group" id="${s.logoGroup}" x="${LOGO_BOX / 2}" y="0">
      <Image name="${name} Logo" id="${s.logo}" x="0" y="0" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${logoAsset(TEAMS.indexOf(team))}">${bound(side === 'away' ? p.awayLogo : p.homeLogo, IMAGE)}</Image>
    </Node>
    ${text({ name: `${name} Name`, x: NAME_OFFSET, y: 14, width: NAME_WIDTH, height: 46, font: FONT_BOLD, size: 40, spacing: 0.5, color: 'FFFFFFFF', styleId: s.nameStyle, value: team.name, property: side === 'away' ? p.awayName : p.homeName, reveal: s.nameReveal })}
    ${text({ name: `${name} Score`, x: scoreX, y: 16, width: SCORE_WIDTH, height: 50, font: FONT_BOLD, size: 46, spacing: 0.5, color: 'FFFFFFFF', styleId: s.scoreStyle, value: side === 'away' ? g.awayScore : g.homeScore, property: side === 'away' ? p.awayScore : p.homeScore, reveal: s.scoreReveal, align: 'right' })}
    ${text({ name: `${name} Record`, x: scoreX, y: 11, width: SCORE_WIDTH, height: 36, font: FONT_REGULAR, size: 32, spacing: 1, color: 'D9FFFFFF', styleId: s.recordStyle, value: side === 'away' ? g.awayRecord : g.homeRecord, property: side === 'away' ? p.awayRecord : p.homeRecord, reveal: s.recordReveal, align: 'right' })}
  </Node>`;
};

/**
 * A game: date, away team, AT, home team, status. The row's node sits at its top, bound
 * to the row-top formula; its content sits on the row's centre line, bound likewise. The
 * tint, sized for the tall row, shows only on the tonight row: the gate around it carries
 * the resting tint opacity, the tint itself the row's tonight flag. Each logo's shade
 * rides in the gate with the tint.
 */
const gameRow = (r: Row) => {
  const g = r.game;
  const p = r.property;
  const top = evaluate(rowTop(r.index));
  const centre = evaluate(rowHeight(r.index)) / 2;
  const shade = (side: Side, x: number) => `<Shape name="${r.name} ${x === AWAY_X ? 'Away' : 'Home'} Logo Shade" id="${side.shade}" x="${x + LOGO_BOX / 2}" y="${TALL_HEIGHT / 2}" scaleY="${(TALL_HEIGHT + GAP) / SHADE_WIDTH}" opacity="${g.tonight}">${bound(p.tonight, OPACITY)}
      <Ellipse width="${SHADE_WIDTH}" height="${SHADE_WIDTH}"/>
      <Fill><RadialGradient startX="0" startY="0" endX="${SHADE_WIDTH / 2}" endY="0"><GradientStop colorValue="73000000" position="0"/><GradientStop colorValue="2E000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
    </Shape>`;
  return `<Node name="${r.name}" id="${r.node}" x="0" y="${top}">${bound(p.tonight, Y, rowTopFormula(r.index))}
  ${hairline(r.name)}
  <Node name="${r.name} Content" id="${r.content}" x="0" y="${centre}">${bound(p.tonight, Y, rowCentreFormula(r.index))}
    ${text({ name: `${r.name} Date`, x: DATE_X, y: 11, width: DATE_WIDTH, height: 36, font: FONT_REGULAR, size: 30, spacing: 1.5, color: 'BFFFFFFF', styleId: r.dateStyle, value: g.date, property: p.date, reveal: r.dateReveal, opacity: { value: 1 - g.tonight, property: p.tonight, converter: NOT_TONIGHT } })}
    ${text({ name: `${r.name} Tonight`, x: DATE_X, y: 12, width: DATE_WIDTH, height: 38, font: FONT_BOLD, size: 34, spacing: 1.5, color: MARKER, colorProperty: P.markerColor, styleId: r.tonightStyle, value: 'TONIGHT', reveal: r.tonightReveal, opacity: { value: g.tonight, property: p.tonight } })}
    ${teamCell(r, 'away')}
    ${text({ name: `${r.name} At`, x: AT_X, y: 9, width: AT_WIDTH, height: 30, font: FONT_REGULAR, size: 26, spacing: 1, color: '99FFFFFF', styleId: r.atStyle, value: 'AT', reveal: r.atReveal, align: 'center' })}
    ${teamCell(r, 'home')}
    ${text({ name: `${r.name} Status`, x: STATUS_X, y: 10, width: STATUS_WIDTH, height: 34, font: FONT_REGULAR, size: 28, spacing: 1.5, color: 'D9FFFFFF', styleId: r.statusStyle, value: g.status, property: p.status, reveal: r.statusReveal, align: 'right' })}
  </Node>
  <Node name="${r.name} Tint Gate" id="${r.gate}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${shade(r.away, AWAY_X)}
    ${shade(r.home, HOME_X)}
    <Shape name="${r.name} Tint" id="${r.tint}" x="0" y="${-GAP / 2}" opacity="${g.tonight}">${bound(p.tonight, OPACITY)}
      ${rectangle(CARD_WIDTH, TALL_HEIGHT + GAP, SQUARE_RADII)}
      <Fill><SolidColor colorValue="${HOME_PRIMARY}">${bound(P.homePrimaryColor, COLOR)}</SolidColor></Fill>
      <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${TALL_HEIGHT + GAP}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    </Shape>
  </Node>
</Node>`;
};

// Every line sits on the table's one panel of dark glass, clipped to its outline.
const tablePanel = `<Node name="Table Panel" id="${TABLE_PANEL}" x="0" y="${TABLE_Y}">
  <Node name="Table Body" id="${TABLE_BODY}" x="0" y="0">
    <ClippingShape name="Table Body Clip" sourceId="${TABLE_SILHOUETTE}"/>
${ROWS.map(gameRow).join('\n')}
${BANDS.map(podBand).join('\n')}
  </Node>
  ${glaze('Table', TABLE_HEIGHT, TABLE_RADII)}
  ${backing('Table', -GAP / 2, TABLE_HEIGHT + GAP, SQUARE_RADII)}
</Node>`;

// --- footer panel ---------------------------------------------------------------------

const footerPanel = `<Node name="Footer Panel" id="${FOOTER_PANEL}" x="0" y="${FOOTER_Y}">
  ${text({ name: 'Classic Line', x: TEXT_INSET, y: 39, width: 1100, height: 36, font: FONT_BOLD, size: 30, spacing: 1, color: 'FFFFFFFF', styleId: FOOTER_LINE_STYLE, value: CLASSIC_LINE, property: P.classicLine, reveal: FOOTER_LINE_REVEAL })}
  ${text({ name: 'Classic Times', x: 1160, y: 38, width: CARD_WIDTH - TEXT_INSET - 1160, height: 32, font: FONT_REGULAR, size: 28, spacing: 2, color: 'CCFFFFFF', styleId: FOOTER_TIMES_STYLE, value: CLASSIC_TIMES, property: P.classicTimes, reveal: FOOTER_TIMES_REVEAL, align: 'right' })}
  ${glaze('Footer', FOOTER_HEIGHT, FOOTER_RADII)}
  ${backing('Footer', -GAP / 2, FOOTER_HEIGHT + GAP / 2, [0, 0, OUTER_RADIUS, OUTER_RADIUS])}
</Node>`;

// --- converters -----------------------------------------------------------------------

// The away team dims when the home team won (winner 2); the home team when the away team
// won (winner 1, the only odd winner); with no winner neither does.
const converters = [
  `<DataConverterRangeMapper name="Away Opacity" id="${AWAY_OPACITY}" minInput="1" maxInput="2" minOutput="1" maxOutput="${LOSER_OPACITY}" clampLower="true" clampUpper="true"/>`,
  `<DataConverterOperationValue name="Winner Parity" id="${HOME_PARITY}" operationType="modulo" operationValue="2"/>`,
  `<DataConverterRangeMapper name="Home Dim" id="${HOME_DIM}" minInput="0" maxInput="1" minOutput="1" maxOutput="${LOSER_OPACITY}" clampLower="true" clampUpper="true"/>`,
  `<DataConverterGroup name="Home Opacity" id="${HOME_OPACITY}"><DataConverterGroupItem converterId="${HOME_PARITY}"/><DataConverterGroupItem converterId="${HOME_DIM}"/></DataConverterGroup>`,
  `<DataConverterRangeMapper name="Not Tonight" id="${NOT_TONIGHT}" minInput="0" maxInput="1" minOutput="1" maxOutput="0" clampLower="true" clampUpper="true"/>`,
  ...ROWS.map((r) => formula(`${r.name} Top`, rowTopFormula(r.index), rowTop(r.index))),
  ...ROWS.map((r) => formula(`${r.name} Centre`, rowCentreFormula(r.index), times(rowHeight(r.index), 0.5))),
  formula('Pod 2 Band Top', BAND2_FORMULA, BAND2_TOP),
];

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

const hold = (objectId: string, propertyKey: number, value: number): Track => ({ objectId, propertyKey, keys: [{ frame: 0, value }] });
const move = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number, ease: string): Track => ({
  objectId, propertyKey,
  keys: start > 0
    ? [{ frame: 0, value: from }, { frame: start, value: from, ease }, { frame: end, value: to }]
    : [{ frame: 0, value: from, ease }, { frame: end, value: to }],
});
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
// Rows wait on open glass, so a reveal starts with its ramp wholly before the text.
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const sideRanges = (s: Side) => [s.nameReveal, s.scoreReveal, s.recordReveal];
const RANGES = [
  TITLE_REVEAL, LABEL_REVEAL, FOOTER_LINE_REVEAL, FOOTER_TIMES_REVEAL, ...BANDS.map((b) => b.reveal),
  ...ROWS.flatMap((r) => [r.dateReveal, r.tonightReveal, r.atReveal, r.statusReveal, ...sideRanges(r.away), ...sideRanges(r.home)]),
];
const GATES = ROWS.map((r) => r.gate);
const EDGE_LIGHTS = [LEFT_EDGE_LIGHT, RIGHT_EDGE_LIGHT];
const LOGOS = ROWS.flatMap((r) => [r.away.logoGroup, r.home.logoGroup]);
const FOOTER_START = lineStart(LINES.length - 1) + 4;

if (lineStart(LINES.length - 1) + GATE_END > INTRO_FRAMES) {
  throw new Error('The last row lights after the intro ends: lengthen INTRO_FRAMES or shorten LINE_STAGGER.');
}

const edgeFlare = (fadeFrom: number, fadeTo: number): Key[] => [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: fadeFrom, value: 1, ease: EASE_OUT }, { frame: fadeTo, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];

const rowIntro = (r: Row): Track[] => {
  const start = lineStart(lineIndex(r));
  const side = (s: Side, delay: number): Track[] => [
    ...scale(s.logoGroup, 1.12, 1, start + delay, start + delay + 36, EASE_OUT),
    move(s.logoGroup, OPACITY, 0, 1, start + delay, start + delay + 18, EASE_OUT),
    ...sideRanges(s).flatMap((range) => reveal(range, start + delay + 2, start + delay + 24)),
  ];
  return [
    ...reveal(r.dateReveal, start, start + 22),
    ...reveal(r.tonightReveal, start, start + 22),
    ...side(r.away, 1),
    ...reveal(r.atReveal, start + 3, start + 24),
    ...side(r.home, 3),
    ...reveal(r.statusReveal, start + 5, start + 27),
    move(r.gate, OPACITY, 0, TINT_OPACITY, start + GATE_START, start + GATE_END, EASE_OUT),
  ];
};

const intro: Track[] = [
  hold(CONTENT, OPACITY, 1),
  move(REVEAL_MASK_RECTANGLE, PATH_WIDTH, 0, MASK_WIDTH, WIPE_START, WIPE_END, EASE_WIPE),
  move(LEFT_EDGE, X, SEAM_X, -8, WIPE_START, WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE, X, SEAM_X, CARD_WIDTH + 8, WIPE_START, WIPE_END, EASE_WIPE),
  ...EDGE_LIGHTS.flatMap((light): Track[] => [
    move(light, SCALE_Y, 0, 1, 0, 16, EASE_OUT),
    { objectId: light, propertyKey: OPACITY, keys: edgeFlare(18, 42) },
  ]),
  move(MARKER_SHAPE, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...reveal(TITLE_REVEAL, 16, 40),
  ...reveal(LABEL_REVEAL, 18, 42),
  ...BANDS.flatMap((b) => reveal(b.reveal, lineStart(lineIndex(b)), lineStart(lineIndex(b)) + 22)),
  ...ROWS.flatMap(rowIntro),
  ...reveal(FOOTER_LINE_REVEAL, FOOTER_START, FOOTER_START + 24),
  ...reveal(FOOTER_TIMES_REVEAL, FOOTER_START + 2, FOOTER_START + 26),
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
  hold(MARKER_SHAPE, SCALE_Y, 1),
  ...LOGOS.flatMap((logo) => [hold(logo, SCALE_X, 1), hold(logo, SCALE_Y, 1), hold(logo, OPACITY, 1)]),
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
  closing(MARKER_SHAPE, SCALE_Y, 1, 0, 0, 16),
  ...LOGOS.flatMap((logo): Track[] => [
    closing(logo, SCALE_X, 1, 1.06, 0, 16), closing(logo, SCALE_Y, 1, 1.06, 0, 16),
    closing(logo, OPACITY, 1, 0, 0, 16),
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

const stateMachine = `<StateMachine name="Big 5 Pod Schedule" id="${id(7)}">
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
  string('pod1Name', P.pod1Name),
  string('pod2Name', P.pod2Name),
  string('classicLine', P.classicLine),
  string('classicTimes', P.classicTimes),
  color('homePrimaryColor', P.homePrimaryColor),
  color('markerColor', P.markerColor),
  ...ROWS.flatMap((r) => {
    const g = `game${r.index + 1}`;
    const p = r.property;
    return [
      string(`${g}Date`, p.date),
      string(`${g}AwayName`, p.awayName), string(`${g}AwayScore`, p.awayScore), string(`${g}AwayRecord`, p.awayRecord), image(`${g}AwayLogo`, p.awayLogo),
      string(`${g}HomeName`, p.homeName), string(`${g}HomeScore`, p.homeScore), string(`${g}HomeRecord`, p.homeRecord), image(`${g}HomeLogo`, p.homeLogo),
      string(`${g}Status`, p.status),
      number(`${g}Winner`, p.winner),
      number(`${g}Tonight`, p.tonight),
    ];
  }),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${escaped(value)}"/>`;
const numberValue = (local: number, value: number) => `<ViewModelInstanceNumber viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const imageValue = (local: number, asset: string) => `<ViewModelInstanceAssetImage viewModelPropertyId="${id(local)}" propertyValue="${asset}"/>`;
const colorValue = (local: number, value: string) => `<ViewModelInstanceColor viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  `<ViewModelInstanceBoolean viewModelPropertyId="${id(P.isPlaying)}" propertyValue="false"/>`,
  stringValue(P.pod1Name, BANDS[0]!.value),
  stringValue(P.pod2Name, BANDS[1]!.value),
  stringValue(P.classicLine, CLASSIC_LINE),
  stringValue(P.classicTimes, CLASSIC_TIMES),
  colorValue(P.homePrimaryColor, HOME_PRIMARY),
  colorValue(P.markerColor, MARKER),
  ...ROWS.flatMap((r) => {
    const g = r.game;
    const p = r.property;
    return [
      stringValue(p.date, g.date),
      stringValue(p.awayName, g.away.name), stringValue(p.awayScore, g.awayScore), stringValue(p.awayRecord, g.awayRecord), imageValue(p.awayLogo, logoAsset(TEAMS.indexOf(g.away))),
      stringValue(p.homeName, g.home.name), stringValue(p.homeScore, g.homeScore), stringValue(p.homeRecord, g.homeRecord), imageValue(p.homeLogo, logoAsset(TEAMS.indexOf(g.home))),
      stringValue(p.status, g.status),
      numberValue(p.winner, g.winner),
      numberValue(p.tonight, g.tonight),
    ];
  }),
];

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" y="${CARD_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${CARD_HEIGHT / 2}"><Rectangle width="2" height="${CARD_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${CARD_HEIGHT / 2}"><Rectangle width="44" height="${CARD_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_big5_pod_schedule.ts; edit that file, not this one.
     Big 5 Classic pod schedule v2: a card, ${CARD_WIDTH} x ${CARD_HEIGHT}, on a transparent 1920 x 1080
     canvas (origin ${CARD_X}, ${CARD_Y}). A title panel, a dark glass table of the six campus pod
     games under two pod bands, and a footer with the Classic tripleheader. Sibling draw
     order is front to back; within one shape the last paint declared is on top. -->
<Artboard name="Basketball Big 5 Pod Schedule v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Big 5 Pod Schedule v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Big 5 Pod Schedule Card" id="${ROOT}" x="${CARD_X}" y="${CARD_Y}">

<!-- Seam ignition at the centre of the card; the two edges ride the reveal mask outward. -->
<Node name="Left Leading Edge" id="${LEFT_EDGE}" x="-8">
  ${edgeLight('Left', LEFT_EDGE_LIGHT, 1)}
</Node>
<Node name="Right Leading Edge" id="${RIGHT_EDGE}" x="${CARD_WIDTH + 8}">
  ${edgeLight('Right', RIGHT_EDGE_LIGHT, -1)}
</Node>
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

<!-- ============================== Footer panel ============================== -->
${footerPanel}
</Node>

<!-- ============================= Clip sources ============================= -->
<Shape name="Card Reveal Mask" id="${REVEAL_MASK}" x="${SEAM_X}" y="-8"><Rectangle id="${REVEAL_MASK_RECTANGLE}" width="${MASK_WIDTH}" height="${CARD_HEIGHT + 16}" originX="0.5" originY="0"/></Shape>
<Shape name="Card Silhouette" id="${CARD_SILHOUETTE}">
  ${rectangle(CARD_WIDTH, CARD_HEIGHT, [OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS], ' x="0" y="0"')}
</Shape>
<Shape name="Title Silhouette" id="${TITLE_SILHOUETTE}">${rectangle(CARD_WIDTH, TITLE_HEIGHT, TITLE_RADII)}</Shape>
<Shape name="Table Silhouette" id="${TABLE_SILHOUETTE}" x="0" y="${TABLE_Y}">${rectangle(CARD_WIDTH, TABLE_HEIGHT, TABLE_RADII)}</Shape>
</Node>

<!-- Intro: seam ignition, one wipe opening outward both ways, the title rising and the
     marker drawing, then the table's lines rising in order as their logos settle, the
     tonight row lighting, the footer and one sheen; ${(INTRO_FRAMES / 60).toFixed(2)} s. Hold and
     Outro explicitly restore every animated property for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

${stateMachine}
</Artboard>

<!-- Row states: winner dims the loser, tonight grows a row; each row's top is a formula of
     the six tonight flags. -->
${converters.join('\n')}

<FontAsset name="Big 5 Pod Schedule v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Big 5 Pod Schedule v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
${TEAMS.map((team, index) => `<ImageAsset name="Big 5 Pod Schedule v2 ${escaped(team.name)}" id="${logoAsset(index)}" file="assets/images/big5/${team.logo}.png"/>`).join('\n')}

<ViewModel name="BasketballBig5PodScheduleV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'big5_pod_schedule.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
