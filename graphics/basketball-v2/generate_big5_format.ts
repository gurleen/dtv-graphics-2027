/**
 * Generates the Big 5 Format card scene from one description:
 *
 *   bun graphics/basketball-v2/generate_big5_format.ts
 *
 * writes big5_format.rml beside this file. Edit this file, not the output.
 *
 * A mid-screen card explaining the Big 5 Classic, in two steps the operator advances with
 * Next. The shell is the same on both: a title bar (BIG 5 CLASSIC, with the step's label at
 * the right), a body and a footer strip.
 *
 *   Step 0  How it works: three columns, pod play (with the six logos), pod standings and
 *           Classic Saturday (its date, venue and three games).
 *   Step 1  The pod standings: one panel per pod, three rows each. The rows of tonight's
 *           two teams take their tints.
 *
 * The state machine has two layers:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro, gated on `isPlaying`, as in every v2 scene.
 *            It animates the shell and the rise of every text and logo in both steps.
 *   Step     Format <-> Pods, gated on `showPods`. On air it cross-fades the two bodies and
 *            swaps the title's label and the footer; off air it snaps, so a take with
 *            `showPods` set builds the pods in the intro. It keys only the step containers
 *            and the label and footer twins, which the Display layer never keys.
 */

import { join } from 'node:path';

const PREFIX = 51;
const ARTBOARD_Y = 27800;

// Test data: big5.ts bound for Saint Joseph's at Drexel (see the package README). The
// golden test compares these with the registry entry's demo.
type Team = { key: string; name: string; primary: string; file: string };
const TEAMS: Team[] = [
  { key: 'saint-josephs', name: "SAINT JOSEPH'S", primary: 'FFC2071B', file: 'assets/images/big5/saint-josephs.png' },
  { key: 'drexel', name: 'DREXEL', primary: 'FF07294D', file: 'assets/images/big5/drexel.png' },
  { key: 'pennsylvania', name: 'PENN', primary: 'FF082A74', file: 'assets/images/big5/pennsylvania.png' },
  { key: 'temple', name: 'TEMPLE', primary: 'FFA80532', file: 'assets/images/big5/temple.png' },
  { key: 'villanova', name: 'VILLANOVA', primary: 'FF123D7C', file: 'assets/images/big5/villanova.png' },
  { key: 'la-salle', name: 'LA SALLE', primary: 'FF003356', file: 'assets/images/big5/la-salle.png' },
];
const teamNamed = (key: string) => TEAMS.find((team) => team.key === key)!;

type Standing = { rank: string; team: string; record: string; tonight: boolean };
// Rows 1-3 are pod 1, rows 4-6 pod 2, each in podStandings order.
const STANDINGS: Standing[] = [
  { rank: '1', team: 'saint-josephs', record: '1-0', tonight: true },
  { rank: '2', team: 'drexel', record: '0-0', tonight: true },
  { rank: '3', team: 'pennsylvania', record: '0-1', tonight: false },
  { rank: '1', team: 'temple', record: '1-0', tonight: false },
  { rank: '1', team: 'villanova', record: '1-0', tonight: false },
  { rank: '3', team: 'la-salle', record: '0-2', tonight: false },
];
const CLASSIC_DATE = 'SAT DEC 5';
const CLASSIC_VENUE = 'XFINITY MOBILE ARENA';
const GAMES = [
  { time: '2:00', name: '5TH PLACE', pairing: '3RD VS 3RD' },
  { time: '4:30', name: '3RD PLACE', pairing: '2ND VS 2ND' },
  { time: '7:00', name: 'CHAMPIONSHIP', pairing: '1ST VS 1ST' },
];
const TONIGHT_GAME = "SAINT JOSEPH'S AT DREXEL · POD 1";

// Geometry. A title bar over a body over a footer strip, GAP apart, at the wireframe's
// place: 1488 wide from x 216, top at y 150, so the foot (y 846) clears the scorebug.
const GAP = 4;
const CARD_X = 216;
const CARD_Y = 150;
const CARD_WIDTH = 1488;
const TITLE_HEIGHT = 104;
const BODY_Y = TITLE_HEIGHT + GAP;
const BODY_HEIGHT = 520;
const FOOTER_Y = BODY_Y + BODY_HEIGHT + GAP;
const FOOTER_HEIGHT = 64;
const CARD_HEIGHT = FOOTER_Y + FOOTER_HEIGHT;
const OUTER_RADIUS = 24;
const INNER_RADIUS = 6;
const INSET = 36;
const MARKER_WIDTH = 8;
const GOLD = 'FFFFC600';
const WHITE = 'FFFFFFFF';
const BRIGHT = 'D9FFFFFF';
const MUTED = 'BFFFFFFF';
const RANK_MUTED = 'B3FFFFFF';
const HAIRLINE = '1FFFFFFF';
const LIFT = '0FFFFFFF';
const CHAMPIONSHIP_LIFT = '14FFFFFF';

// Step 0: three columns, 4 apart.
const COLUMN_WIDTHS = [494, 492, 494];
const columnX = (index: number) => COLUMN_WIDTHS.slice(0, index).reduce((sum, width) => sum + width + GAP, 0);
const NUMERAL_BASELINE = 92;
const HEADING_X = 84;
const RULE_Y = 122;
const LEAD_BASELINE = 178;
// The logo grid: pod 1 over pod 2, three cells each, at the column's foot.
const CELL_GAP = 10;
const CELL_HEIGHT = 88;
const GRID_BOTTOM = BODY_HEIGHT - 32;
const GRID_LOGO = 112;
// The championship row reaches the column's edges; the other two sit inside the inset.
const GAME_ROWS = [68, 68, 76];
const GAMES_BOTTOM = BODY_HEIGHT - 32;

// Step 1: two pod panels, a header over three rows, 4 apart with a hairline in each gap.
const POD_WIDTH = (CARD_WIDTH - GAP) / 2;
const podX = (pod: number) => pod * (POD_WIDTH + GAP);
const POD_HEADER = 88;
const ROW_HEIGHT = 140;
const rowY = (index: number) => POD_HEADER + GAP + index * (ROW_HEIGHT + GAP);
const RANK_X = INSET;
const RANK_WIDTH = 40;
const ROW_LOGO = 128;
const ROW_LOGO_X = RANK_X + RANK_WIDTH + 28 + ROW_LOGO / 2;
const NAME_X = ROW_LOGO_X + ROW_LOGO / 2 + 28;
const RECORD_WIDTH = 110;
const RECORD_X = POD_WIDTH - INSET - RECORD_WIDTH;
const NAME_WIDTH = RECORD_X - 20 - NAME_X;
const SHADE_WIDTH = 120;
const TINT_OPACITY = 0.78;

// The intro opens the card from a seam at its centre.
const SEAM_X = CARD_WIDTH / 2;
const MASK_WIDTH = CARD_WIDTH + 16;
const SWEEP_START = -300;
const SWEEP_END = CARD_WIDTH + 300;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 90;
const OUTRO_FRAMES = 24;
const STEP_FRAMES = 36;
const WIPE_START = 8;
const WIPE_END = 46;
const SWEEP_BEGIN = 50;
const GATE_START = 26;
const GATE_END = 42;

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
const BOOLEAN = 634;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;
const escaped = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Text styles, reveal ranges and logo groups take ids from one counter, in the order the
// markup below declares them.
let nextLocal = 5000;
const allocate = () => id(nextLocal++);

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const CONTENT = id(11);
const TITLE_MARKER = id(102);
const FORMAT_LABEL = id(110);
const PODS_LABEL = id(111);
const FORMAT_BODY = id(201);
const PODS_BODY = id(202);
const FORMAT_FOOTER = id(301);
const PODS_FOOTER = id(302);
const LEFT_EDGE = id(500);
const LEFT_EDGE_LIGHT = id(501);
const RIGHT_EDGE = id(502);
const RIGHT_EDGE_LIGHT = id(503);
const REVEAL_MASK = id(505);
const REVEAL_MASK_RECTANGLE = id(506);
const INTRO_SWEEP = id(600);
const TITLE_SILHOUETTE = id(610);
const CARD_SILHOUETTE = id(611);
const podSilhouette = (pod: number) => id(612 + pod);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const logoAsset = (key: string) => id(910 + TEAMS.findIndex((team) => team.key === key));
const TO_NUMBER = id(950);

const P = {
  isPlaying: 1002, showPods: 1003, classicDate: 1010, classicVenue: 1011, tonightGame: 1012,
  game: (index: number) => {
    const base = 1020 + index * 3;
    return { time: base, name: base + 1, pairing: base + 2 };
  },
  row: (index: number) => {
    const base = 1100 + index * 10;
    return { rank: base, team: base + 1, record: base + 2, logo: base + 3, primaryColor: base + 4, tonight: base + 5 };
  },
} as const;

type Radii = [number, number, number, number];
const SQUARE: Radii = [0, 0, 0, 0];
const SEAM: Radii = [INNER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS];

// --- what the intro moves --------------------------------------------------------------

/** A reveal range and the frame its line starts rising. */
const REVEALS: { range: string; start: number }[] = [];
/** A logo group and the frame it starts settling from 112%. */
const MARKS: { group: string; start: number }[] = [];
/** A row's tint gate and the frame it starts lighting. */
const GATES: { gate: string; start: number }[] = [];

// --- markup helpers -------------------------------------------------------------------

const rectangle = (width: number, height: number, radii: Radii, position = '', inner = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"${inner}/>`;

const bound = (property: number, key: number, converter?: string) =>
  `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"${converter ? ` converterId="${converter}"` : ''}/>`;

const glaze = (name: string, x: number, y: number, width: number, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="${x}" y="${y}">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const plate = (name: string, x: number, y: number, width: number, height: number, color: string, radii: Radii = SEAM) =>
  `<Shape name="${name}" x="${x}" y="${y}">${rectangle(width, height, radii)}<Fill><SolidColor colorValue="${color}"/></Fill></Shape>`;

const rise = (name: string, rangeId: string) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>`;

type Run = { value: string; font: string; size: number; spacing: number; color: string; property?: number };

/**
 * A line of text in a fixed box that rises in from `at`. Several runs share the line (a
 * muted label before a value). A line that takes data or may run long shrinks to fit; a
 * `lines` box wraps fixed copy instead.
 */
const text = (o: {
  name: string; x: number; y: number; width: number; height: number; runs: Run[]; at: number;
  align?: 'center' | 'right'; lines?: boolean; id?: string; opacity?: number;
}) => {
  const range = allocate();
  REVEALS.push({ range, start: o.at });
  const styles = o.runs.map(() => allocate());
  const paints = o.runs.map((run, index) => `<TextStylePaint id="${styles[index]}" fontAssetId="${run.font}" fontSize="${run.size}" letterSpacing="${run.spacing}"><Fill><SolidColor colorValue="${run.color}"/></Fill></TextStylePaint>`).join('');
  const values = o.runs.map((run, index) => `<TextValueRun name="${o.name} Value ${index + 1}" styleId="${styles[index]}" text="${escaped(run.value)}">${run.property === undefined ? '' : bound(run.property, TEXT)}</TextValueRun>`).join('');
  const box = o.lines
    ? `originValue="top" wrapValue="wrap" wordBreakValue="normal" overflowValue="fitFontSize"`
    : `originValue="baseline" wrapValue="noWrap" overflowValue="fitFontSize"`;
  return `<Text name="${o.name}"${o.id ? ` id="${o.id}"` : ''} x="${o.x}" y="${o.y}" ${box} width="${o.width}" height="${o.height}" sizingValue="fixed"${o.align ? ` alignValue="${o.align}"` : ''}${o.opacity === undefined ? '' : ` opacity="${o.opacity}"`}>${paints}${values}${rise(o.name, range)}</Text>`;
};

const bold = (value: string, size: number, color = WHITE, property?: number): Run => ({ value, font: FONT_BOLD, size, spacing: 0.5, color, property });
const regular = (value: string, size: number, color = MUTED, property?: number): Run => ({ value, font: FONT_REGULAR, size, spacing: 2, color, property });

/** A logo centred at x, y in a group that carries the intro's settle. */
const logo = (o: { name: string; x: number; y: number; size: number; team: string; property: number; at: number }) => {
  const group = allocate();
  MARKS.push({ group, start: o.at });
  const scale = o.size / 1024;
  return `<Node name="${o.name} Group" id="${group}" x="${o.x}" y="${o.y}">
      <Image name="${o.name}" x="0" y="0" scaleX="${scale}" scaleY="${scale}" assetId="${logoAsset(o.team)}">${bound(o.property, IMAGE)}</Image>
    </Node>`;
};

// --- title bar ------------------------------------------------------------------------

// The marker is Drexel gold, as the column numerals are; the title's rounded corner clips it.
const titleBar = `<Node name="Title Bar" x="0" y="0">
  <Node name="Title Marker Clip" x="0" y="0">
    <ClippingShape name="Title Marker Clip" sourceId="${TITLE_SILHOUETTE}"/>
    <Shape name="Title Marker" id="${TITLE_MARKER}" x="0" y="0">${rectangle(MARKER_WIDTH, TITLE_HEIGHT, SQUARE)}<Fill><SolidColor colorValue="${GOLD}"/></Fill></Shape>
  </Node>
  ${text({ name: 'Title', x: 40, y: 75, width: 900, height: 80, runs: [{ ...bold('BIG 5 CLASSIC', 68), spacing: 1 }], at: 16 })}
  ${text({ name: 'Format Label', id: FORMAT_LABEL, x: CARD_WIDTH - INSET - 500, y: 64, width: 500, height: 44, runs: [regular('HOW IT WORKS', 34)], at: 18, align: 'right' })}
  ${text({ name: 'Pods Label', id: PODS_LABEL, x: CARD_WIDTH - INSET - 500, y: 64, width: 500, height: 44, runs: [regular('POD STANDINGS', 34)], at: 18, align: 'right', opacity: 0 })}
  ${glaze('Title', 0, 0, CARD_WIDTH, TITLE_HEIGHT, [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS])}
</Node>`;

// --- step 0: how it works -------------------------------------------------------------

/** A column's head: the gold numeral and heading over a hairline, then its lead line. */
const columnHead = (index: number, heading: string, lead: string, at: number, leadProperty?: number) => {
  const width = COLUMN_WIDTHS[index]!;
  return `${text({ name: `Column ${index + 1} Numeral`, x: INSET, y: NUMERAL_BASELINE, width: 56, height: 96, runs: [bold(`${index + 1}`, 84, GOLD)], at })}
    ${text({ name: `Column ${index + 1} Heading`, x: HEADING_X, y: NUMERAL_BASELINE, width: width - HEADING_X - INSET, height: 54, runs: [bold(heading, 44)], at: at + 2 })}
    ${plate(`Column ${index + 1} Rule`, INSET, RULE_Y, width - 2 * INSET, 1, HAIRLINE, SQUARE)}
    ${text({ name: `Column ${index + 1} Lead`, x: INSET, y: LEAD_BASELINE, width: width - 2 * INSET, height: 50, runs: [bold(lead, 40, WHITE, leadProperty)], at: at + 6 })}`;
};

const column = (index: number, inner: string) => `<Node name="Column ${index + 1}" x="${columnX(index)}" y="0">
    ${inner}
    ${glaze(`Column ${index + 1}`, 0, 0, COLUMN_WIDTHS[index]!, BODY_HEIGHT, SEAM)}
  </Node>`;

const podPlay = (at: number) => {
  const width = COLUMN_WIDTHS[0]!;
  const inner = width - 2 * INSET;
  const cellWidth = (inner - 2 * CELL_GAP) / 3;
  const cells = STANDINGS.map((standing, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = INSET + col * (cellWidth + CELL_GAP);
    const y = GRID_BOTTOM - (2 - row) * CELL_HEIGHT - (1 - row) * CELL_GAP;
    return `${logo({ name: `Grid Logo ${index + 1}`, x: x + cellWidth / 2, y: y + CELL_HEIGHT / 2, size: GRID_LOGO, team: standing.team, property: P.row(index).logo, at: at + 12 + 2 * index })}
    ${plate(`Grid Cell ${index + 1}`, x, y, cellWidth, CELL_HEIGHT, LIFT)}`;
  });
  return column(0, `${columnHead(0, 'POD PLAY', '6 TEAMS · 2 PODS OF 3', at)}
    ${text({ name: 'Pod Play Detail 1', x: INSET, y: 224, width: inner, height: 40, runs: [{ ...regular('EACH TEAM PLAYS ITS TWO POD RIVALS', 30, BRIGHT), spacing: 1 }], at: at + 8 })}
    ${text({ name: 'Pod Play Detail 2', x: INSET, y: 264, width: inner, height: 40, runs: [{ ...regular('ONE AT HOME, ONE AWAY, ON CAMPUS', 30, BRIGHT), spacing: 1 }], at: at + 10 })}
    ${cells.join('\n    ')}`);
};

const podStandingsColumn = (at: number) => {
  const width = COLUMN_WIDTHS[1]!;
  const inner = width - 2 * INSET;
  const boxY = BODY_HEIGHT - 32 - 120;
  return column(1, `${columnHead(1, 'POD STANDINGS', 'EACH POD RANKS 1ST TO 3RD', at)}
    ${text({ name: 'Pod Standings Detail', x: INSET, y: 196, width: inner, height: 84, runs: [{ ...regular('FINISH DECIDES YOUR GAME ON CLASSIC SATURDAY', 30, BRIGHT), spacing: 1 }], at: at + 8, lines: true })}
    ${text({ name: 'Tiebreak Label', x: INSET + 22, y: boxY + 44, width: inner - 44, height: 32, runs: [regular('THREE-WAY TIE AT 1-1', 24)], at: at + 12 })}
    ${text({ name: 'Tiebreak Rule', x: INSET + 22, y: boxY + 92, width: inner - 44, height: 42, runs: [bold('FIRST NET RANKING BREAKS IT', 34)], at: at + 14 })}
    ${plate('Tiebreak Box', INSET, boxY, inner, 120, LIFT)}`);
};

const classicSaturday = (at: number) => {
  const width = COLUMN_WIDTHS[2]!;
  const inner = width - 2 * INSET;
  const tops = GAME_ROWS.map((_, index) => GAMES_BOTTOM - GAME_ROWS.slice(index).reduce((sum, height) => sum + height, 0));
  const rows = GAMES.map((game, index) => {
    const championship = index === GAMES.length - 1;
    const top = tops[index]!;
    const height = GAME_ROWS[index]!;
    const baseline = top + Math.round(height / 2 + 11);
    const p = P.game(index);
    const start = at + 12 + 3 * index;
    return `${text({ name: `Game ${index + 1} Time`, x: INSET, y: baseline, width: 88, height: 44, runs: [bold(game.time, 34, championship ? GOLD : WHITE, p.time)], at: start })}
    ${text({ name: `Game ${index + 1} Name`, x: INSET + 100, y: baseline, width: 180, height: 40, runs: [championship ? bold(game.name, 32, WHITE, p.name) : { ...regular(game.name, 30, BRIGHT, p.name), spacing: 1 }], at: start + 1 })}
    ${text({ name: `Game ${index + 1} Pairing`, x: width - INSET - 140, y: baseline, width: 140, height: 40, runs: [bold(game.pairing, 30, WHITE, p.pairing)], at: start + 2, align: 'right' })}
    ${plate(`Game ${index + 1} Rule`, championship ? 0 : INSET, top, championship ? width : inner, 1, HAIRLINE, SQUARE)}
    ${championship ? plate('Championship Lift', 0, top, width, height, CHAMPIONSHIP_LIFT, SQUARE) : ''}`;
  });
  return column(2, `${columnHead(2, 'CLASSIC SATURDAY', CLASSIC_DATE, at, P.classicDate)}
    ${text({ name: 'Classic Venue', x: INSET, y: 220, width: inner, height: 42, runs: [{ ...regular(CLASSIC_VENUE, 32, BRIGHT, P.classicVenue), spacing: 1.5 }], at: at + 8 })}
    ${rows.join('\n    ')}`);
};

const formatBody = `<Node name="Format Body" id="${FORMAT_BODY}" x="0" y="0">
  ${podPlay(22)}
  ${podStandingsColumn(26)}
  ${classicSaturday(30)}
</Node>`;

// --- step 1: pod standings ------------------------------------------------------------

/**
 * A pod's place: rank, logo, school and pod record. On one of tonight's teams the row takes
 * the team's tint out to the hairlines, and the logo stands in a soft shade so it reads on
 * its own colour. The tint and shade follow `rowNTonight`; the gate around them carries the
 * resting tint opacity, which the intro lights.
 */
const standingRow = (index: number, at: number) => {
  const s = STANDINGS[index]!;
  const team = teamNamed(s.team);
  const p = P.row(index);
  const gate = allocate();
  GATES.push({ gate, start: at });
  const name = `Row ${index + 1}`;
  const baseline = ROW_HEIGHT / 2;
  return `<Node name="${name}" x="0" y="${rowY(index % 3)}">
      ${text({ name: `${name} Rank`, x: RANK_X, y: baseline + 14, width: RANK_WIDTH, height: 50, runs: [bold(s.rank, 40, RANK_MUTED, p.rank)], at, align: 'center' })}
      ${logo({ name: `${name} Logo`, x: ROW_LOGO_X, y: baseline, size: ROW_LOGO, team: s.team, property: p.logo, at })}
      ${text({ name: `${name} School`, x: NAME_X, y: baseline + 21, width: NAME_WIDTH, height: 72, runs: [bold(team.name, 60, WHITE, p.team)], at: at + 2 })}
      ${text({ name: `${name} Record`, x: RECORD_X, y: baseline + 22, width: RECORD_WIDTH, height: 76, runs: [bold(s.record, 64, WHITE, p.record)], at: at + 4, align: 'right' })}
      <Node name="${name} Tint Gate" id="${gate}" x="0" y="0" opacity="${TINT_OPACITY}">
        <Shape name="${name} Logo Shade" x="${ROW_LOGO_X}" y="${baseline}" scaleY="${(ROW_HEIGHT + GAP) / SHADE_WIDTH}" opacity="${s.tonight ? 1 : 0}">${bound(p.tonight, OPACITY, TO_NUMBER)}
          <Ellipse width="${SHADE_WIDTH}" height="${SHADE_WIDTH}"/>
          <Fill><RadialGradient startX="0" startY="0" endX="${SHADE_WIDTH / 2}" endY="0"><GradientStop colorValue="73000000" position="0"/><GradientStop colorValue="2E000000" position="0.45"/><GradientStop colorValue="00000000" position="1"/></RadialGradient></Fill>
        </Shape>
        <Shape name="${name} Tint" x="0" y="${-GAP / 2}" opacity="${s.tonight ? 1 : 0}">${bound(p.tonight, OPACITY, TO_NUMBER)}
          ${rectangle(POD_WIDTH, ROW_HEIGHT + GAP, SQUARE)}
          <Fill><SolidColor colorValue="${team.primary}">${bound(p.primaryColor, COLOR)}</SolidColor></Fill>
          <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${ROW_HEIGHT + GAP}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
        </Shape>
      </Node>
    </Node>`;
};

const podPanel = (pod: number, at: number) => {
  const rows = [0, 1, 2].map((offset) => standingRow(pod * 3 + offset, at + 4 + 4 * offset));
  const hairlines = [POD_HEADER, rowY(0) + ROW_HEIGHT, rowY(1) + ROW_HEIGHT].map((y) => y + GAP / 2);
  return `<Node name="Pod ${pod + 1}" x="${podX(pod)}" y="0">
    ${text({ name: `Pod ${pod + 1} Name`, x: INSET, y: 61, width: 300, height: 60, runs: [bold(`POD ${pod + 1}`, 48)], at })}
    ${text({ name: `Pod ${pod + 1} Record Label`, x: POD_WIDTH - INSET - 300, y: 57, width: 300, height: 36, runs: [regular('POD RECORD', 26)], at: at + 2, align: 'right' })}
    <Shape name="Pod ${pod + 1} Hairlines" x="0" y="0">
      ${hairlines.map((y) => rectangle(POD_WIDTH, 1, SQUARE, ` x="0" y="${y}"`)).join('\n      ')}
      <Fill><SolidColor colorValue="${HAIRLINE}"/></Fill>
    </Shape>
    <Node name="Pod ${pod + 1} Rows" x="0" y="0">
      <ClippingShape name="Pod ${pod + 1} Rows Clip" sourceId="${podSilhouette(pod)}"/>
    ${rows.join('\n    ')}
    </Node>
    ${glaze(`Pod ${pod + 1}`, 0, 0, POD_WIDTH, BODY_HEIGHT, SEAM)}
    <Shape name="Pod ${pod + 1} Silhouette" id="${podSilhouette(pod)}" x="0" y="0">${rectangle(POD_WIDTH, BODY_HEIGHT, SEAM)}</Shape>
  </Node>`;
};

const podsBody = `<Node name="Pods Body" id="${PODS_BODY}" x="0" y="0" opacity="0">
  ${podPanel(0, 22)}
  ${podPanel(1, 28)}
</Node>`;

// --- footer ---------------------------------------------------------------------------

const footer = `<Node name="Footer" x="0" y="${FOOTER_Y}">
  ${text({ name: 'Format Footer', id: FORMAT_FOOTER, x: INSET, y: 43, width: CARD_WIDTH - 2 * INSET, height: 40, runs: [{ ...bold('POD WINNERS PLAY FOR THE BIG 5 TITLE', 30), spacing: 1 }], at: 34 })}
  ${text({ name: 'Pods Footer', id: PODS_FOOTER, x: INSET, y: 43, width: CARD_WIDTH - 2 * INSET, height: 40, runs: [regular('TONIGHT', 26), regular('  ', 26), { ...bold(TONIGHT_GAME, 30, WHITE, P.tonightGame), spacing: 1 }], at: 34, opacity: 0 })}
  ${glaze('Footer', 0, 0, CARD_WIDTH, FOOTER_HEIGHT, [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS])}
</Node>`;

// Built before the timelines read REVEALS, MARKS and GATES.
const body = `${titleBar}
<Node name="Body" x="0" y="${BODY_Y}">
${formatBody}
${podsBody}
</Node>
${footer}`;

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
/** A move from `from` to `to` over frames start..end, holding before and after. */
const move = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number, ease: string): Track => ({
  objectId, propertyKey,
  keys: start > 0
    ? [{ frame: 0, value: from }, { frame: start, value: from, ease }, { frame: end, value: to }]
    : [{ frame: 0, value: from, ease }, { frame: end, value: to }],
});
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];
// Lines wait on open glass, so a reveal starts with its ramp wholly before the text.
const reveal = (rangeId: string, start: number, end: number): Track[] => [
  move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT),
  move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT),
];
const revealed = (rangeId: string): Track[] => [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)];
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

const EDGE_LIGHTS = [LEFT_EDGE_LIGHT, RIGHT_EDGE_LIGHT];

const lastLight = Math.max(...GATES.map((g) => g.start + GATE_END), ...REVEALS.map((r) => r.start + 24), ...MARKS.map((m) => m.start + 36));
if (lastLight > INTRO_FRAMES) throw new Error(`The intro moves until frame ${lastLight}: lengthen INTRO_FRAMES.`);

const edgeFlare: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: 18, value: 1, ease: EASE_OUT }, { frame: 42, value: 0, linear: true },
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
  ...EDGE_LIGHTS.flatMap((light): Track[] => [move(light, SCALE_Y, 0, 1, 0, 16, EASE_OUT), { objectId: light, propertyKey: OPACITY, keys: edgeFlare }]),
  move(TITLE_MARKER, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...REVEALS.flatMap(({ range, start }) => reveal(range, start, start + 24)),
  ...MARKS.flatMap(({ group, start }): Track[] => [...scale(group, 1.12, 1, start, start + 36, EASE_OUT), move(group, OPACITY, 0, 1, start, start + 18, EASE_OUT)]),
  ...GATES.map(({ gate, start }) => move(gate, OPACITY, 0, TINT_OPACITY, start + GATE_START, start + GATE_END, EASE_OUT)),
  move(INTRO_SWEEP, X, SWEEP_START, SWEEP_END, SWEEP_BEGIN, INTRO_FRAMES, EASE_SWEEP),
  {
    objectId: INTRO_SWEEP, propertyKey: OPACITY, keys: [
      { frame: 0, value: 0, linear: true }, { frame: SWEEP_BEGIN, value: 0, linear: true }, { frame: SWEEP_BEGIN + 6, value: 0.65, linear: true },
      { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
    ],
  },
];

const settledRanges = REVEALS.flatMap(({ range }) => revealed(range));
const settledGates = GATES.map(({ gate }) => hold(gate, OPACITY, TINT_OPACITY));
const settledSweep = [hold(INTRO_SWEEP, X, SWEEP_END), hold(INTRO_SWEEP, OPACITY, 0)];

const settled: Track[] = [
  hold(CONTENT, OPACITY, 1),
  hold(REVEAL_MASK_RECTANGLE, PATH_WIDTH, MASK_WIDTH),
  hold(LEFT_EDGE, X, -8),
  hold(RIGHT_EDGE, X, CARD_WIDTH + 8),
  ...EDGE_LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(TITLE_MARKER, SCALE_Y, 1),
  ...MARKS.flatMap(({ group }) => [hold(group, SCALE_X, 1), hold(group, SCALE_Y, 1), hold(group, OPACITY, 1)]),
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
  closing(TITLE_MARKER, SCALE_Y, 1, 0, 0, 16),
  ...MARKS.flatMap(({ group }): Track[] => [
    closing(group, SCALE_X, 1, 1.06, 0, 16), closing(group, SCALE_Y, 1, 1.06, 0, 16), closing(group, OPACITY, 1, 0, 0, 16),
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

// --- step layer -----------------------------------------------------------------------

/** What the step swaps: the body, the title's label and the footer, each a twin per step. */
const TWINS = [
  { format: FORMAT_BODY, pods: PODS_BODY, drift: true },
  { format: FORMAT_LABEL, pods: PODS_LABEL, drift: false },
  { format: FORMAT_FOOTER, pods: PODS_FOOTER, drift: false },
];
const OUT_END = 20;
const IN_START = 12;
const DRIFT_OUT = 12;
const DRIFT_IN = 18;

const stepPose = (pods: boolean): Track[] => TWINS.flatMap((twin) => [
  hold(twin.format, OPACITY, pods ? 0 : 1),
  hold(twin.pods, OPACITY, pods ? 1 : 0),
  ...(twin.drift ? [hold(twin.format, Y, 0), hold(twin.pods, Y, 0)] : []),
]);

/** 0.6 s: the outgoing twin sinks and fades, then the incoming one rises in. The shell holds. */
const stepChange = (toPods: boolean): Track[] => TWINS.flatMap((twin) => {
  const leaving = toPods ? twin.format : twin.pods;
  const arriving = toPods ? twin.pods : twin.format;
  return [
    move(leaving, OPACITY, 1, 0, 0, OUT_END, EASE_SWEEP),
    move(arriving, OPACITY, 0, 1, IN_START, STEP_FRAMES, EASE_SWEEP),
    ...(twin.drift ? [closing(leaving, Y, 0, DRIFT_OUT, 0, OUT_END), move(arriving, Y, DRIFT_IN, 0, IN_START, STEP_FRAMES, EASE_OUT)] : []),
  ];
});

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const isTrue = (property: number, value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(property, BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
const onAir = (value: 'equal' | 'notEqual') => isTrue(P.isPlaying, value);
const showsPods = (value: 'equal' | 'notEqual') => isTrue(P.showPods, value);

const ID = { hold: 30, intro: 31, outro: 32, hidden: 33, format: 34, pods: 35, toPods: 36, toFormat: 37 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43, format: 44, pods: 45, toPods: 46, toFormat: 47 } as const;

const stateMachine = `<StateMachine name="Big 5 Format" id="${id(7)}">
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
<StateMachineLayer name="Step">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.format)}"/></EntryState>
  <AnimationState x="180" y="0" id="${id(STATE.format)}" animationId="${id(ID.format)}">
    <StateTransition stateToId="${id(STATE.toPods)}" duration="0">${showsPods('equal')}${onAir('equal')}</StateTransition>
    <StateTransition stateToId="${id(STATE.pods)}" duration="0">${showsPods('equal')}${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="-120" id="${id(STATE.toPods)}" animationId="${id(ID.toPods)}" reset="true">
    <StateTransition stateToId="${id(STATE.pods)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.toFormat)}" duration="0">${showsPods('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.pods)}" animationId="${id(ID.pods)}">
    <StateTransition stateToId="${id(STATE.toFormat)}" duration="0">${showsPods('notEqual')}${onAir('equal')}</StateTransition>
    <StateTransition stateToId="${id(STATE.format)}" duration="0">${showsPods('notEqual')}${onAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="140" id="${id(STATE.toFormat)}" animationId="${id(ID.toFormat)}" reset="true">
    <StateTransition stateToId="${id(STATE.format)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.toPods)}" duration="0">${showsPods('equal')}</StateTransition>
  </AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const vmString = (name: string, local: number) => `<ViewModelPropertyString name="${name}" id="${id(local)}" componentProps="1"/>`;
const vmBoolean = (name: string, local: number) => `<ViewModelPropertyBoolean name="${name}" id="${id(local)}" componentProps="1"/>`;
const vmImage = (name: string, local: number) => `<ViewModelPropertyAssetImage name="${name}" id="${id(local)}" componentProps="1"/>`;
const vmColor = (name: string, local: number) => `<ViewModelPropertyColor name="${name}" id="${id(local)}" componentProps="1"/>`;

const viewModelProperties = [
  vmBoolean('isPlaying', P.isPlaying),
  vmBoolean('showPods', P.showPods),
  vmString('classicDate', P.classicDate),
  vmString('classicVenue', P.classicVenue),
  ...GAMES.flatMap((_, index) => [
    vmString(`game${index + 1}Time`, P.game(index).time),
    vmString(`game${index + 1}Name`, P.game(index).name),
    vmString(`game${index + 1}Pairing`, P.game(index).pairing),
  ]),
  ...STANDINGS.flatMap((_, index) => {
    const row = `row${index + 1}`;
    const p = P.row(index);
    return [
      vmString(`${row}Rank`, p.rank), vmString(`${row}Team`, p.team), vmString(`${row}Record`, p.record),
      vmImage(`${row}Logo`, p.logo), vmColor(`${row}PrimaryColor`, p.primaryColor), vmBoolean(`${row}Tonight`, p.tonight),
    ];
  }),
  vmString('tonightGame', P.tonightGame),
];

const stringValue = (local: number, value: string) => `<ViewModelInstanceString viewModelPropertyId="${id(local)}" propertyValue="${escaped(value)}"/>`;
const booleanValue = (local: number, value: boolean) => `<ViewModelInstanceBoolean viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;
const imageValue = (local: number, asset: string) => `<ViewModelInstanceAssetImage viewModelPropertyId="${id(local)}" propertyValue="${asset}"/>`;
const colorValue = (local: number, value: string) => `<ViewModelInstanceColor viewModelPropertyId="${id(local)}" propertyValue="${value}"/>`;

const viewModelDefaults = [
  booleanValue(P.isPlaying, false),
  booleanValue(P.showPods, false),
  stringValue(P.classicDate, CLASSIC_DATE),
  stringValue(P.classicVenue, CLASSIC_VENUE),
  ...GAMES.flatMap((game, index) => [
    stringValue(P.game(index).time, game.time),
    stringValue(P.game(index).name, game.name),
    stringValue(P.game(index).pairing, game.pairing),
  ]),
  ...STANDINGS.flatMap((s, index) => {
    const p = P.row(index);
    const team = teamNamed(s.team);
    return [
      stringValue(p.rank, s.rank), stringValue(p.team, team.name), stringValue(p.record, s.record),
      imageValue(p.logo, logoAsset(s.team)), colorValue(p.primaryColor, team.primary), booleanValue(p.tonight, s.tonight),
    ];
  }),
  stringValue(P.tonightGame, TONIGHT_GAME),
];

// --- document -------------------------------------------------------------------------

const edgeLight = (name: string, lightId: string, glowToward: 1 | -1) => `<Node name="${name} Edge Light" id="${lightId}" y="${CARD_HEIGHT / 2}" opacity="0">
    <Shape name="${name} Edge Line" y="-${CARD_HEIGHT / 2}"><Rectangle width="2" height="${CARD_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${name} Edge Glow" y="-${CARD_HEIGHT / 2}"><Rectangle width="44" height="${CARD_HEIGHT}" originX="${glowToward === 1 ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${44 * glowToward}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>`;

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_big5_format.ts; edit that file, not this one.
     Basketball Big 5 Format v2: a card, ${CARD_WIDTH} x ${CARD_HEIGHT}, on a transparent 1920 x 1080 canvas
     (origin ${CARD_X}, ${CARD_Y}), clear of the scorebug. A title bar, a body and a footer strip;
     showPods swaps the body from how the Classic works to the two pods' standings.
     Sibling draw order is front to back; within one shape the last paint declared is on top. -->
<Artboard name="Basketball Big 5 Format v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Big 5 Format v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Big 5 Format Card" id="${ROOT}" x="${CARD_X}" y="${CARD_Y}">

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
${body}
<!-- The card's dark glass, one piece: the shell never moves, so the gaps read as glass. -->
<Shape name="Card Backing" x="0" y="0">
  ${rectangle(CARD_WIDTH, CARD_HEIGHT, [OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS])}
  <Fill><SolidColor colorValue="D10E1116"/></Fill>
</Shape>
</Node>

<!-- Clip sources: unpainted, so they draw nothing. -->
<Shape name="Card Reveal Mask" id="${REVEAL_MASK}" x="${SEAM_X}" y="-8"><Rectangle id="${REVEAL_MASK_RECTANGLE}" width="${MASK_WIDTH}" height="${CARD_HEIGHT + 16}" originX="0.5" originY="0"/></Shape>
<Shape name="Card Silhouette" id="${CARD_SILHOUETTE}">
  ${rectangle(CARD_WIDTH, CARD_HEIGHT, [OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS], ' x="0" y="0"')}
</Shape>
<Shape name="Title Silhouette" id="${TITLE_SILHOUETTE}" x="0" y="0">${rectangle(CARD_WIDTH, TITLE_HEIGHT, [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS])}</Shape>
</Node>

<!-- Intro: seam ignition, one wipe opening outward both ways, the title and each column
     rising in turn as the logos settle, tonight's rows lighting and one sheen;
     ${(INTRO_FRAMES / 60).toFixed(2)} s. Hold and Outro restore every animated property. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

${animation('Format', ID.format, 1, 'loop', stepPose(false))}

${animation('Pods', ID.pods, 1, 'loop', stepPose(true))}

${animation('Show Pods', ID.toPods, STEP_FRAMES, 'oneShot', stepChange(true))}

${animation('Show Format', ID.toFormat, STEP_FRAMES, 'oneShot', stepChange(false))}

<!-- Display follows isPlaying; Step follows showPods, animating only on air. -->
${stateMachine}
</Artboard>

<FontAsset name="Big 5 Format v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Big 5 Format v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
${TEAMS.map((team) => `<ImageAsset name="Big 5 Format v2 ${escaped(team.name)}" id="${logoAsset(team.key)}" file="${team.file}"/>`).join('\n')}
<!-- A boolean read as 0 or 1, for a tonight row's tint opacity. -->
<DataConverterToNumber name="Big 5 Format Tonight" id="${TO_NUMBER}"/>

<ViewModel name="BasketballBig5FormatV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${viewModelProperties.join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${viewModelDefaults.join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'big5_format.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
