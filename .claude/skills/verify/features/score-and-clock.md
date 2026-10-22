# Score and clock

The score bar along the bottom of the show page shows the live game: the score, timeouts, team fouls, bonus, the game clock, the shot clock, the period, the phase and possession. It has no controls and the game has no keys; a live data feed, still to be built, will drive the game over `game.apply`. Until then, journeys and proofs change the game over `game.apply` themselves, with the source `operator`, the seeded game's authority for every field group. Every change reaches the bar and the scorebug on program at once, because binds read the live game.

## Sub-features

- `score-display` shows each side's score, timeouts left as pips, team fouls and a `Bonus` tag.
- `clock-display` shows the game clock, ticking while it runs, the shot clock (a dash when it is off), the period and the phase.
- `possession-display` lights the arrow of the side with possession.
- `shot-clock-buzzer` freezes the shot clock when the game clock reaches 0:00.0, and blanks it at halftime and final.

## How to get to it (user POV)

- The `footer.scorebar[aria-label="Game"]` sits at the bottom of `#/show`. The away side is on the left and the home side is on the right, each in a `[data-side="away|home"]` group.
- `[data-testid="score-away|home"]`, `[data-testid="game-clock"]` and `[data-testid="shot-clock"]` show the score and clocks.
- The bar reads `This show has no game.` when the active show has no game.

## Driving it with journeys/score.ts and lib.ts

Preconditions:

- A fresh `dtv.sh up --port=8998`, with the doctor passing. The seeded game starts at SJU 68, DREX 72, 13:59 in the 2nd half, shot clock 24.

- **Run.** `.claude/skills/verify/journeys/score.ts --port=8998` exits 0 with 5 checks passed.
- **Air the scorebug.** Blur focus and press `Digit1`. `waitRendered(program, { bug: 'basketball-v2/scorebug' })` holds.
- **Score.** `s.api.game.apply({ sport: 'basketball', gameId, source: 'operator', commands: [{ type: 'score', side: 'home', value: 75 }] })`. `score-home` reads 75, `s.live(game).score.home` is 75, and `window.dtvRenderer.layers().bug.frame.values.homeScore` on `/renderer` is `75`.
- **Other fields.** Apply the absolute command (`clock`, `clockSet`, `shotClock`, `possession`, `timeouts`, `teamLine`, `bonus`, `period`, `phase`) and read the bar, `s.live(game)` and the bug frame's values on `/renderer`. For the clock, check `clock.running` and that the scorebug's digits move, because renderers never tick the clock themselves. The server re-projects on each second boundary, or each tenth under a minute.
- **Suite.** `bun apps/renderer/scripts/drive.ts --port=8999` sends a score change over `game.apply` and checks that only the scorebug region redraws.
- **The whole game.** `bun apps/controller/scripts/game.ts --port=8994` (after `bun run riv:build`) plays tip-off to final, feeding the game over `game.apply` while show actions go through the controller's keys and clicks, with `/renderer` open, a SIGKILL restart while the clock runs, and a Take pressed during the outage. It starts its own seeded server, asserts program from `output.watch` at each step, and writes screenshots and `renderer.webm` and `controller.webm` to `build/controller/game/`.

## Gotchas

- `game.apply` from a source that is not the field group's authority is refused with `Another source writes this field group`. Use `operator` against the seed.
- Commands carry absolute values (`score home 75`), so a resend changes nothing (docs/ARCHITECTURE.md section 4).
