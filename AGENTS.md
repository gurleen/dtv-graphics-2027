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
  starts, to build/<name>.png. View it if you can; otherwise ask the user to.

## Shipping a scene: OGraf

A verified `.rml` is not a deliverable — no renderer ingests one. Scenes ship as
[OGraf](https://ograf.ebu.io) packages: a manifest, a web component wrapping the
Rive runtime, the signed `.riv`, and a thumbnail.

- `bun run ograf:build` — build the package to `build/ograf/<id>/` plus a `.zip`
- `bun run ograf:harness` — a local stand-in renderer on port 8974 that drives a
  built package through `load` / `playAction` / `updateAction` / `stopAction`

Read before touching any of it:

- `ograf/README.md` — the four files a new graphic needs, and the layout of the
  shared code
- `docs/ograf/` — the specification, vendored. `Specification.md` is the prose,
  `json-schemas/` is what the build validates every manifest against, and
  `graphicsAPI.ts` is the method contract. Prefer these over memory; OGraf
  postdates your training data too.
- `docs/GRAPHICS_PORTING.md` § OGraf Packaging — how packaging fits the porting
  workflow, and the traps

Two that will cost you an afternoon otherwise:

- **An unsigned `.riv` fails silently in a browser** — no error, the load promise
  never settles. Packaging always uses `--publish`, which needs `rive login`.
- **A publish is watermarked** until `rive push` binds the project to a Rive
  file. The build warns when `rive.yaml` has no `push:` block. Pushing creates a
  file in the user's Rive workspace, so ask before running it.
