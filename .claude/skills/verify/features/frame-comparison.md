# Frame comparison against the phase 0 captures

This is the gate that proves a change left the on-air pixels alone. Each of the 17 graphics is aired by itself through the real server and `/renderer`, then compared with its phase 0 capture: the Rive CLI's render of the scene's Default instance, 180 frames after `isPlaying`. Use it after any change to a scene, the renderer, the projector or a bind.

## Sub-features

- `compare-all` runs every registry graphic and passes when no 40 x 40 tile holds more than 100 pixels over a channel delta of 64.
- `compare-one` runs one graphic with `--only=<graphic id>`.
- `compare-changes` uses `--changes` to render small real changes as well: the scorebug's home score +1 and period `2ND HALF`, the player lower third's jersey `3` and last name `REID`. It proves the gate catches each one.
- `compare-runs` repeats each render with `--runs=N`, to measure noise.
- `compare-data-images` uses `--data-images` to keep the seed's image URLs instead of the scene's embedded images.

## How to get to it (user POV)

- Nothing in the UI. Reviewers run this command after a graphics change and read `report.json` and the `*.diff.png` files.

## Driving it with renderer compare.ts

Preconditions:

- `build/riv` is complete and fresh.
- The phase 0 captures exist at `/Users/gurleen/Developer/Personal/dtv-graphics-2027/build/baseline/before/` (one `<scene stem>.png` per scene). They live in the main checkout's gitignored `build/`, not in a worktree. Without them, the run is not possible. Report it as not run.
- Port 8999 is free. The script seeds its own server.

- **Run.** `bun apps/renderer/scripts/compare.ts --port=8999 --baseline=/Users/gurleen/Developer/Personal/dtv-graphics-2027/build/baseline/before --out=build/verify/<run>/compare`. It takes about a minute.
- **Pass.** The last line reads `0 of 17 renders over the gate ...; 0 changes missed`, and the exit code is 0. Each graphic prints a `pass` line with its pixel counts per delta and its densest tile.
- **Evidence.** `--out` holds `<graphic>.run1.png` (what `/renderer` drew), `<graphic>.run1.diff.png` (where it differs) and `report.json` (the gate, the baseline path and every row).
- **Catch check.** Add `--changes`, and each change prints `caught`. A `MISS` line means the gate cannot see that change.

## Gotchas

- Bound values that still differ from the scene's Default instance are patched to the scene's values before the shot, so the gate measures the renderer, not the data. The `pass` line lists those patches (`set to the scene's: {...}`). A new drift there is a data or bind change, not a pixel regression.
- The captures are opaque over the CLI's background colour. The script paints the page in that colour, so a screenshot from it is not transparent. That is expected.
- The gate cannot see a swap of the scorebug's faint team watermark. Check that by eye in the run PNG.
- Burning Question's sponsor logo is the noisiest tile in a correct render (up to about 64 pixels over delta 64). A result near 100 there is noise, not a failure.
