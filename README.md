# dtv-rive

Broadcast graphics for DTV, written as Rive scenes (`.rml`) and shipped
as [OGraf](https://ograf.ebu.io) packages. The scenes are 1920 x 1080 overlays
for basketball games: a scorebug, lower thirds, matchup locators, a starting
five, halftime cards and a score to break. Earlier ports and a Vite preview page
were removed; `git show pre-restructure:<path>` reads them from the
`pre-restructure` tag.

## Requirements

- [Bun](https://bun.sh)
- The Rive CLI (`rive`), logged in with `rive login`. Browsers reject unsigned
  `.riv` files without any error, so every package build publishes through
  Rive's signing service.

Run `bun install` once.

## Quick start

```bash
rive . --verify              # check that the project compiles
rive inspect . --summary     # problems, plus what got built by type
rive . --screenshot --advance=1   # render the scorebug to build/dtv-rive.png
bun run ograf:build          # build every OGraf package into build/ograf/
bun run ograf:harness        # local stand-in renderer on http://localhost:8974
bun run site:build           # stakeholder preview website in build/site/
bun run site:deploy          # publish that website to Cloudflare Workers
```

## Layout

| Path | Contents |
|---|---|
| `graphics/basketball-v2/` | Current graphics: the `.rml` scenes, Luau controllers and generators |
| `ograf/` | Packaging: build script, shared web component, local harness, one directory per package |
| `site/` | Stakeholder preview website: build script and viewer, published as static assets (`wrangler.jsonc`) |
| `data/seed/` | The vendored team dataset (`teams.json`) and the module that normalizes it (`teams.ts`) |
| `scripts/render_frames.ts` | Renders frames and contact sheets for reviewing motion |
| `scripts/baseline.ts` | Captures every scene's on-air frame and compares two captures, to prove a change left the pixels alone |
| `docs/` | Porting tracker and the vendored OGraf specification |
| `assets/` | Fonts and logos |

## Graphics

The basketball v2 set, each packaged under `ograf/graphics/`:

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
bun scripts/render_frames.ts graphics/basketball-v2/basketball_scorebug.rml \
  --frames=0-72:6 --out=build/frames/scorebug/intro --sheet=5
```

Add `--outro` to render the exit instead.

## Shipping a graphic

A verified `.rml` is not a deliverable, because no renderer ingests one. The
build produces `build/ograf/<id>/` (manifest, web component, signed `.riv`,
thumbnail) and a `.zip` beside it. To add a graphic, follow
[`ograf/README.md`](ograf/README.md). A new scene starts from
[`graphics/basketball-v2/DESIGN_SYSTEM.md`](graphics/basketball-v2/DESIGN_SYSTEM.md).

Until `rive push` binds the project to a Rive file, published output carries a
watermark. `rive.yaml` already has a `push:` block. Pushing creates a file in
the Rive workspace, so do it deliberately.

## More documentation

- [`AGENTS.md`](AGENTS.md): working rules for the Rive CLI and RML
- [`graphics/basketball-v2/README.md`](graphics/basketball-v2/README.md): the finished graphics and their fields
- [`docs/GRAPHICS_PORTING.md`](docs/GRAPHICS_PORTING.md): porting tracker and OGraf packaging notes
- [`docs/ograf/`](docs/ograf/): the OGraf specification
- [`site/README.md`](site/README.md): the stakeholder preview website and how to publish it
