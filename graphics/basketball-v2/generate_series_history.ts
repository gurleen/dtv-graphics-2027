/**
 * Generates the Series History card:
 *
 *   bun graphics/basketball-v2/generate_series_history.ts
 *
 * writes series_history.rml beside this file. Edit this file, not the output.
 *
 * A small card with the all-time series between tonight's two teams, in the bottom-right
 * corner where the Burning Question stands, so it shares the screen with the scorebug. A
 * header strip, a row of two team cells (the series leader first) and a foot strip that
 * pages through four facts on its own. It is laid out as the Burning Question is: right
 * edge on the action-safe margin, foot on the scorebug's baseline, the marker on the outer
 * (right) edge. The state machine has two layers that never key the same property:
 *
 *   Display  Hidden -> Intro -> Hold -> Outro on `isPlaying`; keys only the shell.
 *   Pages    Idle -> Fact 1 -> ... -> Fact 4 -> Fact 1 ..., each fact its 6 s dwell; keys
 *            only the facts and the pips. Off air it returns to Idle, which keys nothing,
 *            so the fact on screen closes with the glass.
 */

import { join } from 'node:path';
import { SERIES } from './graphics/big5';

const PREFIX = 53;
const ARTBOARD_Y = 30200;
const id = (local: number) => `${PREFIX}:${local}`;

// --- test data and view model ----------------------------------------------------------

// The leader's cell first, then the trailer's, in capitals as the projector sends them. The
// abbreviations and colours are the seed's for Saint Joseph's and Drexel.
const TEAMS = [
  { abbreviation: 'SJU', wins: String(SERIES.leaderWins), primary: 'FFC2071B', logoFile: 'assets/images/big5/saint-josephs.png', logoName: "Saint Joseph's", asset: 910 },
  { abbreviation: 'DREX', wins: String(SERIES.trailerWins), primary: 'FF07294D', logoFile: 'assets/images/big5/drexel.png', logoName: 'Drexel', asset: 911 },
] as const;
const FACTS = SERIES.facts.map(({ label, value }) => ({ label: label.toUpperCase(), value: value.toUpperCase() }));

type Kind = 'boolean' | 'string' | 'color' | 'image';
type Prop = { readonly name: string; readonly kind: Kind; readonly value: string };

// One table drives the view model's declarations and its Default instance.
const PROPS: readonly Prop[] = [
  { name: 'isPlaying', kind: 'boolean', value: 'false' },
  { name: 'since', kind: 'string', value: SERIES.since },
  ...TEAMS.flatMap((team, i): Prop[] => [
    { name: `team${i + 1}Abbreviation`, kind: 'string', value: team.abbreviation },
    { name: `team${i + 1}Wins`, kind: 'string', value: team.wins },
    { name: `team${i + 1}PrimaryColor`, kind: 'color', value: team.primary },
    { name: `team${i + 1}Logo`, kind: 'image', value: id(team.asset) },
  ]),
  ...FACTS.flatMap((fact, i): Prop[] => [
    { name: `fact${i + 1}Label`, kind: 'string', value: fact.label },
    { name: `fact${i + 1}Value`, kind: 'string', value: fact.value },
  ]),
];

const propLocal = (name: string) => {
  if (name === 'isPlaying') return 1002;
  const index = PROPS.findIndex((prop) => prop.name === name);
  if (index < 0) throw new Error(`no property ${name}`);
  return 1009 + index;
};
const valueOf = (name: string) => PROPS.find((prop) => prop.name === name)!.value;
const bound = (name: string, key: number) => `<DataBindContext sourcePathIds="${id(1000)}-${id(propLocal(name))}" propertyKey="${key}"/>`;

// --- geometry -------------------------------------------------------------------------

// The block's root is its top-left corner. It stands on the right action-safe margin with
// its foot on the scorebug's baseline, clear of the scorebug (which ends at x 526).
const SAFE_RIGHT = 1920 - 96;
const FOOT_Y = 890 + 132;
const WIDTH = 430;
const GAP = 4;
const HALF_GAP = GAP / 2;
const STRIP_HEIGHT = 44;
const CELL_HEIGHT = 84;
const HEIGHT = STRIP_HEIGHT + GAP + CELL_HEIGHT + GAP + STRIP_HEIGHT;
const BLOCK_X = SAFE_RIGHT - WIDTH;
const BLOCK_Y = FOOT_Y - HEIGHT;
const CELL_Y = STRIP_HEIGHT + GAP;
const FOOT_TOP = CELL_Y + CELL_HEIGHT + GAP;
const CELL_WIDTH = (WIDTH - GAP) / 2;
const CELL_X = [0, CELL_WIDTH + GAP] as const;
// The light ignites in the gap between the team cells and the edges wipe outward from it.
const SEAM = CELL_WIDTH + HALF_GAP;
const OUTER = 12;
const INNER = 3;
const MARKER_WIDTH = 6;
const INSET = 18;
// The header title and the facts share a right edge, inside the marker.
const TEXT_RIGHT = WIDTH - MARKER_WIDTH - INSET;
const STRIP_BASELINE = 31;
const CONTENT_DRIFT = 22;
// Each team's 1024 logo as a large faded mark behind its cell's count, cropped by the cell.
const LOGO_X = 150;
const LOGO_SCALE = 0.2;
const LOGO_OPACITY = 0.12;
const TINT_OPACITY = 0.78;
// Page pips at the foot's inner end, one per fact.
const PIP = { x: INSET + 3, step: 13, size: 6, dim: 0.3 };
const FACT_LEFT = PIP.x + PIP.step * FACTS.length + 8;
const SWEEP_LEFT = -120;
const SWEEP_RIGHT = WIDTH + 120;

// --- timing and keys ------------------------------------------------------------------

const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const WIPE_START = 6;
const WIPE_END = 36;
const FACT_FRAMES = 360;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

const X = 13;
const Y = 14;
const SCALE_X = 16;
const SCALE_Y = 17;
const OPACITY = 18;
const COLOR = 37;
const IMAGE = 206;
const TEXT = 268;
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const MODIFY_TO = 336;
const FALLOFF_FROM = 317;
const FALLOFF_TO = 318;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const HEADER = id(100);
const TITLE_CONTENT = id(101);
const TITLE_REVEAL = id(102);
const SINCE_CONTENT = id(103);
const SINCE_REVEAL = id(104);
const MARKER = id(105);
const HEADER_SHAPE = id(106);
const TITLE_STYLE = id(107);
const SINCE_STYLE = id(108);
const SINCE_YEAR_STYLE = id(109);
const cellIds = (base: number) => ({
  node: id(base), content: id(base + 1), nameReveal: id(base + 2), winsReveal: id(base + 3), tint: id(base + 4), logo: id(base + 5),
  nameStyle: id(base + 6), labelStyle: id(base + 7), winsStyle: id(base + 8), labelReveal: id(base + 9),
});
const CELLS = [cellIds(200), cellIds(250)] as const;
const FOOT = id(300);
const FACT_WINDOW = id(301);
const FACT_WINDOW_MASK = id(302);
const factIds = (i: number) => ({ node: id(310 + 10 * i), labelStyle: id(311 + 10 * i), valueStyle: id(312 + 10 * i), pip: id(360 + i) });
const FACT_IDS = FACTS.map((_, i) => factIds(i));
const LEFT_EDGE = id(500);
const LEFT_MASK = id(501);
const LEFT_LIGHT = id(503);
const RIGHT_EDGE = id(505);
const RIGHT_MASK = id(506);
const RIGHT_LIGHT = id(508);
const SWEEP = id(600);
const SILHOUETTE = id(610);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);

// --- markup helpers -------------------------------------------------------------------

type Radii = [number, number, number, number];

const rectangle = (width: number, height: number, radii: Radii) =>
  `<Rectangle width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const glaze = (name: string, width: number, height: number, radii: Radii) => `<Shape name="${name} Glaze" x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="73FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

const darkGlass = (name: string, width: number, height: number, radii: Radii, shapeId = '') => `<Shape name="${name} Glaze"${shapeId ? ` id="${shapeId}"` : ''} x="0" y="0">
    ${rectangle(width, height, radii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="40000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>`;

/** A piece of the block's dark backing, drawn last in its panel so it opens and moves with it. */
const backing = (name: string, x: number, y: number, width: number, height: number, radii: Radii) => `<Shape name="${name} Backing" x="${x}" y="${y}">
    ${rectangle(width, height, radii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>`;

const wipeClips = (name: string) =>
  `<ClippingShape name="${name} Left Wipe Clip" sourceId="${LEFT_MASK}"/><ClippingShape name="${name} Right Wipe Clip" sourceId="${RIGHT_MASK}"/>`;

// Text reveals. Text left of the seam builds from its last glyph and text right of it from
// its first, so every line builds from the seam outward.
type Direction = 'forward' | 'backward';
const RANGE_AT_REST: Record<Direction, string> = {
  forward: 'modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"',
  backward: 'modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"',
};
const rise = (name: string, rangeId: string, direction: Direction) =>
  `<TextModifierGroup name="${name} Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${name} Reveal" id="${rangeId}" unitsValue="1" ${RANGE_AT_REST[direction]}/></TextModifierGroup>`;

type Line = { name: string; x: number; baseline: number; width: number; height: number; align: 'left' | 'right'; runs: string; reveal?: [string, Direction] };
const text = (line: Line) => `<Text name="${line.name}" x="${line.x}" y="${line.baseline}" originValue="baseline" wrapValue="noWrap" width="${line.width}" height="${line.height}" sizingValue="fixed" overflowValue="fitFontSize" alignValue="${line.align}">
    ${line.runs}${line.reveal ? rise(line.name, ...line.reveal) : ''}</Text>`;

const style = (styleId: string, font: string, size: number, spacing: number, color: string, colorBind = '') =>
  `<TextStylePaint id="${styleId}" fontAssetId="${font}" fontSize="${size}" letterSpacing="${spacing}"><Fill><SolidColor colorValue="${color}">${colorBind}</SolidColor></Fill></TextStylePaint>`;
const run = (name: string, styleId: string, value: string, prop?: string) =>
  `<TextValueRun name="${name}" styleId="${styleId}" text="${xml(value)}">${prop ? bound(prop, TEXT) : ''}</TextValueRun>`;

// --- header ---------------------------------------------------------------------------

const HEADER_RADII: Radii = [OUTER, OUTER, INNER, INNER];
const CELL_RADII: Radii = [INNER, INNER, INNER, INNER];
const FOOT_RADII: Radii = [INNER, INNER, OUTER, OUTER];

// The title against the marker at the outer end, the muted year at the inner end.
const header = `<Node name="Header" id="${HEADER}" x="0" y="0">
  ${wipeClips('Header')}
  <!-- On the outer edge, clipped by the strip so it takes the outer corner. -->
  <Shape name="Marker" id="${MARKER}" x="${WIDTH - MARKER_WIDTH}" y="0">
    <Rectangle width="${MARKER_WIDTH}" height="${STRIP_HEIGHT}" originX="0" originY="0"/>
    <Fill><SolidColor colorValue="FFFFFFFF"/></Fill>
    <ClippingShape name="Marker Clip" sourceId="${HEADER_SHAPE}"/>
  </Shape>
  <Node name="Title Content" id="${TITLE_CONTENT}" x="0" y="0">
  ${text({
    name: 'Title', x: SEAM, baseline: STRIP_BASELINE, width: TEXT_RIGHT - SEAM, height: 36, align: 'right', reveal: [TITLE_REVEAL, 'forward'],
    runs: style(TITLE_STYLE, FONT_BOLD, 28, 1, 'FFFFFFFF') + run('Title Value', TITLE_STYLE, 'SERIES HISTORY'),
  })}
  </Node>
  <Node name="Since Content" id="${SINCE_CONTENT}" x="0" y="0">
  ${text({
    name: 'Since', x: INSET, baseline: STRIP_BASELINE, width: SEAM - 2 * INSET, height: 30, align: 'left', reveal: [SINCE_REVEAL, 'backward'],
    runs: style(SINCE_STYLE, FONT_REGULAR, 22, 2, 'A6FFFFFF') + style(SINCE_YEAR_STYLE, FONT_REGULAR, 22, 2, 'A6FFFFFF')
      + run('Since Label', SINCE_STYLE, 'SINCE ') + run('Since Year', SINCE_YEAR_STYLE, valueOf('since'), 'since'),
  })}
  </Node>
  ${darkGlass('Header', WIDTH, STRIP_HEIGHT, HEADER_RADII, HEADER_SHAPE)}
  ${backing('Header', 0, 0, WIDTH, STRIP_HEIGHT + HALF_GAP, [OUTER, OUTER, 0, 0])}
</Node>`;

// --- team cells -----------------------------------------------------------------------

// The abbreviation over a muted WINS at the cell's left, the count large at its right, over
// the team's faded logo. The leader's cell lies left of the seam, so its text builds from
// its last glyph.
const cell = (index: 0 | 1) => {
  const c = CELLS[index];
  const n = index + 1;
  const direction: Direction = index === 0 ? 'backward' : 'forward';
  const halves: Radii = [0, 0, 0, 0];
  return `<Node name="Team ${n} Cell" id="${c.node}" x="${CELL_X[index]}" y="${CELL_Y}">
  ${wipeClips(`Team ${n}`)}
  <Node name="Team ${n} Content" id="${c.content}" x="0" y="0">
  ${text({
    name: `Team ${n} Abbreviation`, x: INSET, baseline: 42, width: 96, height: 40, align: 'left', reveal: [c.nameReveal, direction],
    runs: style(c.nameStyle, FONT_BOLD, 36, 0.5, 'FFFFFFFF') + run(`Team ${n} Abbreviation Value`, c.nameStyle, valueOf(`team${n}Abbreviation`), `team${n}Abbreviation`),
  })}
  ${text({
    name: `Team ${n} Wins Label`, x: INSET, baseline: 66, width: 96, height: 26, align: 'left', reveal: [c.labelReveal, direction],
    runs: style(c.labelStyle, FONT_REGULAR, 20, 2, 'B3FFFFFF') + run(`Team ${n} Wins Label Value`, c.labelStyle, 'WINS'),
  })}
  ${text({
    name: `Team ${n} Wins`, x: 110, baseline: 66, width: CELL_WIDTH - INSET - 110, height: 64, align: 'right', reveal: [c.winsReveal, direction],
    runs: style(c.winsStyle, FONT_BOLD, 66, 0.5, 'FFFFFFFF') + run(`Team ${n} Wins Value`, c.winsStyle, valueOf(`team${n}Wins`), `team${n}Wins`),
  })}
  </Node>
  ${glaze(`Team ${n}`, CELL_WIDTH, CELL_HEIGHT, CELL_RADII)}
  <Image name="Team ${n} Logo" id="${c.logo}" x="${LOGO_X}" y="${CELL_HEIGHT / 2}" opacity="${LOGO_OPACITY}" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${id(TEAMS[index].asset)}">${bound(`team${n}Logo`, IMAGE)}<ClippingShape name="Team ${n} Logo Clip" sourceId="${c.tint}"/></Image>
  <Shape name="Team ${n} Tint" id="${c.tint}" x="0" y="0" opacity="${TINT_OPACITY}">
    ${rectangle(CELL_WIDTH, CELL_HEIGHT, CELL_RADII)}
    <Fill><SolidColor colorValue="${TEAMS[index].primary}">${bound(`team${n}PrimaryColor`, COLOR)}</SolidColor></Fill>
  </Shape>
  <Shape name="Team ${n} Underlay" x="0" y="0">
    ${rectangle(CELL_WIDTH, CELL_HEIGHT, CELL_RADII)}
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
  ${backing(`Team ${n}`, index === 0 ? 0 : -HALF_GAP, -HALF_GAP, CELL_WIDTH + HALF_GAP, CELL_HEIGHT + GAP, halves)}
</Node>`;
};

// --- foot strip and its facts ---------------------------------------------------------

// Each fact is a muted label then a Bold value, right-aligned with the title. The window
// clips a fact as it rises in and sinks out, so it never shows below the block.
const fact = (i: number) => {
  const f = FACT_IDS[i]!;
  const n = i + 1;
  return `<Node name="Fact ${n}" id="${f.node}" x="0" y="0" opacity="${i === 0 ? 1 : 0}">
    ${text({
      name: `Fact ${n}`, x: FACT_LEFT, baseline: STRIP_BASELINE, width: TEXT_RIGHT - FACT_LEFT, height: 36, align: 'right',
      runs: style(f.labelStyle, FONT_REGULAR, 22, 2, 'A6FFFFFF') + style(f.valueStyle, FONT_BOLD, 28, 1, 'FFFFFFFF')
        + run(`Fact ${n} Label`, f.labelStyle, valueOf(`fact${n}Label`), `fact${n}Label`)
        + run(`Fact ${n} Gap`, f.labelStyle, '  ')
        + run(`Fact ${n} Value`, f.valueStyle, valueOf(`fact${n}Value`), `fact${n}Value`),
    })}
  </Node>`;
};

const pip = (i: number) => `<Shape name="Pip ${i + 1}" id="${FACT_IDS[i]!.pip}" x="${PIP.x + PIP.step * i}" y="${STRIP_HEIGHT / 2}" opacity="${i === 0 ? 1 : PIP.dim}">
    <Ellipse width="${PIP.size}" height="${PIP.size}"/>
    <Fill><SolidColor colorValue="FFFFFFFF"/></Fill>
  </Shape>`;

const foot = `<Node name="Foot" id="${FOOT}" x="0" y="${FOOT_TOP}">
  ${wipeClips('Foot')}
  <Node name="Fact Window" id="${FACT_WINDOW}" x="0" y="0">
    <ClippingShape name="Fact Window Clip" sourceId="${FACT_WINDOW_MASK}"/>
    ${FACTS.map((_, i) => fact(i)).join('\n    ')}
  </Node>
  <Node name="Pips">
    ${FACTS.map((_, i) => pip(i)).join('\n    ')}
  </Node>
  <Shape name="Fact Window Mask" id="${FACT_WINDOW_MASK}" x="0" y="0"><Rectangle width="${WIDTH}" height="${STRIP_HEIGHT}" originX="0" originY="0"/></Shape>
  ${darkGlass('Foot', WIDTH, STRIP_HEIGHT, FOOT_RADII)}
  ${backing('Foot', 0, -HALF_GAP, WIDTH, STRIP_HEIGHT + HALF_GAP, [0, 0, OUTER, OUTER])}
</Node>`;

// --- leading edges, sweep, silhouette -------------------------------------------------

// Each edge carries a mask (the left one reaches right of it, the right one left of it, so a
// panel shows between the two) and a white light the height of the block.
const edge = (side: 'Left' | 'Right', edgeId: string, maskId: string, lightId: string) => {
  const left = side === 'Left';
  return `<Node name="${side} Leading Edge" id="${edgeId}" x="${left ? -8 : WIDTH + 8}">
  <Shape name="${side} Reveal Mask" y="-8" id="${maskId}"><Rectangle width="2400" height="${HEIGHT + 16}" originX="${left ? 0 : 1}" originY="0"/></Shape>
  <Node name="${side} Edge Light" id="${lightId}" y="${HEIGHT / 2}" opacity="0">
    <Shape name="${side} Edge Line" y="${-HEIGHT / 2}"><Rectangle width="2" height="${HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
    <Shape name="${side} Edge Glow" y="${-HEIGHT / 2}"><Rectangle width="44" height="${HEIGHT}" originX="${left ? 0 : 1}" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="${left ? 44 : -44}" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
  </Node>
</Node>`;
};

const sweep = `<Shape name="Glass Specular Sweep" id="${SWEEP}" x="${SWEEP_RIGHT}" y="${HEIGHT / 2}" rotation="-0.3490659" opacity="0">
  <Rectangle width="110" height="${HEIGHT + 120}"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${SILHOUETTE}"/>
  ${wipeClips('Sweep')}
</Shape>`;

const silhouette = `<Shape name="Block Silhouette" id="${SILHOUETTE}" x="0" y="0">${rectangle(WIDTH, HEIGHT, [OUTER, OUTER, OUTER, OUTER])}</Shape>`;

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
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) => move(objectId, propertyKey, from, to, start, end, EASE_IN);
const scale = (objectId: string, from: number, to: number, start: number, end: number, ease: string): Track[] =>
  [move(objectId, SCALE_X, from, to, start, end, ease), move(objectId, SCALE_Y, from, to, start, end, ease)];

const reveal = (rangeId: string, direction: Direction, start: number, end: number): Track[] => direction === 'forward'
  ? [move(rangeId, MODIFY_FROM, -0.4, 1, start, end, EASE_OUT), move(rangeId, FALLOFF_FROM, 0, 1.4, start, end, EASE_OUT)]
  : [move(rangeId, MODIFY_TO, 1.4, 0, start, end, EASE_OUT), move(rangeId, FALLOFF_TO, 1, -0.4, start, end, EASE_OUT)];
const revealed = (rangeId: string, direction: Direction): Track[] => direction === 'forward'
  ? [hold(rangeId, MODIFY_FROM, 1), hold(rangeId, FALLOFF_FROM, 1.4)]
  : [hold(rangeId, MODIFY_TO, 0), hold(rangeId, FALLOFF_TO, -0.4)];

const GROUPS = [HEADER, CELLS[0].node, CELLS[1].node, FOOT];
const LIGHTS = [LEFT_LIGHT, RIGHT_LIGHT];
const LOGOS = CELLS.map((c) => c.logo);
// Content left of the seam drifts in from the right, content right of it from the left, so
// it follows the edge that uncovers it; the outro drifts it back toward the seam.
const DRIFTS: [string, number][] = [[SINCE_CONTENT, CONTENT_DRIFT], [CELLS[0].content, CONTENT_DRIFT], [TITLE_CONTENT, -CONTENT_DRIFT], [CELLS[1].content, -CONTENT_DRIFT]];
const RANGES: [string, Direction][] = [
  [SINCE_REVEAL, 'backward'], [TITLE_REVEAL, 'forward'],
  ...CELLS.flatMap((c, i): [string, Direction][] => {
    const direction = i === 0 ? 'backward' : 'forward';
    return [[c.nameReveal, direction], [c.labelReveal, direction], [c.winsReveal, direction]];
  }),
];
const settledRanges = RANGES.flatMap(([range, direction]) => revealed(range, direction));

const edgeFlare: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: 18, value: 1, ease: EASE_OUT }, { frame: 40, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sheen: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 34, value: 0, linear: true }, { frame: 40, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

// The light ignites in the gap between the team cells and splits; each edge wipes its half
// of the block open. Text rises from the seam outward; the facts arrive on the Pages layer.
const intro: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  move(LEFT_EDGE, X, SEAM, -8, WIPE_START, WIPE_END, EASE_WIPE),
  move(RIGHT_EDGE, X, SEAM, WIDTH + 8, WIPE_START, WIPE_END, EASE_WIPE),
  ...LIGHTS.flatMap((light): Track[] => [move(light, SCALE_Y, 0, 1, 0, 12, EASE_OUT), { objectId: light, propertyKey: OPACITY, keys: edgeFlare }]),
  move(MARKER, SCALE_Y, 0, 1, 18, 38, EASE_OUT),
  ...LOGOS.flatMap((logo) => [...scale(logo, 1.12, 1, 8, 48, EASE_OUT), move(logo, OPACITY, 0, LOGO_OPACITY, 8, 36, EASE_OUT)]),
  ...DRIFTS.map(([content, from]) => move(content, X, from, 0, 8, 44, EASE_OUT)),
  ...RANGES.flatMap(([range, direction], i) => reveal(range, direction, 18 + 2 * (i >> 1), 44 + 2 * (i >> 1))),
  move(SWEEP, X, SWEEP_RIGHT, SWEEP_LEFT, 34, INTRO_FRAMES, EASE_SWEEP),
  { objectId: SWEEP, propertyKey: OPACITY, keys: sheen },
];

const settled: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 1)),
  hold(LEFT_EDGE, X, -8),
  hold(RIGHT_EDGE, X, WIDTH + 8),
  ...LIGHTS.flatMap((light) => [hold(light, SCALE_Y, 1), hold(light, OPACITY, 0)]),
  hold(MARKER, SCALE_Y, 1),
  ...LOGOS.flatMap((logo) => [hold(logo, SCALE_X, 1), hold(logo, SCALE_Y, 1), hold(logo, OPACITY, LOGO_OPACITY)]),
  ...DRIFTS.map(([content]) => hold(content, X, 0)),
  ...settledRanges,
  hold(SWEEP, X, SWEEP_LEFT),
  hold(SWEEP, OPACITY, 0),
];

const outro: Track[] = [
  ...GROUPS.map((group): Track => ({ objectId: group, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES, value: 0 }] })),
  closing(LEFT_EDGE, X, -8, SEAM, 2, OUTRO_FRAMES),
  closing(RIGHT_EDGE, X, WIDTH + 8, SEAM, 2, OUTRO_FRAMES),
  ...LIGHTS.flatMap((light): Track[] => [hold(light, SCALE_Y, 1), { objectId: light, propertyKey: OPACITY, keys: edgeClosing }]),
  closing(MARKER, SCALE_Y, 1, 0, 0, 16),
  ...LOGOS.flatMap((logo) => [closing(logo, SCALE_X, 1, 1.06, 0, OUTRO_FRAMES), closing(logo, SCALE_Y, 1, 1.06, 0, OUTRO_FRAMES), closing(logo, OPACITY, LOGO_OPACITY, 0, 0, 20)]),
  ...DRIFTS.map(([content, from]) => closing(content, X, 0, -from * 0.8, 0, OUTRO_FRAMES)),
  ...settledRanges,
  hold(SWEEP, X, SWEEP_LEFT),
  hold(SWEEP, OPACITY, 0),
];

const hidden: Track[] = [
  ...GROUPS.map((group) => hold(group, OPACITY, 0)),
  ...LIGHTS.map((light) => hold(light, OPACITY, 0)),
  hold(SWEEP, OPACITY, 0),
];

// Facts: each holds for FACT_FRAMES. It rises and fades in at the start, as the halftime
// slate's pages do, and sinks and fades at the end; the other facts stay hidden. Its pip
// lights with it.
const FACT_IN = { start: 4, length: 24 };
const FACT_OUT = 12;
const FACT_RISE = 18;
const FACT_SINK = 12;

const factTimeline = (shown: number): Track[] => {
  const node = FACT_IDS[shown]!.node;
  const out = FACT_FRAMES - FACT_OUT;
  const inEnd = FACT_IN.start + FACT_IN.length;
  return [
    ...FACT_IDS.flatMap((f, i) => (i === shown ? [] : [hold(f.node, OPACITY, 0)])),
    { objectId: node, propertyKey: Y, keys: [{ frame: 0, value: FACT_RISE }, { frame: FACT_IN.start, value: FACT_RISE, ease: EASE_OUT }, { frame: inEnd, value: 0 }, { frame: out, value: 0, ease: EASE_IN }, { frame: FACT_FRAMES, value: FACT_SINK }] },
    { objectId: node, propertyKey: OPACITY, keys: [{ frame: 0, value: 0 }, { frame: FACT_IN.start, value: 0, ease: EASE_OUT }, { frame: inEnd, value: 1 }, { frame: out, value: 1, ease: EASE_IN }, { frame: FACT_FRAMES, value: 0 }] },
    ...FACT_IDS.map((f, i) => (i === shown
      ? move(f.pip, OPACITY, PIP.dim, 1, FACT_IN.start, inEnd, EASE_OUT)
      : hold(f.pip, OPACITY, PIP.dim))),
  ];
};

const ANIMATION = { hold: 30, intro: 31, outro: 32, hidden: 33, pagesIdle: 34, fact1: 35 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43, pagesIdle: 44, fact1: 45 } as const;

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (op: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${op}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound('isPlaying', BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
const to = (state: number, conditions = '') => `<StateTransition stateToId="${id(state)}" duration="0">${conditions}</StateTransition>`;
const atEnd = (state: number) => `<StateTransition stateToId="${id(state)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>`;
const FACT_STATES = FACTS.map((_, i) => STATE.fact1 + i);

const stateMachine = `<StateMachine name="Series History" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.hidden)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.hidden)}" animationId="${id(ANIMATION.hidden)}">${to(STATE.intro, onAir('equal'))}</AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.intro)}" animationId="${id(ANIMATION.intro)}" reset="true">${atEnd(STATE.hold)}${to(STATE.outro, onAir('notEqual'))}</AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.hold)}" animationId="${id(ANIMATION.hold)}">${to(STATE.outro, onAir('notEqual'))}</AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.outro)}" animationId="${id(ANIMATION.outro)}" reset="true">${atEnd(STATE.hidden)}</AnimationState>
</StateMachineLayer>
<StateMachineLayer name="Pages">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.pagesIdle)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.pagesIdle)}" animationId="${id(ANIMATION.pagesIdle)}">${to(STATE.fact1, onAir('equal'))}</AnimationState>
${FACT_STATES.map((state, i) => `  <AnimationState x="${180 + 240 * i}" y="0" id="${id(state)}" animationId="${id(ANIMATION.fact1 + i)}" reset="true">${atEnd(FACT_STATES[(i + 1) % FACT_STATES.length]!)}${to(STATE.pagesIdle, onAir('notEqual'))}</AnimationState>`).join('\n')}
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const TYPES: Record<Kind, string> = { boolean: 'Boolean', string: 'String', color: 'Color', image: 'AssetImage' };
const declare = (prop: Prop) => `<ViewModelProperty${TYPES[prop.kind]} name="${prop.name}" id="${id(propLocal(prop.name))}" componentProps="1"/>`;
const instance = (prop: Prop) => `<ViewModelInstance${TYPES[prop.kind]} viewModelPropertyId="${id(propLocal(prop.name))}" propertyValue="${xml(prop.value)}"/>`;

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_series_history.ts; edit that file, not this one.
     Basketball Series History v2: the all-time series between tonight's teams in the
     bottom-right corner of a transparent 1920 x 1080 canvas, ${WIDTH} x ${HEIGHT} from (${BLOCK_X}, ${BLOCK_Y}),
     its right edge on the action-safe margin and its foot on the scorebug's baseline, so the
     two can share the screen. A header strip, two team cells, and a foot strip that pages
     through four facts on its own. Sibling draw order is front to back. -->
<Artboard name="Basketball Series History v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Series History v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Series History" id="${ROOT}" x="${BLOCK_X}" y="${BLOCK_Y}">
${edge('Left', LEFT_EDGE, LEFT_MASK, LEFT_LIGHT)}
${edge('Right', RIGHT_EDGE, RIGHT_MASK, RIGHT_LIGHT)}
${sweep}
${header}
${cell(0)}
${cell(1)}
${foot}
${silhouette}
</Node>

<!-- Intro: ignition between the team cells, outward glass wipes, rising type and one sheen; ${INTRO_FRAMES / 60} s.
     Hold and Outro explicitly restore every animated property for repeat takes. -->
${animation('Intro', ANIMATION.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ANIMATION.hold, 1, 'loop', settled)}

${animation('Outro', ANIMATION.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ANIMATION.hidden, 1, 'oneShot', hidden)}

<!-- Pages: Idle keys nothing, so the fact on screen when the card leaves closes with the glass. -->
${animation('Pages Idle', ANIMATION.pagesIdle, 1, 'oneShot', [])}
${FACTS.map((_, i) => animation(`Fact ${i + 1}`, ANIMATION.fact1 + i, FACT_FRAMES, 'oneShot', factTimeline(i))).join('\n')}

${stateMachine}
</Artboard>

<FontAsset name="Series History v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Series History v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
${TEAMS.map((team) => `<ImageAsset name="Series History v2 ${xml(team.logoName)}" id="${id(team.asset)}" file="${team.logoFile}"/>`).join('\n')}

<ViewModel name="BasketballSeriesHistoryV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
${PROPS.map(declare).join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
${PROPS.map(instance).join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'series_history.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
