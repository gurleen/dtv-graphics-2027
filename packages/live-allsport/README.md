# @dtv/live-allsport

Reads a Daktronics AllSport 5000 console's RTD serial stream and writes its basketball clock, shot clock, period,
score, timeouts, bonus and possession into a game on the running show server, through `game.apply`. It is a
separate process that imports only `@dtv/api` and `@dtv/domain`, and it needs no native serial module.

## Run it

```
bun run live:allsport --port=<path> --game=<GameId> [--score=true|false] [--baud=19200] [--server=ws://localhost:8975/rpc] [--source=allsport]
```

`--port` is the console's serial device: `/dev/cu.usbserial-1410` on macOS, `/dev/ttyUSB0` on Linux. `--game` is a
game id from the data page, such as `2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb`. The tool stops with a
message if the game is not in the server's data or is not basketball. Bad arguments print the usage and exit 2.
`--score=false` leaves score, timeouts, bonus and possession alone, for when StatCrew writes the score.

The port opens at 19200 baud, 8N1, through `stty`. Windows COM ports are out of scope. If the device is missing or a
read fails, the tool logs it once and retries every second, keeping what the console last showed.

## What it reads

Packets are `SYN ... SOH <header> STX <text> EOT <checksum> ETB`. The header `004210` and a zero-based index place
the text in a 1024-character buffer. The checksum is 0x04 plus every byte after SYN up to EOT, modulo 256, as two
uppercase hex digits. A packet with another header or a wrong checksum is dropped, and the tool logs how many every
10 seconds. The console sends only changes and does not send its state when you connect, so a field it has not sent
is unknown and nothing is written for it. Guest is `away`.

| Field | Written as |
|---|---|
| Main clock, tenths clock, zero and stopped marks | `clockSet`, with `phase live` when the clock starts |
| Shot clock | `shotClock`, `null` when the console blanks it |
| Period | `period` |
| Score, timeouts, bonus, possession | `score`, `timeouts`, `bonus`, `possession` |

Timeouts are written as the console's value, taken as timeouts remaining. Team fouls and names are in the field
table but not written: the API has no place for them.

The server runs a clock by itself, so the tool does not write every tick. It writes the clock when it starts or
stops, and when the console differs from the server's projection by more than the display shows: a second when the
console sends minutes and seconds, 0.15 s with tenths. The shot clock works the same way, following the game clock.
Everything else is absolute and is skipped when it matches the last write.

## Authority

On start the tool sends `authority` commands as source `operator` that give `clock`, and `score` unless
`--score=false`, to `--source`, and logs the handover. On SIGINT or SIGTERM it hands them back. If the operator
takes a group back while the tool runs, the next push logs `the operator took <group> back` and the tool keeps
reading.

While the tool holds `clock` the operator cannot set the phase to `halftime` or `final`, because phase belongs to
that group. The tool sets `live` itself when the clock starts. Stop the feed to set halftime or final.

## Prove it

```
bun packages/live-allsport/scripts/prove.ts
```

Starts a server on a scratch database at port 8995 and a pseudo-terminal that plays a console, runs the tool on it,
and reads `game.watch` back as the clock starts and stops, the score changes and the shot clock blanks. It needs
`python3`. It exits non-zero on any failure.

`scripts/console.ts` is that pretend console on its own: it prints a device path, then sends each stdin line, a
JSON object of field values such as `{"clockMain":"10:00","scoreHome":"12"}`, as packets.
