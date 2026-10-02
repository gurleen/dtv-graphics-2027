# Basketball v2 design system

The reference for building a new graphic in this package. `README.md` describes
each finished graphic; this file holds the values and conventions they share.
Every value below is taken from the shipped scenes. When a scene and this file
disagree, the scene is right and this file needs correcting.

The quickest start for a new graphic is to copy the closest existing scene and
renumber it (see [Building a new graphic](#building-a-new-graphic)):

| New graphic resembles | Copy |
|---|---|
| A team-themed lower third with a logo | `staff_lower_third.rml` |
| A team-themed lower third with a photo | `player_lower_third.rml` |
| A team-themed lower third with stats or copy | `generate_team_lower_third.ts` output |
| A neutral (no team) lower third | `generate_talent_lower_thirds.ts` output |
| A full-width pre-game lower third with both teams | `generate_matchup_locator_lower_third.ts` output |
| A mid-screen card | `matchup_locator.rml` |
| A mid-screen table comparing the teams | `generate_halftime_statistics.ts` output |
| A full-frame table of the conference's teams | `generate_conference_standings.ts` output |
| A persistent corner bug | `basketball_scorebug.rml` |

## Colour and material

Colours are written `AARRGGBB` in RML.

| Token | Value | Use |
|---|---|---|
| Team tint | team primary, shape opacity 0.78 | Team panels |
| Underlay | `59000000` | Beneath every team tint, so the colour sits on dark |
| Dark glass | `D10E1116` (82%) | Neutral panels: strips, clock cell, talent name panels |
| Dark glass, dense | `E00E1116` (88%) | Talent role strips |
| Glaze fill | linear `00000000` → `4D000000`, top to bottom | Over every panel |
| Hairline stroke | linear `73FFFFFF` at 0 → `0FFFFFFF` at 0.6, thickness 1 | The glaze's stroke; light from above |
| Block shadow | stroke `99000000`, thickness 10, feather 18, shape opacity 0.6, offset y 4 | Behind the whole block |
| Marker | team secondary, 8 wide (6 on neutral graphics, white) | Left edge of the first panel |
| Alert | `FFE5322D` | Shot clock at 5 or fewer |
| Default team | primary `FF07294D`, secondary `FFFFC600` | Drexel; view model defaults |

Text colours are white at stepped alphas:

| Alpha | Value | Use |
|---|---|---|
| 100% | `FFFFFFFF` | Primary values: last names, scores, titles |
| 85% | `D9FFFFFF` | A Regular first name beside or above a Bold last name |
| 75% | `BFFFFFFF` | Talent roles |
| 70% | `B3FFFFFF` | Secondary labels (player class, locator conference record) |
| 65% | `A6FFFFFF` | Muted detail after a value (`TONIGHT`, `11TH SEASON`) |
| 60% | `99FFFFFF` | The least emphasis (the `#` before a jersey number) |

### The glass panel stack

Every panel is the same four layers. In RML the **first child draws on top**,
so the stack is written top to bottom: content, glaze, tint, underlay. A
neutral panel replaces tint and underlay with one dark-glass fill.

```xml
<Node name="Name Panel" id="NN:200" x="136" y="0">
  <ClippingShape name="Name Reveal Clip" sourceId="NN:506"/>
  <Node name="Name Content" id="NN:210"><!-- text, logos --></Node>
  <Shape name="Name Glaze">
    <Rectangle width="564" height="84" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="3" cornerRadiusTR="12" cornerRadiusBL="3" cornerRadiusBR="3"/>
    <Fill><LinearGradient startX="0" startY="0" endX="0" endY="84"><GradientStop colorValue="00000000" position="0"/><GradientStop colorValue="4D000000" position="1"/></LinearGradient></Fill>
    <Stroke thickness="1"><LinearGradient startX="0" startY="0" endX="0" endY="84"><GradientStop colorValue="73FFFFFF" position="0"/><GradientStop colorValue="0FFFFFFF" position="0.6"/></LinearGradient></Stroke>
  </Shape>
  <Shape name="Name Tint" id="NN:230" opacity="0.78">
    <Rectangle width="564" height="84" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="3" cornerRadiusTR="12" cornerRadiusBL="3" cornerRadiusBR="3"/>
    <Fill><SolidColor colorValue="FF07294D"><DataBindContext sourcePathIds="NN:1000-NN:1022" propertyKey="37"/></SolidColor></Fill>
  </Shape>
  <Shape name="Name Underlay">
    <Rectangle width="564" height="84" originX="0" originY="0" linkCornerRadius="false" cornerRadiusTL="3" cornerRadiusTR="12" cornerRadiusBL="3" cornerRadiusBR="3"/>
    <Fill><SolidColor colorValue="59000000"/></Fill>
  </Shape>
</Node>
```

A faded team logo behind text, or a white radial bloom behind a full-colour
logo, sits inside the content node and is clipped by the tint shape. A
full-colour logo larger than its panel, cropped at the panel's outer edge (the
matchup locator lower third), takes its own node between the content and the
glaze, also clipped by the tint shape, so it moves independently of the text.

### Tables

A table's cells share one panel. Glass on every cell reads as a grid of
separate blocks, which is too loud; divide the table with hairlines and tone
instead. From the halftime card and the standings card:

| Part | Value | Use |
|---|---|---|
| Panel | one dark-glass stack the size of the table | Under every cell |
| Row hairline | `1FFFFFFF`, 1 high on a whole unit, full width, in each 4-unit gap | Divides the rows; draws over highlighted cells |
| Label band | `0AFFFFFF`, from the first hairline to the last | Sets off the label column. It lifts the glass: a darker band is lost over dark video |
| Highlighted cell | team tint, square, out to the hairlines, with the glaze fill in the same shape | The leader mark; the only cell with a fill of its own. On the standings card, a whole row: the night's teams |
| Logo shade | radial `73000000` → `2E000000` at 0.45 → clear, an ellipse 120 across scaled to the row's height, over the tint | Behind a logo on a highlighted row, so a logo on its own colour still reads (Campbell's orange camel on Campbell orange). A white bloom does not do this |

## Typography

Zuume only: `assets/fonts/Zuume-Bold.ttf` and `assets/fonts/Zuume-Regular.ttf`,
declared once per scene as `NN:900` (Bold) and `NN:901` (Regular). Bold carries
the value; Regular carries labels and muted detail. Regular labels take
letter spacing 2; Bold values take 0.5 (1 for short strip values).

| Role | Face | Size | Seen in |
|---|---|---|---|
| Card headline | Bold | 84 | Locator school names, halftime mascots and scores |
| Jersey number | Bold | 68 | Player lower third |
| Scorebug score | Bold | 60 | Scorebug, starting five jersey numbers |
| One-line name, 84 panel | Bold (Regular for a first name) | 52–54 | Staff, talent |
| Two-line name, 84 panel | Regular over Bold | 24 / 50 | Player lower third |
| Card secondary | Bold / Regular | 40–42 / 34 | Locator records, venue |
| Card table value | Bold / Regular | 44 / 30 | Halftime statistic and its detail |
| Strip value, 44 strip | Bold | 28 | Title, stat line |
| Strip label, 44 strip | Regular | 22–24 | `TONIGHT`, roles, detail |

Text rules:

- Set `originValue="baseline"`. In an 84 panel a one-line name sits on
  baseline y 60; in a 44 strip the line sits on baseline y 31–32.
- Any line that takes live data gets `wrapValue="noWrap"`,
  `sizingValue="fixed"`, a `width`, and `overflowValue="fitFontSize"`, so a
  long value shrinks instead of spilling. Alignment also needs the fixed width.
- Mixed weights on one line are separate `TextValueRun`s in one `Text`, each
  with its own `TextStylePaint`; a gap is a run of spaces.
- Rive has no case transform. Defaults are in capitals, and operators send
  capitals.

## Geometry

The frame is 1920 × 1080. Lower thirds share the scorebug's baseline so they
can be on air together.

| Measure | Value |
|---|---|
| Action-safe margin | 96 |
| Lower-third block origin y | 890 |
| Lower-third block height | 132 = 84 panel + 4 gap + 44 strip |
| Centred origin x | 960 − width / 2 |
| Gap between panels | 4 (no rules or dividers; a table's rows take hairlines, see [Tables](#tables)) |
| Gap between blocks | 24 (talent blocks; also the minimum clearance from the scorebug, whose right edge is x 526) |
| Outer corner radius | 12 (24 on the locator and halftime cards) |
| Inner seam radius | 3 (6 on the locator and halftime cards) |
| Text inset from panel edge | 20–26 |
| Square logo panel | 132 × 132 (logo box 118, `Image` scale 0.115 of a 1024 source) |

A centred block up to 820 wide keeps 24 clear of the scorebug; one wider than
868 overlaps it. Say so in the README if it does, as the talent double and
triple do.

`Image` anchors at its centre; `Text` and `Shape` anchor at their origin
(top-left for rectangles with `originX="0" originY="0"`).

## Motion

60 fps throughout. The scene has four animations and a state machine with one
layer. Durations in frames:

| Animation | Frames | Seconds | Loop |
|---|---|---|---|
| Intro | 72 (66 scorebug, 84 matchup lower third, 86 locator, 90 standings) | 1.2 | oneShot |
| Hold | 1 | — | loop |
| Outro | 24 | 0.4 | oneShot |
| Hidden | 1 | — | oneShot |

### Eases

In RML the `CubicEaseInterpolator` sits on the **starting** keyframe of the
segment it shapes.

| Name | Cubic | Use |
|---|---|---|
| Ease-out | `0.16, 1, 0.3, 1` | Almost everything in an intro |
| Ignition split | `0.6, 0, 0.1, 1` | Leading edges leaving the seam |
| Sweep | `0.4, 0, 0.6, 1` | The specular sheen crossing the glass |
| Ease-in | `0.7, 0, 0.84, 0` | Almost everything in an outro |

### Intro recipe (lower thirds)

Every lower third builds the same way; a new one should reuse these frames.

| Frames | What moves |
|---|---|
| 0–12 | Edge light at the seam grows (scaleY 0 → 1); its opacity is 1 by frame 2 |
| 6 → 36/40 | The leading edges (clip masks) leave the seam and wipe each panel open outward |
| 8–44 | Panel content drifts in behind the edge (x −22 → 0) |
| 8–48 | Logos settle from 112% |
| 12–42 | Block shadow fades in (0 → 0.6) |
| 18–38 | Marker draws (scaleY 0 → 1) |
| 18–40 | Edge light fades out |
| 18–46 | Text rises in letter by letter (text modifier range; 20–44 on the name) |
| 22–46 | The strip slides down from under the panel above (y −44 → 0) |
| 34–72 | One specular sheen crosses the glass (opacity up to 0.65) |

Everything reads by about frame 46 (0.77 s); the rest is finish.

The letter-by-letter rise is a `TextModifierGroup` (opacity 0, y 14,
`invertOpacity="true"`) with one `TextModifierRange` (`unitsValue="1"`,
`modifyFrom="1" modifyTo="2" falloffFrom="1.4" falloffTo="2"` at rest). The
Intro keys `modifyFrom` 0 → 1 and `falloffFrom` 0.4 → 1.4, which sweeps the
reveal across the line. Copy it from any lower third.

That start suits text that waits behind a leading edge, which hides the first
frames. Text that waits on open glass, like the standings rows rising after
the wipe has passed them, must start with the ramp wholly before the line:
key `modifyFrom` −0.4 → 1 and `falloffFrom` 0 → 1.4. From 0 and 0.4, the
leading glyphs already show part risen before the line's turn.

To build a line from its last glyph instead, run the range backward: at rest
`modifyFrom="-1" modifyTo="0" falloffFrom="-1" falloffTo="-0.4"`, and the Intro
keys `modifyTo` 1.4 → 0 and `falloffTo` 1 → −0.4. Hold and Outro key the pair
the Intro moves, at those rest values. The matchup locator lower third does
this on the away side, so both teams' text rises from the seam outward.

### Outro recipe

24 frames, ease-in: the strip retracts by frame 18, the marker retracts, logos
enlarge slightly and fade, the edges close toward the seam, the edge lights
flash to 0.45 during frames 6–22, and the shadow is gone by frame 20. The last
frame is fully transparent.

### State machine

The same shape in every scene, gated on the boolean `isPlaying`:

```
Entry → Hidden
Hidden → Intro        when isPlaying == true
Intro  → Hold         at exit time 100%
Intro  → Outro        when isPlaying != true
Hold   → Outro        when isPlaying != true
Outro  → Hidden       at exit time 100%
```

Intro and Outro set `reset="true"`. All transitions have duration 0.

### Keying rules

These keep a second take identical to the first:

1. Hold keys every property the Intro animates, at its resting value.
2. Outro keys the same properties at frame 0, so it starts from the rest pose
   even when it interrupts an Intro.
3. Hidden sets the panels, edge lights, shadow and sheen to opacity 0.
4. A new Intro key therefore needs a matching Hold key and Outro key.
5. The OGraf `definition.ts` durations and the manifest `actionDurations` equal
   the Intro and Outro lengths (72 frames = 1200 ms, 24 = 400 ms).

## Identifiers

All `.rml` files in the repository compile as one document, so every `id` is
global. Each scene owns one namespace `NN:` and uses the same local numbers
for the same roles.

| Id | Role |
|---|---|
| `NN:2` | Artboard |
| `NN:5` | `LayoutComponentStyle` |
| `NN:7` | State machine |
| `NN:10` | The block's root node |
| `NN:20` | Block shadow |
| `NN:30` / `31` / `32` / `33` | Hold / Intro / Outro / Hidden animations |
| `NN:40` / `41` / `42` / `43` | Hold / Intro / Outro / Hidden states |
| `NN:100`, `200`, `300` | First, second, third panel (children numbered within the hundred) |
| `NN:500`–`599` | Leading edges, reveal masks, edge lights |
| `NN:600`–`699` | Sheen, silhouette clip, other masks |
| `NN:900` / `901` | Zuume Bold / Regular |
| `NN:910`+ | Image assets |
| `NN:1000` / `1001` | View model / default instance |
| `NN:1002` | `isPlaying` |
| `NN:1010`+ | Text properties; `NN:1020`+ assets and colours |

Namespaces in use:

| Namespace | Scene | Artboard y |
|---|---|---|
| 0, 1, 3, 8, 9, 19, 20, 21 | Legacy and ported graphics | — |
| 30 | Scorebug | 2600 |
| 31 | Player lower third | 3800 |
| 32 | Matchup locator | 5000 |
| 33 / 34 / 35 | Talent single / double / triple | 6200 / 7400 / 8600 |
| 36 | Staff lower third | 9800 |
| 37 | Starting five lower third | 11000 |
| 38 | Player to Watch lower third | 12200 |
| 39 | Halftime statistics card | 13400 |
| 40 | Team lower third | 14600 |
| 41 | Conference standings card | 15800 |
| 42 | Matchup locator lower third | 17000 |
| 43 | Player of the Game lower third | 18200 |
| **44** | **Next free** | **19400** |

Artboards sit at x 0 and step 1200 in y. Update this table when you take a
namespace.

### Names

| Thing | Pattern | Example |
|---|---|---|
| Scene file | `snake_case.rml` | `staff_lower_third.rml` |
| Artboard | `Basketball <Name> v2` | `Basketball Staff Lower Third v2` |
| State machine | `<Name>` | `Staff Lower Third` |
| View model | `Basketball<Name>V2` | `BasketballStaffLowerThirdV2` |
| Asset names | `<Name> v2 <Asset>` | `Staff Lower Third v2 Zuume Bold` |
| View model properties | camelCase; team data as `teamLogo`, `teamPrimaryColor`, `teamSecondaryColor` (or `away…`/`home…`) | |
| OGraf directory | `ograf/graphics/basketball_v2_<name>/` | `basketball_v2_staff_lower_third` |
| OGraf id | `dtv-basketball-v2-<name>` | `dtv-basketball-v2-staff-lower-third` |

### Property keys

The numeric keys used in `KeyedProperty` and `DataBindContext`. Confirm any
other with `rive schema <Type>`.

| Key | Property |
|---|---|
| 13 / 14 | x / y |
| 15 | rotation |
| 16 / 17 | scaleX / scaleY |
| 18 | opacity |
| 37 | `SolidColor` colour (bind team colours here) |
| 268 | `TextValueRun` text |
| 206 | `Image` asset |
| 634 | Bindable boolean (state machine conditions) |
| 327 / 317 | `TextModifierRange` modifyFrom / falloffFrom |
| 336 / 318 | `TextModifierRange` modifyTo / falloffTo (a backward reveal) |
| 25 | `StraightVertex` y (a shadow outline that follows moving panels) |

## Building a new graphic

1. **Scene.** Copy the closest scene (table at the top) to a new
   `graphics/basketball-v2/<name>.rml`, replace its namespace with the next free
   one, set the artboard y, and rename per [Names](#names). Test data uses the
   Drexel Dragons as the home team.
2. **Verify.** From the repository root, after every edit:
   `rive . --verify` and `rive inspect . --summary`, then
   `rive . --artboard="<Artboard>" --data=isPlaying=true --advance=120 --screenshot=build/<name>.png`
   for the hold pose. Try long values and blank optional values with
   `--data=key=value`.
3. **Motion review.** Render the intro and outro and look at both sheets:
   ```sh
   bun scripts/render_frames.ts graphics/basketball-v2/<name>.rml --frames=0-72:6 --out=build/frames/<name>/intro --sheet=5
   bun scripts/render_frames.ts graphics/basketball-v2/<name>.rml --frames=0-30:3 --out=build/frames/<name>/outro --outro --sheet=6
   ```
   Add `--crop=w:h:x:y` to tile only the graphic. The last outro frame must be
   empty. For a multi-step graphic, `--on-air` starts in Hold, so
   `--on-air --data=step=1` renders the step change.
4. **Package.** Add the four files under `ograf/graphics/basketball_v2_<name>/`
   (see `ograf/README.md`; copy the staff lower third's), add an
   `ograf:build:basketball-v2-<name>` script to `package.json` and append it to
   `ograf:build:v2`, then `bun run ograf:build:basketball-v2-<name>` and check
   the load/play/update/stop cycle with `bun run ograf:harness`.
5. **Document.** Add a section to `README.md` (geometry, panels, intro/outro,
   view model properties), take the namespace in the table above, and mark the
   graphic in the tracker in `docs/GRAPHICS_PORTING.md` if it replaces one.
