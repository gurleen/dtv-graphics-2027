# Tools page

The Tools page (`#/tools`) has a tab list down the left, one tab per tool. Its StatCrew tab starts and stops the live-statcrew feed, which the server runs as a child process. The tab shows Stopped, Running since hh:mm:ss or Exited (code N), the File and Game fields, Start (Restart when the values differ from the running ones) and Stop, an inline error, and the feed's last 200 log lines.

## Sub-features

- `tools-tabs` selects a tab from the hash: `#/tools/statcrew`, and `#/tools` gives the first.
- `statcrew-start` starts the feed on a file and a game. A missing file shows `No file at that path on the server` inline.
- `statcrew-stop` interrupts the feed, which hands score and stats back to the operator.
- `statcrew-shutdown` stops the feed first when the server gets SIGTERM, so the handback lands.

## How to get to it (user POV)

- Click `Tools` in the top bar, then the `StatCrew` tab. The File field is a path on the server's disk.
- The Game picker lists basketball games and defaults to the active game.

## Driving it with journeys/tools.ts

Preconditions: a fresh `dtv.sh up --port=8998`. The `.riv` scenes are not needed.

- **Run.** `.claude/skills/verify/journeys/tools.ts --port=8998` exits 0 with 14 checks passed. It generates a box score for the seeded game with `packages/live-statcrew/scripts/box-score.ts`, drives the page, and reads `game.watch` back: score 61-70, `score` and `stats` authority `statcrew`, then `operator` after Stop. Screenshots go to `build/controller/tools/`.
- **Shutdown.** Start the feed, run `dtv.sh stop`, run `dtv.sh start`, and read the game's authority: it is `operator` again.

## Gotchas

- The feed writes over the server's own socket, so a game that is not in the World or not basketball is refused with `NO_GAME` before anything starts.
- A feed that was running when the server was killed with SIGKILL is not stopped; find its pid with `ps` and kill that pid only.
