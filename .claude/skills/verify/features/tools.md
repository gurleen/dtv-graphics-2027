# Tools page

The Tools page (`#/tools`) has a tab list down the left, one tab per tool. Its StatCrew and AllSport tabs start and stop the live-statcrew and live-allsport feeds, which the server runs as child processes. Each tab shows Stopped, Running since hh:mm:ss or Exited (code N), the File and Game fields, Start (Restart when the values differ from the running ones) and Stop, an inline error, and the feed's last 200 log lines. The StatCrew tab also has a Plays table above the log: the file's play by play, newest first, with the score on scoring plays. It stays after Stop and empties on the next Start. The StatCrew File and AllSport Port are kept in localStorage (`dtv.tools.statcrew.file`, `dtv.tools.allsport.port`) as they are typed, so a reload keeps them; a running feed shows its own.

## Sub-features

- `tools-tabs` selects a tab from the hash: `#/tools/statcrew` or `#/tools/allsport`, and `#/tools` gives the first.
- `statcrew-start` starts the feed on a file and a game. A missing file shows `No file at that path on the server` inline. It writes only the `stats` group, never the score, timeouts, bonus or clock, so it runs beside AllSport on the same game.
- `statcrew-stop` interrupts the feed, which hands back `stats` if it still holds it.
- `allsport-start` starts the feed on a serial device, a game and the Score switch. The Port field lists the server's `/dev/cu.*` (macOS), `/dev/ttyUSB*` and `/dev/ttyACM*` (Linux) or non-Bluetooth `COMn` (Windows) devices, takes any typed path, and has a Refresh button. A missing device shows `No device at that path on the server` inline. Changing Score offers Restart. Score on or off, it starts beside a StatCrew feed on the same game.
- `allsport-stop` interrupts the feed, which hands back whichever of the clock, and the score when it was on, it still holds.
- `feed-shutdown` stops both feeds first when the server gets SIGTERM, so the handback lands.

## How to get to it (user POV)

- Click `Tools` in the top bar, then the `StatCrew` or `AllSport` tab. The File and Port fields are paths on the server's disk.
- The Game picker lists basketball games and defaults to the active game.

## Driving it with journeys/tools.ts

Preconditions: a fresh `dtv.sh up --port=8998`. The `.riv` scenes are not needed.

- **Run.** `.claude/skills/verify/journeys/tools.ts --port=8998` exits 0 with 24 checks passed. It generates a box score for the seeded game with `packages/live-statcrew/scripts/box-score.ts`, adds three plays, drives the page, and reads `game.watch` back: `stats` authority `statcrew`, then `operator` after Stop, while `score` and `clock` stay `operator` and the file's 61-70 never reaches the game's score. AllSport with Score on, started beside it on a missing port, is refused only with NO_PORT. The Plays table shows the three plays newest first and none reach the log, and a fourth play written to the file joins the top. Screenshots go to `build/controller/tools/`.
- **AllSport.** `.claude/skills/verify/journeys/allsport.ts --port=8998` exits 0 with 26 checks passed, on a fresh `dtv.sh up` (the server keeps a feed's state, so run `down` and `up` between journeys). It needs `python3`: `packages/live-allsport/scripts/console.ts` makes a pseudo-terminal that plays a console. It reads `game.watch` back: period 2, score 38-41, timeouts 3-2, clock 14:30 then running with phase `live`, shot clock 24, `clock` and `score` authority `allsport`. Score off then Restart hands only the clock over, and a console score change does not reach the game. Screenshots go to `build/controller/tools/allsport-*.png`.
- **Shutdown.** Start the feed, run `dtv.sh stop`, run `dtv.sh start`, and read the game's authority: it is `operator` again.

## Gotchas

- The feed writes over the server's own socket, so a game that is not in the World or not basketball is refused with `NO_GAME` before anything starts.
- A feed that was running when the server was killed with SIGKILL is not stopped; find its pid with `ps` and kill that pid only.
