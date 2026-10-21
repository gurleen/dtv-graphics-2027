# Data page

The data page (`#/data`) is where an operator corrects reference data before or during a show. It has teams on the left, the team's tables in the middle (roster, staff, season stats, team and branding), and the selected record on the right. A manual edit locks the field, so a later import or feed leaves it alone. A roster CSV import shows a diff before it applies. A save from a stale revision shows theirs beside yours.

## Sub-features

- `data-edit-cell` edits a table cell in place. Enter saves and Esc cancels. A bad value is refused in place (`.cell-error`).
- `data-lock` locks the edited field. A lock mark shows in the row and the record, hovering it shows `Locked by <who>, <when>`, and the `Unlock <field>` dialog clears it.
- `data-import` imports a roster CSV with `Import CSV`. A diff shows added, updated, unchanged, locked-skipped, missing and bad rows. `Apply` writes it, removing missing players only when that box is ticked. A second import of the same file says `Nothing to do`.
- `data-conflict` shows a conflict panel for a refused save, with `Keep theirs`, `Use yours`, and `Pick per field` then `Save picks`.
- `data-branding` edits a school colour, or overrides a team's branding.
- `data-show-record` edits a show's name and crew from the `Shows` list.
- `data-search` filters the team list with the `Search teams` searchbox.

## How to get to it (user POV)

- Press `Data` in the top bar, or open `http://localhost:<port>/#/data`.
- Choose a team in the list, such as `Drexel · MBB` or `Saint Joseph's · MBB`, or choose `Shows`.
- Each cell is a button named `<field> of <row>: <value>. Edit`. Tabs include `Team and branding`.

## Driving it with controller data-proofs.ts

Preconditions:

- Port 8999 is free. The suite seeds its own server and activates `drexel-sju`.

- **Run.** `bun apps/controller/scripts/data-proofs.ts --port=8999 --out=build/verify/<run>/data [--only=lock,conflicts,import,edits]`. It exits 0 and prints `all data-page checks passed`. Every check reads the World back over `@dtv/api`.
- **Lock.** In `Drexel · MBB`, cell `Last of ...: Reed. Edit`: Esc after typing writes nothing. Typing `Reid` and pressing Enter saves `lastName` and locks only that field, and `.lock-count` reads `1 lock`. Hovering the mark shows a tooltip. `Unlock` in the `Unlock Last` dialog removes the lock and keeps the value.
- **Conflicts.** Two pages (`alex`, `sam`) start editing the same cell. Alex saves first. Sam's save shows `.conflict`, with a `tr[data-field="lastName"]` that holds alex's value. `Keep theirs` keeps alex's value. `Use yours` saves sam's value on the new basis. `Pick per field` lists `lastName,position,classYear` and saves the mix that was picked.
- **Import.** In `Saint Joseph's · MBB`, a position is locked first (`G/F`). Then a CSV with six rows goes through the file chooser of `Import CSV`. `.import-summary` reads `1 added`, `2 updated`, `1 unchanged`, `1 field skipped (locked)`, `1 missing` and `1 bad row`, and the bad row names `line 7`. Planning writes nothing. With the `.prune` box ticked, `Apply` adds Ty House, removes Marrs and keeps `G/F`. The same file again reads `Nothing to do`, and `Apply` is disabled.
- **Edits.** `Primary colour` `0b2a4a` saves as `#0b2a4a` and locks `primaryColor`. The override `#123456` lands on the team's branding. `Abbreviation` `TOOLONG` is refused in place. In `Shows`, renaming the show and removing crew member 3 saves, and locks `crew,name`.
- **Journey form.** `s.operator('alex', 'data')`, then `getByRole('option', { name: 'Drexel · MBB', exact: true })`, and wait for `.data-table`. Read `world()` after every save.

## Gotchas

- The CSV header is fixed: `jersey,first_name,last_name,position,class_year,redshirt,hometown,headshot,motion_headshot,source_key`. See `data/seed/README.md`.
- Tooltips open on mouse movement, not on a jump. Move in from outside the element in steps, as `data-proofs.ts`'s `hover` does.
- The suite deletes the `*.png` files in its `--out` folder when it starts. Give each run its own folder.
- Lock state is per field. A test that expects one lock after an edit fails if the edit also touched a second field through the record panel.
- The suite also prints warnings from the page's console. A React warning there does not fail a check, but it is worth reporting.
