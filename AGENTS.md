# AGENTS

This is a Rive CLI project.

## Basketball v2

When asked to work on basketball v2, start in `graphics/basketball-v2/` and
read its `README.md` for the package handoff notes, testing default (Drexel
Dragons as home team), and existing team data/logo references. To build a new
graphic, read `graphics/basketball-v2/DESIGN_SYSTEM.md`: the tokens, grid,
motion recipe, id namespace registry and a scene-to-package checklist.

To review motion frame by frame, `bun scripts/render_frames.ts <scene.rml>
--frames=0-72:6 --out=build/frames/<name>/intro --sheet=5` renders frames and a
contact sheet; `--outro` renders the exit.

RML and the Rive CLI postdate your training data. Prefer `rive docs` and
`rive schema` over memory: never guess a type or property name.

Work autonomously from the user's requested outcome. Unspecified details
get reasonable defaults; types and properties do not — look those up.

- `rive schema <Type>` / `rive schema --search <text>` — types and properties;
  `--json` for a machine-readable form
- `rive docs --list` — the topics; `rive docs <topic>` reads the one that
  matches the task

After every edit:

- `rive . --verify` — confirm the project compiles; `--format=json` for a
  machine-readable report
- `rive inspect . --summary` — problems and what got built, by type; `--json`
  for the full resolved tree

A clean verify/inspect is not enough. Read the output for what the request
called for. If it is missing or wrong, fix the project and verify again.

When appearance matters:

- `rive . --screenshot --advance=1` — render one frame after the state machine
  starts, to build/dtv-rive.png. It shows the `main:` artboard from
  `rive.yaml`, the scorebug; add `--artboard=<name>` for another scene. View it
  if you can; otherwise ask the user to.
- `bun scripts/baseline.ts capture <dir>` renders every scene's on-air frame and
  `bun scripts/baseline.ts compare <dirA> <dirB>` diffs two captures. Run both
  around a change that must not move a pixel.

## Shipping a scene

A verified `.rml` is not a deliverable. The show system plays a scene through a
registry entry, and a browser loads only a signed `.riv`. Read
`docs/ARCHITECTURE.md` section 5 for the entry's shape before writing one.

1. The scene (and its generator) in `graphics/basketball-v2/`, from
   `DESIGN_SYSTEM.md`.
2. `bun run codegen` writes `scenes.gen.ts` from the `.rml`: artboard, state
   machine, view model, timeline lengths and every property. `bun run check`
   fails while it is stale.
3. One registry entry in `graphics/basketball-v2/graphics/<name>.ts`, added to
   `graphics/basketball-v2/index.ts`. Its `bind` returns every property of the
   scene, so a misspelled one fails to compile.
4. The golden test (`graphics/basketball-v2/golden.test.ts`) binds the entry's
   `demo` against the seed and compares it with the scene's Default instance. It
   fails while a scene has no entry, and `KNOWN_DRIFT` records each difference
   that stands.
5. `bun run riv:build` signs each scene into `build/riv/<scene>.riv`.
6. `/renderer` on the server draws program for OBS from those files. `bun run
   site:build` builds the stakeholder site, which lists the graphic from its
   entry with no site code.

`bun run check` and `rive . --verify` run clean before every commit.

Two traps will cost you an afternoon otherwise:

- **An unsigned `.riv` fails silently in a browser.** There is no error, and the
  load promise never settles. `riv:build` always publishes with `rive --publish`,
  which needs `rive login`. Never point the renderer at the output of a plain
  `rive .` build.
- **A publish is watermarked** until `rive push` binds the project to a Rive
  file. `riv:build` warns when `rive.yaml` has no `push:` block. Pushing creates
  a file in the user's Rive workspace, so ask before running it.
