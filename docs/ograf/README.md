# OGraf specification (local copy)

OGraf is the EBU's open specification for broadcast graphics. A graphic is a
folder: a `*.ograf.json` manifest, a JavaScript module whose default export is a
class extending `HTMLElement`, and the resources those two reference. Any
conforming renderer loads the folder and drives the graphic through
`load()` / `playAction()` / `updateAction()` / `stopAction()` / `dispose()`.

Vendored here so the build does not depend on network access, and so the
specification this repository was written against is pinned rather than
whatever is live.

| File | Source |
|---|---|
| `Specification.md` | `https://raw.githubusercontent.com/ebu/ograf/main/v1/specification/docs/Specification.md` |
| `graphicsAPI.ts` | `https://raw.githubusercontent.com/ebu/ograf/main/v1/typescript-definitions/src/apis/graphicsAPI.ts` |
| `json-schemas/**` | `https://ograf.ebu.io/v1/specification/json-schemas/…` |

- **Specification version:** v1 (Graphics Definition, stable September 2025)
- **Fetched:** 2026-09-16

`json-schemas/` holds all nine files the manifest schema `$ref`s, keeping their
published `$id`s. `ograf/scripts/build_package.ts` registers them with Ajv and
validates every generated manifest against them, so a manifest that drifts from
the specification fails the build rather than the renderer.

`graphicsAPI.ts` is a reference copy for reading. The code types against the
`ograf` npm package (v1.2.0), which is the same definitions published by the EBU.

To refresh, re-fetch the URLs above and update the date. Expect
`ograf/shared/schema.ts` to need attention if the GDD type vocabulary changes.
