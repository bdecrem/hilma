# Book Scout

Monthly book recommendations curated by **humans** (critics, booksellers,
librarians) — never by AI taste. The AI only aggregates these humans' picks,
filters to titles **available on Kindle now**, and presents them with
attribution.

## Pieces

- **Control panel + archive:** `feynd.cc/book-scout` (web page,
  `src/app/book-scout/`). Shows the genre, the source list, and every month's
  results. Unlock with the edit key to change the genre, mute/delete sources, or
  add new ones.
- **Data:** Supabase (`sms-bot` project) — `book_scout_config` (one row: genre,
  reference books, deliver-to, notes), `book_scout_sources` (the human
  curators), `book_scout_digests` (each month's results). This is the single
  source of truth; the page and the monthly agent both read/write it.
- **API:** `src/app/api/book-scout/` — `data` (open read), `config` + `sources`
  (authed writes), `digest` (authed; the monthly agent posts results here, which
  saves to the archive AND emails via SendGrid).
- **Monthly agent:** a cloud routine (created with `/schedule`) that runs the
  prompt in `monthly-agent-prompt.md`: reads the config, mines the active human
  sources, applies the available-now filter, and POSTs results to
  `/api/book-scout/digest`.
- **Email:** rendered + sent server-side by `src/lib/book-scout/email.ts`
  (SendGrid), so the cloud routine never needs local secrets.

## Env

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — DB (shared with F2).
- `SENDGRID_API_KEY` — sends the digest email.
- `BOOK_SCOUT_PASSWORD` — edit key for the page + the monthly agent's POST.

All set in Vercel (production) and `.env.local` (local).

## Seed reference

`sources.json` is the original seed list of human curators (already loaded into
the DB). Edit live sources on the page, not here.
