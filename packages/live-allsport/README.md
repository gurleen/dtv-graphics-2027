# @dtv/live-allsport

Reads a Daktronics AllSport 5000 console's serial output, RTD or the whole-board `cg` output, and writes its basketball clock, shot clock, period,
score, timeouts, bonus and possession into a game on the running show server, through `game.apply`. It is a
separate process that imports only `@dtv/api` and `@dtv/domain`, and it needs no native serial module.

## Run it

```
bun run live:allsport --port=<path> --game=<GameId> [--score=true|false] [--format=rtd|cg] [--baud=<rate>] [--server=ws://localhost:8975/rpc] [--source=allsport]
```

`--port` is the console's serial device: `/dev/cu.usbserial-1410` on macOS, `/dev/ttyUSB0` on Linux, `COM1` on
Windows. `--game` is a
game id from the data page, such as `2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb`. The tool stops with a
message if the game is not in the server's data or is not basketball. Bad arguments print the usage and exit 2.
`--score=false` leaves score, timeouts, bonus and possession alone, for when StatCrew writes the score.

`--format` is `cg` on Windows and `rtd` elsewhere, and `--baud` follows it: 9600 for `cg`, 19200 for `rtd`.

The port opens 8N1 through `stty` on macOS and Linux. On Windows `src/windows.ts` opens the COM port
through kernel32 with `bun:ffi`: it sets the same 8N1 with `SetCommState`, makes reads return at once with
`SetCommTimeouts`, and polls every 20 ms. A COM port another program holds fails with `the port is in use by another
program`. If the device is missing or a read fails, the tool logs it once and retries every second, keeping what the
console last showed.

On Windows the server lists the COM ports in `HKLM\HARDWARE\DEVICEMAP\SERIALCOMM`, leaving out Bluetooth links, and
refuses a port not in that list: every `COMn` name passes an existence check there.

## What it reads: `cg`

The output a console wired for a CG sends at 9600 baud, and the one this console uses: the whole board once a second
as `SOH <34 characters> <2 hex checksum> EOT`, with no header. The checksum is the sum of the 34 characters, modulo
256, as two uppercase hex digits. The layout, zero-based, follows `AllSportData.cs` in
[gurleen/LiveStatsManager](https://github.com/gurleen/LiveStatsManager) and a capture of the console:

| Characters | Field | Written as |
|---|---|---|
| 0-6 | Game clock, `mm:ss` or `ss.t` | `clockSet`, with `phase live` when the clock starts |
| 7 | `s` while the game clock is stopped | the clock's running state |
| 8-9 | Shot clock | `shotClock`, `null` when blank |
| 12-14, 15-17 | Home score, Guest score | `score` |
| 28 | Period | `period` |

It has no timeouts, bonus or possession, so those stay with whoever sets them. Character 21 changes during play and
is not mapped. The console marks a stopped game clock but not a stopped shot clock, so the shot clock counts as running
while the game clock runs and the shot clock has ticked down within the last 1.5 s; one that holds a value, such as a
shot clock that is not in use, is written once, stopped.

To map a field, `bun packages/live-allsport/scripts/sniff.ts --port=COM1` prints each new message with a caret under
every character that changed, while you press keys on the console. Stop the feed first: a COM port has one reader.

## What it reads: `rtd`

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
`--score=false`, to `--source`, and logs the handover. On SIGINT, SIGTERM or a `stop` line on stdin (how the server stops it, since Windows cannot send a child SIGINT) it
hands them back. If the operator
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
