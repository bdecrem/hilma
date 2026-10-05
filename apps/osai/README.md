# osai — the Open Source AI reading room

`/osai` (ola.cx/osai, also hilma-nine.vercel.app/osai). Three readers, one
shared passcode, the reading list, three documents and an assistant that has
read all of it.

## What is where

| Piece | Path |
|---|---|
| Pages | `src/app/osai/` — `layout.tsx` gates everything (sign-in or the shell), `page.tsx` the reading list (tab "Resources", the landing page), `memo/` the one-pager (tab "Open Source") with the Landscape card under it, `overview/` the Landscape (no tab; reached from that card), `details/` (no tab; reached from the card at the top of Landscape and from each row), `Chat.tsx` the sidebar |
| API | `src/app/api/osai/` — `auth/login`, `auth/logout`, `auth/password` (GET has one?, POST set, DELETE back to the shared passcode), `chat` (GET history, POST a turn, DELETE to clear), `memory` (GET, DELETE) |
| Logic | `src/lib/osai/` — `auth.ts` (names + passcode + cookie), `prompt.ts` (system prompt, model ids), `memory.ts` (Haiku-maintained note), `core.ts` (one-pager parser), `resources.ts` (page-2 parser, resource docs), `overview.ts` (the eight rows), `content.ts`, `db.ts` |
| Content | `apps/osai/content/core.md` (generated, see below), `map.md`, `resources.txt` and `resources/*.md` (all copied from docsrepo by the same script) |
| Schema | `apps/osai/schema/` — `001` `osai_messages`, `osai_memory`; `002` `osai_users` (own passwords); apply with `supabase db query --linked -f` |
| Checks | `scripts/osai/e2e.mjs` — Playwright run against a dev server (see the header) |

## The content is canonical in docsrepo

Everything under `apps/osai/content/` is a copy; never edit it directly.
The sources, all in `../docsrepo/opensourceai/`:

- `1pager.pages` — the one-pager, edited by hand in Pages.
- `public-benefit-ai-map.md` — the Landscape's long form.
- `page2.txt` — "page 2" of the one-pager: the reading list that is the
  Resources tab. Plain text, edited in TextEdit. One entry per block, blocks
  separated by two blank lines: a title line, byline line(s), the URL on its
  own line, a blank line, the blurb. The heading block (no URL) is skipped.
- `resources/NN-slug.md` — the text of each linked document (or an excerpt,
  for a book-length report), with `title`, `byline`, `url` and `note` in the
  frontmatter. `url` matches the file to its page-2 entry; `note` says what
  was captured. These are what the assistant reads; the tab shows page 2.

After changing any of them:

```bash
pnpm osai:slurp                          # Pages → core.md, plus map.md, resources.txt, resources/
node scripts/osai/slurp.mjs --copy-only  # the copies only, when the one-pager has not changed
git commit -am "osai: refresh the content" && git push
```

If page 2 is pasted into the Pages document as well, the slurp stops the
memo at the "Page 2" heading, so it does not show up twice.

The script drives Pages over AppleScript (export only, the document is closed
without saving), so it runs on a Mac with Pages. The battery glyph after
"Traction:" becomes the word "low"; other SF Symbols glyphs are dropped.
Pros/cons tables and two-column bullet tables become lists.

## Readers, passcode, memory

- Names are fixed in `src/lib/osai/auth.ts` (`mitchell`, `songyee`, `bart`); the reader types their first name (any case) plus the passcode. A fourth name, `e2e`, exists only where `OSAI_E2E_PASSCODE` is set and signs in with that secret alone: it is what `scripts/osai/e2e.mjs` uses, so the check never touches a real reader's rows.
- `OSAI_PASSCODE` (shared) and `OSAI_SESSION_SECRET` live in `.env.local` and
  on Vercel (Production). The cookie is `osai_session`, 90 days.
- A reader can set their own password ("Set a password" in the top bar or
  the chat footer; typed twice, 8+ characters). It is bcrypt-hashed into
  `osai_users` and replaces the shared passcode for that reader until they
  remove it from the same dialog.
- Each reader has a chat history (`osai_messages`) and a memory note
  (`osai_memory.notes`). After every reply, `claude-haiku-4-5` folds the
  exchange into the note (≤150 words); the note is shown in the chat panel
  under "What it remembers about you" and can be cleared there.

## Look

Dark by default, light mode from the user menu (`data-osai-theme="light"` on
`<html>`, remembered in `localStorage` as `osai:theme`). Tokens live at the top
of `src/app/osai/osai.css`: graphite-blue ground with a faint graph-paper
grid, mint for everything interactive, amber for the one data colour ("room
to work"). Type: Bricolage Grotesque for display, Instrument Sans for reading,
JetBrains Mono for labels and numbers (all via `next/font/google` in
`layout.tsx`). Keep new UI on these tokens.

## Web search

Off by default, so every answer starts from the documents. A turn runs with
the `web_search` server tool only when the client sends `search: true`: the
"Search the web for more on this?" prompt under the latest answer, or the
Web toggle in the composer (one message, then it resets). On a search turn
the system prompt asks for the documents' answer first and "From the web"
after, and the route appends a Sources list from the citations.

## Models

`claude-opus-5-5` by default, `claude-fable-5-1` on the toggle (remembered per
device). Both run at `effort: medium` with server-side refusal fallbacks
(`fallbacks: "default"`). The system prompt carries the one-pager, the map,
the overview and the whole reading list (every `resources/*.md`, about 25k
words) with a cache breakpoint, then the reader's name and note.
