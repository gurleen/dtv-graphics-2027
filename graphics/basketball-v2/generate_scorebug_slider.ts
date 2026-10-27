/**
 * Generates the Scorebug Slider scene from one description:
 *
 *   bun graphics/basketball-v2/generate_scorebug_slider.ts
 *
 * writes scorebug_slider.rml beside this file. Edit this file, not the output.
 *
 * A one-line strip of dark glass that slides out of the scorebug's right edge, beside its
 * home row: a bold title, a gap, then a regular subtitle (`VENUE  DASKALAKIS ATHLETIC
 * CENTER · PHILADELPHIA, PA`). It takes the lower-third layer, so it is never on air with a
 * lower third.
 *
 * The glass hugs its text. A timeline cannot key a width it does not know, so the width
 * comes from layout: a hug `Panel` box holds the padded text, and the glass is an absolute
 * child box of the panel whose width is a percentage of it. Keying that percentage from 0
 * to 100 wipes the glass open from the seam, rounded edge leading, at any text length. The
 * runs that carry the sheen and the edge light are percentage boxes beside it. Two findings
 * decide which parts are boxes and which are shapes:
 *
 *   - A percent width resolves against the parent's content box, so the padding is on the
 *     text's own box, not on the panel.
 *   - A box's own fill and stroke ignore an ancestor's ClippingShape; Text and Shape obey
 *     it. So the glass clips the text and the sheen (a shape), while the edge light (lit in
 *     the seam gap before any glass shows) is a box.
 *
 * Text longer than the frame allows shrinks: the line's layout participant is capped at the
 * width left inside the action-safe margin, and `overflowValue="fit"` scales the line into
 * it, centred. `fitFontSize` sits the line high when it shrinks, and without the cap a hug
 * line shrinks to nothing.
 */

import { join } from 'node:path';

const PREFIX = 47;
const ARTBOARD_Y = 23000;

const TITLE = 'VENUE';
const SUBTITLE = 'DASKALAKIS ATHLETIC CENTER · PHILADELPHIA, PA';

// Geometry. The strip stands beside the scorebug's home row (the bug is 430 x 132 at
// 96, 890; its rows are 64 high, 4 apart), one panel gap from its right edge.
const SCOREBUG_RIGHT = 96 + 430;
const GAP = 4;
const FOOT_Y = 890 + 132;
const HEIGHT = 64;
const STRIP_X = SCOREBUG_RIGHT + GAP;
const STRIP_Y = FOOT_Y - HEIGHT;
const ACTION_SAFE_RIGHT = 1920 - 96;
const MAX_WIDTH = ACTION_SAFE_RIGHT - STRIP_X;
const SEAM_RADIUS = 3;
const OUTER_RADIUS = 12;
const INSET_LEFT = 24;
const INSET_RIGHT = 28;
const TEXT_MAX_WIDTH = MAX_WIDTH - INSET_LEFT - INSET_RIGHT;

const TITLE_SIZE = 36;
const SUBTITLE_SIZE = 34;
const GAP_TEXT = '   ';

const CONTENT_DRIFT = 22;
const OUTRO_DRIFT = 18;
const OUTRO_SINK = 10;
const GLOW_WIDTH = 44;
const LINE_WIDTH = 2;
// The line stops short of the glass's rounded corners, so the box (which the glass does
// not clip) never stands outside the curve.
const LINE_INSET = 8;
const SHEEN_WIDTH = 110;
// The sheen's centre travels from SHEEN_REACH before the run's end to SHEEN_REACH past it,
// so it starts and ends wholly off the glass (its slanted footprint is about ±70).
const SHEEN_REACH = 90;

// Timeline lengths in frames at 60 fps.
const INTRO_FRAMES = 72;
const OUTRO_FRAMES = 24;
const WIPE_START = 6;
const WIPE_END = 40;
const SWEEP_FROM = 34;

const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

// Property keys used by the timelines and binds.
const BOX_WIDTH = 7;
const X = 13;
const Y = 14;
const SCALE_Y = 17;
const OPACITY = 18;
const TEXT = 268;
const BOOLEAN = 634;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

const id = (local: number) => `${PREFIX}:${local}`;
const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

// --- identifiers ----------------------------------------------------------------------

const ROOT = id(10);
const PANEL = id(100);
const CONTENT = id(110);
const LINE = id(120);
const TITLE_STYLE = id(121);
const SUBTITLE_STYLE = id(122);
const RISE = id(123);
const GLASS = id(500);
const GLASS_MASK = id(510);
const EDGE_LIGHT = id(520);
const EDGE_LINE = id(522);
const EDGE_RUN = id(530);
const SHEEN_RUN = id(600);
const SHEEN_ANCHOR = id(602);
const SHEEN = id(604);
const FONT_BOLD = id(900);
const FONT_REGULAR = id(901);

const IS_PLAYING = 1002;
const TITLE_PROPERTY = 1010;
const SUBTITLE_PROPERTY = 1011;

// --- markup helpers -------------------------------------------------------------------

const bound = (property: number, key: number) => `<DataBindContext sourcePathIds="${pathTo(property)}" propertyKey="${key}"/>`;

const xml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const RADII = `linkCornerRadius="false" cornerRadiusTL="${SEAM_RADIUS}" cornerRadiusTR="${OUTER_RADIUS}" cornerRadiusBL="${SEAM_RADIUS}" cornerRadiusBR="${OUTER_RADIUS}"`;

const pinned = (edges: Record<string, number>) =>
  `positionTypeValue="absolute" ${Object.entries(edges).map(([edge, value]) => `position${edge}="${value}" position${edge}UnitsValue="points"`).join(' ')}`;

/** A box pinned at the panel's top-left whose width is a percentage of the panel, keyed from the timelines. */
const runStyle = (name: string, styleId: string, extra = '') =>
  `<LayoutComponentStyle name="${name} Style" id="${styleId}" ${pinned({ Left: 0, Top: 0 })} widthUnitsValue="percent" heightUnitsValue="percent"${extra}/>`;

// --- the strip ------------------------------------------------------------------------

// Text reveal: each glyph rises 14 into place as it fades in. The range rests wholly past
// the last glyph.
const text = `<LayoutComponent name="Content" id="${CONTENT}" clip="false" width="0" height="${HEIGHT}" styleId="${id(111)}">
        <LayoutComponentStyle name="Content Style" id="${id(111)}" layoutWidthScaleType="hug" layoutHeightScaleType="fixed" flexDirectionValue="row" layoutAlignmentType="centerLeft" paddingLeft="${INSET_LEFT}" paddingLeftUnitsValue="points" paddingRight="${INSET_RIGHT}" paddingRightUnitsValue="points"/>
        <Text name="Line" id="${LINE}" wrapValue="noWrap" overflowValue="fit">
          <LayoutParticipant layoutWidthScaleType="hug" layoutHeightScaleType="hug" maxWidth="${TEXT_MAX_WIDTH}" maxWidthUnitsValue="points"/>
          <TextStylePaint id="${TITLE_STYLE}" fontAssetId="${FONT_BOLD}" fontSize="${TITLE_SIZE}" letterSpacing="1"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint>
          <TextStylePaint id="${SUBTITLE_STYLE}" fontAssetId="${FONT_REGULAR}" fontSize="${SUBTITLE_SIZE}" letterSpacing="2"><Fill><SolidColor colorValue="D9FFFFFF"/></Fill></TextStylePaint>
          <TextValueRun name="Title Value" styleId="${TITLE_STYLE}" text="${xml(TITLE)}">${bound(TITLE_PROPERTY, TEXT)}</TextValueRun>
          <TextValueRun name="Gap" styleId="${SUBTITLE_STYLE}" text="${GAP_TEXT}"/>
          <TextValueRun name="Subtitle Value" styleId="${SUBTITLE_STYLE}" text="${xml(SUBTITLE)}">${bound(SUBTITLE_PROPERTY, TEXT)}</TextValueRun>
          <TextModifierGroup name="Line Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="Line Reveal" id="${RISE}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup>
        </Text>
      </LayoutComponent>`;

// The sheen is pinned to the end of a run whose width sweeps across the panel after the wipe.
const sheen = `<LayoutComponent name="Sheen Run" id="${SHEEN_RUN}" clip="false" width="0" height="100" styleId="${id(601)}">
        ${runStyle('Sheen Run', id(601))}
        <LayoutComponent name="Sheen Anchor" id="${SHEEN_ANCHOR}" clip="false" width="0" height="${HEIGHT}" styleId="${id(603)}">
          <LayoutComponentStyle name="Sheen Anchor Style" id="${id(603)}" ${pinned({ Right: 0, Top: 0 })}/>
          <Node name="Sheen" id="${SHEEN}" x="${-SHEEN_REACH}" y="${HEIGHT / 2}" opacity="0">
            <Shape name="Glass Specular Sweep" rotation="0.3490659">
              <Rectangle width="${SHEEN_WIDTH}" height="${HEIGHT * 2}"/>
              <Fill><LinearGradient startX="${-SHEEN_WIDTH / 2}" startY="0" endX="${SHEEN_WIDTH / 2}" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
            </Shape>
          </Node>
        </LayoutComponent>
      </LayoutComponent>`;

// The glass is the reveal: its width is keyed. The mask shape fills it and clips the
// text and the sheen. A fill participant stretches its path, corner radii and all, so the
// mask is square; neither the text nor the faint sheen reaches the rounded corners.
const glass = `<LayoutComponent name="Glass" id="${GLASS}" clip="false" width="0" height="100" styleId="${id(501)}">
        ${runStyle('Glass', id(501), ` ${RADII}`)}
        <Fill><SolidColor colorValue="D10E1116"/></Fill>
        <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${HEIGHT}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
        <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${HEIGHT}"><GradientStop colorValue="73FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
        <Shape name="Glass Mask" id="${GLASS_MASK}">
          <LayoutParticipant layoutWidthScaleType="fill" layoutHeightScaleType="fill"/>
          <Rectangle width="100" height="${HEIGHT}" originX="0" originY="0"/>
        </Shape>
      </LayoutComponent>`;

// The edge light is pinned to the end of a run as wide as the glass, so it moves with the
// glass's leading edge while the glass itself is still hidden. Its glow is the light box's
// own fill, as wide as the glass up to GLOW_WIDTH and rounded like the glass, so it stays
// within the glass at any width without a clip; the line stands in the seam gap before
// the glass opens.
const edge = `<LayoutComponent name="Edge Run" id="${EDGE_RUN}" clip="false" width="0" height="100" styleId="${id(531)}">
        ${runStyle('Edge Run', id(531))}
        <LayoutComponent name="Edge Light" id="${EDGE_LIGHT}" clip="false" width="100" height="100" opacity="0" styleId="${id(521)}">
          <LayoutComponentStyle name="Edge Light Style" id="${id(521)}" ${pinned({ Right: 0, Top: 0 })} widthUnitsValue="percent" heightUnitsValue="percent" maxWidth="${GLOW_WIDTH}" maxWidthUnitsValue="points" ${RADII}/>
          <ComponentOrigin originX="0.5" originY="0.5"/>
          <Fill><LinearGradient startX="0" startY="0" endX="${GLOW_WIDTH}" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="30FFFFFF" position="1"/></LinearGradient></Fill>
          <LayoutComponent name="Edge Line" id="${EDGE_LINE}" clip="false" width="${LINE_WIDTH}" height="${HEIGHT - 2 * LINE_INSET}" styleId="${id(523)}">
            <LayoutComponentStyle name="Edge Line Style" id="${id(523)}" ${pinned({ Right: 0, Top: LINE_INSET })} linkCornerRadius="true" cornerRadiusTL="1"/>
            <Fill><SolidColor colorValue="E6FFFFFF"/></Fill>
          </LayoutComponent>
        </LayoutComponent>
      </LayoutComponent>`;

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
const closing = (objectId: string, propertyKey: number, from: number, to: number, start: number, end: number) =>
  move(objectId, propertyKey, from, to, start, end, EASE_IN);

// The glass and the edge light's run open and close together.
const WIPED = [GLASS, EDGE_RUN];

const edgeFlare: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
  { frame: 24, value: 1, ease: EASE_OUT }, { frame: 44, value: 0, linear: true },
];
const edgeClosing: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
  { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
];
const sheenFade: Key[] = [
  { frame: 0, value: 0, linear: true }, { frame: SWEEP_FROM, value: 0, linear: true }, { frame: SWEEP_FROM + 6, value: 0.65, linear: true },
  { frame: INTRO_FRAMES - 10, value: 0.65, linear: true }, { frame: INTRO_FRAMES, value: 0, linear: true },
];

// The light ignites in the gap at the seam and moves with the glass's leading edge to the
// end of the text; the text drifts in behind it and rises letter by letter. The glass
// shows only once the wipe starts: at zero width its stroke draws a hairline at the seam.
const intro: Track[] = [
  { objectId: GLASS, propertyKey: OPACITY, keys: [{ frame: 0, value: 0 }, { frame: WIPE_START, value: 1 }] },
  hold(CONTENT, OPACITY, 1),
  hold(CONTENT, Y, 0),
  ...WIPED.map((box) => move(box, BOX_WIDTH, 0, 100, WIPE_START, WIPE_END, EASE_WIPE)),
  move(EDGE_LIGHT, SCALE_Y, 0, 1, 0, 12, EASE_OUT),
  { objectId: EDGE_LIGHT, propertyKey: OPACITY, keys: edgeFlare },
  move(CONTENT, X, -CONTENT_DRIFT, 0, 8, 44, EASE_OUT),
  move(RISE, MODIFY_FROM, -0.4, 1, 18, 46, EASE_OUT),
  move(RISE, FALLOFF_FROM, 0, 1.4, 18, 46, EASE_OUT),
  move(SHEEN_RUN, BOX_WIDTH, 0, 100, SWEEP_FROM, INTRO_FRAMES, EASE_SWEEP),
  move(SHEEN, X, -SHEEN_REACH, SHEEN_REACH, SWEEP_FROM, INTRO_FRAMES, EASE_SWEEP),
  { objectId: SHEEN, propertyKey: OPACITY, keys: sheenFade },
];

const settledText: Track[] = [hold(RISE, MODIFY_FROM, 1), hold(RISE, FALLOFF_FROM, 1.4)];

const settled: Track[] = [
  hold(GLASS, OPACITY, 1),
  hold(CONTENT, OPACITY, 1),
  hold(CONTENT, Y, 0),
  ...WIPED.map((box) => hold(box, BOX_WIDTH, 100)),
  hold(EDGE_LIGHT, SCALE_Y, 1),
  hold(EDGE_LIGHT, OPACITY, 0),
  hold(CONTENT, X, 0),
  ...settledText,
  hold(SHEEN_RUN, BOX_WIDTH, 100),
  hold(SHEEN, X, SHEEN_REACH),
  hold(SHEEN, OPACITY, 0),
];

// The text sinks and fades toward the seam while the glass closes back into the
// scorebug behind a brief edge light.
const outro: Track[] = [
  { objectId: GLASS, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: OUTRO_FRAMES - 2, value: 1, linear: true }, { frame: OUTRO_FRAMES, value: 0 }] },
  closing(CONTENT, OPACITY, 1, 0, 0, 16),
  closing(CONTENT, Y, 0, OUTRO_SINK, 0, 16),
  ...WIPED.map((box) => closing(box, BOX_WIDTH, 100, 0, 2, OUTRO_FRAMES - 2)),
  hold(EDGE_LIGHT, SCALE_Y, 1),
  { objectId: EDGE_LIGHT, propertyKey: OPACITY, keys: edgeClosing },
  closing(CONTENT, X, 0, -OUTRO_DRIFT, 0, OUTRO_FRAMES),
  ...settledText,
  hold(SHEEN_RUN, BOX_WIDTH, 100),
  hold(SHEEN, X, SHEEN_REACH),
  hold(SHEEN, OPACITY, 0),
];

const hidden: Track[] = [
  hold(GLASS, OPACITY, 0),
  hold(CONTENT, OPACITY, 0),
  hold(EDGE_LIGHT, OPACITY, 0),
  hold(SHEEN, OPACITY, 0),
];

const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
  `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

// --- state machine --------------------------------------------------------------------

const isTrue = (value: 'equal' | 'notEqual') =>
  `<TransitionViewModelCondition opValue="${value}"><TransitionPropertyViewModelComparator><BindablePropertyBoolean>${bound(IS_PLAYING, BOOLEAN)}</BindablePropertyBoolean></TransitionPropertyViewModelComparator><TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

const ID = { hold: 30, intro: 31, outro: 32, hidden: 33 } as const;
const STATE = { hold: 40, intro: 41, outro: 42, hidden: 43 } as const;

const stateMachine = `<StateMachine name="Scorebug Slider" id="${id(7)}">
<StateMachineLayer name="Display">
  <AnyState x="820" y="-120"/><ExitState x="940" y="-120"/>
  <EntryState x="0" y="0"><StateTransition stateToId="${id(STATE.hidden)}"/></EntryState>
  <AnimationState x="180" y="140" id="${id(STATE.hidden)}" animationId="${id(ID.hidden)}"><StateTransition stateToId="${id(STATE.intro)}" duration="0">${isTrue('equal')}</StateTransition></AnimationState>
  <AnimationState x="180" y="0" id="${id(STATE.intro)}" animationId="${id(ID.intro)}" reset="true">
    <StateTransition stateToId="${id(STATE.hold)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/>
    <StateTransition stateToId="${id(STATE.outro)}" duration="0">${isTrue('notEqual')}</StateTransition>
  </AnimationState>
  <AnimationState x="420" y="0" id="${id(STATE.hold)}" animationId="${id(ID.hold)}"><StateTransition stateToId="${id(STATE.outro)}" duration="0">${isTrue('notEqual')}</StateTransition></AnimationState>
  <AnimationState x="660" y="0" id="${id(STATE.outro)}" animationId="${id(ID.outro)}" reset="true"><StateTransition stateToId="${id(STATE.hidden)}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100" duration="0"/></AnimationState>
</StateMachineLayer>
</StateMachine>`;

// --- document -------------------------------------------------------------------------

const document = `<Rive version="1" kind="fragment">
<!-- Generated by generate_scorebug_slider.ts; edit that file, not this one.
     Basketball scorebug slider v2: a one-line dark-glass strip that slides out of the
     scorebug's right edge, beside its home row, on a transparent 1920 x 1080 canvas.
     ${HEIGHT} high at (${STRIP_X}, ${STRIP_Y}); as wide as its text, up to ${MAX_WIDTH} (right edge on x
     ${ACTION_SAFE_RIGHT}). Sibling draw order is front to back. -->
<Artboard name="Basketball Scorebug Slider v2" id="${id(2)}" x="0" y="${ARTBOARD_Y}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Scorebug Slider v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<!-- The panel hugs the padded text; everything else is pinned inside it. -->
<Node name="Scorebug Slider" id="${ROOT}" x="${STRIP_X}" y="${STRIP_Y}">
  <ClippingShape name="Glass Clip" sourceId="${GLASS_MASK}"/>
  <LayoutComponent name="Panel" id="${PANEL}" clip="false" width="0" height="${HEIGHT}" styleId="${id(101)}">
    <LayoutComponentStyle name="Panel Style" id="${id(101)}" ${pinned({ Left: 0, Top: 0 })} layoutWidthScaleType="hug" layoutHeightScaleType="fixed" flexDirectionValue="row"/>
      ${text}
      ${sheen}
      ${edge}
      ${glass}
  </LayoutComponent>
</Node>

<!-- Intro: ignition in the gap at the seam, one wipe out to the end of the text, rising
     type and one sheen; ${INTRO_FRAMES / 60} s. Hold and Outro explicitly restore every animated property
     for repeat takes. -->
${animation('Intro', ID.intro, INTRO_FRAMES, 'oneShot', intro)}

${animation('Hold', ID.hold, 1, 'loop', settled)}

${animation('Outro', ID.outro, OUTRO_FRAMES, 'oneShot', outro)}

${animation('Hidden', ID.hidden, 1, 'oneShot', hidden)}

<!-- Display: isPlaying true takes the graphic on air (Intro then Hold), false dismisses it
     (Outro then Hidden). -->
${stateMachine}
</Artboard>

<FontAsset name="Scorebug Slider v2 Zuume Bold" id="${FONT_BOLD}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Scorebug Slider v2 Zuume Regular" id="${FONT_REGULAR}" file="assets/fonts/Zuume-Regular.ttf"/>

<ViewModel name="BasketballScorebugSliderV2" id="${id(1000)}" defaultInstanceId="${id(1001)}">
<ViewModelPropertyBoolean name="isPlaying" id="${id(IS_PLAYING)}" componentProps="1"/>
<ViewModelPropertyString name="title" id="${id(TITLE_PROPERTY)}" componentProps="1"/>
<ViewModelPropertyString name="subtitle" id="${id(SUBTITLE_PROPERTY)}" componentProps="1"/>
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
<ViewModelInstanceBoolean viewModelPropertyId="${id(IS_PLAYING)}" propertyValue="false"/>
<ViewModelInstanceString viewModelPropertyId="${id(TITLE_PROPERTY)}" propertyValue="${xml(TITLE)}"/>
<ViewModelInstanceString viewModelPropertyId="${id(SUBTITLE_PROPERTY)}" propertyValue="${xml(SUBTITLE)}"/>
</ViewModelInstance>
</ViewModel>
</Rive>
`;

const file = join(import.meta.dir, 'scorebug_slider.rml');
await Bun.write(file, document);
console.log(`wrote ${file}`);
