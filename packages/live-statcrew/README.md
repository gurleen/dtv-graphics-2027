# @dtv/live-statcrew

Watches a StatCrew basketball XML file and writes its box score into a game on the running show server, through
`game.apply`. It is a separate process that imports only `@dtv/api` and `@dtv/domain`.

## Run it

```
bun run live:statcrew --file=<path> --game=<GameId> [--server=ws://localhost:8975/rpc] [--source=statcrew]
```

`--game` is a game id from the data page, such as `2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb`. The tool
stops with a message if the game is not in the server's data or is not basketball. Bad arguments print the usage and
exit 2.

It polls the file's stat every 500 ms, because StatCrew replaces the file rather than writing in place. A file that
does not parse, such as a half-written one, is logged and skipped until the next change. A push that matches the
last one sent is skipped.

## What it writes

| Group | Commands |
|---|---|
| `score` | `score` for each side, from the `<linescore>` |
| `stats` | `teamLine` for each side, from `<totals>`; `playerLine` for each player; `starters` for a side when exactly five matched players have `gs="1"` |

A StatCrew player joins a roster spot by jersey: the `uni` attribute against `Player.jersey`, both strings, so `0`
and `00` differ. Rosters come from the server's data and follow edits made while the tool runs. A player with no
roster spot is logged once as `home #23 SMITH,JOHN` and gets no command. The server refuses a whole batch that
names a player who is not in the game, so one unknown player would otherwise stop every update.

## What it does not write

The clock, period, phase, timeouts, bonus and possession. StatCrew's clock is a snapshot taken at each play, and the
operator keeps the game clock. Plays and last-score information are ignored, because the API has no place for them.

## Authority

Every game starts with its operator as the writer of `score` and `stats`, and the controller has no control to hand
a group to a feed. On start the tool sends `authority` commands as source `operator` that give both groups to
`--source`, and logs the handover. On SIGINT, SIGTERM or a `stop` line on stdin (how the server stops it, since Windows cannot send a child SIGINT) it hands both groups back to `operator`. If the operator
takes a group back while the tool runs, the next push logs `the operator took <group> back` and the tool keeps
watching.

## Prove it

```
bun packages/live-statcrew/scripts/prove.ts
```

Starts a server on a scratch database at port 8996, runs the tool against a seeded game with a box score generated
from its rosters, replaces the file, and reads `game.watch` back. It exits non-zero on any failure.
