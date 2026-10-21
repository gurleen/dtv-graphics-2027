# Architecture

This repo is becoming a Bun monorepo that runs DragonsTV shows from the basketball-v2 Rive scenes. It holds the
scenes, a data model in SQLite, an oRPC API, a server, an operator controller, a `/renderer` page for OBS, and the
stakeholder site at `preview.dragonstv.io`. Live-data packages come later and use the same API.

This document describes the target design and why it has this shape. The shared plan doc tracks progress phase by
phase. Section 8 says how the design was chosen.

## 1. Packages and what each may import

```
package.json            workspaces: apps/*, packages/*, graphics/*
rive.yaml               unchanged; the repo root stays the Rive project
data/seed/              teams.json (vendored), fixtures.json, rosters/*.csv
data/db/                dtv.sqlite and backups/ (gitignored)
graphics/basketball-v2  @dtv/basketball-v2: scenes, generators, scenes.gen.ts, one registry entry per graphic
packages/domain         @dtv/domain: the data model, sport rules, edits, import planning. Pure; runs in a browser.
packages/db             @dtv/db: the SQLite file. DDL derived from the domain, migrate, commit, seed, backup.
packages/playout        @dtv/playout: scene facts, the registry kit, the show reducer, the projector
packages/graphics       @dtv/graphics: GRAPHICS, the one list of graphics, and parseCue
packages/renderer       @dtv/renderer: draws output frames. The only code that touches the Rive runtime.
packages/api            @dtv/api: the oRPC contract and the client helpers
packages/live-*         live-data packages (later)
apps/server             Bun.serve: the store (the one writer), the oRPC router, static files
apps/controller         React: the show page and the data page
apps/renderer           the /renderer page for OBS
apps/site               the stakeholder site: build script and viewer
```

| Workspace | May import |
|---|---|
| `@dtv/domain` | zod |
| `@dtv/db` | domain, `bun:sqlite` |
| `@dtv/playout` | domain, zod |
| `@dtv/basketball-v2` | playout, domain, zod; its golden test may also import db |
| `@dtv/graphics` | basketball-v2, playout, domain, zod |
| `@dtv/renderer` | playout, domain, `@rive-app/canvas-single` |
| `@dtv/api` | playout, domain, zod, `@orpc/*`, partysocket |
| `apps/server` | api, db, graphics, playout, domain, zod, `@orpc/server` |
| `apps/controller` | api, renderer, graphics, playout, domain, react |
| `apps/renderer` | api, renderer, graphics |
| `apps/site` | its build script may import db; its browser code may not |
| `packages/live-*` | api, domain |

Bun hoists every dependency into one `node_modules`, so an undeclared import still compiles. `scripts/check_deps.ts`
fails `bun run check` when a file imports a package its directory may not, or reaches into another package's files.
Each package exposes only `.` in its `exports`.

The graph runs one way: domain, then playout, then the sport packages, then graphics, then the apps. The renderer
and the API never import storage code, so the OBS page and every live-data package stay small.

## 2. The data model

### Entities

Every entity is a zod schema in `packages/domain`. The TypeScript type is `z.infer` of it, the API validates input
with it, and the SQLite tables derive from the `ENTITIES` registry. There is no second definition to keep in sync.
Text is stored in natural case ("Josh Reed"). The projector applies capitals once, because Rive has no case
transform.

| Entity | Id example | Holds | Seeded from |
|---|---|---|---|
| Conference | `caa` | name, short name (`CAA`), logo, ESPN id | teams.json |
| School | `drexel` | name, short name, mascot, abbreviation (`DREX`), `primaryColor`, `secondaryColor`, logo, website, ESPN id | teams.json |
| Team | `drexel-mbb` | one sport program of a school: `schoolId`, `program`, optional `branding` overrides | teams.json, one per program |
| Season | `2026-27` | name | fixtures |
| TeamSeason | `drexel-mbb@2026-27` | conference that season, overall and conference W-L, streak, standings rank, season team stats | teams.json, fixtures |
| Player | `drexel-mbb@2026-27/reed-josh` | one roster spot: names, jersey (a string, so `0` and `00` differ), position code, class, redshirt, hometown, headshot, motion headshot, the importer's `sourceKey` | rosters/*.csv, fixtures |
| PlayerSeasonStats | the player's id | games played and stat totals, a union on `sport` | fixtures, later a feed |
| Staff | `drexel-mbb@2026-27/spiker-zach` | names, title, detail (`11th season`) | fixtures |
| Talent | `rob-brooks` | names, default role | fixtures |
| Sponsor | `independence-blue-cross` | name, `logoOnDark` (white wordmark), `logoOnLight` (full colour) | fixtures |
| Sponsorship | the graphic's id | the sponsor that presents a graphic | fixtures |
| Venue | `daskalakis-athletic-center` | name, city, state | fixtures |
| Game | `2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb` | season, program, away and home team, venue, start, conference game, event title | fixtures |
| Show | `drexel-sju` | name, game, crew (talent with an optional role for the night), rundown (cues) | fixtures |

A Team is one program of a school. `PROGRAMS` maps each program code to its sport and gender (`mbb` is men's
basketball, `wbb` women's basketball). Women's soccer is one more row there plus a soccer module in `sports/`.

A Team's `branding` overrides the school's abbreviation, colours, or logo for that program only. Binds read the
resolved values from `TeamView.brand`, never from the school directly, so an override reaches every graphic.

A Player is a roster spot, one person on one team in one season. A returning player gets a new row next season.
That keeps a cue's single `PlayerId` enough to resolve the jersey, class, and headshot of that season.

### Stats

"Stat" is three things in this model.

1. A sport's stat line. `basketball.StatLine` counts points, makes and attempts, rebounds, assists, and so on,
   each defaulting to 0.
2. Stored lines. Season totals live in `PlayerSeasonStats` and `TeamSeason.stats`. Tonight's lines live in the
   game's live state, per player and per team.
3. The stat catalogue. `PLAYER_SEASON_STATS` and `PLAYER_GAME_STATS` map a key to a label and a formatter (`ppg`
   is `PPG`, the points total over games played). A cue picks stats by key, so a graphic never hard-codes a stat.

Stat unions are discriminated on `sport`, and the store checks that a stored line has its team's sport (see "Checks
SQLite cannot make" below).

### Ids

Every id is a branded slug (`PlayerId = z.string().regex(SLUG).brand<'PlayerId'>()`), so a `TeamId` cannot go where
a `SchoolId` belongs. Seeded and imported rows get deterministic ids from their natural key (`idFor.player(team,
season, first, last)`), so a seed or an import that runs twice writes the same rows. An id never changes after
creation, even when the name it came from is edited. The 361 team names in teams.json produce no slug collisions.

### Live game state

Live state is not an entity. It changes several times a second, so it has its own table and its own stream, and it
never travels with the World. `SPORT_MODULES` holds one row per sport with its live schema, its command schema,
`initial`, `apply`, and `nextChange`. The row is checked with `satisfies`, so a sport without a module fails the
build.

`BasketballLive` holds the phase, period, game clock, shot clock, score, timeouts, bonus, possession, starters,
team and player stat lines, and `authority`. Commands set absolute values (`score home 74`), never deltas, so a
resent packet changes nothing and two operators who press +2 for one basket agree on 74.

`authority` names one writer per field group (`clock`, `score`, `stats`). A feed and an operator never both write
the score. Only the `operator` source can hand a group to a feed or take it back.

A running clock is `{ running: true, remainingMs, since }`, anchored on the server's time. Nothing ticks it.
Every display is computed from `now` at projection time, so a restart cannot lose time.

### Prefilled data and manual edits

Most data arrives prefilled, and people correct it on the data page. These rules let both write the same tables.

- Every batch names its origin. `manual` is a person on the data page. `import` is the seed, an importer, or a
  live-data package.
- Each row keeps a `locked` list beside its document. A manual put locks the fields it changed. An import put
  writes only unlocked fields and reports the fields it skipped. The data page can unlock a field, and the next
  import updates it again.
- A put with `onExisting: 'keep'` writes a row only when the row is missing. The seed uses it, so `bun run db:seed`
  never resets a record that a feed or an import updated since.
- A manual batch carries `basis`, the World revision its writer read. A put or delete of a row written after that
  revision fails the whole batch with `CONFLICT`, so one editor never overwrites another.
- Importers return warnings for the data page to show. On teams.json they report what we measured on the vendored
  file: `conference_id` 7 is both the Big Ten and the EIWA, `conference_id` 10 carries two names for the CAA, 12
  logo files are shared by 31 schools, 35 records have no valid alternate colour, 38 have no logo, and the CAA list
  still includes Delaware.

The roster importer runs in two steps. `parseRosterCsv` reports every bad row. `planRoster` matches each row to an
existing player by `sourceKey`, then by jersey and last name, then by full name. It returns adds, updates, an
unchanged count, players missing from the file, and the edits. The data page shows the plan, and the operator
commits it with `data.apply`. Planning the same file again returns an empty plan. Missing players are deleted only
when the operator asks (`prune`).

### Storage

Each entity kind is one table of JSON documents. The referencing and unique fields are lifted into STORED generated
columns, so SQLite still enforces foreign keys and natural keys while the zod schema stays the one definition.
Bun 1.4.3 ships SQLite 3.54.0, which rejects a dangling id on a generated column. Foreign keys are deferred, so a
batch may put a team before its school.

```sql
CREATE TABLE players (
	id TEXT PRIMARY KEY,
	doc TEXT NOT NULL CHECK (json_valid(doc)),
	seq INTEGER NOT NULL,
	locked TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(locked)),
	team_id TEXT GENERATED ALWAYS AS (doc ->> '$.teamId') STORED NOT NULL
		REFERENCES teams (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
	season_id TEXT GENERATED ALWAYS AS (doc ->> '$.seasonId') STORED NOT NULL
		REFERENCES seasons (id) DEFERRABLE INITIALLY DEFERRED,
	source_key TEXT GENERATED ALWAYS AS (doc ->> '$.sourceKey') STORED
) STRICT;
```

Three more tables hold what is not an entity.

- `journal (seq, at, actor, kind, payload)` records every data batch, live command, and show command. A
  `Revision` is a journal sequence number, so revisions only grow, across restarts too.
- `live (game_id, doc, seq)` holds each game's live state.
- `show_state (id = 1, doc, seq)` holds program and the operators' previews, so a restart brings program back as
  it was.

`migrate` compares each table's SQL with what `tableSql(kind)` derives and rebuilds the tables that differ, with
SQLite's documented rebuild. A second run finds nothing to do. An added field needs no migration, because every
load parses each document and the schema's `.default()` fills it in. A rename is a `DocMigration`, applied once
under `PRAGMA user_version`. A document that fails its schema on load stops the server and names its kind and id.

`VACUUM INTO` writes a backup without blocking readers. The server takes one before every migration, at every show
activation, and on shutdown, and `bun run db:backup` takes one on demand. The newest 30 are kept.

After a data commit the server reloads the World from SQLite instead of patching memory, so a cascaded delete can
never leave memory behind the file. A candidate measured a median of 1.22 ms to load 2,527 seed-shaped rows.

### Checks SQLite cannot make

Some rules span rows, which the document layout cannot express as SQL `CHECK` constraints. The store checks them
on every write and refuses the batch with `INCONSISTENT`.

- Both teams of a game play in the game's program.
- `TeamSeason.stats` and `PlayerSeasonStats.stats` have the sport of their team's program.
- A `game.apply` names the sport of its game.
- Every rundown cue names a graphic in the registry, and its params and overrides fit that graphic.

## 3. The API

### One contract, one socket

The contract lives in `@dtv/api` and uses oRPC 1.15.7 (`oc`, `eventIterator`, `type`). The server implements it
with `implement(contract)`. Callers import `@dtv/api` and never the server, so no client's typecheck pulls in
SQLite.

| Procedure | Input | Output | Errors |
|---|---|---|---|
| `data.watch` | none | stream of `WorldSnapshot` | none |
| `data.apply` | `EditBatch` | `{ revision, skipped }` | `CONFLICT`, `INVALID_REFERENCE`, `DUPLICATE`, `INCONSISTENT` |
| `data.planRoster` | team, season, csv, prune | the plan, or the bad rows | none |
| `game.watch` | game | stream of `GameLive` | none |
| `game.apply` | `GameApplyInput` | `{ revision, live }` | `NOT_AUTHORITY`, `NO_GAME` |
| `show.watch` | operator | stream of `ShowView` | none |
| `show.command` | `{ id, command }` | `{ revision, changed }` | `REJECTED` |
| `output.watch` | bus | stream of `OutputFrame` | none |

There are no per-entity procedures. `data.watch` gives every client the whole World, and `data.apply` is the one
data write. A live-data package needs only `data.apply` for reference data and `game.apply` for live state.

Every client talks over one WebSocket at `/rpc`, with `RPCHandler` from `@orpc/server/bun-ws` and `RPCLink` from
`@orpc/client/websocket` over partysocket's `ReconnectingWebSocket`. The controller holds about five streams at
once. Over HTTP/1.1, server-sent events would use five of the six connections a browser allows per host. When the
socket drops, the link ends every open call, and the `watch` helper opens each stream again. A candidate's probe
killed the server, started a new one a second later, and saw the new server's value 1,519 ms after the kill.
`perMessageDeflate` is on, because a World snapshot is about 430 KB of JSON and 34 KB compressed.

The `?client=` label on the socket names the caller in the journal. It is not authentication. The design trusts
the local network.

### Streams send whole values, newest only

Every `watch` yields complete values. A change marks the stream dirty and wakes it. The stream recomputes its value
and sends it only if it differs from the last one sent. A slow consumer gets the newest value, never a backlog, and
a client that reconnects has caught up as soon as its first value arrives.

Each stream wakes only on the changes its value reads. `data.watch` wakes on data commits and compares revisions.
`game.watch` wakes on its game's live state. `show.watch` wakes on data and show changes. `output.watch` wakes on
data, live, show, and clock changes. A clock tick therefore never serializes the World.

### Show commands carry ids

Live commands are absolute and data puts are whole documents, so a repeat of either changes nothing. Show commands
include `toggle`, which is relative by nature, and a client cannot tell whether a command sent just before a drop
landed. So `show.command` takes a client-chosen `id`. The server remembers the last 256 ids and answers a
repeated id with the first result instead of applying the command again. After a restart it recovers the ids of
commands that changed state from the journal. A rejected or unchanged command is remembered only in memory,
because repeating it changes nothing.

### oRPC version

The design pins `^1.15.7`, which installs 1.16.0. The v2 line is in beta. Four files import oRPC:
`packages/api/src/contract.ts` and `client.ts`, and `apps/server/src/router.ts` and `main.ts`. Moving to v2 renames
`@orpc/server/bun-ws` and `eventIterator`, and the server and every client must move together because the wire
format changed.

## 4. Show and playout

All of this is pure and lives in `@dtv/playout`. The server runs it for the live show. The site runs the same code
in the browser over a fixed World.

### Layers

Graphics that share a screen region share a layer. A take on a layer replaces what is there, out and then in, so two
graphics that would overlap are never on air together.

| Layer | Graphics |
|---|---|
| `bug` | Scorebug, Score to Break, Halftime Adjustments |
| `lower` | Player, staff, team, and talent lower thirds, Starting Five, Player To Watch, Player Of The Game, Matchup Locator lower third, Burning Question |
| `card` | Matchup Locator, Halftime Statistics, Conference Standings |

An entry can name layers its take also clears. The double and triple talent lower thirds clear `bug`, because they
overlap the scorebug.

### Free panel and rundown

A cue is a graphic id, its params, optional overrides, and a note. The free panel is derived, not stored. It lists
every registry entry that has a `free(context)` function, with params computed from the show. The scorebug's params
are `{}`. The talent lower thirds take the first one, two, or three members of the show's crew, and an entry whose
`free` returns null gets no button. The rundown is `Show.rundown`, an ordered list of cues edited through
`data.apply` with a `basis`.

### Preview and program

Program is one shared bus, because there is one output. Each operator has their own preview. A take sends the
taker's preview and nobody else's, so one operator can never put another operator's half-built cue on air. Every
operator still sees every preview.

A slot is a cue on a bus, frozen when it was cued. It holds the graphic, the params, the overrides, the ref it
came from, and its step. It does not hold a `Cue`, because a free-panel graphic has no cue id. Binds still read
the live World and live game, so a corrected name or a new score shows at once. An edited rundown cue reaches air only through `refresh`. A new slot id on a
layer is what tells a renderer to play out and then in.

| Command | Effect |
|---|---|
| `cue operator ref` | Into my preview, on the graphic's layer. The same cue with equal params changes nothing. |
| `uncue operator layer` | Out of my preview. |
| `take operator` | Each layer of my preview goes to program, plus each entry's `clears`. My preview empties. |
| `air operator ref` | Straight to program, for free-panel keys. No change if that cue is already on air. |
| `toggle operator ref` | Clear it if it is on program, else air it. |
| `clear layer slot?` | Off air. With a slot id, only if the layer still holds that slot. |
| `clearAll` | Everything off air. |
| `step layer slot to` | Moves a stepped graphic to step `to`. A step past the last takes it off air. |
| `refresh layer slot` | Re-reads the on-air cue's params from the rundown. Refused if the cue now names another graphic. |
| `patch layer slot overrides` | Replaces the on-air overrides, for a last-second text fix. A resend changes nothing. |
| `activate show` | Makes a show active, takes a backup, and empties previews. Program stays on air. |

### Two operators at once

The server applies commands one at a time. bun:sqlite is synchronous and the server is one process, so each command
is one reducer step and one transaction that nothing interleaves with.

| Situation | Result |
|---|---|
| A and B cue different lower thirds | Each lands in its owner's preview. Nothing collides. |
| A and B both take a lower third | The later take wins the layer. The renderer plays the first out and the second in. |
| A clears the lower third as B takes a new one | A's clear names the slot A saw. If B's take landed first, the clear changes nothing. |
| A and B both press Next on Starting Five | Both send `to: 1`, computed from the step they saw. It moves once. |
| A and B both press +2 for one basket | Both send `score home 74`. The score is 74. |
| A and B both press toggle on the scorebug | It goes on, then off. A surface that knows the state sends `air` or `clear`. |
| A person edits a player while a feed writes stats | Different documents and different writers. Both land. |

### Keyboard, mouse, and other control surfaces

Every way of running the show sends the same `show.command` calls. The controller binds keys and clicks to them
for now. A Stream Deck plugin or another surface later is one more client of `@dtv/api`, with no server change. A
surface that shows the on-air state sends `air` and `clear`. A surface with no display of its own sends `toggle`,
which the server decides against the current program. Phase 4 designs the key map with the controller prototypes.

### The clock

The server keeps one timer, set to the earliest `nextChange` across live games. That is the next second change
above a minute, the next tenth below it, or the next shot-clock second. When the timer fires, output streams
re-project. Renderers never tick a clock, so every output shows the same digits.

## 5. Graphics and the renderer

### One registry entry per graphic

```ts
export const scoreToBreak = defineGraphic({
	id: 'basketball-v2/score-to-break',
	scene: SCENES.score_to_break,
	params: z.object({ side: z.enum(['left', 'right']).default('left'), status: z.string().min(1).optional() }),
})({
	name: 'Score to Break',
	sport: 'basketball',
	layer: 'bug',
	demo: { side: 'left' },
	site: 'full-frame',
	free: () => ({ side: 'left' }),
	label: (params) => `Score to Break · ${params.side}`,
	bind(params, context) {
		const { sides, program } = requireGame(context);
		const live = requireBasketball(context);
		return { alignRight: params.side === 'right', awayScore: live.score.away /* ...every property */ };
	},
	frozenOnAir: ['alignRight'],
	exitSignal: '_onScreen',
});
```

A bind is pure. It returns every public property except `isPlaying`, which the renderer owns, so a misspelled
property fails to compile. `defineGraphic` takes two calls so that `free: () => ({ side: 'left' })` keeps its
literal type. A file of `@ts-expect-error` cases in `bun run check` proves the types refuse a misspelled property,
a wrong value kind, `isPlaying`, and a bad internal property name.

### Scene facts come from the .rml

`packages/playout/scripts/scene-codegen.ts` reads each `.rml` and writes `scenes.gen.ts`. The file holds the
artboard, the state machine, the view model, every timeline's length in milliseconds, the public and internal
properties with their kinds, and the Default instance's values. `--check` fails when the file is stale. The codegen refuses a scene without one
artboard, one state machine, a Default view-model instance, a public boolean `isPlaying`, and `Intro` and `Outro`
timelines. Numbered properties become groups (`row1Team` to `row13Streak` is group `row`), so a bind returns rows
and the projector writes the numbered names.

Durations now come from the timelines, so the OGraf rule of keeping definition durations in sync with the scenes
goes away. The golden test binds each entry's `demo` against the seed data and compares the result with the
scene's Default instance. It proves the bind, the seed, and the scene agree, and it fails while a scene has no
entry.

### Two rules in the projector

The projector uppercases every string property once. It also binds an image URL for every image property. A bind
returns `null` for a missing image, and the projector binds `/assets/images/blank.png` in its place. The player
lower third binds the headshot placeholder instead. A scene's embedded test logo therefore never reaches air.

### The four behaviours OGraf carried

| Behaviour | Here |
|---|---|
| Burning Question waits two frames before `isPlaying` | Every graphic does. The renderer writes values, waits two frames, then sets `isPlaying`. The answer is step 1, so Next reveals it and every take starts at the question. |
| Step graphics | `steps: { count, values(step), transition }` in the entry. A step is one more value written. |
| Score to Break holds `alignRight` until `_onScreen` reads 0 | `frozenOnAir: ['alignRight']` and `exitSignal: '_onScreen'`. |
| Motion headshot overlay | `overlay: { kind: 'motion-media', ... }` in the entry, drawn by one renderer module. |

### Each layer is a state machine

`createRenderer({ host, registry, rivUrl, blankImage })` returns `render(frame)` and `dispose()`. It holds no data
and runs no binds. One module serves the `/renderer` page, the controller's preview and program monitors, and the
site. Each layer runs this table, as a pure function of state and event that returns effects:

| State | Event | Next state and effects |
|---|---|---|
| empty | a frame | loading: create the instance, write values, decode images, wait two frames |
| loading | any frame | loading, with the newest frame pending |
| loading | loaded | entering (set `isPlaying`) after writing a pending frame for the same slot, or straight to a pending frame for another slot |
| loading | load failed | empty. The layer does not load that slot again until a new slot arrives. A pending frame for another slot loads. |
| entering | a frame for the same slot | entering, writing the changed values except `frozenOnAir` ones. A step change waits. |
| entering | another slot or none | entering, with the change pending. The intro finishes first. |
| entering | intro done | on, or leaving if a change is pending |
| on | a frame for the same slot | on, writing changed values except `frozenOnAir` ones. A step change writes the step's values and enters again for `steps.transition`. |
| on | another slot or none | leaving (clear `isPlaying`) |
| leaving | any frame | leaving, keeping only the newest pending frame |
| leaving | exited (the exit signal, or the outro's length) | dispose, then loading the pending frame, or empty |
| any | a frame whose bind failed | unchanged. The layer keeps what it shows, whatever slot the frame names. |

`entering` covers any animation that must land before the next change: the Intro, or a step's transition timeline.
A step change during one is held and played when it lands.

The intro finishes before an outro starts because of how the scenes are built. In `basketball_scorebug.rml`,
clearing `isPlaying` during the Intro jumps to the Outro state with no exit time, and the Outro resets to its own
first frame. A half-played intro would snap to the full pose before leaving.

`instance.ts` is the only module that touches Rive. It loads with `new Rive({ riveFile, canvas, artboard,
stateMachine, autoBind: false })` and binds the Default view-model instance by name. One `RiveFile` per `.riv` is
fetched once and shared. Images go through one cache that counts users and calls `unref()` when the last one lets
go. The runtime is `@rive-app/canvas-single`, which inlines its wasm, because `@rive-app/canvas` fetches its wasm
from a CDN that a venue network may block.

### The site

The site build seeds an in-memory database and writes `world.json` with the snapshot, the demo game's live state,
and a show with one cue per graphic from each entry's `demo`. In the browser, `createLocalShow` runs the same
reducer and projector as the server, and the same renderer draws it. The site needs no server.

## 6. Build order

Each phase ends in a check that runs on the real artifact.

| Phase | Lands | Gate |
|---|---|---|
| 2.1 Data | workspaces, `@dtv/domain`, `@dtv/db`, the seed | typecheck, tests on a real SQLite file, a second seed writes nothing, a second migrate does nothing, lock and basis tests, the teams.json warnings |
| 2.2 Live | `@dtv/api`, the show reducer and projector, the scene codegen with two registry entries, `apps/server` | a second client sees the first client's writes over the WebSocket, streams reconnect after a server restart, the clock re-projects on its boundaries |
| 3 Renderer and site | the other registry entries, `@dtv/renderer`, `/renderer`, the signed `.riv` build, the site on the new renderer, then `ograf/` deleted | the golden test for all 17 scenes, `/renderer` frames compared with the phase 0 captures, the site build |
| 4 Controller | prototypes first, then the show page and the data page | the owner reviews the prototypes |
| 5 Show day | a rehearsal in OBS | a full mock show |

## 7. Open questions for the owner

- Per-operator previews mean a multiviewer must pick whose preview to show. Should there also be one shared
  preview that follows a named operator?
- Is a Player as one roster spot per season right, or do career stats across seasons matter soon?
- Should the scorebug say `2ND HALF` (as Score to Break does) or `2ND PERIOD` (as its own scene does)? Women's
  games have quarters.
- Is Saint Joseph's secondary colour `#101010` or `#a7a9ac`? Three scenes say one and two say the other.
- When `/renderer` reloads mid-show, the graphics on air play their intros again. Is that acceptable, or should
  they appear without the intro?
- Are sponsorships the same for every show, as designed, or set per show?
- The seed covers both basketball programs for 2026-27 at all 361 schools, from the men's list. Is that the right
  scope?
- What header does the learfield-roster-app CSV export use? The column map is a guess until checked.

## 8. How this design was chosen

Four models designed the system from the same brief and grounding: Opus, Fable, Sonnet, and Haiku. Each wrote a
design and a typechecked sketch, scored on six criteria (domain fidelity, ownership and sync, interface depth,
playout correctness, buildability, and data lifecycle). The Opus design scored highest (27 of 30, against 25 for
Sonnet, 20 for Fable, and 17 for Haiku) and is the base. A cross-model judge was started and then skipped at the
owner's request, so no independent judge confirmed the pick.

The base contributed the one-writer store, per-operator previews, slot-scoped clears, absolute live commands, the
one-socket transport with its reconnect probe, zod as the only schema with JSON documents in SQLite, the registry
entry shape, and the scene codegen.

Parts taken from the other designs:

- From Sonnet. Field locks and the origin rule, import warnings, finishing the intro before the outro, not
  reloading a failed slot, command ids, and compile-time tests of the registry types.
- From Fable. Per-program branding overrides.
- From Haiku. Checking that stat and live-state sports match their team and game.

Changes made during the synthesis:

- `step` names the target step instead of a delta, for the same reason live commands are absolute.
- The renderer does not preload the next graphic during an outro. That removes a state from the table, and it can
  come back if a measured take is too slow.
- The seed has no overwrite mode. With field locks, a reset is an unlock followed by an import.
- School colours are two flat fields, so a person can lock one without the other.

Rejected:

- Server-sent events over HTTP, for the six-connection limit.
- Binds in the browser, because every output would need the data, the rules, and a clock, and two renderers on
  different code could show different text.
- One shared preview guarded by a revision on `take`. It detects the conflict by refusing a take mid-show, where
  per-operator previews remove the conflict.
- A wide API of 28 to 32 procedures.
- Drizzle tables as the source of truth. Sport unions still need zod, which means two schema languages, and storage
  would become the root of the browser-side domain types.

Three of the four designs set values, wait two frames, and then set `isPlaying` for every graphic. Three derive
scene facts from the scenes, and three send every show change through one command union. Those choices are in the
synthesis without debate.
