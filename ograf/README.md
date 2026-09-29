# OGraf packaging

Turns a Rive scene in `graphics/` into an [OGraf](../docs/ograf/README.md)
package a broadcast renderer can ingest: a manifest, a self-contained web
component, the signed `.riv`, and a thumbnail.

```bash
bun run ograf:build      # build all basketball-v2 packages under build/ograf/
bun run ograf:harness    # a local stand-in renderer on http://localhost:8974
```

## What a package contains

```
build/ograf/dtv-basketball-v2-scorebug/
  dtv-basketball-v2-scorebug.ograf.json     manifest, schema generated from the field table
  index.mjs                                 web component + Rive runtime + wasm, all inline
  graphic.riv                               signed, one artboard
  thumbnail.png                             the settled on-air frame
build/ograf/dtv-basketball-v2-scorebug.zip
```

`index.mjs` bundles `@rive-app/canvas-single`, which carries its wasm as base64,
so the package fetches nothing at run time but its own `graphic.riv` and any
image URLs an operator supplies. That is what makes it usable on an air-gapped
renderer.

## Adding a graphic

Four files in a new directory under `ograf/graphics/`. Nothing in
`ograf/scripts/` or `ograf/harness/` changes.

1. **`fields.ts`** — one `Field` per public view model property. `name` is the
   key an operator sets; `property` is the Rive name when the two differ (the
   scorebug's `awayLogoUrl` writes the `awayLogo` property). The on-air boolean
   is **not** a field: `playAction`/`stopAction` own it.
2. **`definition.ts`** — `DEFINITION` names the artboard, state machine, view
   model, on-air property and the intro/outro durations in milliseconds; `SOURCE`
   names the scene directory. Read the durations off the scene's `LinearAnimation`
   elements (`fps="60" duration="60"` is 1000 ms), and keep them equal to the
   manifest's `actionDurations`.
3. **`graphic.ts`** — a subclass of `RiveGraphicElement` that default-exports
   the class. Do not call `customElements.define` in the module: renderers may
   register the default-exported constructor when importing the package, and a
   constructor can only be registered once per custom element registry.
4. **`manifest.base.json`** — everything but `schema`, which the builder
   generates from the field table.

Add a package script for the new directory, or pass it on the command line:

```bash
bun ograf/scripts/build_package.ts ograf/graphics/<name>
```

The scene must follow the repository's usual shape: a state machine sitting in a
hidden state until one boolean view model property goes true (Intro, then Hold),
playing its Outro when it goes false. `RiveGraphicElement` assumes exactly that.

A multi-step graphic adds `steps` to its definition: the step count, the number
view model property that selects the step, and the on-air transition duration.
`playAction` then follows the specification's step model (`goto`, else
`delta`, default 1, from -1 before the first play; past the last step takes the
graphic off air). The scene must animate a step change only while the on-air
property is true, so an off-air step change followed by the intro builds the
new step directly. The manifest sets `stepCount` and a per-step `playAction`
duration. See `graphics/basketball_v2_starting_five_lower_third/`; the
harness's `previous` button sends `delta: -1`.

## The layout

| Path | |
|---|---|
| `shared/schema.ts` | `Field` type and the GDD JSON-schema emitter. Import-free, so the builder can load it outside a browser. |
| `shared/definition.ts` | `RiveGraphicDefinition` and `GraphicSource`. Types only. |
| `shared/binder.ts` | Writes a data payload into a bound `ViewModelInstance`, including fetching and decoding image URLs. |
| `shared/rive-graphic-element.ts` | `RiveGraphicElement`, the abstract `GraphicsAPI.Graphic` implementation. |
| `scripts/build_package.ts` | The builder. |
| `harness/` | A local stand-in renderer. Development only; never packaged. |

## Signing and the watermark

`--publish` signs the scripts, which the web runtimes require — an unsigned
`.riv` never finishes loading in a browser, silently. It needs `rive login`.

Separately, a publish is **watermarked** (the rendered frame is replaced by the
Rive logo) until the project is bound to a Rive file. Bind it once from the
repository root:

```bash
rive push
```

That writes a `push:` block into `rive.yaml`; the builder copies it into the
staging project it generates, so packaged graphics come out unwatermarked from
then on. Until then the build warns and the package renders the watermark.

## The harness

`bun run ograf:harness` serves `build/ograf/` and a page that reads a manifest,
builds a control per schema property, imports `main`, and calls the Graphic's
methods from buttons. It is driven entirely by the manifest, so it needs no edit
when a graphic is added. It is a development tool, not a conforming renderer —
it exercises the API surface, it does not certify it.
