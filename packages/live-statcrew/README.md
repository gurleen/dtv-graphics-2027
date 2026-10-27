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
| `score` | `score` for each side, from the `<linescore>`; `timeouts` and `bonus` for each side, below |
| `stats` | `teamLine` for each side, from `<totals>`; `playerLine` for each player; `starters` for a side when exactly five matched players have `gs="1"`; `shots`, below |

A StatCrew player joins a roster spot by jersey: the `uni` attribute against `Player.jersey`, both strings, so `0`
and `00` differ. Rosters come from the server's data and follow edits made while the tool runs. A player with no
roster spot is logged once as `home #23 SMITH,JOHN` and gets no command. The server refuses a whole batch that
names a player who is not in the game, so one unknown player would otherwise stop every update.

## Timeouts and bonus

The file has no count of either, so the tool works them out for the current period, `<status period>` (or the last
play's period on a file without one). Regulation is `<rules prds>`: 2 is halves, 4 quarters, and a file without it
goes by the game's program. With neither a status nor a play, the tool leaves both alone.

- **Timeouts left**: four a game, less each `TIMEOUT` play charged to the side. Media timeouts (`type="MEDIA"`) are charged
  to a team in the file but do not count. Halves carry at most three into the second half; each overtime adds one.
- **Bonus**: a side is in the bonus when the other side has 7 team fouls in the half (halves) or 5 in the quarter
  (quarters), from `<totals><statsbyprd pf>`. Overtime counts with the last regulation period. `<rules fouls>` is the
  foul-out limit, not the bonus.

These are NCAA rules. A different timeout allotment would be a change to `commands.ts`.

## What it does not write

The clock, period, phase and possession. StatCrew's clock is a snapshot taken at each play, and the
operator keeps the game clock. The plays themselves do not reach the game, only the shots below.

## Shots

`shots` is every `GOOD` and `MISS` play with a side and a `m:ss` time, in the file's order: its period, its clock, its
side, its value (`FT` is 1, `3PTR` is 3, any other type 2) and whether it went in. The made shots add up to the
file's score. The Scorebug Slider's `insights` cue reads its runs, droughts and field goal streaks from them, against
the game clock.

## Plays

Whenever the `<plays>` section changes, the tool prints the whole play list as one stdout line: `@events ` and a JSON
list of `StatcrewPlay` (`@dtv/api`). The server's feed supervisor keeps the newest list as the feed's `events` and
leaves the line out of the log, and the Tools page's StatCrew tab shows it newest first as a check against StatCrew's
own screen. Run by hand, the line goes to the terminal.

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
from its rosters, replaces the file, and reads `game.watch` back. It also airs a Player Lower Third set to Game stats
and reads its stat line from program's `output.watch`, before and after the file changes. It stops the tool with a
`stop` line, as the server does. It exits non-zero on any failure.
