# Stakeholder preview site

A static website that shows one built graphic at a time, so stakeholders can
review the work without running anything. Graphics designed to sit beside the
scorebug are shown with the scorebug on air behind them. Each page has Show and
Hide, Previous and Next step for the starting five, an editable content form,
and a dark or transparency backdrop.

It is separate from `preview/`, the Vite page that runs the scorebug during
development. This site is built from the OGraf packages, so it plays exactly
what a broadcast renderer would load.

```bash
bun run site:build      # build every OGraf package, then assemble build/site/
bun run site:assemble   # assemble build/site/ from an existing build/ograf/
bun run site:preview    # serve build/site/ locally with wrangler dev (port 8787)
bun run site:deploy     # publish to Cloudflare Workers (wrangler deploy)
```

`site:build` needs `rive login`, as `ograf:build` does. Deploying needs
`wrangler login` and publishes to the account you are logged in to, so run it
deliberately.

## What gets built

`build/site/` is plain static files, with no Worker script:

```
index.html, app.js, style.css   the viewer
fonts/                          IBM Plex Sans, self-hosted (@fontsource/ibm-plex-sans)
graphics.json                   the catalog: name, placement, paths
graphics/<id>/                  each OGraf package as built (manifest, index.mjs, .riv, thumbnail)
```

`wrangler.jsonc` at the repository root serves that directory as Workers static
assets. Any other static host works too: upload `build/site/` as it is (for
Cloudflare Pages, set the output directory to `build/site`). Routing uses the
URL hash (`/#dtv-basketball-v2-scorebug`), so no rewrite rules are needed and a
link to one graphic can be shared.

To change the Worker's name, edit `name` in `wrangler.jsonc`.

## Adding a graphic

Nothing to edit: a package built into `build/ograf/` appears on the site under
"Full frame". If it is meant to share the screen with the scorebug, add its id
to `COMPANION_IDS` in `catalog.ts`.

## Files

| Path | |
|---|---|
| `catalog.ts` | Which graphic is the scorebug and which sit beside it |
| `scripts/build_site.ts` | Assembles `build/site/` from `build/ograf/` |
| `app/` | The viewer: `index.html`, `style.css`, `app.ts` (bundled to `app.js`) |

Published packages carry the Rive watermark until `rive push` binds the project
to a Rive file; see `ograf/README.md`. The site shows whatever the build
produced.
