# dtv-rive

Broadcast graphics for DTV basketball, written as Rive scenes (`.rml`) and run
live from one show server. Operators drive the show from a controller in the
browser, OBS loads one page that draws what is on air, and stakeholders review
the same graphics on a static site. The scenes are 1920 x 1080 overlays: a
scorebug, lower thirds, matchup locators, a starting five, halftime cards and a
score to break. Earlier ports, the OGraf packaging and a Vite preview page were
removed; `git show pre-restructure:<path>` reads them from the `pre-restructure`
tag.

## Requirements

- [Bun](https://bun.sh)
- The Rive CLI (`rive`), logged in with `rive login`. Browsers reject unsigned
  `.riv` files without any error (the load never finishes), so every scene build
  (`bun run riv:build`) publishes through Rive's signing service.

```bash
bun install
bun run riv:build            # sign every scene into build/riv/; again after any .rml change
```

## Running a show

```bash
bun run start -- --seed      # seed data/db/dtv.sqlite, then serve on http://localhost:8975
bun run start                # serve the file as it is
bun run dev                  # the same, restarting when a source file changes
```

`PORT` and `DTV_DB` override the port and the database file. The server is the
one writer of the database, and every page talks to it through the oRPC
contract in `@dtv/api` over one WebSocket at `/rpc`.

| Page | What it is |
|---|---|
| `/` | The operator controller. The first visit asks for your name. `#/show` is the console, `#/data` the data page |
| `/renderer` | The transparent 1920 x 1080 page OBS loads. It draws program |
| `/renderer?bus=preview&operator=<name>` | One operator's preview, for a monitor |
| `/status` | The revision, the active game and the connected operators |

**The show page** has the free panel (the scorebug and Score to Break, always
one key away), the rundown of the active game's cues, an inspector for the
selected cue's fields, your own preview beside program, the other operators'
previews, and the score bar, which shows the live game and has no controls
(a live data feed will drive the game). Cue a graphic to your preview, then Take puts it on
program for every controller and for `/renderer`. Next steps a multi-step
graphic on, and takes a one-step graphic off.

**The data page** edits teams, rosters, staff, talent, sponsors, venues and
games. A manual edit locks the field so an import will not overwrite it; the
lock icon says who and when, and a click unlocks it. A roster CSV import shows
its changes as a diff before you apply it. A game is its show: games are
created, given their crew and made active here, and the show page runs the
active game's rundown.

**Keys** on the show page (`?` lists them; none fire while you type):

| Key | Does |
|---|---|
| ↑ ↓ | Move the rundown selection; your preview follows it |
| Enter | Cue the selected row to your preview again, as after a take |
| Space | Take your preview |
| N | Next on the graphic on program |
| Esc / Shift+Esc | Clear your preview / clear the program lower third |
| Shift+Backspace | Clear All, held for 600 ms or pressed twice |
| 1, 2 | Air or clear the free-panel buttons |

## Data

Two Bun workspace packages hold the data model. `@dtv/domain` (`packages/domain/`)
has the entities, the basketball rules, edits and the importers, and runs in a
browser. `@dtv/db` (`packages/db/`) owns the SQLite file, `data/db/dtv.sqlite`.
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) describes both.

```bash
bun run db:seed              # migrate, then fill the file from data/seed/
bun run db:migrate           # bring the file to the schema the code expects
bun run db:backup            # copy the file to data/db/backups/; the newest 30 stay, and the newest of each reason
```

`DTV_DB` names another database file, as it does for the server, and its backups
go in `backups/` beside it. Run `db:seed` with the server stopped, because the
server is the only process that writes the file. A second seed writes nothing,
and it never resets a row that someone changed.
[`data/seed/README.md`](data/seed/README.md) describes the seed files and the
roster CSV header.

## Checking a change

```bash
bun run check                # typecheck, check package imports, run the tests (the golden test binds every graphic against the seed)
rive . --verify              # check that the scenes compile
rive inspect . --summary     # problems, plus what got built by type
bun run codegen              # regenerate graphics/basketball-v2/scenes.gen.ts after changing a scene's inputs
```

The end-to-end proofs drive the real server and Chromium on a scratch database
(run `bun run riv:build` first). Each starts its own server, writes screenshots
under `build/`, and exits non-zero when a check fails:

```bash
bun apps/controller/scripts/proofs.ts        # two operators, all 17 graphics through preview, Take and program, a restart
bun apps/controller/scripts/game.ts          # a whole game from tip-off to final, fed over game.apply, with a SIGKILL mid-half
bun apps/controller/scripts/data-proofs.ts   # locks, edit conflicts, roster import
bun apps/controller/scripts/games-proofs.ts  # create a game, give it a crew, activate it, delete another
bun apps/renderer/scripts/proofs.ts          # steps, exits, reloads and rapid takes on /renderer
bun apps/renderer/scripts/compare.ts --baseline=<dir>   # every graphic's on-air frame against a capture
```

For a quicker look at one feature, the project's `verify` skill
(`.claude/skills/verify/`) runs a server on a scratch database and drives it in
a few short journeys.

## Graphics

The basketball v2 set, each a scene in `graphics/basketball-v2/` with a registry entry in `graphics/basketball-v2/graphics/`:

- Scorebug
- Player lower third
- Staff lower third
- Team lower third
- Talent lower third (single, double and triple)
- Starting five lower third
- Player to Watch lower third
- Player of the Game lower third
- Matchup locator
- Matchup locator lower third
- Halftime statistics card
- Halftime adjustments
- Conference standings
- Burning question
- Score to Break

Every graphic follows one design language: tinted glass panels, Zuume type and
short ease-out motion. The values are in
[`graphics/basketball-v2/DESIGN_SYSTEM.md`](graphics/basketball-v2/DESIGN_SYSTEM.md).

## Reviewing motion

```bash
rive . --screenshot --advance=1   # render the scorebug to build/dtv-rive.png
bun scripts/render_frames.ts graphics/basketball-v2/basketball_scorebug.rml \
  --frames=0-72:6 --out=build/frames/scorebug/intro --sheet=5
```

Add `--outro` to render the exit instead.

## Shipping a graphic

A verified `.rml` is not a deliverable. A scene ships as a scene plus a registry
entry: run `bun run codegen`, add the entry (`graphics/basketball-v2/graphics/`),
and `bun run check` runs the golden test that binds the entry against the seed.
`bun run riv:build` signs the scene into `build/riv/`. The controller offers it,
`/renderer` plays it and the stakeholder site lists it. The steps are in
[`AGENTS.md`](AGENTS.md), and the entry's shape is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) section 5. A new scene starts from
[`graphics/basketball-v2/DESIGN_SYSTEM.md`](graphics/basketball-v2/DESIGN_SYSTEM.md).

Until `rive push` binds the project to a Rive file, signed output carries a
watermark. `rive.yaml` already has a `push:` block. Pushing creates a file in
the Rive workspace, so do it deliberately.

## Stakeholder site

```bash
bun run site:build           # sign the scenes, then build the site into build/site/
bun run site:serve           # serve build/site/ on http://localhost:8988
bun run site:preview         # the same through wrangler dev, on http://localhost:8787
bun run site:deploy          # publish to Cloudflare Workers
```

## Layout

| Path | Contents |
|---|---|
| `graphics/basketball-v2/` | The graphics: `.rml` scenes, Luau controllers, generators and registry entries |
| `packages/domain/` | `@dtv/domain`: entities, sport rules, edits and importers |
| `packages/db/` | `@dtv/db`: the SQLite schema, migrations, commits, seed and backups |
| `packages/playout/` | `@dtv/playout`: scene facts, the registry kit, the show reducer and the projector |
| `packages/graphics/` | `@dtv/graphics`: `GRAPHICS`, the one list of graphics |
| `packages/renderer/` | `@dtv/renderer`: draws output frames; the only code that touches the Rive runtime |
| `packages/api/` | `@dtv/api`: the oRPC contract and the `connect`, `watch` and `first` helpers |
| `apps/server/` | The server: the store, the oRPC router and `Bun.serve` |
| `apps/controller/` | The operator controller at `/` (React, React Aria), and its proofs |
| `apps/renderer/` | The `/renderer` page for OBS, and its proofs and frame comparison |
| `apps/site/` | Stakeholder preview website: build script and viewer, published as static assets (`wrangler.jsonc`) |
| `data/seed/` | The seed: the vendored team dataset (`teams.json`), `fixtures.json` and roster CSVs |
| `data/db/` | The SQLite file and its backups, not committed |
| `scripts/build_riv.ts` | `bun run riv:build`: signs every scene into `build/riv/` |
| `scripts/check_deps.ts` | Fails `bun run check` when a package imports what its directory may not |
| `scripts/render_frames.ts` | Renders frames and contact sheets for reviewing motion |
| `scripts/baseline.ts` | Captures every scene's on-air frame and compares two captures, to prove a change left the pixels alone |
| `.claude/skills/verify/` | Scripts and recipes that drive the running app for a quick proof |
| `docs/` | The architecture and the porting tracker |
| `assets/` | Fonts and logos |

## More documentation

- [`AGENTS.md`](AGENTS.md): working rules for the Rive CLI and RML
- [`graphics/basketball-v2/README.md`](graphics/basketball-v2/README.md): the finished graphics and their fields
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the packages, the data model, the API, the show, the controller and the renderer
- [`docs/GRAPHICS_PORTING.md`](docs/GRAPHICS_PORTING.md): porting tracker and RML gotchas
- [`apps/site/README.md`](apps/site/README.md): the stakeholder preview website and how to publish it
