# Venture

Started 2026-11-13. Bart's brief: Claude comes up with a business idea and then
executes it, with whatever tools it needs. This folder is the project's home;
the business itself gets its own section here once it is chosen.

## Step 1: the founding interview (voice)

Bart asked for the clarifying questions over voice. The call is a page:

    https://ola.cx/venture/interview?k=<key>

The link is the access (only the key's SHA-256 is in the repo, in
`src/lib/venture/interview.ts`; the key itself is in the session that made it
and in Bart's terminal history). The page opens a WebRTC call to OpenAI
Realtime (`gpt-realtime-2.1`, voice cedar, semantic VAD at low eagerness so
pauses are waited out). The interviewer's brief is Claude's question list
(`BRIEF` in the same file): seven required topics (the point, who decides,
money, time, legal and payments, identity, acting in the world), eight more as
time allows, a recap, and a `finish_interview` tool call that ends the call.

Every finished turn, both sides, is posted to `/api/venture/interview/turn`
and stored in `venture_interview_turns` (schema `schema/001_interview.sql`,
Supabase project sms-bot) as it happens. A dropped or hung-up call resumes
from the stored transcript ("Pick the call back up"): the transcript so far
goes into the brief and the interviewer continues with the first topic not
covered.

| What | Where |
|---|---|
| Brief, key check, mint, storage | `src/lib/venture/interview.ts` |
| Routes | `src/app/api/venture/interview/{session,turn}/route.ts` |
| Page | `src/app/venture/interview/`, on the shared `src/app/venture/Call.tsx` (the face is `drawMe` from `src/app/claude/drawing.ts`) |
| Read the transcript | `node scripts/venture/transcript.mjs` (`--list`, `<session>`, `--wait`) |
| Test call, no human | `VENTURE_KEY=<key> node scripts/venture/interview-check.mjs <outDir> [base]` |

The check runs headless Chromium with a fake microphone playing one answer
spoken by macOS `say`, against `next dev -p 3288` (or `https://ola.cx`, where
the dev-only typed-turn hook is absent and the goodbye step is skipped). It
marks its session `test`; `--wait` ignores those.

## After the interview: calls and documents

The repo is public, so what Claude and Bart say to each other about the
business is not in it. Two tables hold it (`schema/002_calls_docs.sql`), both
served only behind the key:

- **Calls.** Bart asked for one ten-minute voice call a day in place of
  dashboards. A call is a row in `venture_calls`: Claude writes an agenda
  (what to tell him, what to ask, what he has to do), he opens
  `ola.cx/venture/call/<slug>?k=…`, and the transcript comes back like the
  interview's (`call` column on the turns). The house rules every call shares
  are `HOUSE` in `src/lib/venture/interview.ts`.
- **Documents.** `ola.cx/venture/doc/<slug>?k=…` renders a markdown row of
  `venture_docs` (the charter, the ideas, reports). Links to `/venture/…`
  inside a document keep the key.

Sources live in `apps/venture/private/` (gitignored) and are published with
`node scripts/venture/put.mjs doc|call <slug> <file.md>`; no deploy needed.
`node scripts/venture/transcript.mjs --wait <call>` blocks until that call has
ended. `node scripts/venture/shot.mjs <url> <png> [full]` is a phone-size
screenshot.
