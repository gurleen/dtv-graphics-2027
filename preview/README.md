# Graphics preview

From the repository root, run `bun install` once, then `bun run dev` for the Vite dev server or `bun run build` for a static build in `preview-dist/`.

The page previews each graphic in the Rive web runtime, one at a time. The links in the header select a graphic, and the URL hash names the selection, so `#basketball-halftime-adjustments` opens the halftime adjustments directly:

| Slug | Scene | Component |
| --- | --- | --- |
| `ncaa-basketball-scorebug` | `graphics/10_ncaa_basketball_scorebug/10_ncaa_basketball_scorebug.rml` | `src/scorebug_preview.tsx` |
| `basketball-halftime-adjustments` | `graphics/basketball-v2/halftime_adjustments.rml` | `src/halftime_adjustments_preview.tsx` |

`scripts/generate.ts` builds the runtime assets. For each graphic it creates an isolated Rive project under `build/preview-<slug>/`, sets the scene's `isPlaying` view-model default to true in that temporary copy, and writes `preview/public/graphics/<slug>.riv` and a reference `<slug>.png`. `bun preview/scripts/generate.ts <slug> ...` regenerates only the named graphics; with no arguments it regenerates all of them, one at a time. In development, changing a scene's RML, scripts, fonts or logos regenerates that graphic's asset and reloads the page.

## Scorebug

The browser executes the embedded `basketball_score_scroll.luau` controller. React writes every public view-model property: the game state (`isPlaying`, `period`, `clock`, `shotClock`) and, per side, `awayScore`/`homeScore`, `awayAcronym`/`homeAcronym`, `awayLogo`/`homeLogo`, `awayPrimaryColor`/`homePrimaryColor`, `awaySecondaryColor`/`homeSecondaryColor`, `awayTimeouts`/`homeTimeouts` and `awayBonus`/`homeBonus`. It never writes the internal score strings, offsets, or glow values. The game clock and looping shot clock run in React, and a score increase of exactly three selects the +3 / gold pulse sequence automatically.

## Halftime adjustments

The playout card holds `isPlaying` and the `step` buttons: Away is step 0 and Home is step 1. On air, a step change plays the team change; off air it takes effect immediately. Each team card writes `{side}School`, `{side}Mascot`, `{side}Line1`, `{side}Line2`, `{side}Logo` and the two colours. Text is upper-cased as it is typed. Each adjustment shows a character count against the 30-character guide and turns amber beyond it; longer lines still fit, because the scene shrinks them. Selecting a team preset sets the school, mascot, logo and colours but leaves the adjustments alone.

## Shared behaviour

Colors are written with `ViewModelInstanceColor.rgb()` rather than the signed 32-bit `value`. Every page can show the transparent graphic against dark, light, or checkerboard backgrounds and outline the artboard bounds (`src/stage.tsx`).

Team presets come from `src/teams.json`, a vendored copy of `src/data/teams.json` in the `dtv-graphics-2026-hgfx` repository, normalized by `src/teams.ts` into 361 teams grouped by conference. Each team carries its school (`team`), mascot, acronym (`abbreviation`) and both colors (`color` and `alternate_color`); the 35 entries with a missing or malformed color fall back to neutral values. Logos are served from `https://images.dragonstv.io/logos/<logo_name>`, built from each team's `logo_name`. The 38 teams with no `logo_name` keep whatever logo is already up and are omitted from the logo picker.

The page swaps a logo by fetching its bytes and calling `decodeImage`, so a school need not be embedded in the `.riv` to be previewed. Each logo decodes once into a module-level cache in `src/common.ts` because the engine holds a reference until `unref()`; a failed fetch is evicted so the next selection retries the CDN, and the cache is released when a preview unmounts.

## Signing

Browser scripting requires signed bytecode. Run `rive login` before generating the preview. The generator renders the reference PNG first, then runs `rive --publish` to sign the scene through Rive's compile service and copies that signed output into `preview/public/graphics/`. Generation requires network access and fails if signing fails. Do not replace the browser asset with an unsigned `--once` or `--screenshot` build. Rive may watermark signed output when the generated project is not bound to an editor file.

## Adding a graphic

1. Add an entry to `PREVIEW_GRAPHICS` in `scripts/generate.ts`: slug, scene, artboard, the scene's `isPlaying` default element and the advance frame of the reference PNG.
2. Add the files that should regenerate it to `PREVIEW_SOURCES` in `vite.config.ts`.
3. Write a preview component that renders `Stage` beside its controls, and add it to `GRAPHICS` in `src/main.tsx`.
