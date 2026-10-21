# Stakeholder preview site

A static website that shows one graphic at a time, so stakeholders can review the work without running anything.
Graphics designed to sit beside the scorebug are shown with the scorebug on air behind them. Each page has Show and
Hide, Previous and Next step for the stepped graphics (Starting Five, Halftime Adjustments, Burning Question), an
editable content form, a dark or transparency backdrop, and a sponsors filter. A link to `/#basketball-v2/starting-five`
opens that graphic.

There is no server. The page runs a local show (`createLocalShow` in `@dtv/playout`): the reducer and projector the
show server runs, over a World baked into `world.json`. `createRenderer` draws it, the same module the `/renderer`
page and the controller use. What stakeholders see is what OBS gets.

```bash
bun run site:build          # sign every scene (bun run riv:build), then assemble build/site/
bun run site:assemble       # assemble build/site/ from the scenes already in build/riv/
bun run site:preview        # serve build/site/ with wrangler dev (port 8787)
bun run site:serve          # serve build/site/ with Bun (port 8988), where wrangler cannot run
bun run site:screenshots    # drive the served site in Chromium and screenshot every graphic
bun run site:deploy         # publish to Cloudflare Workers (wrangler deploy)
```

`site:build` needs `rive login`, as `riv:build` does. `wrangler dev` needs Node, so on a machine without it use
`site:serve`. Deploying needs `wrangler login` and publishes to the account you are logged in to, so run it
deliberately.

## What gets built

`build/site/` is plain static files, with no Worker script.

```
index.html, app.js, style.css   the viewer
world.json                      the World snapshot, the demo game's live state, and a show with one cue per graphic
riv/<scene>.riv                 the signed scenes
assets/images/                  the images graphics bind and the sponsors' logos
assets/remote/                  team logos fetched from images.dragonstv.io at build time
fonts/                          IBM Plex Sans, self-hosted (@fontsource/ibm-plex-sans)
```

`wrangler.jsonc` at the repository root serves that directory as Workers static assets. Any other static host works
too. Routing uses the URL hash, so no rewrite rules are needed.

The build seeds an in-memory database from `data/seed`, replaces the demo show's rundown with one cue per registry
entry from its `demo`, and fails if a demo does not bind. It copies every image the bound frames name, and fetches
the remote ones so the site needs no other host.

## The content form

`form.ts` builds it from the graphic's own definition, so a new graphic needs no site code.

- **Content** holds the params a person may type: free text (the Burning Question's question and answer, the halftime
  title) and fixed choices (Score to Break's side). Ids such as a player or a team stay as the demo cues them.
- **Text on screen** lists every text the scene shows. A value changed here becomes a cue override.

An edit rewrites the cue in the local show's rundown and refreshes the slot on air. A property the scene holds still
while on air (`frozenOnAir`, such as Score to Break's side) takes the graphic again, so it plays out and in.

## Adding a graphic

Nothing to edit here. A registry entry appears under the section its `site` field names. Its sponsor comes from the
seed's sponsorships, and the sponsors filter lists any sponsor that presents a graphic.

## Files

| Path | |
|---|---|
| `main.ts` | The page: list, sponsors filter, Show, Hide and step buttons, backdrop |
| `form.ts` | The content form |
| `world.ts` | The shape of `world.json` |
| `scripts/build.ts` | Assembles `build/site/` |
| `scripts/serve.ts` | Serves `build/site/` with Bun |
| `scripts/screenshots.ts` | Screenshots every graphic in Chromium, plus a step, an edit and the sponsors filter |

Published scenes carry the Rive watermark until `rive push` binds the project to a Rive file.
