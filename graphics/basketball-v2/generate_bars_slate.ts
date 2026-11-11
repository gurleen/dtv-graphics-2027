/**
 * Generates the Bars Slate scene:
 *
 *   bun graphics/basketball-v2/generate_bars_slate.ts
 *
 * writes bars_slate.rml beside this file. Edit this file, not the output.
 *
 * The test pattern a broadcast feeds before and after the show: SMPTE EG 1-1990 colour bars
 * across the whole frame, with a dark-glass box over the top bars that holds a time-of-day
 * clock and a line of copy.
 *
 *   Top      seven 75% bars, 2/3 of the frame.
 *   Middle   the castellations: blue, black, magenta, black, cyan, black, grey, each under
 *            its bar.
 *   Bottom   -I, 100% white, +Q, black, then the PLUGE (sub-black, black, super-black) and
 *            black. The bottom's columns are in twelfths of a top bar, so each edge lands on
 *            the same pixel row to row.
 *
 * The scene cuts in: Intro and Outro are 12-frame fades of the whole frame. The clock is
 * drawn at the scorebug's size in a scaled node, and a controller lays its digits out tabular.
 */

import { join } from 'node:path';

const PREFIX = 50;
const ARTBOARD_Y = 26600;
const id = (local: number) => `${PREFIX}:${local}`;

// --- test data and view model ----------------------------------------------------------

// What the demo bind yields at 2026-11-08 21:00 UTC, which is 4 PM in New York.
const CLOCK = '04:00:00';
const PERIOD = 'PM ET';
const MESSAGE = 'GOOD AFTERNOON FROM PHILADELPHIA';

// The scorebug's clock: Zuume Bold digit advances (1000 per em) and size, as in
// bars_slate_clock.luau, so the default instance opens with the digits it would lay out.
const DIGIT_ADVANCE = [373, 236, 369, 369, 355, 371, 375, 316, 371, 375];
const DIGIT_CELL = 375;
const CLOCK_FONT = 62;
const CLOCK_TRACKING = 0.5;
const CLOCK_SLOTS = 8;
const digitPad = (char: string) => (/^\d$/.test(char) ? ((DIGIT_CELL - DIGIT_ADVANCE[Number(char)]!) * CLOCK_FONT) / 1000 / 2 : 0);
const round = (value: number) => String(Math.round(value * 1000) / 1000);
const clockChars = (text: string) => Array.from({ length: CLOCK_SLOTS }, (_, i) => (i < CLOCK_SLOTS - 1 ? text.charAt(i) : text.slice(i)));
const clockSpacings = (text: string) =>
  clockChars(text).map((char, i) => CLOCK_TRACKING + digitPad(char) + digitPad(i < Math.min(text.length, CLOCK_SLOTS) - 1 ? text.charAt(i + 1) : ''));

type Kind = 'boolean' | 'string' | 'number';
type Prop = { readonly name: string; readonly kind: Kind; readonly value: string };
const string = (name: string, value: string): Prop => ({ name, kind: 'string', value });

// One table drives the view model's declarations and its Default instance. `_` properties
// are the clock controller's; operators never set them.
const PROPS: readonly Prop[] = [
  string('clock', CLOCK),
  string('period', PERIOD),
  string('message', MESSAGE),
  ...clockChars(CLOCK).map((char, i) => string(`_clockChar${i + 1}`, char)),
  ...clockSpacings(CLOCK).map((spacing, i): Prop => ({ name: `_clockSpacing${i + 1}`, kind: 'number', value: round(spacing) })),
  { name: '_clockX', kind: 'number', value: round(digitPad(CLOCK.charAt(0)) / 2) },
];

const IS_PLAYING = 1002;
const propLocal = (name: string) => {
  if (name === 'isPlaying') return IS_PLAYING;
  const index = PROPS.findIndex((prop) => prop.name === name);
  if (index < 0) throw new Error(`no property ${name}`);
  return 1010 + index;
};
const valueOf = (name: string) => PROPS.find((prop) => prop.name === name)!.value;
const bind = (name: string, key: number) => `<DataBindContext sourcePathIds="${id(1000)}-${id(propLocal(name))}" propertyKey="${key}"/>`;

// --- the pattern ------------------------------------------------------------------------

const FRAME = { width: 1920, height: 1080 };
const TOP_HEIGHT = 720;
const MID_HEIGHT = 88;
const MID_Y = TOP_HEIGHT;
const BOTTOM_Y = TOP_HEIGHT + MID_HEIGHT;
const BOTTOM_HEIGHT = FRAME.height - BOTTOM_Y;

// A top bar is 12 units wide, so 1.25 bars (the bottom's wide columns) are 15 and a third
// of a bar (a PLUGE stripe) is 4. Edges are rounded from the running total, so every row
// tiles the frame exactly.
const BAR_UNITS = 12;
const TOTAL_UNITS = 7 * BAR_UNITS;
type Cell = { readonly units: number; readonly color: string };
const edges = (cells: readonly Cell[]) => {
  const total = cells.reduce((sum, cell) => sum + cell.units, 0);
  if (total !== TOTAL_UNITS) throw new Error(`a row spans ${total} units, not ${TOTAL_UNITS}`);
  let run = 0;
  return cells.map((cell) => {
    const left = Math.round((run * FRAME.width) / TOTAL_UNITS);
    run += cell.units;
    return { left, width: Math.round((run * FRAME.width) / TOTAL_UNITS) - left, color: cell.color };
  });
};

const GRAY = 'FFC0C0C0';
const YELLOW = 'FFC0C000';
const CYAN = 'FF00C0C0';
const GREEN = 'FF00C000';
const MAGENTA = 'FFC000C0';
const RED = 'FFC00000';
const BLUE = 'FF0000C0';
// The reference black: the PLUGE's centre stripe sits on it, so the stripes either side read
// as darker and lighter than their surround.
const BLACK = 'FF131313';

const TOP_ROW = edges([GRAY, YELLOW, CYAN, GREEN, MAGENTA, RED, BLUE].map((color) => ({ units: BAR_UNITS, color })));
const MID_ROW = edges([BLUE, BLACK, MAGENTA, BLACK, CYAN, BLACK, GRAY].map((color) => ({ units: BAR_UNITS, color })));
const BOTTOM_ROW = edges([
  { units: 15, color: 'FF00214C' }, // -I
  { units: 15, color: 'FFFFFFFF' }, // 100% white
  { units: 15, color: 'FF32006A' }, // +Q
  { units: 15, color: BLACK },
  { units: 4, color: 'FF090909' }, // sub-black
  { units: 4, color: BLACK },
  { units: 4, color: 'FF1D1D1D' }, // super-black
  { units: 12, color: BLACK },
]);

const strip = (name: string, y: number, height: number, row: typeof TOP_ROW) =>
  `<Node name="${name}" y="${y}">\n${row
    .map((cell, i) => `  <Shape name="${name} ${i + 1}" x="${cell.left}"><Rectangle width="${cell.width}" height="${height}" originX="0" originY="0"/><Fill><SolidColor colorValue="${cell.color}"/></Fill></Shape>`)
    .join('\n')}\n</Node>`;

// --- the overlay -----------------------------------------------------------------------

const OUTER = 24;
const BOX = { width: 1100, height: 300 };
const BOX_X = (FRAME.width - BOX.width) / 2;
const BOX_Y = (TOP_HEIGHT - BOX.height) / 2;

// The clock is drawn at 62 and scaled up, because the controller pads digits at that size.
const CLOCK_SIZE = 120;
const CLOCK_SCALE = CLOCK_SIZE / CLOCK_FONT;
const CLOCK_TEXT_WIDTH = 165;
const CLOCK_BASELINE = 154;
const PERIOD_WIDTH = 120;
const PERIOD_GAP = 22;
const CLOCK_GROUP = CLOCK_TEXT_WIDTH * CLOCK_SCALE + PERIOD_GAP + PERIOD_WIDTH;
const CLOCK_X = (BOX.width - CLOCK_GROUP) / 2;
const MESSAGE_BASELINE = 234;

const ROOT = id(10);
const BOX_NODE = id(100);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);
const CONTROLLER = id(950);

const X = 13;
const OPACITY = 18;
const TEXT = 268;
const LETTER_SPACING = 390;
const BOOLEAN = 634;

const rectangle = (width: number, height: number, radius: number) =>
  `<Rectangle width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radius}" cornerRadiusTR="${radius}" cornerRadiusBL="${radius}" cornerRadiusBR="${radius}"/>`;

const darkGlass = (name: string, width: number, height: number, radius: number) => `<Shape name="${name} Glaze">
    ${rectangle(width, height, radius)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${height}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>
  <Shape name="${name} Body">${rectangle(width, height, radius)}<Fill><SolidColor colorValue="D10E1116"/></Fill></Shape>`;

let styleCount = 0;
type Run = { prop: string; font: string; size: number; spacing: number; color: string };
/** A line of fixed width that shrinks to fit, bound to a property. */
const text = (o: { name: string; x: number; y: number; width: number; align: 'left' | 'center' | 'right'; run: Run }) => {
  const style = id(700 + styleCount++);
  const { run } = o;
  return `<Text name="${o.name}" x="${o.x}" y="${o.y}" originValue="baseline" wrapValue="noWrap" width="${o.width}" height="${Math.round(run.size * 1.2)}" sizingValue="fixed" alignValue="${o.align}" overflowValue="fitFontSize">` +
    `<TextStylePaint id="${style}" fontAssetId="${run.font}" fontSize="${run.size}" letterSpacing="${run.spacing}"><Fill><SolidColor colorValue="${run.color}"/></Fill></TextStylePaint>` +
    `<TextValueRun name="${o.name} Run" styleId="${style}" text="${valueOf(run.prop)}">${bind(run.prop, TEXT)}</TextValueRun></Text>`;
};

const clockStyles = Array.from({ length: CLOCK_SLOTS }, (_, i) => id(760 + i));
const clock = `<Node name="Clock Scale" x="${CLOCK_X}" y="${CLOCK_BASELINE}" scaleX="${CLOCK_SCALE}" scaleY="${CLOCK_SCALE}">
    <Text name="Clock" x="${valueOf('_clockX')}" y="0" originValue="baseline" wrapValue="noWrap" width="${CLOCK_TEXT_WIDTH}" sizingValue="fixed" alignValue="center">${bind('_clockX', X)}
      ${clockStyles.map((_, i) => `<TextStylePaint id="${clockStyles[i]}" fontAssetId="${FONT_BOLD}" fontSize="${CLOCK_FONT}" letterSpacing="${valueOf(`_clockSpacing${i + 1}`)}">${bind(`_clockSpacing${i + 1}`, LETTER_SPACING)}<Fill><SolidColor colorValue="FFFFFFFF"/></Fill><TextStyleFeature name="kern" tag="1801810542" featureValue="0"/></TextStylePaint>`).join('\n      ')}
      ${clockStyles.map((style, i) => `<TextValueRun name="Clock Character ${i + 1}" styleId="${style}" text="${valueOf(`_clockChar${i + 1}`)}">${bind(`_clockChar${i + 1}`, TEXT)}</TextValueRun>`).join('\n      ')}
    </Text>
  </Node>`;

const box = `<Node name="Clock Box" id="${BOX_NODE}" x="${BOX_X}" y="${BOX_Y}">
  <Node name="Box Content">
    ${clock}
    ${text({ name: 'Period', x: CLOCK_X + CLOCK_TEXT_WIDTH * CLOCK_SCALE + PERIOD_GAP, y: CLOCK_BASELINE, width: PERIOD_WIDTH, align: 'left', run: { prop: 'period', font: FONT_BOLD, size: 56, spacing: 1, color: 'D9FFFFFF' } })}
    ${text({ name: 'Message', x: 48, y: MESSAGE_BASELINE, width: BOX.width - 96, align: 'center', run: { prop: 'message', font: FONT_REGULAR, size: 44, spacing: 2, color: 'FFFFFFFF' } })}
  </Node>
  ${darkGlass('Box', BOX.width, BOX.height, OUTER)}
</Node>`;

// --- timelines ------------------------------------------------------------------------

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';

type Key = { frame: number; value: number; ease?: string };
type Track = { objectId: string; propertyKey: number; keys: Key[] };

const renderTrack = ({ objectId, propertyKey, keys }: Track) => {
  const frames = keys.map(({ frame, value, ease }) =>
    ease
      ? `    <KeyFrameDouble frame="${frame}" value="${round(value)}" interpolationType="cubic">${ease}</KeyFrameDouble>`
      : `    <KeyFrameDouble frame="${frame}" value="${round(value)}" interpolationType="hold"/>`,
  );
  return `  <KeyedObject objectId="${objectId}"><KeyedProperty propertyKey="${propertyKey}">\n${frames.join('\n')}\n  </KeyedProperty></KeyedObject>`;
};

const FADE_FRAMES = 12;
const fade = (from: number, to: number, ease: string): Track[] => [{ objectId: ROOT, propertyKey: OPACITY, keys: [{ frame: 0, value: from, ease }, { frame: FADE_FRAMES, value: to }] }];
const pose = (opacity: number): Track[] => [{ objectId: ROOT, propertyKey: OPACITY, keys: [{ frame: 0, value: opacity }] }];

const ANIMATION = { hold: 30, intro: 31, outro: 32, hidden: 33 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43 } as const;

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const onAir = (op: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${op}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bind('isPlaying', BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;
const to = (state: number, conditions = '') => `<StateTransition stateToId="${id(state)}" duration="0">${conditions}</StateTransition>`;
const atEnd = (state: number) => `<StateTransition stateToId="${id(state)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>`;

const stateMachine = `<StateMachine name="Bars Slate" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.hidden)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.hidden)}" animationId="${id(ANIMATION.hidden)}">${to(STATE.intro, onAir('equal'))}</AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.intro)}" animationId="${id(ANIMATION.intro)}" reset="true">${atEnd(STATE.hold)}${to(STATE.outro, onAir('notEqual'))}</AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.hold)}" animationId="${id(ANIMATION.hold)}">${to(STATE.outro, onAir('notEqual'))}</AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.outro)}" animationId="${id(ANIMATION.outro)}" reset="true">${atEnd(STATE.hidden)}</AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- view model -----------------------------------------------------------------------

const TYPES: Record<Kind, string> = { boolean: 'Boolean', string: 'String', number: 'Number' };
const declare = (prop: Prop) =>
  `<ViewModelProperty${TYPES[prop.kind]} name="${prop.name}" id="${id(propLocal(prop.name))}"${prop.name.startsWith('_') ? '' : ' componentProps="1"'}/>`;
const instance = (prop: Prop) => `<ViewModelInstance${TYPES[prop.kind]} viewModelPropertyId="${id(propLocal(prop.name))}" propertyValue="${prop.value}"/>`;

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_bars_slate.ts; edit that file, not this one.
     Basketball bars slate v2: SMPTE colour bars across a 1920 x 1080 frame, with a dark-glass
     box over the top bars holding a time-of-day clock and a line of copy. It cuts in: Intro and
     Outro are ${FADE_FRAMES}-frame fades. Sibling draw order is front to back. -->
<Artboard name="Basketball Bars Slate v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="${FRAME.width}" height="${FRAME.height}" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Bars Slate v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>
<!-- Lays the clock's digits out tabular. -->
<ScriptedDrawable name="Bars Slate Clock Controller" scriptAssetId="${CONTROLLER}"/>

<Node name="Bars Slate" id="${ROOT}" opacity="0">

${box}

${strip('Bottom Row', BOTTOM_Y, BOTTOM_HEIGHT, BOTTOM_ROW)}

${strip('Castellations', MID_Y, MID_HEIGHT, MID_ROW)}

${strip('Top Bars', 0, TOP_HEIGHT, TOP_ROW)}
</Node>

<!-- Display: the whole frame fades. Hold and Outro restore every property the Intro animates. -->
${animation('Intro', ANIMATION.intro, FADE_FRAMES, 'oneShot', fade(0, 1, EASE_OUT))}
${animation('Hold', ANIMATION.hold, 1, 'loop', pose(1))}
${animation('Outro', ANIMATION.outro, FADE_FRAMES, 'oneShot', fade(1, 0, EASE_IN))}
${animation('Hidden', ANIMATION.hidden, 1, 'oneShot', pose(0))}

${stateMachine}
</Artboard>

<FontAsset name="Bars Slate v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Bars Slate v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>
<ScriptAsset name="bars_slate_clock" folderPath="graphics/basketball-v2" id="${CONTROLLER}" file="graphics/basketball-v2/bars_slate_clock.luau"/>

<ViewModel name="BasketballBarsSlateV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>
${PROPS.map(declare).join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>
${PROPS.map(instance).join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'bars_slate.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
