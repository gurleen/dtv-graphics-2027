# Seed data

`bun run db:seed` reads this folder and fills `data/db/dtv.sqlite`. Run it with the server stopped, because the server is the only process that writes the file.

| File | Holds |
|---|---|
| `teams.json` | The vendored ESPN list of 361 Division I schools, with abbreviations, colours, logos and conferences |
| `fixtures.json` | What the basketball-v2 generators hardcode that `teams.json` lacks: seasons, records, standings, stats, staff, talent, sponsors, the venue, the demo game, its live state and the demo show |
| `rosters/<team id>@<season>.csv` | One roster per team-season, read by the roster importer |

## How the seed combines the files

The seed reads its sources in this order:

1. `teams.json`, through `espnEdits`. Each record becomes a school and, for each program in `fixtures.json` `teams.programs`, a team and a season row for `teams.season`. Conferences come from the records' short names.
2. Each roster CSV, through `parseRosterCsv` and `planRoster`.
3. `fixtures.json`.

A row from a later source merges field by field over the row an earlier source gave the same kind and id. A fixture that corrects a `teams.json` school names only the fields it changes, as `{ "id": "saint-josephs", "abbreviation": "SJU" }` does. A fixture row with a new id must be complete.

The seed then runs `checkEdits` on the merged batch and commits it as one import batch in which every put is `onExisting: 'keep'`. A row that already exists is left alone. A second run therefore writes nothing, and the seed never resets a row that a person or a feed changed since. To reset a value, unlock the field on the data page and run the import that supplies it.

The seed writes a live state from `fixtures.json` only for a game that has none.

The seed prints warnings. `teams.json` gets one for each defect measured on the file: `conference_id` 7 names both the Big Ten and the EIWA, the CAA has two names, 12 logo files are shared by 31 schools, 35 records have no valid alternate colour, and 38 have no logo. A fixture that moves a team season to another conference also gets one. The fixtures move Delaware from the CAA to C-USA for 2026-27, because `teams.json` predates that realignment.

## fixtures.json

| Key | Holds |
|---|---|
| `teams` | `season` and `programs` for the `teams.json` rows |
| `entities` | Rows by kind, keyed by the names in `ENTITIES` (`packages/domain/src/entities.ts`) |
| `live` | Live game states, one per game |

The values come from the generators and hand-written scenes in `graphics/basketball-v2/`:

| Rows | Source |
|---|---|
| The 2025-26 CAA table, ranks 1 to 13 | `generate_conference_standings.ts` |
| Drexel 14-6 (6-3 CAA), Saint Joseph's 15-5 (7-2 A10) for 2026-27 | `matchup_locator.rml`, `generate_matchup_locator_lower_third.ts` |
| Drexel's 2026-27 points for and against over 20 games (78.4 and 66.9 a game) | `generate_team_lower_third.ts` |
| Josh Reed's 2026-27 season (18.4 PPG, 7.2 RPG, 3.1 APG, 48.2% FG over 20 games) | `generate_player_feature_lower_thirds.ts` |
| Zach Spiker, head coach, 11th season | `staff_lower_third.rml` |
| Rob Brooks, Mike Tuberosa and Tessa Peloso | `generate_talent_lower_thirds.ts` |
| The five sponsors and the graphics they present | Every scene that shows a sponsor |
| Daskalakis Athletic Center, Philadelphia, PA | `matchup_locator.rml` |
| The live state: 68-72, 13:59 in the 2nd half, shot clock 24, timeouts 3 and 4, home bonus and possession, both starting fives, both teams' halftime shooting, rebounds, assists and turnovers, Reed's line tonight | `basketball_scorebug.rml`, `generate_starting_five_lower_third.ts`, `halftime_statistics.rml`, `player_lower_third.rml` |

The games played (20) come from Drexel's 14-6 record, because the scenes give only averages. The date and time of the demo game are placeholders.

## Roster CSV files

Name each file `<team id>@<season>.csv`, as in `drexel-mbb@2026-27.csv`. Our header is:

```csv
jersey,first_name,last_name,position,class_year,redshirt,hometown,headshot,motion_headshot,source_key
```

| Column | Required | Values |
|---|---|---|
| `jersey` | Yes | One or two digits. `0` and `00` are different jerseys. A leading `#` is dropped. |
| `first_name` | No | Blank when the source names only the family name |
| `last_name` | Yes | Natural case, as in `De Laporterie` |
| `position` | No | `G`, `F`, `C` or a combination such as `G/F`. `Guard`, `PG` and the like are read as their codes. |
| `class_year` | No | `FR`, `SO`, `JR`, `SR` or `GR`. `Fr.`, `Sophomore`, `R-Jr.`, `Gr.` and `5th` are read too. |
| `redshirt` | No | `yes` or `no`. When blank, an `R-` class prefix decides it. |
| `hometown` | No | Free text. Quote a value that has a comma: `"Philadelphia, PA"`. |
| `headshot`, `motion_headshot` | No | An `http(s)` URL or a `/assets/...` path |
| `source_key` | No | The source's id for the player, such as a roster page URL. A re-import matches on it first. |

A file with another header is read through the aliases in `ROSTER_COLUMNS` (`packages/domain/src/imports/roster.ts`). A Sidearm export with `No.`, `Name`, `Pos.`, `Cl.` and `Hometown` columns works as it is. The learfield-roster-app export header is not confirmed yet.

The importer matches each row to a player of the team-season by `source_key`, then by jersey and last name, then by full name. A matched player keeps its id, and a blank cell keeps the player's current value.
