---
name: venture
description: Resume and run Venture, the business Claude runs with Bart. Loads the charter, the current state and the log from outside the session, reads what Bart said since (voice transcripts, iMessage), restarts the watchers, and carries on from the next action. Use it whenever Bart says "venture", "resume", "pick the business back up", "where were we with the business", "continue your work", asks about the business ideas, customers, revenue or the daily call, after a restart or in a new terminal, and at the start of any session that touches apps/venture, src/lib/venture or scripts/venture.
---

# Venture: resume and run

Bart asked Claude (2026-11-13) to come up with a business and execute it, as his
partner. The work outlives any one terminal session, so nothing that matters is
kept only in a conversation. This skill is how a new session becomes the one
that was running before.

This repo is public. The business itself (charter, ideas, research, state, log,
call agendas, transcripts, the access key) is **never committed**. It lives in
`apps/venture/private/` (gitignored, on this machine) and in Supabase
(`venture_docs`, `venture_calls`, `venture_interview_turns`,
`venture_messages`). This file holds the procedure only; keep it that way.

## 1. Load the state

Read, in this order:

1. `apps/venture/private/NOW.md` — where things stand, what is in flight, the
   next actions, what is waiting on Bart.
2. `apps/venture/private/CHARTER.md` — the rules Bart set (spending limit, what
   needs telling him first, what counts as success and as failure).
3. `apps/venture/private/LESSONS.md` — what has proved true and wrong so far
   (how Bart works, picking ideas, finding customers, doing the work, tools,
   mistakes not to repeat). This is the memory that makes each session better
   than the last; read all of it.
4. `apps/venture/private/BETS.md` — the open bets, each with the prediction
   written before its result, and the calibration so far.
5. The last ~80 lines of `apps/venture/private/LOG.md` — what happened and what
   he said, dated.
6. `apps/venture/README.md` for the mechanics (calls, the open conversation,
   iMessage, scripts).

If the private folder is missing or empty (a new machine, a lost folder):
`node scripts/venture/sync.mjs pull` restores every document from Supabase,
and the data files (`private/data/`: lead lists, scans) from its storage.
The access key for `ola.cx/venture/...?k=` links is in
`apps/venture/private/KEY` and as `VENTURE_KEY` in `.env.local`; if both are
gone, every link in Bart's iMessage thread carries it.

## 2. Catch up on Bart

- `node scripts/venture/imsg.mjs inbox` — texts he sent that no session has
  read (with the answers the server already gave him). Marks them read.
- `node scripts/venture/transcript.mjs --list` — every voice session. Read any
  real one (not marked test) that is newer than the last LOG entry:
  `node scripts/venture/transcript.mjs <session>`.

Whatever he decided or asked for goes into LOG.md in his words, and into
NOW.md's next actions, before anything else.

## 3. Restart the watchers

Run both as background tasks; each exits when there is something to read, and
is restarted after it has been handled:

    node scripts/venture/imsg.mjs --wait
    node scripts/venture/transcript.mjs --wait talk

Add `transcript.mjs --wait <slug>` while an agenda call is open.

## 4. Work

Take NOW.md's next actions from the top. The charter is the authority; the
points that have bitten already:

- Spending: the limit in the charter, every dollar in the ledger. Anything over
  needs his yes first.
- Cold email, calls or DMs to strangers: **Bart reviews every draft and the
  full recipient list first, and nothing goes out until he says yes to that
  batch** (his words, 2026-11-14: "I need you to let me review those emails
  before they go out and understand who you're going to send them to").
- No deception. If someone asks whether they are dealing with an AI, yes.
- Ideas come from first principles and outside evidence, never from whatever
  already exists in this repo or in memory, and each must have a road to real
  size (see the memory file `project_venture.md`).
- Research goes to subagents with narrow briefs; their reports are saved to
  `private/` the moment they return. Put the lessons that bear on the task
  into the brief (for lead lists: only published addresses, no contact).
- **Learn as you go.** Before a decision or a draft for Bart, reread the
  LESSONS sections that bear on it. Before any test, write its prediction in
  BETS.md (a number where possible, how sure, what each outcome triggers).
  Anything a later session may need goes in `private/` (documents) or
  `private/data/` (data), never only in a scratchpad.

## 5. Talk to Bart

He is usually not looking at the terminal.

- **Short things, and "this is ready":** `node scripts/venture/imsg.mjs send "…"`.
  Plain text, a few a day at most, with the link when there is something to
  open. He writes back by starting a text with `v` or `venture`.
- **Discussion:** `https://ola.cx/venture/talk?k=<key>` (open voice
  conversation; Claude answers from the documents, so push NOW.md first).
- **Fixed asks that need him at a keyboard:** an agenda call,
  `node scripts/venture/put.mjs call <slug> <file.md>` →
  `https://ola.cx/venture/call/<slug>?k=<key>`.
- **Things to read:** `https://ola.cx/venture/doc/<slug>?k=<key>`.

## 6. Checkpoint, every time

Before the turn ends, and right after anything that matters (a decision of
his, money moved, something sent to a stranger, research returned):

1. Rewrite `NOW.md`: state, in flight, next actions, waiting on Bart, which
   background tasks should be running.
2. Append to `LOG.md`: the date, what happened, what was decided, his words
   quoted where they set direction.
3. **Learn.** If a result came in, close its bet in BETS.md (result, the gap
   from the prediction, the lesson) and update the calibration line. If Bart
   corrected me, decided something, or reacted to anything, or something
   surprised me, add or revise a lesson in LESSONS.md (what, evidence with
   date, how to apply). Strike through a lesson that proved wrong, with why;
   never silently delete one.
4. `node scripts/venture/sync.mjs push` (the copy in Supabase is the backup,
   and what the voice and the texting Claude read; it also uploads
   `private/data/`).

A session that dies right after a checkpoint has lost nothing. A session that
dies without one has lost whatever it had not written down, so checkpoint
before long-running work, not only after.

## 7. Review, at the end of every cycle

Each Friday (the end of a week's bet) and whenever a bet is killed: reread
LESSONS.md whole, merge duplicates, rewrite vague lessons into specific ones,
move what no longer applies to a "Retired" section with the reason, and
recompute the calibration in BETS.md (how many predictions were right, and
where I am systematically off). Log the review in LOG.md.

Lessons about the business go in `private/LESSONS.md`. Only the few rules that
must reach every Claude session (not only venture ones) go in the memory file
`project_venture.md`. This file holds the procedure, never the content.
