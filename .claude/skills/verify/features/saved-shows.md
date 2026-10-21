# Saved shows

Operators build next week's show ahead of time. They add the game, give it a show, copy an earlier show's rundown onto it (cues on the old opponent's people are flagged `CHECK:`), and make it the active show when it is time. Making a show active empties every preview, and program stays on air.

## Sub-features

- `shows-list` lists every show under `Shows` on the data page. The active one carries `.active-mark`, and only one show does.
- `shows-new-game` creates a game with `+ Game`: away and home team, venue, game day, start time, event title, conference game. The `Create its show too` box can create its show as well. The same matchup twice on one day is refused in the dialog.
- `shows-new-show` creates a show with `+ Show`: a name, a game and crew. Its id comes from the name.
- `shows-rename` renames a show in place. Its id stays.
- `shows-duplicate` copies a show with `Duplicate…` onto another game. Crew and cues are copied with fresh ids. Only cues that name something the new game lacks get a `CHECK:` note.
- `shows-activate` makes a show active with `Make <name> active` and a confirm dialog. Every controller's top bar and rundown switch, and previews empty.
- `shows-delete` deletes an inactive show. `Delete` is disabled on the active show, and the server refuses that delete too.
- `shows-picker` offers `Activate` on the show page when no show is active.

## How to get to it (user POV)

- Open `Data`, choose `Shows` in the left list, and use `+ Game`, `+ Show`, and per-row `Make ... active`.
- Select a show row to show `Duplicate…` and `Delete` in the record panel.

## Driving it with controller shows-proofs.ts

Preconditions:

- Port 8999 is free. The suite does not need `build/riv`, because it reads the tally from the rows and the show stream, not from the monitors.

- **Run.** `bun apps/controller/scripts/shows-proofs.ts --port=8999 --out=build/verify/<run>/shows`. It exits 0 with `all shows checks passed`.
- **Create game.** In the `New game` dialog: `Away team` `hofs` → `Hofstra · MBB`, `Home team` `drexel mbb` → `Drexel · MBB`, `Venue` `Daskalakis Athletic Center`, `Game day` `2026-11-15`, `Start time` `14:30`, `Event title` `CAA opener`, then `Create game`. `world()` has the game `2026-27/2026-11-15/hofstra-mbb.at.drexel-mbb`, its `startsAt` carries the browser's UTC offset, and `game.watch` gives a 0 to 0 live state. A second `Create game` with the same teams and day shows an `alert` that matches `already play that day`.
- **Create show.** `+ Show`, `Name` `Hofstra at Drexel (blank)`, pick the game, `+ Add crew`, `Create`. The show `hofstra-at-drexel-blank` has one crew member and no cues.
- **Duplicate.** Add a Carey (Saint Joseph's) player cue to `drexel-sju`. Select it and choose `Duplicate…`, `Onto game` Hofstra at Drexel, `Show name` `Hofstra at Drexel`, `Duplicate`. The dialog's `.flagged li` lists the flagged cue before it writes. In `world()`, every cue has a fresh id, only the Carey cue has a `CHECK: ` note, and the source show is untouched.
- **Activate.** Sam has a cue in preview and the scorebug is on program. Alex presses `Make Hofstra at Drexel active` and confirms `Make active`. `view('sam').show.id` is `hofstra-at-drexel`, sam's preview is empty, `program.bug` is the same slot, and both top bars read `Hofstra at Drexel`.
- **Restart.** After a server restart, the same show is active with the same rundown, and the list still marks it.

## Gotchas

- A show's id is derived from its name when it is created (`Hofstra at Drexel (blank)` → `hofstra-at-drexel-blank`). A rename keeps the old id, so look the show up by id, not by its name.
- The duplicate flags only cues whose params name the old opponent's people or team. Cues on Drexel, which plays both games, stay unflagged by design.
- The game's start time uses the browser's time zone. Chromium shares the machine's zone, so an expected offset computed in the script matches.
- The `Make ... active` confirm says that previews empty and program stays on air. Assert both in the API, not only in the dialog's text.
