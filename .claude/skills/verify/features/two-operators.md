# Two operators

Two or more controllers can run one show at the same time. Each operator has a private preview that the others can watch as a thumbnail. Program is shared, so a clear by one operator takes off what another operator took. The server applies commands one at a time, and a stale rundown save is refused where the operator is looking.

## Sub-features

- `ops-name` asks for a name on the first visit, warns when that name is already connected, and stores the name in localStorage `dtv.operator`.
- `ops-presence` lists every connected operator as a chip in the top bar, and shows their previews under `Others' previews`.
- `ops-own-preview` keeps each cue in its owner's preview only. Another operator's preview stays empty.
- `ops-shared-program` shows one operator's Take on every program monitor and on `/renderer`, and lets any operator clear it.
- `ops-stale-save` refuses the second of two saves made from the same revision. The refused operator keeps their typing, and the strip offers `Revert` and `Dismiss`.
- `ops-rename` changes the operator from the `You are <id>; change` chip.

## How to get to it (user POV)

- Open the controller in two browsers. Give one the name `alex` and the other `sam`.
- Watch the right rail's `Others' previews`, and the `Operators connected` group in the top bar.

## Driving it with lib.ts and controller proofs.ts

Preconditions:

- An instance from `dtv.sh up` with the seeded show active, or a free port 8999 for the suite.

- **Two pages.** `const alex = await s.operator('alex'); const sam = await s.operator('sam');`. Each gets its own browser context, so each has its own localStorage. `alex.locator('.other[data-operator="sam"]')` appears.
- **First visit.** Open a context without `dtv.operator` set, and type `Alex` in `getByLabel('Your name')` while alex is connected. The `alert` reads `alex is already connected`. Type `Sam` and press `Start`. `localStorage.getItem('dtv.operator')` is `sam`.
- **Own preview.** Alex cues the `Zach Spiker` row. `waitMonitor(alex, 'preview', { lower: <staff> })` holds, `waitMonitor(sam, 'other:alex', { lower: <staff> })` holds, and `waitMonitor(sam, 'preview', { lower: 'empty' })` holds.
- **Shared program.** Alex presses `Take`. `program` is on in both pages. Sam presses `Clear` in `.layer-row[data-layer="lower"]`, and `program` is `empty` in both pages.
- **Stale save.** Both select the `Zach Spiker` row and fill `Note` with different text. Sam saves first, then alex saves. Alex's `.problem-strip` matches `Someone changed the rundown`, alex's `Note` still holds alex's text, and `world()` holds sam's note.
- **Suite.** `bun apps/controller/scripts/proofs.ts --port=8999 --quick` runs `two operators` and `problems where the operator looks`. Screenshots: `01-name-taken`, `02-sam-sees-alex-preview`, `03-alex-took`, `04-sam-cleared` and `55-conflict`.

## Gotchas

- Two pages in one browser context share localStorage, and so share one operator. Use separate contexts. `s.operator()` makes a new context each time.
- Two controllers with the same name share one preview. The name dialog warns, but `Use it anyway` lets it happen.
- A clear names the slot the operator saw. If another operator's Take landed first, the clear changes nothing. That is the design, not a bug.
- The thumbnails under `Others' previews` are monitors named `other:<id>`, which read the same as `preview`.
