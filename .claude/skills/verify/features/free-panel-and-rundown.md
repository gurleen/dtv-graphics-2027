# Free panel and rundown editing

The free panel airs a graphic straight to program with one press, and the same press takes it off. The rundown is the show's ordered list of cues. Operators add, edit, reorder and remove cues in the middle column, and a save on a cue that is on air refreshes program.

## Sub-features

- `free-air` airs a free-panel graphic to program. `free-toggle` takes it off with a second press of the same button.
- `free-keys` airs the free-panel buttons with keys 1 to 9.
- `free-labels` shows the server's labels: Scorebug, Talent with one, two or three crew members, and Score to break · left.
- `rundown-add` adds a cue through the `Add cue` dialog, after the selected row.
- `rundown-edit` edits a cue's params, note or text fix in the inspector, then `Save`.
- `rundown-refresh` saves a cue that is on program, and program redraws with the new values.
- `rundown-reorder` drags a row by its handle, with the mouse or from the keyboard.
- `rundown-remove` removes a cue with its row's `Remove` button.
- `rundown-error` shows why a cue cannot air on its row (`.cue-error`).

## How to get to it (user POV)

- The `Free panel` region is on the show page's left. Each `.free-button` shows its key (1 to 5 in the seed).
- The `Rundown` region is in the middle. `Add cue` is in its header. The `Selected cue` panel below it holds the fields, `Save` and `Cue to my preview`.
- Each row has a `Move <label>` drag handle and a `Remove <label>` button.

## Driving it with controller proofs.ts and lib.ts

Preconditions:

- `build/riv` is complete, so the monitors draw.
- For the suite, port 8999 is free. For a journey, an instance runs from `dtv.sh up` and the seeded show is active.

- **Free panel.** Press the `.free-button` whose `.free-label` starts with `Scorebug`. `waitMonitor(page, 'program', { bug: 'basketball-v2/scorebug' })` holds, and the button gets `data-pgm`. Press it again, and the bug layer goes `empty`.
- **Keys.** Blur focus, then press `Digit1`. The scorebug is on program.
- **Add cue.** Select the last row and press `Add cue`. In the dialog, open the first `.select-button`, choose `Talent Lower Third (Single)`, open the first combobox, choose `Rob Brooks`, and press `Add to rundown`. `world()` shows a new last cue on the seeded game's show with `graphic: 'basketball-v2/talent-lower-third-single'` and `params: { talents: ['rob-brooks'] }`.
- **Edit on air.** Take the `Josh Reed #5 · game` row. In the inspector, toggle the `threes` and `stl` stat chips and press `Save`. `dtvMonitors.program.frame.layers` for `lower` has a `statLine` that ends in `STL` and no longer holds `3PT`. The cue in `world()` has `line.stats` set to `pts, reb, ast, stl`.
- **Reorder.** Click the last row, then press Right (to its handle), Enter, Up and Enter. In `world()`, the last two cue ids have swapped.
- **Remove.** Press `Remove Talent · Rob Brooks`. The rundown length in `world()` is back to 15.
- **Suite.** `bun apps/controller/scripts/proofs.ts --port=8999 --quick` checks all of the above under `rundown edits`. Its screenshots are `40-add-cue.png`, `42-edited-on-air.png` and `43-reordered.png` in `build/controller/proofs/`.

## Gotchas

- An edited rundown cue reaches air only through `Save` while it is on program, which sends `refresh`. Editing a cue that is only in preview does not change preview.
- The free panel is derived, not stored. It holds two buttons: the scorebug on 1 and Score to Break on 2. The talent lower thirds are rundown cues.
- A save on a stale rundown is refused, and `.problem-strip` reads `Someone changed the rundown`. See [two-operators.md](./two-operators.md).
- The keyboard reorder needs short pauses (about 200 ms) between keys while the drag state settles. Without them the move is dropped.
