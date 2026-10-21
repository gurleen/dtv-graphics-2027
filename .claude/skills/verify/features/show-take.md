# Preview, take and program

On the show page an operator cues a rundown cue into their own preview, takes it to the one shared program, steps a graphic with Next (a one-step graphic leaves air on the first Next), and clears a layer or everything. OBS's `/renderer` shows program and nothing else.

## Sub-features

- `take-activate` opens the show picker when no show is active, and `Activate` loads the console.
- `take-cue` puts the selected rundown cue into my preview: the preview monitor draws it and the row gets the PVW tag.
- `take-take` moves my preview to program, empties my preview, and replaces whatever was on that layer.
- `take-next` moves a stepped graphic (Starting Five, Burning Question, Halftime Adjustments) one step, and past the last step takes it off air.
- `take-clear-layer` clears one layer from On air by layer. `take-clear-preview` empties my preview.
- `take-clear-all` clears every layer, only on a hold.
- `take-keys` runs the same actions from the keyboard.
- `take-covers` handles a graphic that covers another layer: the double and triple talent lower thirds take the scorebug off.

## How to get to it (user POV)

- Open `http://localhost:<port>/#/show` (the default route). On a first visit, type a name in `Your name` and press `Start`.
- Choose a row in the `Rundown` grid, then press `Cue to my preview` in the Selected cue panel, or press Enter.
- Press `Take` (Space), `Next` (N) and `Clear PVW` (Esc) in the right rail.
- Press `Clear` on a row of On air by layer. Shift+Esc clears the lower third.
- Hold `Clear all` in the top bar, or hold Shift+Backspace for about 0.6 s.

## Driving it with journeys/take.ts and lib.ts

Preconditions:

- A fresh `dtv.sh up --port=8998`, with the doctor passing.

- **Activate.** The journey opens `alex` on `#/show`. If `getByRole('button', { name: 'Activate' })` shows, it presses it. `.topbar .show-name` reads `Saint Joseph's at Drexel`.
- **Cue.** It clicks the `Zach Spiker` row and `Cue to my preview`. `waitMonitor(alex, 'preview', { lower: 'basketball-v2/staff-lower-third' })` holds. `/renderer?bus=preview&operator=alex` draws the same graphic. Program `/renderer` stays empty, and `view('alex').preview.lower.graphic` names the graphic.
- **Take.** It presses `/^Take/`. The program monitor and program `/renderer` draw the staff lower third, the preview monitor empties, and `view('alex').program.lower` holds it.
- **Clear.** It presses `Clear` in `.layer-row[data-layer="lower"]`. Program `/renderer` and the monitor go empty, and the API shows no lower slot.
- **Run it.** `.claude/skills/verify/journeys/take.ts --port=8998` exits 0 with 14 checks passed.
- **Next and keys.** `bun apps/controller/scripts/proofs.ts --port=8999 --quick` runs the keyboard stretch. 1 airs the scorebug. Up, Down and Enter cue Starting Five. Esc clears preview. Space takes. N steps, and N past the last step takes it off air.
- **Next on a one-step graphic.** `.claude/skills/verify/journeys/next.ts --port=8998` airs the scorebug, takes a staff lower third and presses N: the lower third leaves program and `/renderer`, and the scorebug stays. Without a selection N moves the topmost rundown graphic on program; it never reaches a free-panel graphic (scorebug, Score to Break) unless that graphic's cue is selected. A tap of Shift+Backspace changes nothing, and a hold clears all.
- **Every graphic.** The same suite without `--quick` takes all 15 rundown cues and the 2 free-panel graphics through preview, Take, each step and Clear. It checks `all 17 graphics reached program`, and it records `build/controller/runthrough.webm`.

## Gotchas

- Keys do nothing while focus is in a text field, a dialog or an open list. Blur first: `page.evaluate('document.activeElement?.blur()')`.
- `Take` is disabled while my preview is empty. A click on it does nothing and raises no error.
- A Take on a layer that is still in its intro waits for the intro to finish before the outro starts. Wait for `phase === 'on'`, not a fixed sleep.
- `proofs.ts` deletes `build/controller/proofs/` when it starts, and it has no `--out` flag. Copy what you need into `build/verify/` before you run it again.
- `proofs.ts` also covers two operators, rundown edits, problems and a restart in one run. `--quick` skips only the 17-graphic loop.
