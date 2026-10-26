# Headshots

Source images for the `dtv-headshots` R2 bucket. The layout is the bucket's key layout:

    data/headshots/<espnId>/<program>/<jersey>.png
    data/headshots/2182/mbb/23.png        Drexel men's basketball, #23

- `espnId` is the school's ESPN id (`School.espnId`: Drexel 2182, Penn State 213). `program` is `mbb` or `wbb`.
- `jersey` is the roster string: `0` and `00` are different files. PNG only.
- The `.png` files are not committed.

    bun scripts/headshots.ts fetch <espnId> <program> <roster url>
                                     download a Sidearm roster page's photos, converted to PNG
    bun run headshots:push           upload new files (a key already in the bucket is skipped)
    bun run headshots:push --force   upload everything

A scene loads `/headshots/<espnId>/<program>/<jersey>.png` from the show server, which keeps a disk copy in
`data/cache/headshots`. Delete a cached file (or the folder) after replacing a headshot in the bucket.
A player with no file in the bucket shows the placeholder. In code: `headshotUrl(espnId, program, jersey)`,
or `headshotOf(player, team)` inside a basketball-v2 graphic.
