# Score and clock

The score bar along the bottom of the show page runs the live game: the score, timeouts, team fouls, bonus, the game clock, the shot clock, the period and possession. Every change reaches the scorebug on program at once, because binds read the live game.

## Sub-features

- `score-points` changes a side's score with `+1`, `+2` and `+3`, and `<ABBR> minus one` takes a point off.
- `score-timeouts` sets a side's timeouts left by pressing the n-th timeout pip.
- `score-fouls` changes team fouls with `Foul on <side>` and `Foul off <side>`. `Bonus` toggles the bonus.
- `clock-run` starts and stops the game clock with `Start` and `Stop`.
- `clock-set` sets the clock: press `Set the game clock`, type into `Game clock`, then press Enter.
- `shot-clock` resets the shot clock with `30` and `20`.
- `period` picks the period from the `Period` select.
- `possession` sets possession with `Possession <ABBR>`. A second press clears it.
- `phase` picks pregame, live, halftime or final from the `Phase` select. Halftime blanks the shot clock; Final makes the scorebug read FINAL.
- `game-keys` runs the same controls from the keyboard: Q, W, E add 1, 2, 3 for away and I, O, P for home; Shift+Q and Shift+I take one back; C starts or stops the clock; R and T reset the shot clock to 30 and 20; `[` and `]` give possession. `?` (or the free panel's `Keys` button) lists every key. Keys do nothing while focus is in a text field. The table is `KEY_MAP` in `apps/controller/src/show/keys.ts`.
- `shot-clock-buzzer` freezes the shot clock when the game clock reaches 0:00.0, and blanks it at halftime and final.

## How to get to it (user POV)

- The `footer.scorebar[aria-label="Game"]` sits at the bottom of `#/show`. The away side is on the left and the home side is on the right, each in a `[data-side="away|home"]` group.
- `[data-testid="score-away|home"]` shows each score.
- The bar reads `This show has no game.` when the active show has no game.

## Driving it with journeys/score.ts and lib.ts

Preconditions:

- A fresh `dtv.sh up --port=8998`, with the doctor passing. The seeded game starts at SJU 68, DREX 72, 13:59 in the 2nd half, shot clock 24.

- **Run.** `.claude/skills/verify/journeys/score.ts --port=8998` exits 0 with 4 checks passed.
- **Air the scorebug.** Blur focus and press `Digit1`. `waitRendered(program, { bug: 'basketball-v2/scorebug' })` holds.
- **Score.** In `[data-side="home"]`, press the button whose name starts with `+3` (its key hint, P or E, follows in the name). `score-home` reads 75. `s.live('2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb').score.home` is 75. `window.dtvRenderer.layers().bug.frame.values.homeScore` on `/renderer` is `75`.
- **Other controls.** Use the same pattern for each: press the control, read `s.live(game)` for the new state, and read the bug frame's values on `/renderer`. The clock is the exception. Check `clock.running` and that the scorebug's digits move, because renderers never tick the clock themselves. The server re-projects on each second boundary, or each tenth under a minute.
- **Suite.** `bun apps/renderer/scripts/drive.ts --port=8999` sends a score change over `game.apply`, not through the bar, and checks that only the scorebug region redraws.
- **The whole game.** `bun apps/controller/scripts/game.ts --port=8994` (after `bun run riv:build`) plays tip-off to final through the controller's keys and clicks only, with `/renderer` open, a SIGKILL restart while the clock runs, and a Take pressed during the outage. It starts its own seeded server, asserts program from `output.watch` at each step (78 checks), and writes screenshots and `renderer.webm` and `controller.webm` to `build/controller/game/`.

## Gotchas

- The `+1`, `+2` and `+3` buttons exist once for each side. Scope them to `[data-side=...]`, or the click hits the away side.
- The bar sends absolute values (`score home 75`) computed from the score it showed. When two operators press `+2` for one basket, both send the same value and the score moves once. That is the design (docs/ARCHITECTURE.md section 4), so expect it rather than a double count.
- A key computes its absolute value from the live state the page shows, including commands still waiting for an answer, so Q pressed twice before the first answer gives +2. A pending control pulses amber; after 10 s without an answer it reports the failure beside Take.
