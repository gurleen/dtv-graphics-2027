# dtv-rive

Broadcast graphics for DTV, written as Rive scenes (`.rml`) and shipped
as [OGraf](https://ograf.ebu.io) packages. The scenes are 1920 x 1080 overlays
for basketball games: a scorebug, lower thirds, a matchup locator and a
starting five.

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
rive . --screenshot --advance=1   # render one frame to build/<name>.png
bun run dev                  # Vite preview of the scorebug
bun run ograf:build          # build every OGraf package into build/ograf/
bun run ograf:harness        # local stand-in renderer on http://localhost:8974
```

## Layout

| Path | Contents |
|---|---|
| `graphics/basketball-v2/` | Current graphics: the `.rml` scenes, Luau controllers and generators |
| `graphics/10_*`, `graphics/11_*`, `graphics/legacy/` | Earlier ports. Use them for data, not layout |
| `ograf/` | Packaging: build script, shared web component, local harness, one directory per package |
| `preview/` | Vite and React page that runs the scorebug in the Rive web runtime |
| `scripts/render_frames.ts` | Renders frames and contact sheets for reviewing motion |
| `docs/` | Porting tracker and the vendored OGraf specification |
| `assets/` | Fonts and logos |

## Graphics

The basketball v2 set, each packaged under `ograf/graphics/`:

- Scorebug
- Player lower third
- Staff lower third
- Talent lower third (single, double and triple)
- Starting five lower third
- Matchup locator

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
- [`preview/README.md`](preview/README.md): how the preview page works
