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
`VENTURE_KEY=<key> node scripts/venture/call-listen.mjs <slug>` joins a call
with a silent microphone and prints how it opens (marks the session `test`).

`apps/venture/private/` on the iMac holds the key (`KEY`), the charter, the
ideas, the call agendas, the interview transcript and the research notes. None
of it is in git; the published copies are the database rows.

## The open conversation (voice mode)

Added 2026-11-13, when Bart asked to discuss the ideas instead of answering an
agenda: "an open ended voice conversation, like voice mode, where I give
comments and you react."

    https://ola.cx/venture/talk?k=<key>

A fork of the call with the two halves pulled apart. OpenAI Realtime is only
the ears and the mouth: voice activity detection, transcription, and reading
text aloud (`create_response: false`, so it never answers by itself). Every
reply is written by Claude (`claude-opus-5-5`, effort low, the system prompt
cached), with every row of `venture_docs` loaded as its notes; the row `now`
(source `private/NOW.md`, "where things stand") goes first, so update and
republish it before a conversation.

1. Bart stops talking; the transcript of his turn arrives on the data channel.
2. The page posts it to `/api/venture/talk/reply`, which stores it and streams
   Claude's reply back as plain text.
3. The page hands the text to the voice a sentence or two at a time
   (`response.create` with `conversation: 'none'` and the text in `<line>`
   tags), so the first sentence is heard while the rest is still being
   written. About three seconds from the end of his turn to the first sound.
4. Talking over Claude stops it: the stream is aborted, the audio buffer
   cleared, and the stored turn keeps only as much as he can have heard
   (playback time at about 2.7 words a second), followed by an `interrupted`
   event that Claude sees on its next reply.

Turns land in `venture_interview_turns` with `call = 'talk'`; "End the call"
writes the `ended` marker, so `transcript.mjs --wait talk` returns at once.

| What | Where |
|---|---|
| Claude's side (persona, notes, messages, the reader voice's mint) | `src/lib/venture/talk.ts` |
| Routes | `src/app/api/venture/talk/{session,reply}/route.ts` (turns still go to `interview/turn`) |
| Page | `src/app/venture/talk/`, `src/app/venture/Talk.tsx` |
| Test call, no human | `VENTURE_KEY=<key> node scripts/venture/talk-check.mjs <outDir> [base]` |

The check plays one spoken comment through a fake microphone, then (on a dev
server, through `window.__talk`) compares what the voice said with what it was
given, types a turn, talks over the reply and checks the cut. Run it against
`next dev -p 3288` only when no other dev server shares the checkout: two of
them fight over `.next` and API routes 404 on the first try.

## Voice notes

Bart, 2026-11-14: "a permanent conversation URL I can bookmark... a URL where I
can leave you voice notes."

    https://ola.cx/venture/memo?k=<key>

Record, then stop and send (or discard). The browser records with
`MediaRecorder` at 32 kbit/s, one upload per note, nine minutes at most; the
server transcribes it (`gpt-4o-transcribe`) and stores it in the text thread,
`venture_messages`, marked `(voice note)`. So the watcher the working session
already runs (`imsg.mjs --wait`) wakes on it, and he never has to say a note
exists. Nothing answers on the page; the list under the button shows each note
and when the session read it.

| What | Where |
|---|---|
| Transcribe, store, list | `src/lib/venture/memo.ts`, route `src/app/api/venture/memo/route.ts` |
| Page | `src/app/venture/memo/`, `src/app/venture/Memo.tsx` |
| Test, no human | `node scripts/venture/memo-check.mjs <outDir> [base]` (a fake microphone plays one note; sent as a test, so it is stored as read and deleted after) |

## iMessage

Bart, 2026-11-13: "you can/should communicate with me using iMessage; we have
an iMessage bridge running on the Mac mini." Both directions go through the
plumbing Dodo and Onething already use (see "iMessage — one inbox" in the root
CLAUDE.md); the thread is the table `venture_messages`
(`schema/003_messages.sql`).

- **Out.** `node scripts/venture/imsg.mjs send "…"` posts to
  `/api/venture/imsg` (behind the key), which sends through `sendIMessage` to
  the phone handle paired to the f2 account `bart` and stores the row. Every
  text starts with `✴️` (`VENTURE_MARK`); the webhook drops from-me echoes that
  carry it.
- **In.** A text from one of Bart's paired handles that starts with `v` or
  `venture` is Venture's: `dispatchInbound` hands it to
  `src/lib/venture/messages.ts` before Onething or Dodo see it. It is stored,
  and Claude (Opus 5.5, with every `venture_docs` row as notes and the last 40
  messages) answers at once; an acknowledgment gets no answer. That reply
  cannot act; the working session reads the thread when it runs
  (`imsg.mjs inbox`, or `imsg.mjs --wait` as a background task).

## The company's site: kochitolabs.com

Bart asked (2026-11-14) for demand exploration before picking an idea: landing
pages and a small ad campaign. The pages are the company's site,
`src/app/kochito/` (kochitolabs.com through host rewrites; the domain is
registered at Vercel): `/pdf` and `/apps`, one form each.

| What | Where |
|---|---|
| Pages, the form, the visit counter | `src/app/kochito/` (`LeadForm.tsx`, `Track.tsx`, `kochito.css`) |
| Storage (events without cookies, sign-ups) | `src/lib/kochito/store.ts`, `schema/004_kochito.sql`, routes `/api/kochito/{event,lead}` |
| The numbers: people per page and source; new sign-ups | `node scripts/venture/leads.mjs` (`--all`, `--since <day>`, `--wait`) |
| Form check, as a visitor from an ad | `node scripts/venture/kochito-check.mjs [base]` (its sign-ups use `@kochito-check.test`, never counted, deleted after) |
| One fixed document shown to its owner, `kochitolabs.com/s/<slug>` | `src/app/kochito/s/[slug]/`, `schema/005_kochito_samples.sql`, `node scripts/venture/kochito-sample.mjs put <slug> [--publish] \| unpublish <slug> \| list` (reads a private fixing run; refuses a file that does not pass the checker) |
| Look at every page; rebuild the share images | `kochito-shots.mjs <dir> [base]`, `kochito-og.mjs` (both against a dev server; pass `https://kochitolabs.com` to look at the live site) |

The look is plain on purpose: white, one blue, Public Sans, real tables, no
decoration. Bart's words on the first version and the rule are at the top of
`kochito.css`.

Ad links carry `utm_source`, `utm_campaign` and `utm_term`; the page remembers
the first ones a browser arrived with, so a sign-up counts for the ad that
brought the visitor. What the pages claim (dates, prices, what is offered) is
sourced in the private notes; correct it there first, then here.

## Persistence: a session is not the business

Bart, same evening: "we need to save this session as a skill or agent or
whatever so that when this computer restarts or this terminal closes, we can
resume your work." Nothing that matters is kept only in a conversation:

| What | Where |
|---|---|
| The procedure for resuming (read state, catch up on Bart, restart watchers, work, checkpoint) | the project skill `.claude/skills/venture/SKILL.md`: type `/venture` in any session |
| Where things stand and the next actions | `private/NOW.md` (doc `now`), rewritten at every checkpoint |
| What happened and what Bart said, dated | `private/LOG.md` (doc `log`), append only |
| The rules | `private/CHARTER.md` (doc `charter`) |
| A copy of every private document off this disk | `venture_docs`, with the file name in `source`; `node scripts/venture/sync.mjs push | pull | status` |
| Everything Bart said by voice or text | `venture_interview_turns`, `venture_messages` |
| The standing rules, each distilled from a correction Bart had to make, with the checklists to run before he or a customer sees anything | `private/RULES.md` (doc `rules`). On this machine a SessionStart hook (`.claude/hooks/venture-rules.sh`, untracked like the rest of `.claude/hooks`) injects it into every session in the repo, also after compaction; the voice and the texting Claude get it right after `now` |
| Every correction, in his words, with the cause, the rule and the generalization | `private/CORRECTIONS.md` (doc `corrections`) |
| What has proved true and wrong (how he works, ideas, customers, tools, mistakes), read at every start and written at every result | `private/LESSONS.md` (doc `lessons`) |
| Every test's prediction, written before its result, then the result and the gap; the calibration so far | `private/BETS.md` (doc `bets`) |
| Data files (`private/data/` lead lists and scans, `private/pdf-proof/` samples) | the private storage bucket `venture-private`, by the same `sync.mjs push / pull` |
| The few rules every Claude session must know | the memory file `project_venture.md` |

Later the same day he made it stricter: "every time I correct something, that's a
failure... update your memory so that you don't make that same mistake again...
can I generalize additional learnings from this?... make sure that those
memories are always part of your context." The protocol is in the skill (step
3b) and at the top of RULES.md.

Bart asked on 2026-11-14 for the agent to learn as well as remember ("so that
it can inform and you can improve your work over time"). The skill makes every
session read LESSONS and BETS first, write a prediction before every test,
close it with the result, add a lesson whenever he corrects or decides
something, and review the whole file at the end of each weekly cycle.

`sync.mjs pull` on another machine (with the repo and `.env.local`) rebuilds
the private folder, so the mini or the laptop can pick the work up. The access
key is in `private/KEY` and as `VENTURE_KEY` in `.env.local`; it is not in
Supabase, but every link texted to Bart carries it. Not built yet: a scheduled
headless session that works with no terminal open.

