/**
 * Generates the three talent lower third scenes (one, two and three talents) from a
 * single description, so the variants cannot drift apart:
 *
 *   bun graphics/basketball-v2/generate_talent_lower_thirds.ts
 *
 * writes talent_lower_third_single.rml, talent_lower_third_double.rml and
 * talent_lower_third_triple.rml beside this file. Edit this file, not the output.
 */

import { join } from 'node:path';

type Variant = {
  suffix: 'single' | 'double' | 'triple';
  title: 'Single' | 'Double' | 'Triple';
  prefix: number;
  artboardY: number;
  columnWidth: number;
  talents: readonly { name: string; role: string }[];
};

const VARIANTS: readonly Variant[] = [
  {
    suffix: 'single', title: 'Single', prefix: 33, artboardY: 6200, columnWidth: 560,
    talents: [{ name: 'JORDAN ELLIS', role: 'PLAY-BY-PLAY' }],
  },
  {
    suffix: 'double', title: 'Double', prefix: 34, artboardY: 7400, columnWidth: 460,
    talents: [
      { name: 'JORDAN ELLIS', role: 'PLAY-BY-PLAY' },
      { name: 'CASEY MORGAN', role: 'ANALYST' },
    ],
  },
  {
    suffix: 'triple', title: 'Triple', prefix: 35, artboardY: 8600, columnWidth: 400,
    talents: [
      { name: 'JORDAN ELLIS', role: 'PLAY-BY-PLAY' },
      { name: 'CASEY MORGAN', role: 'ANALYST' },
      { name: 'TAYLOR REED', role: 'SIDELINE REPORTER' },
    ],
  },
];

// Geometry shared by every variant (see the package README's design language).
const FRAME_WIDTH = 1920;
const BLOCK_Y = 890;
const GAP = 4;
const COLUMN_GAP = 24;
const NAME_HEIGHT = 84;
const ROLE_HEIGHT = 44;
const BLOCK_HEIGHT = NAME_HEIGHT + GAP + ROLE_HEIGHT;
const OUTER_RADIUS = 12;
const INNER_RADIUS = 3;
const MARKER_WIDTH = 6;
const TEXT_INSET = 26;
const CONTENT_DRIFT = 22;

// Keyframe easing, as in the other v2 graphics.
const EASE_OUT = '<CubicEaseInterpolator x1="0.16" y1="1" x2="0.3" y2="1"/>';
const EASE_WIPE = '<CubicEaseInterpolator x1="0.6" y1="0" x2="0.1" y2="1"/>';
const EASE_IN = '<CubicEaseInterpolator x1="0.7" y1="0" x2="0.84" y2="0"/>';
const EASE_SWEEP = '<CubicEaseInterpolator x1="0.4" y1="0" x2="0.6" y2="1"/>';

// Property keys used by the timelines.
const X = 13;
const Y = 14;
const SCALE_Y = 17;
const OPACITY = 18;
const WIDTH = 20;
const MODIFY_FROM = 327;
const FALLOFF_FROM = 317;

type Key = { frame: number; value: number; ease?: string; linear?: boolean };
type Track = { objectId: string; propertyKey: number; keys: Key[] };

const renderTrack = ({ objectId, propertyKey, keys }: Track) => {
  const frames = keys.map(({ frame, value, ease, linear }) => {
    if (ease) return `    <KeyFrameDouble frame="${frame}" value="${value}" interpolationType="cubic">${ease}</KeyFrameDouble>`;
    return `    <KeyFrameDouble frame="${frame}" value="${value}" interpolationType="${linear ? 'linear' : 'hold'}"/>`;
  });
  return `  <KeyedObject objectId="${objectId}"><KeyedProperty propertyKey="${propertyKey}">\n${frames.join('\n')}\n  </KeyedProperty></KeyedObject>`;
};

const rectangle = (width: number, height: number, radii: [number, number, number, number], position = '') =>
  `<Rectangle${position} width="${width}" height="${height}" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="${radii[0]}" cornerRadiusTR="${radii[1]}" cornerRadiusBL="${radii[2]}" cornerRadiusBR="${radii[3]}"/>`;

const round = (value: number) => Math.round(value * 1000) / 1000;

const renderVariant = (variant: Variant) => {
  const { prefix, title, columnWidth, talents } = variant;
  const count = talents.length;
  const blockWidth = count * columnWidth + (count - 1) * COLUMN_GAP;
  const blockX = Math.round((FRAME_WIDTH - blockWidth) / 2);
  const centre = blockWidth / 2;
  const wipeWidth = blockWidth + 16;
  const sweepEnd = blockWidth + 120;
  const id = (local: number) => `${prefix}:${local}`;
  const viewModel = `BasketballTalentLowerThird${title}V2`;
  const pathTo = (property: number) => `${id(1000)}-${id(property)}`;

  const nameProperty = (index: number) => 1010 + index * 10;
  const roleProperty = (index: number) => 1011 + index * 10;

  const columns = talents.map((talent, index) => {
    const x = index * (columnWidth + COLUMN_GAP);
    // Distance from the seam in column steps: 0 for a centred column, 0.5 or 1 otherwise.
    const rank = Math.abs(index - (count - 1) / 2);
    const side = Math.sign(x + columnWidth / 2 - centre);
    return {
      talent, index, x, rank, side,
      label: `Talent ${index + 1}`,
      // Each talent is a separate block, so every column takes the outer corners.
      nameRadii: [OUTER_RADIUS, OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS] as [number, number, number, number],
      roleRadii: [INNER_RADIUS, INNER_RADIUS, OUTER_RADIUS, OUTER_RADIUS] as [number, number, number, number],
      markerRadii: [OUTER_RADIUS, INNER_RADIUS, INNER_RADIUS, INNER_RADIUS] as [number, number, number, number],
      panelId: id(100 + index * 20),
      contentId: id(101 + index * 20),
      markerId: id(102 + index * 20),
      nameRevealId: id(103 + index * 20),
      roleRevealId: id(104 + index * 20),
      textStyle: { name: id(105 + index * 20), role: id(106 + index * 20) },
    };
  });

  const namePanels = columns.map((column) => {
    const { talent, label, x, nameRadii, markerRadii } = column;
    return `<Node name="${label} Name Panel" id="${column.panelId}" x="${x}" y="0">
  <Shape name="${label} Marker" id="${column.markerId}" x="0" y="0">
    ${rectangle(MARKER_WIDTH, NAME_HEIGHT, markerRadii)}
    <Fill><SolidColor colorValue="F2FFFFFF"/></Fill>
  </Shape>
  <Node name="${label} Name Content" id="${column.contentId}">
  <Text name="${label} Name" x="${TEXT_INSET}" y="60" originValue="baseline" wrapValue="noWrap" width="${columnWidth - 2 * TEXT_INSET}" height="60" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${column.textStyle.name}" fontAssetId="${id(900)}" fontSize="52" letterSpacing="0.5"><Fill><SolidColor colorValue="FFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${label} Name Value" styleId="${column.textStyle.name}" text="${talent.name}"><DataBindContext sourcePathIds="${pathTo(nameProperty(column.index))}" propertyKey="268"/></TextValueRun><TextModifierGroup name="${label} Name Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${label} Name Reveal" id="${column.nameRevealId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup></Text>
  </Node>
  <Shape name="${label} Name Glaze" x="0" y="0">
    ${rectangle(columnWidth, NAME_HEIGHT, nameRadii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${NAME_HEIGHT}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${NAME_HEIGHT}"><GradientStop colorValue="73FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>
  <Shape name="${label} Name Body" x="0" y="0">
    ${rectangle(columnWidth, NAME_HEIGHT, nameRadii)}
    <Fill><SolidColor colorValue="D10E1116"/></Fill>
  </Shape>
</Node>`;
  });

  const roleCells = columns.map((column) => {
    const { talent, label, x, roleRadii } = column;
    return `  <Text name="${label} Role" x="${x + TEXT_INSET}" y="31" originValue="baseline" wrapValue="noWrap" width="${columnWidth - 2 * TEXT_INSET}" height="30" sizingValue="fixed" overflowValue="fitFontSize"><TextStylePaint id="${column.textStyle.role}" fontAssetId="${id(901)}" fontSize="24" letterSpacing="2"><Fill><SolidColor colorValue="BFFFFFFF"/></Fill></TextStylePaint><TextValueRun name="${label} Role Value" styleId="${column.textStyle.role}" text="${talent.role}"><DataBindContext sourcePathIds="${pathTo(roleProperty(column.index))}" propertyKey="268"/></TextValueRun><TextModifierGroup name="${label} Role Rise" modifyOpacity="true" modifyTranslation="true" invertOpacity="true" opacity="0" y="14"><TextModifierRange name="${label} Role Reveal" id="${column.roleRevealId}" unitsValue="1" modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"/></TextModifierGroup></Text>
  <Shape name="${label} Role Glaze" x="${x}" y="0">
    ${rectangle(columnWidth, ROLE_HEIGHT, roleRadii)}
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="${ROLE_HEIGHT}"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="40000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="${ROLE_HEIGHT}"><GradientStop colorValue="59FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>
  <Shape name="${label} Role Body" x="${x}" y="0">
    ${rectangle(columnWidth, ROLE_HEIGHT, roleRadii)}
    <Fill><SolidColor colorValue="E00E1116"/></Fill>
  </Shape>`;
  });

  const silhouette = columns
    .map(({ x, nameRadii, roleRadii }) =>
      rectangle(columnWidth, NAME_HEIGHT, nameRadii, ` x="${x}" y="0"`) +
      rectangle(columnWidth, ROLE_HEIGHT, roleRadii, ` x="${x}" y="${NAME_HEIGHT + GAP}"`))
    .join('');

  // Identifiers of the block-level elements.
  const namePanelsId = id(10);
  const shadowId = id(20);
  const roleStripId = id(300);
  const roleContentId = id(310);
  const wipeMaskId = id(500);
  const wipeRectangleId = id(501);
  const leftEdgeId = id(502);
  const rightEdgeId = id(503);
  const sweepId = id(600);
  const silhouetteId = id(610);
  const roleMaskId = id(620);

  // --- timelines ------------------------------------------------------------------

  const hold = (objectId: string, propertyKey: number, value: number): Track =>
    ({ objectId, propertyKey, keys: [{ frame: 0, value }] });
  const rise = (objectId: string, start: number, end: number): Track[] => [
    { objectId, propertyKey: MODIFY_FROM, keys: [{ frame: 0, value: 0 }, { frame: start, value: 0, ease: EASE_OUT }, { frame: end, value: 1 }] },
    { objectId, propertyKey: FALLOFF_FROM, keys: [{ frame: 0, value: 0.4 }, { frame: start, value: 0.4, ease: EASE_OUT }, { frame: end, value: 1.4 }] },
  ];
  const settledText = (objectId: string): Track[] => [hold(objectId, MODIFY_FROM, 1), hold(objectId, FALLOFF_FROM, 1.4)];
  const edgeFlare: Key[] = [
    { frame: 0, value: 0, linear: true }, { frame: 2, value: 1, linear: true },
    { frame: 18, value: 1, ease: EASE_OUT }, { frame: 40, value: 0, linear: true },
  ];
  const edgeClosing: Key[] = [
    { frame: 0, value: 0, linear: true }, { frame: 6, value: 0, linear: true },
    { frame: 10, value: 0.45, linear: true }, { frame: 22, value: 0.45, linear: true }, { frame: 24, value: 0, linear: true },
  ];
  const stagger = (rank: number) => Math.round(rank * 6);

  const intro: Track[] = [
    hold(namePanelsId, OPACITY, 1),
    hold(roleStripId, OPACITY, 1),
    { objectId: wipeRectangleId, propertyKey: WIDTH, keys: [{ frame: 0, value: 0 }, { frame: 6, value: 0, ease: EASE_WIPE }, { frame: 40, value: wipeWidth }] },
    { objectId: leftEdgeId, propertyKey: X, keys: [{ frame: 0, value: centre }, { frame: 6, value: centre, ease: EASE_WIPE }, { frame: 40, value: -8 }] },
    { objectId: rightEdgeId, propertyKey: X, keys: [{ frame: 0, value: centre }, { frame: 6, value: centre, ease: EASE_WIPE }, { frame: 40, value: blockWidth + 8 }] },
    ...[leftEdgeId, rightEdgeId].flatMap((edge): Track[] => [
      { objectId: edge, propertyKey: SCALE_Y, keys: [{ frame: 0, value: 0, ease: EASE_OUT }, { frame: 12, value: 1 }] },
      { objectId: edge, propertyKey: OPACITY, keys: edgeFlare },
    ]),
    ...columns.flatMap((column): Track[] => {
      const delay = stagger(column.rank);
      return [
        { objectId: column.markerId, propertyKey: SCALE_Y, keys: [{ frame: 0, value: 0 }, { frame: 18 + delay, value: 0, ease: EASE_OUT }, { frame: 38 + delay, value: 1 }] },
        { objectId: column.contentId, propertyKey: X, keys: [{ frame: 0, value: -column.side * CONTENT_DRIFT }, { frame: 8, value: -column.side * CONTENT_DRIFT, ease: EASE_OUT }, { frame: 44, value: 0 }] },
        ...rise(column.nameRevealId, 14 + delay, 36 + delay),
        ...rise(column.roleRevealId, 28 + delay, 46 + delay),
      ];
    }),
    { objectId: roleContentId, propertyKey: Y, keys: [{ frame: 0, value: -ROLE_HEIGHT }, { frame: 22, value: -ROLE_HEIGHT, ease: EASE_OUT }, { frame: 46, value: 0 }] },
    { objectId: shadowId, propertyKey: OPACITY, keys: [{ frame: 0, value: 0 }, { frame: 24, value: 0, ease: EASE_OUT }, { frame: 50, value: 0.6 }] },
    { objectId: sweepId, propertyKey: X, keys: [{ frame: 0, value: -120 }, { frame: 34, value: -120, ease: EASE_SWEEP }, { frame: 72, value: sweepEnd }] },
    {
      objectId: sweepId, propertyKey: OPACITY, keys: [
        { frame: 0, value: 0, linear: true }, { frame: 34, value: 0, linear: true }, { frame: 40, value: 0.65, linear: true },
        { frame: 62, value: 0.65, linear: true }, { frame: 72, value: 0, linear: true },
      ],
    },
  ];

  const settled: Track[] = [
    hold(namePanelsId, OPACITY, 1),
    hold(roleStripId, OPACITY, 1),
    hold(wipeRectangleId, WIDTH, wipeWidth),
    hold(leftEdgeId, X, -8),
    hold(rightEdgeId, X, blockWidth + 8),
    ...[leftEdgeId, rightEdgeId].flatMap((edge) => [hold(edge, SCALE_Y, 1), hold(edge, OPACITY, 0)]),
    ...columns.flatMap((column) => [
      hold(column.markerId, SCALE_Y, 1),
      hold(column.contentId, X, 0),
      ...settledText(column.nameRevealId),
      ...settledText(column.roleRevealId),
    ]),
    hold(roleContentId, Y, 0),
    hold(shadowId, OPACITY, 0.6),
    hold(sweepId, X, sweepEnd),
    hold(sweepId, OPACITY, 0),
  ];

  const outro: Track[] = [
    { objectId: namePanelsId, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: 24, value: 0 }] },
    { objectId: roleStripId, propertyKey: OPACITY, keys: [{ frame: 0, value: 1 }, { frame: 24, value: 0 }] },
    { objectId: wipeRectangleId, propertyKey: WIDTH, keys: [{ frame: 0, value: wipeWidth }, { frame: 2, value: wipeWidth, ease: EASE_IN }, { frame: 24, value: 0 }] },
    { objectId: leftEdgeId, propertyKey: X, keys: [{ frame: 0, value: -8 }, { frame: 2, value: -8, ease: EASE_IN }, { frame: 24, value: centre }] },
    { objectId: rightEdgeId, propertyKey: X, keys: [{ frame: 0, value: blockWidth + 8 }, { frame: 2, value: blockWidth + 8, ease: EASE_IN }, { frame: 24, value: centre }] },
    ...[leftEdgeId, rightEdgeId].flatMap((edge): Track[] => [
      hold(edge, SCALE_Y, 1),
      { objectId: edge, propertyKey: OPACITY, keys: edgeClosing },
    ]),
    ...columns.flatMap((column): Track[] => [
      { objectId: column.markerId, propertyKey: SCALE_Y, keys: [{ frame: 0, value: 1 }, { frame: 8, value: 1, ease: EASE_IN }, { frame: 24, value: 0 }] },
      { objectId: column.contentId, propertyKey: X, keys: [{ frame: 0, value: 0, ease: EASE_IN }, { frame: 24, value: -column.side * 18 }] },
      ...settledText(column.nameRevealId),
      ...settledText(column.roleRevealId),
    ]),
    { objectId: roleContentId, propertyKey: Y, keys: [{ frame: 0, value: 0, ease: EASE_IN }, { frame: 18, value: -ROLE_HEIGHT }] },
    { objectId: shadowId, propertyKey: OPACITY, keys: [{ frame: 0, value: 0.6, ease: EASE_IN }, { frame: 20, value: 0 }] },
    hold(sweepId, X, sweepEnd),
    hold(sweepId, OPACITY, 0),
  ];

  const hidden: Track[] = [
    hold(namePanelsId, OPACITY, 0),
    hold(roleStripId, OPACITY, 0),
    hold(leftEdgeId, OPACITY, 0),
    hold(rightEdgeId, OPACITY, 0),
    hold(shadowId, OPACITY, 0),
    hold(sweepId, OPACITY, 0),
  ];

  const animation = (name: string, local: number, duration: number, loop: 'oneShot' | 'loop', tracks: Track[]) =>
    `<LinearAnimation name="${name}" id="${id(local)}" fps="60" duration="${duration}" loopValue="${loop}">\n${tracks.map(renderTrack).join('\n')}\n</LinearAnimation>`;

  const onAir = `<TransitionPropertyViewModelComparator><BindablePropertyBoolean><DataBindContext sourcePathIds="${pathTo(1002)}" propertyKey="634"/></BindablePropertyBoolean></TransitionPropertyViewModelComparator>`;
  const whenOnAir = (value: 'equal' | 'notEqual') =>
    `<TransitionViewModelCondition opValue="${value}">${onAir}<TransitionValueBooleanComparator value="true"/></TransitionViewModelCondition>`;

  const talentWord = count === 1 ? 'talent' : 'talents';
  const artboardName = `Basketball Talent Lower Third ${title} v2`;

  return `<Rive version="1" kind="fragment">
<!-- Generated by generate_talent_lower_thirds.ts; edit that file, not this one.
     Basketball talent lower third v2 (${count} ${talentWord}): dark glass blocks, ${blockWidth} x ${BLOCK_HEIGHT},
     centred at the bottom of a transparent 1920 x 1080 canvas (origin ${blockX}, ${BLOCK_Y}), on the
     scorebug's baseline. One block per talent, ${COLUMN_GAP} units apart: the name panel
     with a white marker strip, over the role strip. Neutral colours and no branding.
     Sibling draw order is front to back; within one shape the last paint declared is
     on top. -->
<Artboard name="${artboardName}" id="${id(2)}" x="0" y="${variant.artboardY}" width="1920" height="1080" viewModelId="${id(1000)}" viewModelInstanceId="${id(1001)}" defaultStateMachineId="${id(7)}" styleId="${id(5)}">
<LayoutComponentStyle name="Talent Lower Third ${title} v2 Style" id="${id(5)}"/>
<Fill><SolidColor colorValue="00000000"/></Fill>

<Node name="Lower Third" id="${id(3)}" x="${blockX}" y="${BLOCK_Y}">

<!-- Seam ignition: two edge lights split from the centre and lead the wipe outward. -->
<Node name="Left Leading Edge" id="${leftEdgeId}" x="-8" y="${BLOCK_HEIGHT / 2}" opacity="0">
  <Shape name="Left Edge Line" y="-${BLOCK_HEIGHT / 2}"><Rectangle width="2" height="${BLOCK_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
  <Shape name="Left Edge Glow" y="-${BLOCK_HEIGHT / 2}"><Rectangle width="44" height="${BLOCK_HEIGHT}" originX="0" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="44" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
</Node>
<Node name="Right Leading Edge" id="${rightEdgeId}" x="${blockWidth + 8}" y="${BLOCK_HEIGHT / 2}" opacity="0">
  <Shape name="Right Edge Line" y="-${BLOCK_HEIGHT / 2}"><Rectangle width="2" height="${BLOCK_HEIGHT}" originX="0.5" originY="0"/><Fill><SolidColor colorValue="E6FFFFFF"/></Fill></Shape>
  <Shape name="Right Edge Glow" y="-${BLOCK_HEIGHT / 2}"><Rectangle width="44" height="${BLOCK_HEIGHT}" originX="1" originY="0"/><Fill><LinearGradient startX="0" startY="0" endX="-44" endY="0"><GradientStop colorValue="30FFFFFF" position="0"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill></Shape>
</Node>
<Shape name="Glass Specular Sweep" id="${sweepId}" x="${sweepEnd}" y="${BLOCK_HEIGHT / 2}" rotation="0.3490659" opacity="0">
  <Rectangle width="110" height="340"/>
  <Fill><LinearGradient startX="-55" startY="0" endX="55" endY="0"><GradientStop colorValue="00FFFFFF" position="0"/><GradientStop colorValue="20FFFFFF" position="0.5"/><GradientStop colorValue="00FFFFFF" position="1"/></LinearGradient></Fill>
  <ClippingShape name="Sweep Silhouette Clip" sourceId="${silhouetteId}"/>
</Shape>

<!-- ============================== Name panels ============================== -->
<Node name="Name Panels" id="${namePanelsId}">
<ClippingShape name="Wipe Reveal Clip" sourceId="${wipeMaskId}"/>
${namePanels.join('\n')}
</Node>

<!-- ============================== Role strips ============================== -->
<Node name="Role Strips" id="${roleStripId}" x="0" y="${NAME_HEIGHT + GAP}">
<ClippingShape name="Role Reveal Clip" sourceId="${roleMaskId}"/>
<ClippingShape name="Role Wipe Clip" sourceId="${wipeMaskId}"/>
<Node name="Role Sliding Content" id="${roleContentId}">
${roleCells.join('\n')}
</Node>
</Node>

</Node>

<!-- Separation from bright video: a feathered dark stroke around the block. -->
<Node name="Lower Third Backing" x="${blockX}" y="${BLOCK_Y}">
<Shape name="Block Shadow" id="${shadowId}" x="0" y="4" opacity="0.6">
  ${columns.map(({ x }) => `<Rectangle x="${x}" y="0" width="${columnWidth}" height="${BLOCK_HEIGHT}" originX="0" originY="0" cornerRadiusTL="${OUTER_RADIUS}"/>`).join('')}
  <Stroke thickness="10"><SolidColor colorValue="99000000"/><Feather strength="18"/></Stroke>
</Shape>
<Shape name="Wipe Reveal Mask" id="${wipeMaskId}" x="${round(centre)}" y="-8"><Rectangle id="${wipeRectangleId}" width="${wipeWidth}" height="${BLOCK_HEIGHT + 16}" originX="0.5" originY="0"/></Shape>
<Shape name="Block Silhouette" id="${silhouetteId}">${silhouette}</Shape>
<Shape name="Role Reveal Mask" id="${roleMaskId}" x="0" y="${NAME_HEIGHT + GAP}"><Rectangle width="${blockWidth}" height="${ROLE_HEIGHT}" originX="0" originY="0"/></Shape>
</Node>

<!-- Intro: seam ignition, outward glass wipe, rising type and one sheen; 1.2 s.
     Hold and Outro explicitly restore every animated property for repeat takes. -->
${animation('Intro', 31, 72, 'oneShot', intro)}

${animation('Hold', 30, 1, 'loop', settled)}

${animation('Outro', 32, 24, 'oneShot', outro)}

${animation('Hidden', 33, 1, 'oneShot', hidden)}

<!-- isPlaying drives the graphic: true takes it on air (Intro then Hold), false
     dismisses it (Outro then Hidden). It defaults to false, so nothing shows
     until the host raises it. -->
<StateMachine name="Talent Lower Third" id="${id(7)}"><StateMachineLayer name="Display">
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

<FontAsset name="Talent Lower Third ${title} v2 Zuume Bold" id="${id(900)}" file="assets/fonts/Zuume-Bold.ttf"/>
<FontAsset name="Talent Lower Third ${title} v2 Zuume Regular" id="${id(901)}" file="assets/fonts/Zuume-Regular.ttf"/>

<ViewModel name="${viewModel}" id="${id(1000)}" defaultInstanceId="${id(1001)}">
<ViewModelPropertyBoolean name="isPlaying" id="${id(1002)}" componentProps="1"/>
${columns.map(({ index }) => `<ViewModelPropertyString name="talent${index + 1}Name" id="${id(nameProperty(index))}" componentProps="1"/>
<ViewModelPropertyString name="talent${index + 1}Role" id="${id(roleProperty(index))}" componentProps="1"/>`).join('\n')}
<ViewModelInstance name="Default" id="${id(1001)}" exports="true">
<ViewModelInstanceBoolean viewModelPropertyId="${id(1002)}" propertyValue="false"/>
${columns.map(({ index, talent }) => `<ViewModelInstanceString viewModelPropertyId="${id(nameProperty(index))}" propertyValue="${talent.name}"/>
<ViewModelInstanceString viewModelPropertyId="${id(roleProperty(index))}" propertyValue="${talent.role}"/>`).join('\n')}
</ViewModelInstance>
</ViewModel>
</Rive>
`;
};

for (const variant of VARIANTS) {
  const file = join(import.meta.dir, `talent_lower_third_${variant.suffix}.rml`);
  await Bun.write(file, renderVariant(variant));
  console.log(`wrote ${file}`);
}
