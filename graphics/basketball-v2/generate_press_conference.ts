/**
 * Generates the Press Conference scene:
 *
 *   bun graphics/basketball-v2/generate_press_conference.ts
 *
 * writes press_conference.rml beside this file. Edit this file, not the output.
 *
 * A full-frame wrapper for the live press-conference video. A marble background covers the
 * frame except a 16:9 window the video shows through: the marble is clipped by a shape of
 * two rectangles (the frame and the window) under the even-odd fill rule. A border in the
 * team's secondary colour rings the window, and a sidebar in the team's primary colour
 * lists the date, both scores, a few player lines and the next game. The graphic fades in
 * and out as one: only the root node's opacity is keyed.
 */

import { join } from 'node:path';

const P = 48;
const ARTBOARD_Y = 24200;
const id = (local: number) => `${P}:${local}`;

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const BORDER = 6;
// The window is exactly 16:9; its border rings it from outside.
const WINDOW = { x: 24, y: 140, width: 1424, height: 801 };
const SIDEBAR = { x: 1482, y: 134, width: 372, height: 813 };
const INNER_X = SIDEBAR.x + BORDER;
const INNER_WIDTH = SIDEBAR.width - 2 * BORDER;
const TEXT_INSET = 12;
const TEXT_WIDTH = INNER_WIDTH - 2 * TEXT_INSET;
const TEXT_X = INNER_X + TEXT_INSET;
const at = (relative: number) => SIDEBAR.y + relative;

const DATE_BASELINE = at(78);
const BAND_HEIGHT = 75;
const BAND_TOPS = { home: at(180), away: at(381) };
// The mark is about half its 1024 source tall; 0.3 draws a Drexel-sized mark about 155 high.
const LOGO_SCALE = 0.3;
const LOGO_CENTRE_X = INNER_X + 104;
const SCORE_SIZE = 84;
const SCORE_WIDTH = 150;
const SCORE_RIGHT = INNER_X + INNER_WIDTH - 18;
const PLAYER_BASELINES = [at(528), at(565), at(602)];
const DIVIDER_Y = at(660);
const NEXT_BASELINES = { label: at(712), opponent: at(750), date: at(788) };

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const OPACITY = 18;
const INTRO_FRAMES = 20;
const OUTRO_FRAMES = 24;

// Test data in capitals, as the projector sends it: the seed's demo game, Saint Joseph's at Drexel, with the Drexel Dragons featured.
type Prop =
  | { name: string; kind: 'string'; value: string }
  | { name: string; kind: 'color'; value: string }
  | { name: string; kind: 'image'; asset: number };
const PROPS: readonly Prop[] = [
  { name: 'date', kind: 'string', value: 'NOVEMBER 8TH 2026' },
  { name: 'homeLogo', kind: 'image', asset: 911 },
  { name: 'awayLogo', kind: 'image', asset: 912 },
  { name: 'homeScore', kind: 'string', value: '72' },
  { name: 'awayScore', kind: 'string', value: '68' },
  { name: 'playerLine1', kind: 'string', value: 'J. REED 18 PTS, 0-0 FG, 0-0 FT' },
  { name: 'playerLine2', kind: 'string', value: '' },
  { name: 'playerLine3', kind: 'string', value: '' },
  { name: 'nextGameLabel', kind: 'string', value: 'NEXT GAME' },
  { name: 'nextGameOpponent', kind: 'string', value: 'AT PENN' },
  { name: 'nextGameDate', kind: 'string', value: '11/14/26' },
  { name: 'primaryColor', kind: 'color', value: 'FF07294D' },
  { name: 'secondaryColor', kind: 'color', value: 'FFFFC600' },
];
const propId = (name: string) => id(1010 + PROPS.findIndex((prop) => prop.name === name));
const path = (name: string) => `${id(1000)}-${name === 'isPlaying' ? id(1002) : propId(name)}`;
const bindTo = (name: string, key: number) => `<DataBindContext sourcePathIds="${path(name)}" propertyKey="${key}"/>`;
const TEXT_KEY = 268;
const COLOR_KEY = 37;
const IMAGE_KEY = 206;

const valueOf = (name: string) => (PROPS.find((prop) => prop.name === name) as { value: string }).value;

let styleCount = 0;
const text = (
  name: string, prop: string, baseline: number, x: number, width: number, size: number, align: 'left' | 'center' | 'right',
  fill: string | { bound: string; fallback: string },
) => {
  const style = id(700 + styleCount++);
  const paint =
    typeof fill === 'string'
      ? `<SolidColor colorValue="${fill}"/>`
      : `<SolidColor colorValue="${fill.fallback}">${bindTo(fill.bound, COLOR_KEY)}</SolidColor>`;
  return `<Text name="${name}" x="${x}" y="${baseline}" originValue="baseline" wrapValue="noWrap" width="${width}" height="${Math.round(size * 1.2)}" sizingValue="fixed" alignValue="${align}" overflowValue="fitFontSize"><TextStylePaint id="${style}" fontAssetId="${id(900)}" fontSize="${size}" letterSpacing="0.5"><Fill>${paint}</Fill></TextStylePaint><TextValueRun name="${name} Value" styleId="${style}" text="${valueOf(prop)}">${bindTo(prop, TEXT_KEY)}</TextValueRun></Text>`;
};

const rect = (x: number, y: number, width: number, height: number) =>
  `<Rectangle x="${x}" y="${y}" width="${width}" height="${height}" originX="0" originY="0"/>`;

const solid = (color: string, bound?: string) =>
  `<Fill><SolidColor colorValue="${color}">${bound ? bindTo(bound, COLOR_KEY) : ''}</SolidColor></Fill>`;

const SIDES = [
  { key: 'home', title: 'Home' },
  { key: 'away', title: 'Away' },
] as const;

const bands = SIDES.map(({ key, title }) => `<Shape name="${title} Band">${rect(INNER_X, BAND_TOPS[key], INNER_WIDTH, BAND_HEIGHT)}${solid('FFFFFFFF')}</Shape>`).join('\n');

const logos = SIDES.map(({ key, title }) => {
  const asset = (PROPS.find((prop) => prop.name === `${key}Logo`) as { asset: number }).asset;
  return `<Image name="${title} Logo" x="${LOGO_CENTRE_X}" y="${BAND_TOPS[key] + BAND_HEIGHT / 2}" scaleX="${LOGO_SCALE}" scaleY="${LOGO_SCALE}" assetId="${id(asset)}">${bindTo(`${key}Logo`, IMAGE_KEY)}</Image>`;
}).join('\n');

const scores = SIDES.map(({ key, title }) =>
  text(`${title} Score`, `${key}Score`, BAND_TOPS[key] + BAND_HEIGHT / 2 + 30, SCORE_RIGHT - SCORE_WIDTH, SCORE_WIDTH, SCORE_SIZE, 'right', 'FF000000'),
).join('\n');

const playerLines = PLAYER_BASELINES.map((baseline, index) =>
  text(`Player Line ${index + 1}`, `playerLine${index + 1}`, baseline, TEXT_X, TEXT_WIDTH, 30, 'left', 'FFFFFFFF'),
).join('\n');

const track = (keys: string) => `<KeyedObject objectId="${id(10)}"><KeyedProperty propertyKey="${OPACITY}">${keys}</KeyedProperty></KeyedObject>`;
const intro = track(`
    <KeyFrameDouble frame="0" value="0" interpolationType="cubic">${EASE_OUT}</KeyFrameDouble>
    <KeyFrameDouble frame="${INTRO_FRAMES}" value="1" interpolationType="hold"/>
  `);
const outro = track(`
    <KeyFrameDouble frame="0" value="1" interpolationType="cubic">${EASE_IN}</KeyFrameDouble>
    <KeyFrameDouble frame="${OUTRO_FRAMES}" value="0" interpolationType="hold"/>
  `);
const rest = (value: number) => track(`<KeyFrameDouble frame="0" value="${value}" interpolationType="hold"/>`);

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', body: string) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${body}\n</LinearAnimation>`;

const onAir = `<TransitionPropertyViewModelComparator><BindablePropertyBoolean><DataBindContext sourcePathIds="${path('isPlaying')}" propertyKey="634"/></BindablePropertyBoolean></TransitionPropertyViewModelComparator>`;
const whenOnAir = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}">${onAir}<TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const TYPES = { string: 'String', color: 'Color', image: 'AssetImage' } as const;
const viewModelProps = PROPS.map((prop, index) => `<ViewModelProperty${TYPES[prop.kind]} name="${prop.name}" id="${id(1010 + index)}" componentProps="1"/>`).join('\n');
const instanceValues = PROPS.map((prop, index) => {
  const value = prop.kind === 'image' ? id(prop.asset) : prop.value;
  return `<ViewModelInstance${TYPES[prop.kind]} viewModelPropertyId="${id(1010 + index)}" propertyValue="${value}"/>`;
}).join('\n');

const rml = `<Rive version="1" kind="fragment">
<!-- Generated by generate_press_conference.ts; edit that file, not this one.
     Basketball press conference v2: a marble frame round a transparent ${WINDOW.width} x ${WINDOW.height} window
     for the live video, and a team-coloured sidebar. Marble: ambientCG Marble012 (CC0).
     The whole graphic fades through one root node. -->
<Artboard name="Basketball Press Conference v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Press Conference v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Press Conference" id="${id(10)}" opacity="0">

<!-- Sidebar content: the first child draws on top. -->
<Node name="Sidebar Content" id="${id(200)}">
${text('Date', 'date', DATE_BASELINE, TEXT_X, TEXT_WIDTH, 44, 'center', 'FFFFFFFF')}
${scores}
${logos}
${playerLines}
<Shape name="Divider">${rect(INNER_X, DIVIDER_Y, INNER_WIDTH, 6)}${solid('FFFFFFFF')}</Shape>
${text('Next Game Label', 'nextGameLabel', NEXT_BASELINES.label, TEXT_X, TEXT_WIDTH, 44, 'center', { bound: 'secondaryColor', fallback: 'FFFFC600' })}
${text('Next Game Opponent', 'nextGameOpponent', NEXT_BASELINES.opponent, TEXT_X, TEXT_WIDTH, 36, 'center', 'FFFFFFFF')}
${text('Next Game Date', 'nextGameDate', NEXT_BASELINES.date, TEXT_X, TEXT_WIDTH, 36, 'center', 'FFFFFFFF')}
${bands}
</Node>

<Shape name="Sidebar">
  ${rect(SIDEBAR.x + BORDER / 2, SIDEBAR.y + BORDER / 2, SIDEBAR.width - BORDER, SIDEBAR.height - BORDER)}
  ${solid('FF07294D', 'primaryColor')}
  <Stroke thickness="${BORDER}"><SolidColor colorValue="FFFFC600">${bindTo('secondaryColor', COLOR_KEY)}</SolidColor></Stroke>
</Shape>

<Shape name="Window Border">
  ${rect(WINDOW.x - BORDER / 2, WINDOW.y - BORDER / 2, WINDOW.width + BORDER, WINDOW.height + BORDER)}
  <Stroke thickness="${BORDER}"><SolidColor colorValue="FFFFC600">${bindTo('secondaryColor', COLOR_KEY)}</SolidColor></Stroke>
</Shape>

<Node name="Marble" id="${id(100)}">
<ClippingShape name="Window Cutout Clip" sourceId="${id(600)}" fillRule="evenOdd"/>
<Image name="Marble Image" x="${FRAME_WIDTH / 2}" y="${FRAME_HEIGHT / 2}" assetId="${id(910)}"/>
</Node>

</Node>

<Node name="Window Backing">
<Shape name="Window Cutout" id="${id(600)}">${rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)}${rect(WINDOW.x, WINDOW.y, WINDOW.width, WINDOW.height)}</Shape>
</Node>

<!-- Fade in over ${INTRO_FRAMES} frames, out over ${OUTRO_FRAMES}. Hold keys the resting opacity so a second take matches the first. -->
${animation('Intro', 31, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', 30, 1, 'loop', rest(1))}

${animation('Outro', 32, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', 33, 1, 'oneShot', rest(0))}

<StateMachine name="Press Conference" id="${id(7)}"><StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(43)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(43)}" animationId="${id(33)}"><StateTransition stateToId="${id(41)}" duration="0">${whenOnAir('equal')}</StateTransition></AnimationState>
  <AnimationState x="180" y="0" id="${id(41)}" animationId="${id(31)}" reset="true">
    <StateTransition stateToId="${id(40)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(42)}" duration="0">${whenOnAir('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="0" id="${id(40)}" animationId="${id(30)}"><StateTransition stateToId="${id(42)}" duration="0">${whenOnAir('notEqual')}</StateTransition></AnimationState>
  <AnimationState x="660" y="0" id="${id(42)}" animationId="${id(32)}" reset="true"><StateTransition stateToId="${id(43)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/></AnimationState>
</StateMachineLayer></StateMachine>
</Artboard>

<FontAsset name="Press Conference v2 Zuume Bold" id="${id(900)}" file="assets/fonts/Zuume-Bold.ttf"/>
<ImageAsset name="Press Conference v2 Marble" id="${id(910)}" file="assets/images/press_conference/marble.jpg"/>
<ImageAsset name="Press Conference v2 Drexel" id="${id(911)}" file="assets/images/scorebug/drexel.png"/>
<ImageAsset name="Press Conference v2 Saint Joseph's" id="${id(912)}" file="assets/images/scorebug/saint-josephs.png"/>

<ViewModel name="BasketballPressConferenceV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
<ViewModelPropertyBoolean name="isPlaying" id="${id(1002)}" componentProps="1"/>
${viewModelProps}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
<ViewModelInstanceBoolean viewModelPropertyId="${id(1002)}" propertyValue="false"/>
${instanceValues}
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'press_conference.rml');
await Bun.write(file, rml);
console.log(`wrote ${file}`);
