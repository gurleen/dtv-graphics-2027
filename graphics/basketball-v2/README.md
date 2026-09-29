# Basketball v2

Broadcast graphics for basketball, version 2. Every graphic in this package
follows the design language below. Do not copy layouts from `graphics/10_*`,
`graphics/11_*` or `graphics/legacy/`; they are references for data only.

**Building a new graphic?** Read [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) first:
exact colour and type values, the layout grid, the intro/outro frame recipe,
the id namespace registry (next free: 39), naming, and a five-step checklist
from scene to OGraf package. This README describes the finished graphics.

## Design language

A summary; `DESIGN_SYSTEM.md` has the values.

- **Material: tinted frosted glass.** Team panels use the team's primary colour
  at about 78% opacity over a dark underlay. A glaze shades each panel from
  clear at the top to about 30% black at the foot, and a hairline edge is lit
  from above (white at about 45% along the top, fading to a trace by 60% of
  the height). No white wash over the colour. Neutral panels use dark glass
  (`#0E1116` at about 82%). A feathered dark stroke behind the block gives it
  separation from bright video.
- **Typeface: Zuume.** `assets/fonts/Zuume-Bold.ttf` for acronyms, scores and
  the game clock; `assets/fonts/Zuume-Regular.ttf` for labels (period, `SHOT`,
  `BONUS`).
- **Corners:** 12 on the outer corners of a block, 3 on inner seams. Panels are
  separated by 4-unit gaps, not by rules.
- **Motion:** decisive and short, no overshoot. Intros run about 1.2 s but
  read by about 0.77 s: a light ignites at a seam, splits into leading edges
  that wipe the glass open, and text rises in letter by letter, with a strong
  ease-out (`0.16, 1, 0.3, 1`). Outros are 0.4 s with an ease-in
  (`0.7, 0, 0.84, 0`).
- **Alert colour:** `#E5322D`.

## Scorebug (`basketball_scorebug.rml`)

A stacked corner block at the bottom left of the 1920 x 1080 frame, inside the
action-safe margin (block origin 96, 890; size 430 x 132).

- **Team rows (234 x 64 each):** away on top, home below. Each row, left to
  right: a secondary-colour marker strip, the acronym over a large faded team
  logo cropped by the row, up to four timeout pips beneath the acronym, the `BONUS` tag, the possession chevron, and the
  score, right-aligned.
- **Clock panel (194 x 132, dark glass):** period over the game clock, the shot
  clock digits (no label) in their own sub-cell at the right, and a sponsor strip along the bottom.
- **Sponsor:** Independence Blue Cross, white wordmark directly on the dark
  glass. `assets/images/sponsors/independence_blue_cross.svg` is the source (the
  IBX "Live Fearless" lockup with the tagline removed); the `.png` beside it is
  the 1600-wide export the scene uses. Re-export with
  `rsvg-convert -w 1600 <svg> -o <png>` after editing the SVG.
- **Timeouts:** one pip per remaining timeout; a used pip fades to a faint ghost.
- **Shot clock:** the sub-cell turns red and pulses at 5 seconds or fewer.
- **Score change:** the row brightens briefly and the new score rolls up from
  below. Driven by `scorebug_controller.luau`, which also runs the shot-clock alert.
- **Intro (1.1 s, no overshoot):** a light ignites between the team rows and
  clock panel, then splits into leading edges that wipe the block open outward.
  Content drifts behind the edges, the faded logos settle from 112%, and scores,
  acronyms and clock text rise in letter by letter from the seam outward. The
  team markers draw upward/downward, a light traces the shot-clock cell, the
  sponsor rises into place, and one specular sweep finishes the glass. Everything
  reads by about 0.67 s.
- **Outro (0.4 s):** the markers retract and text sinks away while illuminated
  edges close both sides of the glass toward the seam. The logos gently enlarge
  and fade, the sponsor lowers away, and the shadow contracts with the panels.
  The joined seam light contracts to the centre and extinguishes last.
- **Motion maintenance:** Hold keys every animated property at its resting
  value. Intro and Outro explicitly key the same properties so replay resets
  the exit pose; Hidden also turns off the edge lights and sweep. Keep
  the OGraf definition and manifest intro durations in sync with the timeline.
- **On air:** `isPlaying` true plays Intro then Hold; false plays Outro then
  Hidden. It defaults to false.

View model `BasketballScorebugV2`, public properties: `isPlaying`,
`awayAcronym`/`homeAcronym`, `awayScore`/`homeScore`, `awayLogo`/`homeLogo`,
`awayPrimaryColor`/`homePrimaryColor`, `awaySecondaryColor`/`homeSecondaryColor`,
`awayTimeouts`/`homeTimeouts` (0 to 4), `awayBonus`/`homeBonus`,
`awayPossession`/`homePossession`, `period`, `clock`, `shotClock` (string; blank
hides nothing, a number at 5 or less raises the alert), `sponsorLogo`.
Properties prefixed `_` are internal and written by the script.

## Player lower third (`player_lower_third.rml`)

A tinted-glass block centred at the bottom of the 1920 x 1080 frame, on the
scorebug's baseline and height so the two can be on air together (block origin
550, 890; size 820 x 132; 24 units clear of the scorebug).

- **Headshot panel (140 x 132, team tint):** a secondary-colour marker strip on
  the left edge and the headshot, cropped by the panel. The image covers the
  panel at any size and aligns to its top, so any head-and-shoulders crop
  works; a transparent background lets the team tint show through.
  `assets/images/headshots/placeholder.png` is the neutral silhouette used until
  a real headshot is bound (re-export from the `.svg` beside it with
  `rsvg-convert -w 600 <svg> -o <png>`).
- **Name panel (676 x 84, team tint):** `#` and the jersey number, first name
  (Zuume Regular) over last name (Zuume Bold), and position over class,
  right-aligned, over a large faded team logo cropped by the panel. The names
  shrink to fit a 340-unit column.
- **Stat strip (676 x 44, dark glass):** a muted label (`TONIGHT`, `SEASON`)
  followed by the stat line; the whole line shrinks to fit.
- **Intro (1.2 s):** a light ignites at the headshot/name seam and splits into
  outward wipes. The headshot and name content drift behind the edges, the
  faded logo settles from 112%, and text rises in letter by letter. The stat
  strip slides down from under the name panel; one sheen finishes the glass.
  Everything reads by about 0.77 s. The 0.4 s outro retracts the stat strip
  and closes the panels toward the seam with a brief edge light.
- **Motion maintenance:** Hold and Outro key every intro property at its
  resting value. Hidden turns off the panels, shadow, edge lights and sheen.
  Keep OGraf action durations in sync with the timelines.
- **On air:** `isPlaying`, as on the scorebug.

Text is shown as entered; Rive has no case transform, so send names in capitals.

View model `BasketballPlayerLowerThirdV2`, public properties: `isPlaying`,
`firstName`, `lastName`, `jerseyNumber` (string), `position`, `classYear`,
`statLabel`, `statLine`, `headshot`, `teamLogo`, `teamPrimaryColor`,
`teamSecondaryColor`.

## Staff lower third (`staff_lower_third.rml`)

The player lower third's counterpart for non-players: coaching staff,
administrators and other team personnel. A tinted-glass block centred at the
bottom of the 1920 x 1080 frame, on the scorebug's baseline and height (block
origin 610, 890; size 700 x 132; 84 units clear of the scorebug).

- **Logo panel (132 x 132, team tint):** a secondary-colour marker strip on the
  left edge and the full-colour team logo over a soft white bloom, as on the
  matchup locator. The logo box is 118 units square (the 1024 source at 0.115),
  so a logo draws at about 84.
- **Name panel (564 x 84, team tint):** first and last name on one line at 54,
  the first name in Zuume Regular (slightly muted) and the last name in Zuume
  Bold. The line shrinks to fit a 516-unit column.
- **Title strip (564 x 44, dark glass):** the title (`HEAD COACH`, Zuume Bold,
  white) followed by a muted detail (`8TH SEASON`, Zuume Regular); the whole
  line shrinks to fit. A blank detail leaves the title alone.
- **Intro (1.2 s):** the player lower third's build. A light ignites at the
  logo/name seam and splits into outward wipes; the logo settles from 112% as
  its bloom spreads, the name drifts behind the edge, the marker draws down, the
  title strip slides down from under the name panel, text rises in letter by
  letter, and one sheen finishes the glass. Everything reads by about 0.77 s.
  The 0.4 s outro retracts the strip and marker, enlarges and fades the logo,
  and closes the panels toward the seam with a brief edge light.
- **Motion maintenance:** Hold and Outro key every intro property at its
  resting value. Hidden turns off the panels, shadow, edge lights and sheen.
  Keep OGraf action durations in sync with the timelines.
- **On air:** `isPlaying`, as on the scorebug.

View model `BasketballStaffLowerThirdV2`, public properties: `isPlaying`,
`firstName`, `lastName`, `title`, `detail`, `teamLogo`, `teamPrimaryColor`,
`teamSecondaryColor`. Send text in capitals.

## Matchup locator (`matchup_locator.rml`)

A card centred on the 1920 x 1080 frame (card origin 360, 260; size
1200 x 560), for mid-screen use such as a wide shot before tip-off. It is a
standalone graphic and is not designed to share the screen with the scorebug.
The card departs from the package corners: 24 on the outer corners, 6 on inner
seams.

- **Team halves (598 x 466 each, team tint):** away on the left, home on the
  right, 4 units apart. Each has a 6-unit secondary-colour stripe along its top
  edge (clipped by the half, so it follows the rounded corner) with a 1-unit
  white hairline under it so a near-black secondary still reads, then a centred
  stack: the full-colour logo over a soft white radial bloom, the school name
  (Zuume Bold 84, shrinks to fit a 518-unit column) and the record line. The
  logo box is 340 units square (the 1024 source at 0.332); logos fill about 70%
  of their padded source, so they draw at about 240.
- **Record line:** the overall record (Zuume Bold) then ` · ` and the conference
  record (Zuume Regular, muted). A blank conference record also hides the
  separator; `record_separator.luau` is the converter that does this.
- **VS medallion (124 round, dark glass)** on the seam, level with the logos,
  with a feathered shadow ring.
- **Venue strip (1200 x 90, dark glass):** venue name, ` · `, and the location on
  the left; `PRESENTED BY` and the sponsor logo (the scorebug's Independence
  Blue Cross export) on the right.
- **Intro (1.43 s, no overshoot):** a light ignites on the seam and splits into
  two leading edges that wipe the halves open outward, each team stripe drawing
  just ahead of its edge. The content drifts outward behind the edges, the logos
  settle from 112% as their blooms spread, and the names and records rise in
  letter by letter from the seam out (text modifier ranges). The medallion
  settles from 72% while a ring draws round it from twelve o'clock and fades,
  the venue strip slides down from under the halves, and one specular sweep
  crosses the glass to finish. Everything reads by about 0.77 s. The outro is
  unchanged and reverses the build in 0.4 s.
- **Intro maintenance:** the reveal masks, edge lights, ring and sweep are
  invisible at rest. Hold and Outro key every property the intro animates at its
  resting value, so a new intro key needs a matching Hold and Outro key.
- **On air:** `isPlaying`, as on the scorebug.

View model `BasketballMatchupLocatorV2`, public properties: `isPlaying`,
`awaySchool`/`homeSchool`, `awayOverallRecord`/`homeOverallRecord`,
`awayConferenceRecord`/`homeConferenceRecord` (e.g. `6-3 CAA`; blank hides it),
`awayLogo`/`homeLogo`, `awayPrimaryColor`/`homePrimaryColor`,
`awaySecondaryColor`/`homeSecondaryColor`, `venueName` (default
`DASKALAKIS ATHLETIC CENTER`), `venueLocation` (default `PHILADELPHIA, PA`),
`sponsorLogo`.

## Talent lower thirds (`talent_lower_third_{single,double,triple}.rml`)

Name and role identification for one, two or three on-air talents. Neutral
throughout: dark glass only, a white accent, no team colour, logo or sponsor.
One dark glass block per talent, 24 units apart, centred as a group at the bottom of the 1920 x 1080 frame, on the
scorebug's baseline and height (origin y 890; 132 high).

| Variant | Column width | Block | Origin x |
|---|---|---|---|
| Single | 560 | 560 | 680 |
| Double | 460 | 944 | 488 |
| Triple | 400 | 1248 | 336 |

Only the single variant clears the scorebug; the double and triple overlap it
and are meant for shots without it (pregame, halftime, the desk).

- **Generated.** The three `.rml` files are written by
  `generate_talent_lower_thirds.ts` from one description, so they cannot drift
  apart. Edit the generator, then run
  `bun graphics/basketball-v2/generate_talent_lower_thirds.ts`; never edit the
  `.rml` output by hand.
- **Blocks (one per talent, 24 units apart):** a name panel (84 high, dark glass
  at 82%) with a 6-unit white marker strip on its left edge and the name in
  Zuume Bold 52, over a role strip (44 high, dark glass at 88%) with the role in
  muted Zuume Regular 24. Both lines shrink to fit the column less a 26-unit
  inset each side. Each block takes the outer corners (12); the name/role seam is 3.
- **Intro (1.2 s):** a light ignites at the centre of the block and splits into
  two leading edges that wipe all the blocks open outward. Each block's name
  drifts outward behind the edges, the markers draw in, the role strip slides
  down from under the name panels, and text rises in letter by letter from the
  centre column out. The shadow fades in once the wipe is mostly open, and one
  sheen finishes the glass. Everything reads by about 0.87 s.
- **Outro (0.4 s):** the role strip retracts, the markers retract, and the edges
  close the blocks toward the centre with a brief edge light.
- **Motion maintenance:** the generator keys Hold and Outro from the same
  property list as the Intro; Hidden turns off both panel groups, the edge
  lights, shadow and sheen. Keep the OGraf durations in sync with the timelines.
- **On air:** `isPlaying`, as on the scorebug.

View models `BasketballTalentLowerThirdSingleV2`, `…DoubleV2` and
`…TripleV2`; public properties `isPlaying` and `talentNName`/`talentNRole` for
N = 1 up to the talent count, numbered left to right. Send text in capitals.

## Starting five lower third (`starting_five_lower_third.rml`)

One team's starting lineup, presented by Independence Blue Cross, on the
scorebug's baseline and height so the two can be on air together (block origin
550, 890; size 1274 x 132; 24 units clear of the scorebug, as the player lower
third). A two-step OGraf graphic: step 0 shows the away team, step 1 the home
team, and advancing on air changes team without taking the glass down.

- **Generated.** `generate_starting_five_lower_third.ts` writes the `.rml` from
  one description of the header, five columns and both teams. Edit the
  generator, then run
  `bun graphics/basketball-v2/generate_starting_five_lower_third.ts`; never edit
  the `.rml` output by hand.
- **Header (304 wide, team tint):** a secondary-colour marker on the left edge,
  the team logo over a soft white bloom, the school (Zuume Bold 40, shrinks to
  fit) over `STARTING FIVE` (muted Regular 24). Below it, a dark glass strip
  carries `PRESENTED BY` and the sponsor logo.
- **Player columns (five, 190 wide, 4 apart):** a team-tinted panel with the
  jersey number (Bold 60, a small Regular `#`) on the left and the headshot
  cropped to the right 106 units, over a dark glass strip with the last name
  (Bold 28, shrinks to fit) and the short position (Regular 24, `G`/`F`/`C`).
  A missing headshot shows the embedded placeholder.
- **Intro (1.4 s) and outro (0.4 s):** the player lower third's build. A light
  ignites at the header/players seam and splits into outward wipes, the strips
  slide down from under the panels, text rises in letter by letter column by
  column, and one sheen finishes the glass. The outro retracts the strips and
  closes the panels toward the seam.
- **Team change (1.0 s):** the glass stays up. Column by column, 4 frames
  apart, the outgoing content sinks and fades, the tints crossfade to the other
  team's primary colour, the incoming number, headshot, name and position rise
  in, the marker and logo swap, and one sweep crosses the block. Off air, a
  step change snaps with no animation, so the intro always builds the team
  being played.
- **State machine:** two layers. Display (Hidden → Intro → Hold → Outro) follows
  `isPlaying`; Team (Away Shown, Home Shown and the two changes) follows `step`
  and only animates while `isPlaying` is true. Keep the OGraf durations
  (`introDuration`, `outroDuration`, `steps.transitionDuration`) in sync with
  the timelines.

View model `BasketballStartingFiveLowerThirdV2`, public properties:
`isPlaying`, `step` (0 away, 1 home), `sponsorLogo`, and for each of `away` and
`home`: `{team}School`, `{team}Logo`, `{team}PrimaryColor`,
`{team}SecondaryColor`, and `{team}PlayerNNumber`, `{team}PlayerNLastName`,
`{team}PlayerNPosition`, `{team}PlayerNHeadshot` for N = 1 to 5, numbered left
to right. Send text in capitals. To review a team change frame by frame:
`bun scripts/render_frames.ts graphics/basketball-v2/starting_five_lower_third.rml --on-air --data=step=1 --frames=0-60:4 --out=build/frames/starting_five/change --sheet=5`.

## Player to Watch lower third (`player_to_watch_lower_third.rml`)

A pre-game feature for one player, presented by Belfor: either up to four
stats or a line or two of copy. Block origin 260, 802; size 1400 x 220,
standing on the scorebug's baseline (y 1022). **It overlaps the scorebug, so it
is for pre-game only; never put the two on air together.**

- **Generated.** `generate_player_to_watch_lower_third.ts` writes the `.rml`.
  Edit the generator, then run
  `bun graphics/basketball-v2/generate_player_to_watch_lower_third.ts`; never
  edit the `.rml` output by hand.
- **Headshot (220 wide, team tint):** a transparent cutout in a 212 x 304 frame
  whose top 84 units rise above the block, so the head breaks out over the
  header. A secondary-colour marker runs down the left edge.
- **Header (44 high, dark glass):** `PLAYER TO WATCH`, then the optional
  context tag (for example `2026-27 SEASON`) after a secondary-colour `/`; a
  blank tag hides the separator. `PRESENTED BY` and the full-colour sponsor logo
  on a white chip sit at the right.
- **Name row (84 high, team tint):** the jersey number, first name over last
  name (shrinks to fit), and position over class year at the right, over a
  faded team logo.
- **Body row (84 high, dark glass):** `bodyMode` `STATS` shows up to four stat
  cells, value over label; a blank value hides its cell and the rest share the
  row evenly. `TEXT` shows `bodyText` (Bold 32, two lines, longer copy shrinks
  to fit). Changing either on air crossfades or re-spaces smoothly.
- **Controller script.** `player_to_watch_controller.luau` counts the shown
  stats and writes each cell's x, width and opacity, the two body opacities and
  the context separator into `_`-prefixed view model properties the scene
  binds. Those properties are internal; never send them.
- **Intro (1.4 s) and outro (0.4 s):** the player lower third's build, with the
  light igniting at the headshot/column seam. The headshot rises 16 units and
  fades in as its wipe opens; the stat cells slide down from under the name row
  4 frames apart.

View model `BasketballPlayerToWatchLowerThirdV2`, public properties:
`isPlaying`, `bodyMode` (`STATS` or `TEXT`), `firstName`, `lastName`,
`jerseyNumber`, `position`, `classYear`, `contextLabel`, `statNValue` and
`statNLabel` for N = 1 to 4, `bodyText`, `headshot`, `teamLogo`,
`teamPrimaryColor`, `teamSecondaryColor`, `sponsorLogo`. Send text in capitals.

**Motion headshot.** The OGraf package also takes `headshotMediaUrl`: an MP4,
WebM or animated GIF played muted and looping in place of the still. The Rive
runtime draws no video, so the package lays a web element over the canvas,
exactly on the headshot frame, animates it in step with the intro and outro,
and hides the still (`_headshotOpacity`) while it plays. Media that fails to
load within 5 s falls back to the still. Rive screenshots, `render_frames.ts`
and the package thumbnail never show it; test it in `bun run ograf:harness`.
Send an empty string to go back to the still: omitting the key leaves the media
unchanged. Crop motion media to 212:304 (portrait); it is scaled to cover the
frame and anchored at the top.

**Sponsor asset.** `assets/images/sponsors/belfor.png` is the source;
`belfor_trimmed.png` beside it is the 1600-wide export the scene uses, with the
transparent margin cropped. Re-export with
`ffmpeg -i belfor.png -vf "crop=7501:2508:251:246,scale=1600:-1:flags=lanczos" -pix_fmt rgba belfor_trimmed.png`.

Build the OGraf package with
`bun run ograf:build:basketball-v2-player-to-watch-lower-third`.

## Test data

When testing any graphic in this package, always use the **Drexel Dragons as
the home team**. The away team can vary as needed for the design and test case.

## Reuse existing team data and logos

Use the existing basketball team data and logo conventions instead of creating
a parallel team catalog:

- `preview/src/teams.json` is the vendored team dataset.
- `preview/src/teams.ts` maps its fields to the app's team model, defines the
  logo URL convention (`https://images.dragonstv.io/logos/<logo_name>`), and
  exports `DREXEL_ID` (`2182`). Teams without a `logo_name` have no logo URL.
- `assets/images/scorebug/` contains local scorebug logo assets, including
  `drexel.png`.
- Existing Rive graphics show how local team logos are declared as
  `ImageAsset`s. See `graphics/10_ncaa_basketball_scorebug/` and
  `graphics/11_ncaa_basketball_locator/`.

For local Rive graphics, prefer the existing local logo assets and follow the
asset declaration pattern in the relevant existing graphic. For data-driven
team selection in a preview or companion UI, reuse `preview/src/teams.ts` and
`preview/src/teams.json`.
