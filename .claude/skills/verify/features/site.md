# Stakeholder site

The stakeholder site (`preview.dragonstv.io`) shows one graphic at a time, with no server. It runs the same reducer, projector and renderer as the show over a World that is baked into `world.json`, so what stakeholders see is what OBS gets. Each page has Show and Hide, Next and Previous step, a content form, a backdrop toggle and a sponsors filter.

## Sub-features

- `site-graphic` opens one graphic per `#<graphic id>` route, such as `#basketball-v2/starting-five`. Graphics that sit beside the scorebug show it behind them.
- `site-step` steps Burning Question, Starting Five and Halftime Adjustments with `#next`.
- `site-form` edits typed params in `#content` (Burning Question's answer, Score to Break's `side`) and refreshes the graphic.
- `site-sponsor-filter` filters the list to the graphics a sponsor presents, with `[data-sponsor="<id>"]`.

## How to get to it (user POV)

- Open the deployed site, or a local build at `http://localhost:<port>/#basketball-v2/scorebug`.

## Driving it with site screenshots.ts

Preconditions:

- `build/riv` is complete. The build fetches team logos from `images.dragonstv.io`, so it needs the network.
- Port 8999 is free. The site has no `dtv.sh` instance; it is static files.

- **Build.** `bun run site:assemble` reuses `build/riv/` and prints `Built build/site/ with 17 graphics, 17 scenes and 9 images.` (`bun run site:build` signs every scene again first.)
- **Serve.** `nohup bun apps/site/scripts/serve.ts 8999 > $TMPDIR/dtv-site-8999.log 2>&1 & echo $! > $TMPDIR/dtv-site-8999.pid`. The log prints `build/site on http://localhost:8999`.
- **Drive.** `bun apps/site/scripts/screenshots.ts http://localhost:8999 build/verify/<run>/site`. It waits on `window.dtvRenderer.layers()` until every layer is `on` or `empty`, screenshots each of the 17 graphics, Burning Question after Next and after an answer edit, Score to Break set to `right`, and the Belfor sponsor filter. It exits 1 and lists the problems on any console error or failed expectation.
- **Stop.** `kill -TERM $(cat $TMPDIR/dtv-site-8999.pid)`, then `lsof -nP -iTCP:8999 -sTCP:LISTEN` prints nothing.

## Gotchas

- `site:serve` defaults to port 8988 and `site:preview` (wrangler) to 8787. Give the port explicitly. Wrangler needs Node, so use `serve.ts` under Bun.
- The site shows a Rive watermark until `rive push` binds the project. That is expected for a local build. Do not run `rive push` or `site:deploy` without the owner.
- A site page's `window.dtvRenderer` has the same shape as on `/renderer`, so `s.rendered(page)` from `lib.ts` works there too. Open it with a plain Playwright page, because `s.renderer()` expects `/renderer`'s `data-status`.
