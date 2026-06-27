# Dog-Ear — the monthly run

There is **one** monthly run. It builds the shared Staff Picks once, generates
each signed-up user's personal Claude Code Picks from their stored taste
profile, and emails every user their issue (staff picks + their picks).

All of that logic lives server-side in **`POST /api/book-scout/monthly`**
(`src/app/api/book-scout/monthly/route.ts`), key-gated with `x-book-scout-key`.
The work runs in `after()` on the server, so the caller just fires it and
returns.

## The cron

A monthly cloud routine (`/schedule`, trigger `book-scout-monthly`, `0 15 1 * *`)
does nothing but call the endpoint:

```
curl -sS -X POST https://feynd.cc/api/book-scout/monthly -H 'x-book-scout-key: <BOOK_SCOUT_PASSWORD>'
```

Expect `{"started": true, "month": "..."}`. The research + emails finish in the
background.

## What the endpoint does

1. **Staff Picks** — `researchBooks(config.genre, active sources)` once → saved
   as a shared `book_scout_digests` row (books only). Falls back to the most
   recent issue if the research call fails, so the run still goes out.
2. **Per-user Claude Code Picks** — for each `book_scout_users` row with a
   library: build the taste profile if missing, then `researchClaudePicks` from
   the profile, dedup against what they own, save to `book_scout_user_picks`.
3. **Email** — each user gets `buildDigestHtml(staffBooks, …, theirPicks)` at
   their account email.

## Scaling note

Users are processed sequentially inside one function invocation (each ~½–1 min
for the picks research). That's fine for a handful of users. If the user count
grows past what fits in the function's `maxDuration`, move the per-user loop to
a queue / batched invocations (e.g. process N users per call, or fan out to the
Mac mini) — the per-user step is already self-contained.
