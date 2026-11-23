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

## 0. Take over from the runner

Since 2026-11-14 a runner on the Mac mini (`scripts/venture/runner.mjs`, launchd
`sh.venture.runner`) works while no terminal session is open, and it edits the
same private notes. So before reading anything:

    node scripts/venture/runner.mjs status     # is a run going? what did the last one do?
    node scripts/venture/sync.mjs pull         # its notes are newer than this folder's

Since Nov 19 (OLA-211) the runner works the tracker day and night, also while a
session is open: it takes the top open ticket no one has claimed. Start the
watchers early (step 3): their heartbeat tells the runner a session is open, so
it leaves Bart's texts and the board's inbox to the session. **Claim every
ticket you or a builder you start works on**: `issues.mjs start <id> --who <name>`
claims it, `issues.mjs claim <id>` renews it (at least every 45 minutes; put it
in every builder's brief), `done`/`wait`/`open`/`release` let go. An unclaimed
ticket is the runner's. Read the LOG lines starting "runner:" to see what it did
while you were away.

**One builder at a time on Ola's server code, counting the runner** (OLA-251, Nov 20:
three builders at once overwrote each other's work). The tracker enforces it. The lane is
the ticket's (server: web, model, security, design, and ops tickets about Ola's server;
apps; tools), changed only on the ticket (`issues.mjs edit <id> --lane <lane> --why "…"`).
A claim has a role: builder, checker, investigator, hold, runner (`--role`, or a `--who`
that is that word; `lead` is a hold; any other name is a builder). Builders and the runner
take the lane; a checker, an investigator and a hold do not, unless their ticket gets
commits changing the server's code while they hold it. A refused builder waits with
`--wait` (one command; `issues.mjs claims` shows it waiting; the runner yields to a higher
priority) instead of a polling loop; `--beside "<folders>"` starts beside the holder when
its recent commits touch none of them. The one who built a ticket cannot pass its checks:
the tracker reads which agent runs the command (`scripts/venture/_who.mjs`), not the name.
The test server is updated only through `runner.mjs deploy` (OLA-272), with no spacing between
updates since OLA-338 (step 4b).

## 1. Load the state

Read, in this order:

0. `apps/venture/private/RULES.md`, in full: the start-of-session hook gives a session only a
   digest (each rule's lead sentence; the whole file does not fit what a hook may add). It holds
   the standing rules, each one distilled
   from a correction Bart had to make, with the checklists to run before he or
   a customer sees anything. (A SessionStart hook, `.claude/hooks/venture-rules.sh`,
   also injects this file into every session in the repo on this machine;
   read it here anyway, the hook is local and untracked.) Then
   `apps/venture/private/CORRECTIONS.md`, the ledger behind the rules.
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
7. **Ola: read `apps/activist-ai/OVERVIEW.md` first**, before any Ola code or
   doc (the product, the request path, the parts, the settled decisions), and
   run `node scripts/venture/overview-check.mjs`. If it says stale, update the
   overview before relying on it (see step 6, item 5).

If the private folder is missing or empty (a new machine, a lost folder):
`node scripts/venture/sync.mjs pull` restores every document from Supabase,
and the data files (`private/data/`: lead lists, scans) from its storage.
The access key for `ola.cx/venture/...?k=` links is in
`apps/venture/private/KEY` and as `VENTURE_KEY` in `.env.local`; if both are
gone, every link in Bart's iMessage thread carries it.

## 2. Catch up on Bart

- `node scripts/venture/imsg.mjs inbox` — texts he sent that no session has
  read (with the answers the server already gave him), and his voice notes
  from `ola.cx/venture/memo` (they arrive in the same thread, marked
  "(voice note)"). Marks them read.
- `node scripts/venture/mail.mjs inbox` — mail from customers and strangers to
  hello@ at the three domains. `node scripts/venture/leads.mjs` — sign-ups.
- `node scripts/venture/transcript.mjs --list` — every voice session. Read any
  real one (not marked test) that is newer than the last LOG entry:
  `node scripts/venture/transcript.mjs <session>`.

Whatever he decided or asked for goes into LOG.md in his words, and into
NOW.md's next actions, before anything else.
Anything he says he did (in a text, a voice note, a call or the terminal) closes or
updates its tracker issue the same turn: `node scripts/venture/issues.mjs done <id>
--proof "Bart: <his words>; checked: …"`. A hook (`.claude/hooks/bart-done.py`) puts
this rule and the issues waiting on him in front of every prompt.

## 3. Restart the watchers

Run both as background tasks; each exits when there is something to read, and
is restarted after it has been handled:

    node scripts/venture/imsg.mjs --wait
    node scripts/venture/transcript.mjs --wait      (every call: the talk page, the check-in, the phone, and voice notes)
    node scripts/venture/mail.mjs --wait        (mail to the company's domains)
    node scripts/venture/leads.mjs --wait       (sign-ups on the sites)
    node scripts/venture/issues.mjs --wait      (what Bart writes on the board's tracker)
    node scripts/venture/sweep.mjs --wait       (6 pm Pacific: the day's sweep is owed)

Never name one call (`--wait talk`): on 2026-11-19 a session did, and a check-in Bart
started on the phone went unseen for two hours.

**The tracker is a way Bart gives instructions** (his words, 2026-11-18: "make sure the issues
tracker is actually used: if I create a new ticket, or reopen one, or leave a comment on an open
ticket, the agent should handle all that"). When `issues.mjs --wait` fires, or the prompt hook
lists something he wrote on the board: `issues.mjs inbox`, then for each item the same turn: read
the thread (`issues.mjs show <id>`), answer on the ticket (`issues.mjs comment <id> "…"`: what
will happen and when, or the answer), start the work or put it in its place in the queue
(`issues.mjs start <id>`), and only then `issues.mjs inbox --mark`. A reopened ticket goes back
to doing with what is still wrong in his words. Restart the watcher.

## 3b. A correction from Bart is a failure of the system

His words (2026-11-14): "every time I correct something, that's a failure...
update your memory so that you don't make that same mistake again... can I
generalize additional learnings from this?... make sure that those memories are
always part of your context." A request he should not have had to make counts
too. The same turn, before other work:

His order (2026-11-20, after publishing failed for him four times in one morning): "priority 1:
learn from your mistake. priority 2: make the harness better from each mistake. priority 3: fix
the literal thing for the customer."

1. **Learn.** Name the kind of mistake (the weakness it falls under:
   `node scripts/venture/correct.mjs list`) and why the last fix for that kind did not hold.
2. **Make the system better.** Build a fix of a stronger kind than the last one: written down <
   shown at the moment < refused by code < checked by another < taken away. Another rule for a
   weakness that already had a rule is refused. For a failure of Ola itself, the request he made
   becomes a case in Ola's request test set, with the same request in the other places Ola is
   used, so it can never fail again unnoticed.
3. **Fix the one case.**
4. **Record it, with the tool and nothing else:**
   `node scripts/venture/correct.mjs add --title … --words "<his words>" --did … --cause …
   --weakness <id> --fix … --level <1-5> --where <what carries the fix> [--why-last …] [--escape]`.
   It writes CORRECTIONS.md and the weaknesses ledger together and refuses a fix that is no
   stronger than the one that failed. `--escape` when he met something broken or untrue after
   being told it was done or working: that count is the one that says whether "it works" can be
   trusted.
5. Go through what is in flight and what has shipped, and fix the other instances of the same
   cause without being asked.
6. `sync.mjs push`, and tell him in one line what changed in the system, not what was patched.

Before Bart or a customer sees anything, run the matching checklist at the end
of RULES.md.

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

### 4b. The light way of working (OLA-338, since Nov 21)

Bart, Nov 21, 5:26 am, typed: "Ola-338 yes", after finding that the Nov 20 rules made a 30-minute
button fix take 4 h 46 min (about 45% of it waiting for the Mac mini). Five rules; the tools hold
the ones marked so:

1. **Anything Bart will touch is tried once by a second agent** (a checker, `apps/venture/CHECKER.md`)
   on the live site or the real build before he is told it works. `issues.mjs say` and the checks
   enforce it, unchanged.
2. **The project's own tools get no second agent** (scripts/venture, apps/venture, hooks, Ola's ops
   tools): the builder's tests, then the lead runs them once. Mark the ticket
   `issues.mjs check <id> internal --why "…"` and close it with
   `issues.mjs done <id> --proof "no user path: <why>; lead ran <test>: n of n"`. `done` refuses that
   close without the lead line or when a count is not n of n; `unchecked` does not list it; never
   start a checker for it.
3. **One check pass per update of the test server, not per ticket**: when an update is live, one
   checker gets every ready ticket it carried. Each check is tried three times on his exact path
   unless its text says more.
4. **The update of the test server** (`runner.mjs deploy`, `_plate.mjs` `deployGate`, and
   `apps/activist-ai/ops/ola.mjs`): no spacing between updates; one at a time; never while a checker
   works on the live server; only the suites the change touches; every suite under a time limit
   (`ops/suite.mjs`), stopped and counted as failed at it, the turn given back; a failed suite rerun
   once by itself, and deploys.log names a suite that failed and where its output is kept, or one
   that passed only on the rerun. The automatic check (`ola.mjs ci`) has the same limits.
5. **Agents report only when finished** (no progress messages); **no hourly check between 10 pm
   and 7 am Pacific**; **a fresh session each morning** (the lead hands off at night and Bart's
   morning starts with `/venture` in a new session).

**The hourly check** (the lead's recurring check while a session is open, e.g. `/loop 1h`; not
between 10 pm and 7 am Pacific). Its standard wording:

> Hourly check. If it is between 10 pm and 7 am Pacific, do nothing and stop. Otherwise:
> `node scripts/venture/runner.mjs status` (its last line is plan usage, every machine: say it to Bart when
> a window is past 90% or a limit is recorded) and `node scripts/venture/issues.mjs unchecked`. If an
> update of the test server went live with ready tickets, start ONE checker for all of them
> (apps/venture/CHECKER.md brief, three tries of his exact path per check unless a check says more).
> Never start a checker for an internal ticket: the project's own tools close on the builder's tests
> run once by the lead (`done --proof "no user path: ...; lead ran <test>: n of n"`). Read finished
> agents' reports; do not ask running agents for progress. Report to Bart only what changed for him.

## 5. Talk to Bart

He is usually not looking at the terminal.

- **Short things, and "this is ready":** `node scripts/venture/imsg.mjs send "…"`.
  Plain text, a few a day at most, with the link when there is something to
  open. He writes back by starting a text with `v` or `venture`.
- **Discussion:** `https://ola.cx/venture/talk?k=<key>` (open voice
  conversation; Claude answers from the documents, so push NOW.md first).
- **The project's home page, the one link he keeps:** `https://app.kochitolabs.com`
  (Kit's face, the three voice systems, what is waiting on him, the journal).
- **His voice notes to me:** `https://ola.cx/venture/memo?k=<key>`, a page he
  bookmarks: record, stop and send. Each note is transcribed into the text
  thread, so `imsg.mjs --wait` wakes on it; he never has to say a note exists.
- **Fixed asks that need him at a keyboard:** an agenda call,
  `node scripts/venture/put.mjs call <slug> <file.md>` →
  `https://ola.cx/venture/call/<slug>?k=<key>`.
- **Things to read:** `https://ola.cx/venture/doc/<slug>?k=<key>`.

## 6. Checkpoint, every time

Before the turn ends, and right after anything that matters (a decision of
his, money moved, something sent to a stranger, research returned):

1. Rewrite `NOW.md`: state, in flight, next actions, waiting on Bart, which
   background tasks should be running. Then `JOURNAL.md`, which Bart reads at
   `app.kochitolabs.com`: a line or two per thing done, newest first,
   the time read from the clock, and the "Waiting on you" list kept exact. If
   the open questions changed, rewrite `call-checkin.md` and publish it
   (`put.mjs call checkin …`).
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
5. **At a handoff, and after Ola work lands:** `node scripts/venture/overview-check.mjs`.
   If it prints `stale: N Ola commits since <date>`, read those commits
   (`--list`), change what they changed in `apps/activist-ai/OVERVIEW.md`, set
   its "Last checked against" line to the newest commit on origin/main and its
   date, and commit OVERVIEW.md on its own with the issue `[OLA-132]` (a commit
   that changes only the overview does not make it stale). The board shows a red
   "stale" badge until then.

A session that dies right after a checkpoint has lost nothing. A session that
dies without one has lost whatever it had not written down, so checkpoint
before long-running work, not only after.

## 6b. The daily sweep

Once a day, from 6 pm Pacific, the day is swept: everything that happened is read and turned
into changes to how Kit runs the project and how Ola's agents, skills and orchestration work,
posted as a dated entry on the board's Learning page. The procedure is `apps/venture/SWEEP.md`;
`node scripts/venture/sweep.mjs due` names the days owed, and the prompt hook says so too. A
session that is open in the evening does it before it ends; the runner does it after 9 pm
otherwise.
Each entry also carries one idea for Kit (how the project is run) and one for Ola (the code
engine), each with its own ticket; the day's first `sweep.mjs post` texts Bart the two, and the
Learning page lists them under "Daily ideas" (Bart, Nov 18: "Notify me each day when that
happened. Document on the learning page"). Every idea is built at once (Bart, Nov 20: "They
should always be built duh!! So they are immediately implemented"; OLA-331): its ticket is P1
with its checks written (or `check <id> internal --why` naming a test), and the review's last
step hands both to builders the same night, an Opus builder per part of the code from an open
session, otherwise the mini's agent, which takes idea tickets right after P0. `sweep.mjs post`
refuses the next review while an earlier idea is neither done nor dropped (`sweep.mjs ideas`
lists them). Before the post, `requests.mjs --day <day>` matches every request Bart made that day
to a ticket and opens the missing ones (OLA-213); the post refuses a day it has not matched.

## 7. Review, at the end of every cycle

Each Friday (the end of a week's bet) and whenever a bet is killed: count the
week's entries in CORRECTIONS.md and the repeats (a repeat means a rule was
missing, vague or not loaded: fix that first), check every rule in RULES.md
is still concrete and still enforced; then reread
LESSONS.md whole, merge duplicates, rewrite vague lessons into specific ones,
move what no longer applies to a "Retired" section with the reason, and
recompute the calibration in BETS.md (how many predictions were right, and
where I am systematically off). For Ola, rerun `overview-check.mjs` and bring
`apps/activist-ai/OVERVIEW.md` up to date (step 6, item 5), and check its
"Decided" and "Live now, and next" against the week. Log the review in LOG.md.

Lessons about the business go in `private/LESSONS.md`. Only the few rules that
must reach every Claude session (not only venture ones) go in the memory file
`project_venture.md`. This file holds the procedure, never the content.
