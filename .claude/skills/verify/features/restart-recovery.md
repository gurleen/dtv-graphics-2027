# Server restart recovery

The server can stop mid-show (a crash, a deploy, a laptop lid) and come back on the same database. Every controller and `/renderer` reconnects without reloading. The active show, the rundown and program come back as they were, and nothing on air replays its intro.

## Sub-features

- `restart-badge` shows `Reconnecting…` (`[data-testid="reconnecting"]`) in the top bar while the server is down, and clears it once every stream is back.
- `restart-program` brings program back with the same slots in the same phases on every monitor and on `/renderer`.
- `restart-no-reload` keeps controller pages from reloading, so unsaved typing survives.
- `restart-show` keeps the active show and its rundown across the restart, including a show made active just before it.
- `restart-backup` makes SIGTERM write a `shutdown` backup into `backups/` beside the DB.

## How to get to it (user POV)

- Stop the server process with SIGTERM (Ctrl+C in its terminal), then start it again on the same `DTV_DB` without `--seed`.

## Driving it with journeys/restart.ts and dtv.sh

Preconditions:

- A fresh `dtv.sh up --port=8998`, with the doctor passing.

- **Run.** `.claude/skills/verify/journeys/restart.ts --port=8998` exits 0 with 12 checks passed. The journey calls `dtv.sh stop` and `dtv.sh start` itself.
- **On air first.** Alex activates the show, presses 1 (scorebug), and cues the `Zach Spiker` row with Enter and takes it with Space. The journey records `s.monitor(alex, 'program')`, `s.rendered(renderer)` and `view('alex')`, and sets `window.verifyMarker = true` on both pages.
- **Stop.** `dtv.sh stop` prints `DB kept at ...`. `page.getByTestId('reconnecting')` appears within 10 s (screenshot `02-reconnecting.png`).
- **Start.** `dtv.sh start` serves the kept DB without seeding. The badge detaches within 15 s.
- **Compare.** After 3 s, the monitor and `/renderer` layer states equal the recorded strings, with the same slot ids and phase `on`. The API has the same show id and the same `program.bug` and `program.lower` slot ids. `window.verifyMarker` still holds on both pages, so neither reloaded.
- **Backup.** Before `down`, `ls $TMPDIR/dtv-verify-8998/backups/` lists a `*-shutdown.sqlite`, and a `*-show.sqlite` from the activation.
- **Suites.** `bun apps/controller/scripts/proofs.ts --port=8999 --quick` runs `server restart mid-show` with two operators and a resize to 1728 x 1117 (screenshots `59` to `70`). `shows-proofs.ts` proves that a newly active show survives a restart.

## Gotchas

- Run `dtv.sh start`, not `up`, to restart. `up` deletes the scratch dir and seeds a new DB.
- Do not stop a server you did not start. Restart only an instance whose pid is in `$TMPDIR/dtv-verify-<port>/server.pid`.
- Hot reload is off (`development: { hmr: false }`), because a reload replays every intro on air. `bun run dev` (`--watch`) restarts the process, and the pages must still not reload.
- Wait at least 3 s after the badge clears before you check the marker. A reload, if one happens, comes after reconnection.
