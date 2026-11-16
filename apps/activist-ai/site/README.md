# Ola, the landing page

The front door of Ola: a private AI agent for activists and academics, on one computer Bart owns.
The page is a letter from Bart's office beside a drawing of the study where the computer sits.
It is a static page with no JavaScript, no cookies, no analytics, and no request to any other origin.
The fonts are self-hosted, and the only link off the page is the `mailto:`.

The design is Ola identity 7b2 ("the letter and the desk", evening, lamp on), approved
2026-11-15. The drawing code in `src/drawing.mjs` is ported verbatim from that design's generator,
so the art, the wordmark and the mark match it. At 1280×800 and 390×844 the page matches the approved
screenshots to about 0.1% of pixels; what differs is anti-aliasing.

## Where things are

| Path | What |
|---|---|
| `build.mjs` | Writes the deployable files to **`public/ola-site/`** at the repo root. `SITE_URL` (`https://ola.cx`) and `BASE` (`/ola-site/`) are the only places the address lives. |
| `src/drawing.mjs`, `src/geom.mjs` | The brush pen: the wordmark "Ola,", the mark (the room: a brushed O with a vermilion dot), the painted button and the study. |
| `signature.svg` | **The signature slot.** For now it holds a drawn placeholder "Bart". Replace it with a trace of Bart's real signature: `viewBox="0 0 160 70"`, ink baseline at y≈60, one color (any fill becomes `currentColor`). Then run `node build.mjs`. It is shown 116 px wide on a desk and 92 px on a phone. |
| `src/fonts.py` | Cuts the fonts to Latin and to the axis ranges the page uses (Bricolage Grotesque wght 650–720 and opsz 12–72; Literata roman and italic at 400, opsz 12–24). Sources are the variable TTFs from github.com/google/fonts, cached in `scripts/fonts/.cache/`. Run it with `scripts/fonts/.venv/bin/python apps/activist-ai/site/src/fonts.py`. Both families are OFL, and the license files ship next to the fonts. |
| `check.mjs` | The proof (see below). |

How it is served: ola.cx is the hilma Next.js app on Vercel. A host rewrite sends `/` to
`/ola-site/index.html`, which is why every asset URL is absolute under `/ola-site/`. A relative URL
would break when the page is served at `/`. `404.html` is written for the rewrite to use for
unknown paths on ola.cx.

## Build, preview, check

```bash
node apps/activist-ai/site/build.mjs            # the pages, manifest and favicon.svg (fast)
node apps/activist-ai/site/build.mjs --images   # also the PNG icons and og.png (Playwright)

# preview: serve the repo's public/ and open the page where the rewrite would put it
cd public && python3 -m http.server 8472        # then http://localhost:8472/ola-site/index.html
#   (or: npx serve public, then /ola-site/)

node apps/activist-ai/site/check.mjs            # serves public/ the way ola.cx will and checks it
node apps/activist-ai/site/check.mjs https://ola.cx/   # the same checks against the live site
```

`check.mjs` loads the page at 1280×800, 390×844, 768×1024, 1440×900 and 1920×1080 in a fresh
browser. It scrolls, hovers and tabs to the button, and records every request. It **fails on any
request to an origin other than the page's own**. It also fails on a cookie or storage write, a
script element, sideways scroll, a font that did not load, more or fewer than one `h1`, a broken
icon, manifest or share-card link, and a missing page that does not answer 404. It prints the bytes
transferred on a first visit.

Measured 2026-11-15, gzip on: **168 KB in 4 requests** (the page 49 KB, Literata 31, Literata
italic 32, Bricolage Grotesque 57). Uncompressed, the HTML is 139 KB, most of it the drawing's
paths. The share card, `og.png`, is fetched only by link previews.

Screenshots of design work: `node scripts/ola-brand/shot.mjs <url-or-file> <png> <w> <h>`.

## Before it goes live

1. **The ola.cx move.** ola.cx still serves other projects (Dolly's universal links, among others,
   in `next.config.ts`). The rewrite of `/` to `/ola-site/index.html` and the 404 handling are set
   up in hilma's `next.config.ts`, not here.
2. **bart@ola.cx must receive mail** (any address at ola.cx does, through SendGrid Inbound Parse, since 2026-11-15). The button and the link both write to it, and today the
   address may not exist. Set up receiving (forwarding to Bart is enough) and send a test message.
3. **The real signature** in `signature.svg`, then rebuild.
4. Run `check.mjs https://ola.cx/` against the live site, and preview the share card in a
   link-preview debugger.
