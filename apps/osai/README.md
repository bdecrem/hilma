# osai — the Open Source AI reading room

`/osai` (ola.cx/osai, also hilma-nine.vercel.app/osai). Three readers, one
shared passcode, three documents and an assistant that has read them.

## What is where

| Piece | Path |
|---|---|
| Pages | `src/app/osai/` — `layout.tsx` gates everything (sign-in or the shell), `page.tsx` the one-pager, `overview/`, `details/`, `Chat.tsx` the sidebar |
| API | `src/app/api/osai/` — `auth/login`, `auth/logout`, `chat` (GET history, POST a turn, DELETE to clear), `memory` (GET, DELETE) |
| Logic | `src/lib/osai/` — `auth.ts` (names + passcode + cookie), `prompt.ts` (system prompt, model ids), `memory.ts` (Haiku-maintained note), `core.ts` (one-pager parser), `overview.ts` (the eight rows), `content.ts`, `db.ts` |
| Content | `apps/osai/content/core.md` (generated, see below) and `map.md` (copied from docsrepo) |
| Schema | `apps/osai/schema/001_osai.sql` — `osai_messages`, `osai_memory`; apply with `supabase db query --linked -f` |
| Checks | `scripts/osai/e2e.mjs` — Playwright run against a dev server (see the header) |

## The one-pager is canonical in Pages

`../docsrepo/opensourceai/1pager.pages` is the source of truth and is edited
by hand in Pages. Never edit `apps/osai/content/core.md` directly. After
changing the Pages document:

```bash
pnpm osai:slurp        # Pages → RTF → markdown into apps/osai/content/core.md, plus map.md
git commit -am "osai: refresh the one-pager" && git push
```

The script drives Pages over AppleScript (export only, the document is closed
without saving), so it runs on a Mac with Pages. The battery glyph after
"Traction:" becomes the word "low"; other SF Symbols glyphs are dropped.
Pros/cons tables and two-column bullet tables become lists.

## Readers, passcode, memory

- Names are fixed in `src/lib/osai/auth.ts` (`mitchell`, `songyee`, `bart`).
- `OSAI_PASSCODE` (shared) and `OSAI_SESSION_SECRET` live in `.env.local` and
  on Vercel (Production). The cookie is `osai_session`, 90 days.
- Each reader has a chat history (`osai_messages`) and a memory note
  (`osai_memory.notes`). After every reply, `claude-haiku-4-5` folds the
  exchange into the note (≤150 words); the note is shown in the chat panel
  under "What it remembers about you" and can be cleared there.

## Models

`claude-opus-5-5` by default, `claude-fable-5-1` on the toggle (remembered per
device). Both run at `effort: medium` with server-side refusal fallbacks
(`fallbacks: "default"`). The system prompt carries all three documents with a
cache breakpoint, then the reader's name and note.
