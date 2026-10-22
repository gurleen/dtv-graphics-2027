# DTV verification map

This directory is the maintained list of what operators, OBS and stakeholders can do with the DTV show server and site. Each file is a recipe. Read this index first, then open the file for the feature you are proving.

## Baseline preconditions

- The prerequisites in [../SKILL.md](../SKILL.md) are met: `bun install` is done, `rive whoami` names an account, and `bun run riv:build` has run since the last `.rml` change.
- An instance runs from `.claude/skills/verify/scripts/dtv.sh up --port=8998` (or `8999`), and `dtv.sh doctor` passes.
- The seed has one game, `Saint Joseph's at Drexel` (`2026-27/2026-11-08/saint-josephs-mbb.at.drexel-mbb`). Its show, keyed by the same id, has 15 rundown cues and three crew members (Rob Brooks, Mike Tuberosa, Tessa Peloso). No game is active until someone presses `Activate`.
- Drexel is the home team for every default test.

## Driving conventions

- Start each recipe from a fresh `dtv.sh up` unless the recipe says otherwise. Recipes change the database.
- Name operators in lowercase letters (`alex`, `sam`). The controller stores the name in localStorage `dtv.operator`. `session().operator(id)` sets it before the page loads.
- Prefer roles and accessible names. Use the `data-*` attributes and class names in SKILL.md only where no role exists.
- Read layer state from `window.dtvMonitors` (controller) and `window.dtvRenderer` (`/renderer`, site). Do not judge a graphic only by a screenshot, because a graphic that is still `entering` looks half drawn.
- A journey that the existing suites already cover can run the suite. Give it `--port=8999` and point `--out` into `build/verify/`.

## Proof and skip reporting

- Report the feature file, the sub-feature ids, the entry point (button, key, URL) and the evidence folder for each claim.
- A check that read the API back counts as proof of state. A screenshot counts as proof of what the operator saw. Give both.
- If a precondition is missing (no `.riv`, no baseline captures, the port taken), report the sub-feature as not run and name the missing precondition. Do not report it as passed through another path.

## Feature entry contract

Each feature file starts with an H1 and a paragraph on what the user sees. Then come four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, and `Gotchas`.

## Features

- [Preview, take and program](./show-take.md) covers cueing, Take, Next, the clears and the show page's keys.
- [Free panel and rundown editing](./free-panel-and-rundown.md) covers airing from the free panel, Add cue, editing in the inspector, refresh on air, reorder and remove.
- [Two operators](./two-operators.md) covers separate previews, a shared program, the name dialog and a refused stale save.
- [Data page](./data-page.md) covers in-place edits, locks, roster CSV import and edit conflicts.
- [Games](./games.md) covers creating a game, its crew, making it active, its first cue, and the delete guards.
- [Renderer output](./renderer-output.md) covers `/renderer` program and preview buses, reload mid-show, steps and Score to Break.
- [Server restart recovery](./restart-recovery.md) covers the Reconnecting badge, program and show surviving a restart, and pages that do not reload.
- [Frame comparison](./frame-comparison.md) covers every graphic on `/renderer` against the phase 0 captures.
- [Score and clock](./score-and-clock.md) covers the read-only score bar, driving the game over `game.apply`, the shot clock at the buzzer, and the scripted tip-off-to-final game.
- [Stakeholder site](./site.md) covers the static preview site built from the same renderer.
