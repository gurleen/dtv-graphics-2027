---
name: verify
description: Drive the DTV show server the way operators and OBS use it (the operator controller at / with its show and data pages, the /renderer page OBS loads, and the oRPC socket at /rpc) in headless Chromium against a scratch database, and keep screenshots, traces and API read-backs as proof. Use to prove a controller, renderer, server, playout or graphics change works in the running app before calling it done, or to reproduce a bug there.
---

# Verify the DTV show server

The app is one Bun process (`apps/server/src/main.ts`). It serves:

- `/`: the operator controller. `#/show` holds preview, Take and program. `#/data` holds teams, rosters and games.
- `/renderer`: the transparent 1920 x 1080 page that OBS loads. It draws program. `/renderer?bus=preview&operator=<id>` draws one operator's preview.
- `/status`: a plain status page.
- `/rpc`: the oRPC WebSocket. `@dtv/api` has `connect`, `watch` and `first`.

The stakeholder site (`apps/site`) is a separate static build. See [features/site.md](features/site.md).

Read [features/README.md](features/README.md) before you drive anything. It is the feature map. Each feature file is a recipe.

## Ground rules

- Use port 8998 or 8999 only. Port 8975 is the owner's real server, and other agents hold other ports on this machine.
- Use a scratch `DTV_DB` only. Never point a verification instance at `data/db/dtv.sqlite`.
- Stop only processes you started, by pid. Never use `pkill`, `killall` or a name pattern.
- If `dtv.sh up` reports that the port is held by a process that is not yours, use the other port. Do not drive or kill that process.

## Prerequisites (once per checkout)

```bash
bun install
rive whoami             # signing needs `rive login`; an unsigned .riv never loads and logs nothing
bun run riv:build       # 17 signed scenes into build/riv/; about 2 minutes
```

The doctor fails when `build/riv/` lacks a scene or holds a `.riv` that is older than its `.rml`. Without the scenes, the controller's monitors and `/renderer` stay blank, and nothing reports an error. Chromium comes from the controller's Playwright. If it is missing, run `cd apps/controller && bunx playwright install chromium`.

## Launch

```bash
.claude/skills/verify/scripts/dtv.sh up --port=8998
```

This command deletes the instance's scratch dir, migrates and seeds a new database, and starts the server with `nohup`. It returns when the log prints `dtv server on http://localhost:8998`. Seeding finishes before the server listens, so at that point the server is ready to drive. The seed has no active game. The show page opens on a picker with an `Activate` button beside `Saint Joseph's at Drexel · Nov 8`.

Scratch state lives in `$TMPDIR/dtv-verify-<port>/`: `dtv.sqlite`, `backups/`, `server.log`, `server.pid` and `root`.

For the restart recovery journey, `dtv.sh stop` sends SIGTERM and keeps the DB, and `dtv.sh start` serves the kept DB again without seeding.

## Doctor

```bash
.claude/skills/verify/scripts/dtv.sh doctor --port=8998
```

The doctor is read-only. It exits 1 on any `FAIL`. It checks that the pid is alive and runs this checkout's `main.ts`, that the port's listener is that pid, that `/status` serves the scratch DB, and that `/`, `/renderer` and one `.riv` answer 200. It also checks that `build/riv` is complete and fresh. It prints the revision, the active game, the connected operators, the commit and whether the checkout has uncommitted changes. Run it first, and run it again whenever something looks off.

## Drive

Use two harnesses. Both use Playwright from `apps/controller`.

**Journeys against a `dtv.sh` instance.** `scripts/lib.ts` exports `session(name)`, which reads `--port=`. It provides:

- `operator(id, 'show' | 'data')` opens a 1440 x 900 controller page. It sets localStorage `dtv.operator` to `id` first, so the page skips the name dialog.
- `renderer(path)` opens a 1920 x 1080 `/renderer` page. It returns once `document.body.dataset.status === 'live'`.
- `monitor(page, 'preview' | 'program' | 'other:<id>')` and `rendered(page)` read layer states.
- `waitMonitor` and `waitRendered` take a want such as `{ lower: '<graphic id>', bug: 'empty' }`.
- `view(operator)` and `world()` read back the show view and the World over `@dtv/api`.
- `command(...)` sends a show command with a fresh id.
- `shoot(page, name)` saves a screenshot.
- `check(ok, what)` records a check.
- `run(body)` turns a throw into a failed check and a screenshot, then writes `checks.json` and exits 1 if any check failed.

[`journeys/take.ts`](journeys/take.ts) is the worked example. Copy it to start a new journey in `journeys/`:

```bash
.claude/skills/verify/journeys/take.ts --port=8998
```

**The repo's proof suites.** Each suite starts its own seeded server on the `--port` you give it and deletes that server's database when it finishes. A suite needs a free port, not a `dtv.sh` instance. The feature files say which suite covers what.

| Suite | Run as | Writes to |
|---|---|---|
| `apps/controller/scripts/proofs.ts` | `--port=8999 [--quick]` | `build/controller/proofs/`, `build/controller/runthrough.webm` (wiped first; no `--out`) |
| `apps/controller/scripts/data-proofs.ts` | `--port=8999 --out=build/verify/<run>/data [--only=lock,conflicts,import,edits]` | `--out` |
| `apps/controller/scripts/games-proofs.ts` | `--port=8999 --out=build/verify/<run>/games` | `--out` |
| `apps/renderer/scripts/drive.ts` | `--port=8999 --out=build/verify/<run>/drive` | `--out` |
| `apps/renderer/scripts/proofs.ts` | `--port=8998 --out=... [--only=steps,score-to-break,motion-headshot,reload,two-renderers,rapid]` | `--out`; **also binds port + 1** |
| `apps/renderer/scripts/compare.ts` | `--port=8999 --baseline=<dir> --out=...` | `--out`, plus `report.json` |
| `apps/site/scripts/screenshots.ts` | `<origin> <out-dir>` | the out-dir |

Stable handles. These are the names the code uses, so do not guess:

- `window.dtvMonitors[name]` on a controller page is a monitor. Its `.renderer.layers()` gives `{ bug, lower, card }`, each with a `phase` (`empty`, `loading`, `entering`, `on` or `leaving`) and a `frame` with `graphic`, `slot` and `step`. Its `.frame` is the newest output frame, with bound `values`.
- `window.dtvRenderer.layers()` gives the same shape on `/renderer` and on a site page.
- `[data-monitor="preview|program|other:<id>"]` is a monitor's element. Its canvases show what was drawn.
- `[data-testid="reconnecting"]` is the top bar's badge while any stream is down.
- `.topbar .show-name` shows the active game's matchup, or `No active game`.
- The rundown is `getByRole('grid', { name: 'Rundown cues' })`. A rundown row is `.cue-row` with `data-pvw` and `data-pgm`. The inspector has `Cue to my preview`, `Save` and `Add cue`.
- The rail has the buttons `/^Take/`, `/^Next/` and `Clear PVW`, and `.problem-strip` (role `alert`) for a refused command.
- The on-air rows are `.layer-row[data-layer="bug|lower|card"]`. Each has a `Clear` button.
- `.free-button` is a free-panel button. It carries `data-pgm` when its graphic is on air.

## Evidence

A journey writes to `build/verify/<UTC stamp>-<journey>/`. The folder holds numbered PNGs, `log.txt`, `checks.json` (every check and the failure count) and `trace-N.zip`, one per browser context. To open a trace, run `cd apps/controller && bunx playwright show-trace <zip>`. `build/` is gitignored, and no cleanup step deletes `build/verify/`. Point the suites' `--out` there too, so one run's proof stays in one place.

Proof standards:

- Drive the user's path: buttons, keys and the URL that OBS loads. Use `command` and `data.apply` only to set up a precondition the UI does not reach, such as a second operator's state or a cue on a deleted player, and say so in the journey.
- Capture the action and the state that results from it: a screenshot before and after, not only the final screen.
- Check each claim through a second surface. A monitor's layer state agrees with `/renderer`, and both agree with `view()` or `world()` over the API. A data edit is proven by reading the World back, not by the table cell.
- A screenshot of a blank monitor proves nothing. The scenes may be missing, so run the doctor.
- The `--quick` flag of `proofs.ts` skips the 17-graphic run-through. Report that a run skipped it. Do not report it as covered.

## Cleanup

```bash
.claude/skills/verify/scripts/dtv.sh down --port=8998
lsof -nP -iTCP:8998 -sTCP:LISTEN     # prints nothing once it is down
```

`down` stops only the pid in its own pidfile, after it confirms that the pid still runs this checkout's server. Then it deletes `$TMPDIR/dtv-verify-<port>/`. Run `down` after every run, including a failed one. Each suite stops its own server in a `finally` block. If a suite is killed partway, its server can outlive it. Find that server with `lsof -nP -iTCP:<port> -sTCP:LISTEN` and kill that pid only after `ps -o command= -p <pid>` shows this checkout's `apps/server/src/main.ts`.

## Helpers

- `scripts/dtv.sh up|doctor|stop|start|down [--port=8998]` runs the instance lifecycle, as shown above.
- `scripts/lib.ts` provides the journey session. Import it from a journey file: `import { session } from '../scripts/lib'`.
- `journeys/take.ts` takes a cue through preview, Take and program, and checks the controller, `/renderer` and the API at each step.
- `journeys/restart.ts` puts two graphics on air, runs `dtv.sh stop` and `start` on the same DB, and checks the badge, the layer states, the API and that no page reloaded.
- `journeys/next.ts` takes a one-step lower third with the scorebug on air, presses N, and checks the lower third leaves program while the scorebug stays.
- `journeys/score.ts` airs the scorebug with key 1, checks the score bar has no controls, adds 3 to Drexel's score over `game.apply`, and checks the score bar, the live game over the API and the scorebug's bound score on `/renderer`.
