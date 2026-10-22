# Games

A game is its show. Operators add next week's game ahead of time, give it a crew, and make it the active game when it is time. The game's show (its crew and rundown) is keyed by the game's id and stored only once someone edits the crew or the rundown. Making a game active empties every preview, and program stays on air.

## Sub-features

- `games-list` lists every game under `Games` on the data page, newest first, with its event title, crew and cue count. The active one carries `.active-mark` in its row, and only one row does.
- `games-new` creates a game with `+ Game`: away and home team, venue, game day, start time, event title, conference game. The dialog asks nothing about a show. The same matchup twice on one day is refused in the dialog. The new game is selected.
- `games-record` shows the selected game's venue, start, conference game and event title, its crew editor, its cue count, `Make active` and `Delete`. `Save` saves the game and its crew together.
- `games-crew` edits the crew. The first crew edit of a game with no show stored puts its show row.
- `games-activate` makes a game active with `Make <label> active` and a confirm dialog. Every controller's top bar and rundown switch, and previews empty.
- `games-first-cue` adds the first cue to a game with an empty rundown with `Add cue` on the show page. The rundown edit keeps the crew.
- `games-delete` deletes an inactive game, and its show row and live state go with it. `Delete` is disabled on the active game, and the server refuses that delete too. The server also refuses deleting a show row on its own.
- `games-picker` offers `Activate` beside each game on the show page when no game is active.

## How to get to it (user POV)

- Open `Data`, choose `Games` in the left list, and use `+ Game` and per-row `Make ... active`.
- Select a game row to show its record, with the crew editor, `Make active` and `Delete`.

## Driving it with controller games-proofs.ts

Preconditions:

- Port 8999 is free. The suite does not need `build/riv`, because it reads the tally from the rows and the show stream, not from the monitors.

- **Run.** `bun apps/controller/scripts/games-proofs.ts --port=8999 --out=build/verify/<run>/games`. It exits 0 with `all games checks passed`.
- **List.** `Games` marks Saint Joseph's at Drexel active. There is no `Shows` list and no `+ Show`.
- **Create game.** In the `New game` dialog: `Away team` `hofs` → `Hofstra · MBB`, `Home team` `drexel mbb` → `Drexel · MBB`, `Venue` `Daskalakis Athletic Center`, `Game day` `2026-11-15`, `Start time` `14:30`, `Event title` `CAA opener`, then `Create game`. `world()` has the game `2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb` and no show row for it, its `startsAt` carries the browser's UTC offset, and `game.watch` gives a 0 to 0 live state. A second `Create game` with the same teams and day shows an `alert` that matches `already play that day`.
- **Crew.** The record shows `0 cues` and no crew. `+ Add crew`, `Role for crew member 1` `Sideline`, `Save`. `world().get('show', <game id>)` has one crew member and no cues.
- **Activate.** Sam has a cue in preview and the scorebug is on program. Alex presses `Make Hofstra at Drexel · Nov 15 active` and confirms `Make active`. `view('sam').game.id` is the game's id, sam's preview is empty, `program.bug` is the same slot, and both top bars read `Hofstra at Drexel`.
- **First cue.** On sam's show page, `Add cue` with `Talent Lower Third (Single)` and `Rob Brooks`. The show row has one cue and keeps its crew.
- **Delete.** A spare game with a show row is put over the API. `Delete` is disabled on the active game, and `data.apply` refuses deleting it with `is active`, and refuses deleting the spare's show alone with `only with its game`. Deleting the spare game from its record removes the game and its show row.
- **Restart.** After a server restart, the same game is active with its one cue, and the list still marks it.

## Gotchas

- A game's id is its season, day and teams. The record does not edit those; a game on another day is a new game.
- A game with no show row reads as an empty crew and rundown everywhere (`showOf`). Do not expect `world().get('show', id)` to exist until the first crew or rundown edit.
- The game's start time uses the browser's time zone. Chromium shares the machine's zone, so an expected offset computed in the script matches.
- The `Make ... active` confirm says that previews empty and program stays on air. Assert both in the API, not only in the dialog's text.
- The record panel carries its own `.active-mark` when the active game is selected. Count marks in `.data-row`, not on the page.
