# Surf agent (mini side)

The server half of **Macinclaude Surf** — a reader-mode web browser for the
Macintosh Plus. The Plus sends one command line; this agent fetches the page on
the modern side, has Claude distill it to a compact reader-mode markup, and
streams the page back over the serial/TCP link. The Plus never sees HTML.

```
Mac Plus ──serial──> RetroWiFi SI ──WiFi/TCP──> Mac mini :2326 ── socat ── surf-agent
```

At 9600 baud (~950 bytes/s) a cleaned article of 5–8 KB loads in 6–8 seconds,
and the Plus renders lines as they arrive, so reading starts in ~2.

## Wire protocol (must match `surf/surf.c`)

All lines end `\r\n` on the agent side; the Plus sends `\r`.

**Plus -> agent** (one command per line):

```
GO <url-or-search-words>   fetch a URL, or web-search if it isn't URL-shaped
LINK <n>                   follow link number n on the current page
BACK                       go to the previous page (replayed from cache)
SUM                        summarize the current page (~one screen)
ASK <question>             answer a question about the current page
```

**Agent -> Plus**:

```
SRFSTS <message>           transient status ("fetching...", "searching...")
SRFPAG                     page frame begins
T <text>                   page title (first block)
H <text>                   section heading
P <text>                   paragraph
Q <text>                   quote (indented)
- <text>                   bullet item
L <n> <text>               numbered link (click or LINK n to follow)
+ <text>                   continuation of the previous block (joined with a space)
B                          vertical gap
SRFEND                     page frame ends
SRFERR <message>           failure (no frame follows)
```

Rules that keep the 68000 parser trivial:
- every wire line is <= 220 chars; long blocks are split into `+` continuations
- text is 7-bit ASCII (smart quotes/dashes transliterated on the mini)
- at most 250 blocks, 30 links, ~12 KB of text per page (agent enforces)
- link numbers are assigned by the agent; it keeps the n -> URL map per page

## What Claude does

- **Reader mode** (`GO` url / `LINK`): the agent fetches + strips HTML to rough
  text and a link list locally, then Claude (model `SURF_MODEL`, default
  `claude-opus-4-8`) re-emits it as clean SRF blocks — article text kept
  near-verbatim, nav/ads/cookie noise dropped, the ~dozen genuinely useful
  links kept (emitted as `L <url> | <text>`, the agent numbers them).
- **Search** (`GO` non-url): Claude runs the `web_search` server tool and
  emits a results page with titled links.
- **Summarize / Ask**: Claude condenses or answers from the current page's
  already-extracted text. No re-fetch.

## Files

- `src/page.ts`     — sanitize Claude's block output into a legal frame
                      (ASCII fold, line splitting, link numbering, caps)
- `src/extract.ts`  — fetch + strip HTML -> rough text + absolute link list
- `src/claude.ts`   — the three Claude calls (readerify / search / answer)
- `src/session.ts`  — per-connection state: history stack, link maps, frame cache
- `src/main.ts`     — stdin/stdout line loop (the socat-facing program)
- `src/selftest.ts` — offline: embedded HTML -> extract -> frame -> validate;
                      live (with key + network): real URL end to end

## Run it

```bash
npm install

# offline selftest (no key needed) + live test when ANTHROPIC_API_KEY is set
npm run selftest

# interactive local session (type GO/LINK/BACK/SUM/ASK lines):
ANTHROPIC_API_KEY=... npm start

# what the Plus dials into (port 2326 — 2323 shell, 2324 Code, 2325 Paint):
socat TCP-LISTEN:2326,reuseaddr,fork \
  EXEC:'npx tsx /path/to/agent-surf/src/main.ts',pty,setsid,ctty,stderr
```

Env: `ANTHROPIC_API_KEY` (or `.env.local` at the repo root), `SURF_MODEL`
to override the model.

## Phase 2 (not built)

A dithered hero image appended after `SRFEND` (Prodigy-style, loads last) —
the Atkinson wire format already proves the image path; bolt-on when wanted.
