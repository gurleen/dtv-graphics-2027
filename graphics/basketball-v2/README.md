# Basketball v2

Broadcast graphics for basketball, version 2. Every graphic in this package
follows the design language below. Do not copy layouts from `graphics/10_*`,
`graphics/11_*` or `graphics/legacy/`; they are references for data only.

**Building a new graphic?** Read [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) first:
exact colour and type values, the layout grid, the intro/outro frame recipe,
the id namespace registry (next free: 43), naming, and a five-step checklist
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
  white) followed by a muted detail (`11TH SEASON`, Zuume Regular); the whole
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

## Team lower third (`team_lower_third.rml`)

The staff lower third's build for a team as a whole: a school and mascot over
either up to four stats or one line of copy (for example a record, scoring
averages or a preseason poll position). Block origin 550, 890; size 820 x 132,
centred at the bottom of the frame on the scorebug's baseline and height, and
wide enough to clear it. No sponsor.

- **Generated.** `generate_team_lower_third.ts` writes the `.rml`. Edit the
  generator, then run `bun graphics/basketball-v2/generate_team_lower_third.ts`;
  never edit the `.rml` output by hand.
- **Logo panel (132 x 132, team tint):** the staff lower third's, with the
  secondary-colour marker and the team logo over a soft bloom.
- **Name panel (684 x 84, team tint):** `school` in Zuume Regular followed by
  `mascot` in Zuume Bold, on one line that shrinks to fit.
- **Body strip (684 x 44, dark glass):** `bodyMode` `STATS` shows up to four
  cells, each a Bold value, then a muted Regular label (`14-3 OVERALL`),
  centred, with a hairline divider between cells. A blank value hides its
  cell; the rest share the strip evenly. A blank label drops the gap. `TEXT`
  shows `bodyText` on one line (Bold 28, shrinks to fit; the strip is too short
  for two lines). Changing any of it on air re-spaces or crossfades smoothly.
- **Controller script.** `team_lower_third_controller.luau` counts the shown
  cells and writes each cell's x, width, opacity, divider and label gap, and the
  two body opacities, into `_`-prefixed view model properties the scene binds.
  Those properties are internal; never send them.
- **Intro (1.2 s) and outro (0.4 s):** the staff lower third's build. The strip
  slides down from under the name panel, and the stat cells rise in 3 frames
  apart. Hold and Outro key every intro property at its resting value.
- **On air:** `isPlaying`, as on the scorebug.

View model `BasketballTeamLowerThirdV2`, public properties: `isPlaying`,
`bodyMode` (`STATS` or `TEXT`), `school`, `mascot`, `bodyText`, `statNValue`
and `statNLabel` for N = 1 to 4, `teamLogo`, `teamPrimaryColor`,
`teamSecondaryColor`. Send text in capitals.

Build the OGraf package with
`bun run ograf:build:basketball-v2-team-lower-third`.

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

## Matchup locator lower third (`matchup_locator_lower_third.rml`)

The matchup locator recast as a wide pre-game banner, presented by Independence
Blue Cross. Block origin 96, 782; size 1728 x 240, spanning the action-safe
width and standing on the scorebug's baseline (y 1022). **It overlaps the
scorebug, so it is for pre-game only; never put the two on air together.**

- **Generated.** `generate_matchup_locator_lower_third.ts` writes the `.rml`.
  Edit the generator, then run
  `bun graphics/basketball-v2/generate_matchup_locator_lower_third.ts`; never
  edit the `.rml` output by hand.
- **Band (136 high):** the two team panels (792 wide, team tint) either side of
  the VS panel (136 wide, dark glass at 88%) on the block's centre. The away
  panel runs from the block's left end, the home panel to its right end.
- **Logos:** each sits at its panel's outer end, larger than the band: the 1024
  source at 0.44 (a mark of about 264 x 189), centred 62 units in from the
  outer edge. The panel's tint shape clips it, so the panel crops the logo at
  the outer edge, top and bottom. It sits over a soft white bloom, and a
  secondary-colour marker (8 wide) runs down the panel's outer edge over it.
- **Team text:** the school (Zuume Regular 60, 85% white) and the mascot
  (Bold 60) on one line, over the overall record (Bold 34) and the conference
  record (Regular 28, muted). The column starts 240 units in from the outer
  edge, clear of the logo. The away side is left-aligned and the home side
  right-aligned, so each team's text stands beside its logo. Both lines shrink
  to fit the 528-unit column.
- **Event title tab (440 x 44, dark glass):** centred above the VS panel, 4
  units clear of the band, with `eventTitle` in Bold 28 (shrinks to fit). A
  blank title fades the tab out; a title sent on air fades it back in.
- **Strip (1728 x 52, dark glass):** the venue name (Bold 30), ` · ` and the
  location (Regular 24, muted) at the left; `PRESENTED BY` and the sponsor logo
  (the scorebug's Independence Blue Cross export at 0.13, 26.5 high) at the
  right.
- **Blank values.** A blank mascot, conference record or venue location also
  removes its gap or dot. `matchup_locator_lower_third_controller.luau` writes
  those separators and the tab's opacity into `_`-prefixed view model
  properties the scene binds; those are internal, never send them. To clear a
  value on air, send an empty string: omitting the key leaves it unchanged.
- **Intro (1.4 s, 84 frames):** a light ignites at the VS panel and splits into
  two leading edges that wipe the band open outward (frames 6–40). Each side's
  text drifts in behind its edge and rises in letter by letter from the seam
  outward, so the away lines build from their last glyph. The strip slides down
  from under the band. As each edge reaches its outer end, the logo settles
  from 112% while drifting 24 units outward, and the marker draws upward; the
  tab rises from behind the band. One specular sweep crosses the block and the
  tab to finish. Everything reads by about frame 60 (1.0 s).
- **Outro (0.4 s):** the logos fade as they swell to 106%, the markers
  retract, the strip and tab withdraw behind the band, and the edges close the
  glass toward the seam with a brief edge light.
- **Motion maintenance:** Hold and Outro key every property the intro animates
  at its resting value; Hidden turns off the panel groups, edge lights, shadow
  and sweeps. The block shadow is one outline round the band and the strip,
  its bottom edge keyed to follow the strip; the tab casts its own. Keep the
  OGraf durations (1400 / 400 ms) in sync with the timelines.
- **On air:** `isPlaying`, as on the scorebug.

View model `BasketballMatchupLocatorLowerThirdV2`, public properties:
`isPlaying`, `eventTitle` (default `COLLEGE BASKETBALL`; blank hides the tab),
`awaySchool`/`homeSchool`, `awayMascot`/`homeMascot` (blank shows the school
alone), `awayOverallRecord`/`homeOverallRecord`,
`awayConferenceRecord`/`homeConferenceRecord` (blank hides it),
`awayLogo`/`homeLogo`, `awayPrimaryColor`/`homePrimaryColor`,
`awaySecondaryColor`/`homeSecondaryColor`, `venueName`, `venueLocation` (blank
hides it), `sponsorLogo`. Send text in capitals.

Build the OGraf package with
`bun run ograf:build:basketball-v2-matchup-locator-lower-third`.

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
  blank tag hides the separator. `PRESENTED BY` sits at the right, centred over
  the sponsor chip.
- **Name row (84 high, team tint):** the jersey number, first name over last
  name (shrinks to fit), and position over class year at the right, over a
  faded team logo. The full-colour sponsor logo (50 high) closes the row on a
  200 x 84 white chip.
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

## Halftime statistics card (`halftime_statistics.rml`)

A card comparing the two teams' first halves, presented by Drexel Physical
Therapy. Card origin 282, 222; size 1356 x 636, centred on the frame. It ends
at y 858, 32 units above the scorebug (y 890), so the two can be on air
together. Like the matchup locator, it takes 24 on the outer corners and 6 on
inner seams.

- **Generated.** `generate_halftime_statistics.ts` writes the `.rml`. Edit the
  generator, then run
  `bun graphics/basketball-v2/generate_halftime_statistics.ts`; never edit the
  `.rml` output by hand.
- **Team panels (340 x 636, team tint):** away at the left, home at the right,
  each with the locator's secondary-colour stripe and white hairline along the
  top. The school (Regular 30, muted) sits over the mascot (Bold 84, on the
  scores' baseline), then the full-colour logo, about 260 across, over a soft
  bloom.
- **Column (668 wide):** one panel of dark glass; the cells have no glass of
  their own. They line up in three columns, away value (240), label (180) and
  home value (240). From the top: the title strip (60 high, `title`); the score
  row (100 high), the scores in Bold 84 either side of `SCORE`; six statistic
  rows (60 high); and the sponsor strip (84 high), `PRESENTED BY` and the
  full-colour sponsor logo on a 216 x 64 white chip, centred as a group. A
  one-unit hairline in each 4-unit gap divides the rows, and a lighter band
  behind the labels sets the three columns apart.
- **Statistic text:** the value (Bold 44), then an optional muted detail
  (Regular 30), for example `12-28  42.9%`. A blank detail also removes the gap,
  so the value stays centred; `detail_separator.luau` is the converter that
  does this.
- **Leader mark.** In the score row and each statistic row, the leading team's
  cell fills with that team's tint, out to the hairlines, which draw over it.
  The tint darkens toward its foot as the glass does, so two marked cells in a
  column still read as two. `halftime_statistics_controller.luau` compares
  the details when both hold a number, and the values otherwise; the figure in
  a text is its first number, so `12-28` compares as 12. `rowNLeadingValue` says
  which figure leads: `HIGHER` (the default), `LOWER` (turnovers) or `NONE`,
  which marks neither team. A tie, or a figure that does not parse, also marks
  neither. The score row always compares the scores, the higher leading. A
  change on air crossfades the mark. The controller writes the `_`-prefixed
  lead opacities the scene binds; those are internal, never send them.
- **Intro (1.43 s) and outro (0.4 s):** the locator's build. A light ignites at
  the centre of the card and splits into two leading edges that wipe the glass
  open outward. The title, labels and values rise in letter by letter, row by
  row from the top, and each row's leader lights as the row settles. The
  sponsor strip slides down from under the last row, and one specular sweep
  crosses the card to finish. Hold and Outro key every property the intro
  animates at its resting value.

View model `BasketballHalftimeStatisticsV2`, public properties: `isPlaying`,
`title` (default `HALFTIME STATS`), `awaySchool`/`homeSchool`,
`awayMascot`/`homeMascot`, `awayScore`/`homeScore`, `rowNLabel`,
`rowNAwayValue`, `rowNAwayDetail`, `rowNHomeValue`, `rowNHomeDetail` and
`rowNLeadingValue` for N = 1 to 6, `awayLogo`/`homeLogo`,
`awayPrimaryColor`/`homePrimaryColor`, `awaySecondaryColor`/`homeSecondaryColor`,
`sponsorLogo`. The rows default to FG, 3PT, FT, REB, AST and TO, with TO
leading `LOWER`. The feed sends every figure formatted (`12-28`, `42.9%`) and
text in capitals. To clear a detail on air, send an empty string: omitting the
key leaves the detail unchanged.

**Sponsor asset.** `assets/images/sponsors/drexel_physical_therapy.png` is the
source, downloaded from `https://images.dragonstv.io/sponsors/DrexelPT.png`
(1920 x 1080, the logo on white). `drexel_physical_therapy_trimmed.png` beside
it is the 1600 x 447 export the scene uses: cropped to the logo, with the white
background made transparent and the colours recovered from white so the edges
stay clean. Re-export from `assets/images/sponsors/` with

```bash
D='max(max(255-r(X,Y),255-g(X,Y)),255-b(X,Y))' && ffmpeg -y -i drexel_physical_therapy.png -vf "crop=659:184:524:784,scale=1600:-1:flags=lanczos,format=rgba,geq=r='st(0,$D);if(gt(ld(0),0),clip(255-(255-r(X,Y))*255/ld(0),0,255),0)':g='st(0,$D);if(gt(ld(0),0),clip(255-(255-g(X,Y))*255/ld(0),0,255),0)':b='st(0,$D);if(gt(ld(0),0),clip(255-(255-b(X,Y))*255/ld(0),0,255),0)':a='st(0,$D);if(gt(ld(0),4),ld(0),0)'" -pix_fmt rgba drexel_physical_therapy_trimmed.png
```

Build the OGraf package with
`bun run ograf:build:basketball-v2-halftime-statistics`.

## Conference standings card (`conference_standings.rml`)

The CAA standings: the conference's thirteen teams in order, one row per
place. Card origin 410, 70; size 1100 x 788, centred across the frame. Like
the halftime card it ends at y 858, clear of the scorebug (y 890), and it
takes 24 on the outer corners and 6 on inner seams.

- **Generated.** `generate_conference_standings.ts` writes the `.rml`. Edit
  the generator, then run
  `bun graphics/basketball-v2/generate_conference_standings.ts`; never edit
  the `.rml` output by hand.
- **Title panel (1100 x 70):** the white CAA wordmark
  (`assets/images/CAAWhite.png`, 35 high) and `STANDINGS` (Bold 50) at the
  left, the sport (Regular 32, muted) at the right.
- **Table panel (1100 x 714):** one panel of dark glass; the rows have no
  glass of their own. A header row (38 high) labels the columns `TEAM`,
  `CONF`, `OVERALL` and `STREAK` (Regular 24, muted). Under it, one row per
  place (48 high): the rank (Bold 35, muted) in an 80-wide column set off by
  a lighter band, the logo in a 55 x 37.5 box, the school (Bold 38), then the
  conference record, overall record and streak (Bold 38), each centred in a
  155-wide column. A one-unit hairline in each 4-unit gap divides the rows.
- **Rows are entered by place.** `rowNTeam` names the team in place N, one of
  the members in `conference_teams.ts`, and the row takes that team's logo.
  The rank is the row number, so ties are not marked. The records and streak
  are text, sent formatted (`15-3`, `L1`).
  `conference_standings_controller.luau` finds each row's team, matching
  without regard to case or surrounding spaces; a row naming no member
  (blank, say) shows no logo. The controller writes the `_`-prefixed row
  properties the scene binds; those are internal, never send them.
- **Game night.** The rows of `awayTeam` and `homeTeam` take those teams'
  tints, and a tinted row's logo stands in a soft dark shade, so a logo on its
  own colour (Campbell's orange camel on Campbell orange) still reads. `NONE`
  is a team outside the conference: no row is tinted for it. On air, a tint
  fades in or out; a new team's logo and text change at once.
- **Intro (1.5 s) and outro (0.4 s):** the halftime card's build. A light
  ignites at the centre of the card and splits into two leading edges that
  wipe the glass open outward. The title rises in letter by letter and the
  wordmark settles from 112%. The rows then rise in rank order, two frames
  apart, each logo settling from 112%, and the rows of the night's teams
  light last. One specular sweep crosses the card to finish. Hold and Outro
  key every property the intro animates at its resting value.

View model `BasketballConferenceStandingsV2`, public properties: `isPlaying`,
`sport` (`MEN'S BASKETBALL` or `WOMEN'S BASKETBALL`), `awayTeam`/`homeTeam`
(default `CAMPBELL`/`DREXEL`), and `rowNTeam`, `rowNConferenceRecord`,
`rowNOverallRecord` and `rowNStreak` for N = 1 to 13. The defaults are the
2025-26 final regular-season standings. In the OGraf package the sport and
every team field are selects, so an operator cannot misspell a team.

**Logos.** `assets/images/caa/` holds one full-colour mark per member, from
`https://images.dragonstv.io/logos/<NAME>.PNG` (for example `CAMPBELL`,
`COLLEGE_OF_CHARLESTON`, `NORTH_CAROLINA_AT`, `UNC_WILMINGTON`,
`WILLIAM_MARY`). Each is cropped to its visible pixels, then fitted and
centred with a 4 margin in a 176 x 120 transparent canvas, so wide and tall
marks carry the same weight. Northeastern's keeps only the husky head (source
rows 340 down): its arched black wordmark vanishes on dark glass.

**Adding a member.** Fairfield joins in 2027-28. Add its entry to
`conference_teams.ts` and its logo to `assets/images/caa/`, then regenerate.
Each row adds 52 to the card's height, and the card is anchored at the
bottom, so a fourteenth row would lift its top to y 18, outside the safe
area: reduce `ROW_HEIGHT` as well. The generator refuses to write a scene
whose last row lights after the intro ends; lengthen `INTRO_FRAMES` (and the
package durations) to match.

Build the OGraf package with
`bun run ograf:build:basketball-v2-conference-standings`.

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
