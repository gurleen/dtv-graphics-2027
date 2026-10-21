# Renderer output

`/renderer` is the page OBS loads as a browser source. It is a transparent 1920 x 1080 page that draws program, and it holds no state of its own. A reload rebuilds what is on air from the first frame it gets. `/renderer?bus=preview&operator=<id>` draws one operator's preview, for a multiviewer or a second screen.

## Sub-features

- `out-program` draws program and nothing else. A cue that is only in preview does not show.
- `out-preview-bus` draws only the named operator's preview at `?bus=preview&operator=<id>`.
- `out-live-values` redraws a bound value change, such as a score, on the affected graphic only.
- `out-reload` returns, after a reload mid-show, with the same slots, phases and steps, drawn as before. The intro replays from the current step.
- `out-steps` plays a step's transition on Next (Starting Five, Burning Question), and starts a fresh take at step 1.
- `out-score-to-break` keeps Score to Break's side until its exit signal, and refreshes to the other side.
- `out-motion-headshot` plays the player lower third's motion clip over the still.
- `out-rapid` ends rapid takes on the last one, with never two canvases on a layer at once.
- `out-clear` leaves a transparent frame after Clear all.

## How to get to it (user POV)

- In OBS, a browser source at `http://<server>:<port>/renderer`, 1920 x 1080.
- In a browser, the same URL. Add `?bus=preview&operator=alex` for alex's preview.
- `document.body.dataset.status` is `live` once the output stream is connected.

## Driving it with renderer drive.ts, renderer proofs.ts and lib.ts

Preconditions:

- `build/riv` is complete and fresh (`dtv.sh doctor`). Without it, every layer stays in `loading` and the page stays transparent with no error.

- **Journey.** `const program = await s.renderer('/renderer')`, then run the show from a controller page. `waitRendered(program, { lower: '<graphic id>', bug: 'empty', card: 'empty' })` passes once the intro ends. `s.shoot(program, name)` keeps the alpha channel, so an empty frame is a transparent PNG.
- **Preview bus.** `s.renderer('/renderer?bus=preview&operator=alex')` draws alex's cue alone. [`journeys/take.ts`](../journeys/take.ts) proves it beside program.
- **Reload.** Read `JSON.stringify(dtvRenderer.layers())`, call `page.reload()`, wait for `body[data-status="live"]` and every layer to settle, then read it again. The two strings are equal.
- **Suite, the show.** `bun apps/renderer/scripts/drive.ts --port=8999 --out=build/verify/<run>/drive`. It runs empty → scorebug → lower third in preview only → taken → home score +3 (only the scorebug region changes) → reload → clear all. It checks pixel coverage per region, and it exits 0 with `all states hold`.
- **Suite, special cases.** `bun apps/renderer/scripts/proofs.ts --port=8998 --out=build/verify/<run>/renderer-proofs [--only=steps,score-to-break,motion-headshot,reload,two-renderers,rapid]`. Its screenshots are named with their time after the command, and it prints each layer's phase changes.

## Gotchas

- `apps/renderer/scripts/proofs.ts` serves its two-renderer page on `--port` + 1. Run it with `--port=8998` only, and only when nothing else holds 8999.
- A layer that is still `entering` or `leaving` is mid-animation. Wait for `on` or `empty` before a screenshot or a comparison.
- The page is never perfectly still. `drive.ts` measures how much a frame differs from itself a second later before it judges a reload. Compare against that drift, not against zero.
- `/renderer` with `?bus=preview` and no `operator` falls back to program.
- The scorebug sits bottom left, at about x 0 to 540 and y 850 to 1080. Lower thirds sit beside it. A full-frame coverage check hides a graphic drawn in the wrong region.
