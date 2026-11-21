# The daily sweep

Bart, November 18, 2026: "a new daily 'agentic sweep' where the agent (you) take a look at all the
things that happened that day and, from that, improves its memory and other systems for both (a)
the management of the project ("kit") and (b) orchestration, skills and how the ola agents work ...
that should be a page with updates on it on most date ... with one or more headline numbers."

The page is Learning on app.kochitolabs.com. This file is the procedure; the content of a sweep is
private (it lives in Supabase and in `apps/venture/private/data/sweeps/`).

## When, and who

Once per Pacific day, from 6 pm of that day. `node scripts/venture/sweep.mjs due` names the days
still owed. A terminal session does it when one is open (the prompt hook `.claude/hooks/bart-done.py`
says when a day is owed); otherwise the runner on the Mac mini does it after 9 pm
(`scripts/venture/runner.mjs`). A missed day is swept late, never skipped. A day on which nothing
happened gets an entry with `"quiet": true` and one sentence.

A sweep takes about half an hour. It makes the changes it can finish; anything larger becomes a
ticket (`issues.mjs add`) and is listed under `open`. It never texts Bart: he reads the page.

## 1. Read the day

    node scripts/venture/sweep.mjs gather --day 2026-11-18 > <scratch file>

Read all of it: every message Bart typed, texted or said, the grader's steers, the corrections,
the tracker (opened, done, what he wrote on the board), the commits, Ola's tests, the requests
people kept on the Ola machine (and which were handed to Claude after Ola's own model tried), the
machine's alarms. Then read that day's entries in `private/CORRECTIONS.md`, `LOG.md` and
`JOURNAL.md`.

## 1b. First, the escapes and the checks (since 2026-11-20)

Before anything else, the three things that say whether "it works" could be trusted today:

- `node scripts/venture/correct.mjs escapes`: how often Bart met something broken or untrue after
  being told it was done or working. For each one today: which check passed it, or why there was
  no check, and what that check now does differently. A checker's pass that failed for him is the
  most important finding of the day.
- `node scripts/venture/issues.mjs unchecked`: tickets ready with no checker, tickets in progress
  with no checks, and the day's closings without checks. Read every "internal" reason and every
  skipped place as a stranger would; reopen what does not hold.
- The request test set on the test server (OLA-231): every request that stopped working, and every
  failure of Ola today that is not yet a case in it. A case is written from the stored conversation
  of what Bart typed (on the mini: `frontdesk/admin.mjs kept bart`), with his exact words, the place
  and the time; from his description only when there is no log (Bart, Nov 20: "don't rely on the
  report, rely on the logs ... when possible").
- A day counts as learned from only when each of its failures ended in a fix that code enforces or
  that someone else checks. A day whose fixes are all written rules is reported as not learned from.

A correction is recorded with `node scripts/venture/correct.mjs add …` and nothing else. A weakness
that came back gets a stronger kind of fix; the tool refuses another written rule.

## 1b2. The models (since 2026-11-20, OLA-245)

Bart, Nov 20: "are you being deliberste about when to do things yourself (Fable, more expensive)
and when to delegate to opus subagents?" Rule 43 and the usage readout did not stop the lead from
rewriting a page from 97 commits on Fable, so the count is the review's, from the transcripts:

    node scripts/venture/delegable.mjs --day 2026-11-20          (on the machine the lead ran on)

It prints the day's shares of output by model and each stretch where the lead, on Fable, made more
than 15 tool calls in a row that were all reads, searches, edits, writes or shell commands, with no
message from Bart and no reply to him over 400 characters in between (the rule is printed with it).
`sweep.mjs template` fills the entry's `models` from it (`--json`), and `post` refuses an entry
without it. For each stretch, say in the day's `kit` changes or `open` what would have sent it to an
Opus agent; the Learning page shows the shares and the stretches under the day.

## 1c. Clean the notes, instead of adding rules (since 2026-11-20)

Bart approved on Nov 20 (OLA-251) that the evening review cleans the notes rather than adding to
them. The outside research of that morning (LEARNING-RESEARCH-2026-11-20.md) found that notes an
agent writes for itself, unreviewed, do nothing or do harm, and that a pass checking the notes
against what really happened is what helped. So every evening, against the day's record:

- **Remove** what is no longer true or no longer needed: a superseded state, a finished plan, a
  stale "next", a layer of NOW.md that a later layer replaced.
- **Merge** what says the same thing twice: two rules for one weakness, a lesson repeated in a
  rule, the same fact in three notes.
- **Correct** what the day showed to be wrong: a time, a number, a name, a description of how a
  tool works that the code no longer matches.

Each one goes in the entry's `cleaned`: `{ "did": "removed" | "merged" | "corrected", "what": "…",
"where": "NOW.md" }`, where `what` says what changed and what in the record showed it. The Learning
page shows the list under the day; it is the short list Bart reads of what the review removed.
`sweep.mjs post` refuses an entry with no `cleaned` (a quiet day excepted), and refuses one whose
`kit` or `ola` change adds a written rule (a rule, a lesson, `enforced: false` naming RULES.md) for a
weakness that already had a fix before that day: a written rule of the same kind is what failed.
Make the fix stronger (`correct.mjs`: refused by code, checked by another, taken away), or record it
as owed (`correct.mjs add --owed OLA-n`). A fix owed for more than two days also blocks the post.

Measure before and after: `npx tsx scripts/venture/notes-check.ts --quiet` prints the characters
the voice and text replies carry against the 1,000,000 budget; `wc -l apps/venture/private/NOW.md`.

### The first job, tonight (Nov 20)

1. **NOW.md** is 232 lines and about 91,000 characters, eight dated layers stacked since Nov 14
   ("NIGHT OF Nov 19 to 20", "READ FIRST: STATE AT 8:30 pm, Wednesday Nov 18", "M4 SESSION,
   Wednesday Nov 18", "HANDOFF, Tuesday Nov 17", "State", "Fact check … Nov 14", …). Keep the top
   block (from "# NOW" to "# Where things stand"), brought up to date against today's record, and
   "Waiting on Bart", "How we talk" and "Background tasks" if they are still true. Move every other
   layer, unchanged, to `apps/venture/private/NOW-ARCHIVE.md` (its slug ends in "archive", so the
   voice and text replies list it and never load it: `src/lib/venture/notes.ts`). The state file
   must read in one screen or two.
2. **The notes are about 8,700 characters over budget** (Nov 20, 1 pm: 1,008,670 of 1,000,000).
   Step 1 alone brings them under; check with notes-check.ts after `sync.mjs push`.
3. Each move, merge and correction is a line in the entry's `cleaned`.

## 2. Study each thing that went wrong: five questions

Bart, the same evening: "our goal is to have a system that gets smarter and better each day by
studying what it did wrong, how to prevent that same mistake/weakness, and what else can be
learned, generalized, built". A sweep that only fixes the day's faults one by one is not that. So
every finding, for Kit and for Ola, goes through the same five questions, in this order:

1. **What went wrong, and why really?** The cause, not "I forgot". His words where he said it.
2. **Which weakness is this?** The ledger is `apps/venture/private/data/weaknesses.json`
   (`node scripts/venture/sweep.mjs weaknesses` prints it; `gather` prints it first). File the
   finding under an existing weakness (add `{ day, ref }` to its `seen`), or add a new one only when
   none fits: a weakness is a cause that can bite in many places, named in words Bart would use,
   never one incident. Every correction in `CORRECTIONS.md` is filed too (`ref: "correction 45"`);
   `learning.mjs` says when one is not.
3. **Did a guard fail?** If the weakness already had a guard, this is the important case: say why
   the guard did not hold (too narrow, a rule nobody loaded, covered one channel of several) and
   replace it with a stronger one. A weakness seen again after an enforced guard shows on the page
   in red as "came back".
4. **What prevents it from now on?** In this order of preference: the system does it by itself
   (a hook, a guard in a script, a check, a test: `enforced: true`); a checklist line a script
   prints at the right moment; a rule in `RULES.md` with the correction in `CORRECTIONS.md`; a
   lesson. Add it to the weakness's `guards` with the day. A rule Kit has to remember is the
   weakest fix and is shown as such.
5. **Where else does the same cause bite?** Look, the same evening, at the other places the
   cause could be (the other channels, the other pages, the other scripts, what already shipped),
   and fix those too. Say in the entry what was looked at.

### A replay case for every correction (OLA-175)

Each correction of the day also becomes a case for the replay test, the same evening: one JSON
file in `apps/venture/private/data/replay-cases/` (private, like the corrections), named
`c<N>-<short-slug>.json`:

    { "id": "c92-…", "source": "Correction 92", "day": "2026-11-20", "title": "the fault in plain words",
      "weakness": "<the weakness id it is filed under>",
      "situation": "Context: <what Kit knew just before the mistake, with the facts that make the right
                    answer possible, and none of the hindsight>\n\nWhat do you do, and what, if anything,
                    do you say to Bart?",
      "must": ["<what a right response does, concrete enough to grade>"],
      "must_not": ["<the mistake itself>"] }

The situation is the moment of choice, written so a fresh session that knows only Kit's rules could
get it right; it never says which rule applies. A correction with no such moment (a structural fault
already fixed in code, a pure layout request, or one another case already covers) gets one line in
`apps/venture/private/data/replay-untestable.json` instead, `"92": "why"`. `sweep.mjs post` refuses
an entry while a correction from 22 on has neither (`node scripts/venture/replay-coverage.mjs`
lists them). Try a new case once before posting: `node scripts/venture/steer-replay.mjs --tries 1
--only c92-…` (run it on the Mac mini, not on Bart's iMac). The runner replays every case each night
between 2 and 8 am; a case that fails with the rules loaded is filed under its weakness on the
Learning page, and that weakness's rule is the one to strengthen.

Then two questions for the day as a whole:

- **The pattern.** What do today's findings have in common, with each other and with earlier
  days (the ledger shows what keeps coming back)? One or two sentences in the entry's `pattern`.
- **What to build next.** Not another patch: the one thing (a tool, a test, a skill, a check)
  that would remove a whole weakness, chosen from the ones seen most that still rest on a rule.
  It gets a ticket and goes in the entry's `build`, and in the weakness's `bet`. Before naming a
  new one, look at the last one named: is it built, and did the weakness stop?

### One idea for each side, every day

Bart, Nov 18: "daily loop for kit and Ola each to think of one idea or improvement to make the
overall system and the code engine work better. Notify me each day when that happened. Document
on the learning page". Every entry, a quiet day's too, carries two ideas in `ideas`:

- **`kit`**: one idea or improvement for how the project is run (the overall system: the rules,
  hooks, checks, the tracker, the notes, the runner, how sessions hand over).
- **`ola`**: one for the code engine (Ola's agents, skills, instructions, tools, the model ladder,
  the orchestration around the model).

An idea is not the day's `build` again and not an earlier day's idea (posting refuses a ticket
that was already an idea). It starts from something in the day's record or the ledger, and it is
checked against the open tickets first (`issues.mjs list --status open,in_progress,waiting`): an
idea that is already a ticket is not new. `text` is one sentence of at most 220 characters that
says what would be built, in words Bart understands; `why` says what in the record points to it
and how it would be measured.

**Every idea is built at once** (Bart, Nov 20, 11 pm: "They should always be built duh!! So they
are immediately implemented"; OLA-331). An idea is work, not a proposal he can drop:

1. Each idea gets its own ticket at P1 (`issues.mjs add ... --pri P1`, area `ops` or `board` for
   Kit, `model`, `apps` or `web` for Ola) with its checks written before the post: what Bart does
   and must then see, one per place (`issues.mjs check <id> add --at ... --do ... --see ...`), or,
   when nothing a person does or sees changes, `issues.mjs check <id> internal --why "..."` naming
   the test that proves it.
2. The last step of the review hands both to builders the same night. A session that is open
   starts an Opus builder per part of the code each idea touches (the builder starts the ticket,
   builds, tests, pushes, `issues.mjs ready`). With no session open, the mini's agent takes them:
   its pick puts the latest reviews' idea tickets right after P0 (`_plate.mjs`, `ideaTickets`),
   before any other work.
3. `sweep.mjs post` refuses the next review while an idea of an earlier review is neither done nor
   dropped, and names each one; `sweep.mjs ideas` lists them beforehand. Only Bart drops an idea.

The first post of the day texts Bart the two ideas and that both are being built (`sweep.mjs post`
does it and records it; a repost sends nothing); no other text about them. The Learning page lists
them by day under "Daily ideas", each with where its build stands in the tracker: built on a date,
being built, or dropped on a date.

### One improvement to the learning system, every day until Nov 25

Bart, Nov 19: "add a daily task for the next week, then review if useful: improvements to the
learning system" (OLA-182). From Nov 19 to Nov 25 every entry carries `learning`: the one
improvement made that day to the learning system itself, meaning how corrections and rules are
stored, loaded into a session, enforced, counted or shown. It is made and finished that day, not
proposed; `changed` says what is different from tomorrow on, `why` what showed it was needed,
`where` names the place in words Bart understands. Posting refuses an entry without it. Where to
look: a rule-only weakness that could get a guard; a rule that was in the notes and was broken
anyway (was it in front of the agent?); a count on the Learning page that nothing checks; what
the reply check sent back that day (`~/.claude/reply-check.log`).

The entry of Nov 26 carries `learningReview`: what each of the seven days changed, what the
figures did over the week (corrections a day, the share under a known weakness, weaknesses
holding), and a recommendation to keep or stop. That day OLA-182 goes to Bart
(`issues.mjs wait OLA-182 --what "keep or stop the daily improvement to the learning system"`).

### Every correction is an error

Bart, Nov 18: "the learning agents need to treat every correction I make as an error the agent
made". Before anything else, re-read every message of the day (`gather` prints them in full) and
list each one in which he corrects, redirects, rejects, narrows, redoes or has to add to something
an agent did, said or proposed. That includes a question that shows the work fell short, and a
correction of an automatic reply. None is set aside as a change of mind, a preference, a new
requirement or something the agent could not have known. Each one gets an entry in
`CORRECTIONS.md` (his words, what the agent had done, the cause) and a line in its weakness's
`seen`. The grader (`steers.mjs`) makes the same count independently; posting is refused while a
correction is unfiled, or while the grader counted more corrections than were written down. On
Nov 18 the ledger held 9 corrections for the day and the re-read found 27.

### What to look at for Kit (how the project is run)

- A correction, a steer, or anything he had to say twice.
- Something he said in passing that has no ticket.
- Something that went wrong and he did not see: a failed deploy, a check that could not run, a
  wrong time or number in a note, a watcher that was not running, a tool that read the wrong place.
- Something that worked and should be kept: an approach he confirmed, a check that caught a fault.
  That is a lesson (`LESSONS.md`) or a step in a skill.
- Notes that no longer match the system (NOW.md, a README, a handoff, the overview).

### What to look at for Ola (agents, skills, orchestration)

- Each request handed to Claude after Ola's own model tried: a result that was not good enough
  (OLA-157). `gather` prints the week's switches as labels and counts (per 100 requests, by kind,
  the largest group) and how many became test tasks: made-up copies scored against Claude, whose
  losses are candidates (`admin.mjs compare candidates` on the Ola machine), and drafts from kept
  conversations (`admin.mjs switches tasks`). The largest group gets the Friday fix (below).
- Each failed test and each thing Bart said about Ola's output.
- How requests are routed and approved: the wrong engine, an approval asked too often or not at
  all, a step that took too long, an alarm on the machine.
- The builders (the agents that write Ola): a review finding that repeats, a deploy that failed,
  a check missing from the update command.

A change to Ola's code goes through a ticket and the usual checks; a skill or instruction change
is measured with and without before it stays. The runner cannot change code: it opens the ticket
and lists it under `open`.

## 3. On Fridays, the week

The Friday sweep also reads the ledger as a whole: which weaknesses were seen this week, which
guards held all week, which came back, whether the number at the top of the Learning page moved
(weaknesses guarded and holding, of all known), and whether last week's "to build" got built.
One paragraph in the entry's `pattern`.

**The switches fix** (OLA-157, approved by Bart Nov 19). The Friday sweep names the week's largest
group of switches to Claude (`admin.mjs switches --days 7` on the Ola machine; the board's Learning
page shows the same). For that group: turn its drafts and candidates into test tasks with a check a
program runs (`apps/activist-ai/evals/apps/README.md`, "Add a problem from a real failure"; Bart's
own requests and anything else from a real project stay on the Ola machine, never in this public
repo), score Ola's own model on them, make the one fix (a skill, an instruction, a tool, or a
different open model), score again, and put both numbers in the entry's `ola` change with its
ticket. A group with no drafts or candidates yet is fixed from its labels and the eval families'
existing tasks of that kind, and the entry says so.

## 4. Write the entry

    node scripts/venture/sweep.mjs template --day 2026-11-18 > apps/venture/private/data/sweeps/2026-11-18.json

Fill it in and post it (posting also refreshes the ledger on the page, and the day's first post
texts Bart the two ideas). Then hand both idea tickets to builders (step 2 above):

    node scripts/venture/sweep.mjs post apps/venture/private/data/sweeps/2026-11-18.json

The shape (`Sweep` in `src/lib/venture/board.ts`):

    { "day": "2026-11-18", "by": "Kit",
      "summary": "one or two sentences: what the day showed",
      "pattern": "what the findings have in common, and with earlier days",
      "read":  [{ "n": "115", "what": "messages from you" }, …],       from gather, never from memory
      "kit":   [{ "weakness": "unread-channel", "saw": "what happened", "changed": "what is different now",
                  "where": "rule 48; the prompt hook", "enforced": true, "issue": "OLA-171" }],
      "ola":   [ … the same … ],
      "open":  [{ "text": "found, not fixed today", "issue": "OLA-175" }],
      "cleaned": [{ "did": "removed", "what": "what changed in the notes and what showed it", "where": "NOW.md" }],
      "models":  { "shares": [{ "model": "Fable", "share": 60 }, …], "rule": "…", "stretches": [{ "at": "10:51 am to 10:53 am", "calls": 23, "what": "…" }] },
      "build": { "text": "the one thing to build next that removes a whole weakness", "issue": "OLA-175" },
      "ideas": { "kit": { "text": "one sentence: what would be built", "why": "the evidence, and the measure", "issue": "OLA-180" },
                 "ola": { … the same … } } }

Rules for the entry:

- Every change is real and finished: a file changed today, and `where` names it in words Bart
  understands (a rule's number, "the prompt hook", "the steer counter", "the design skill").
- Every change names its `weakness` (posting refuses one that is not in the ledger).
- `enforced: true` only when code now does it without Kit having to remember.
- `changed` leads: it says what is different from tomorrow on. `saw` is the evidence in one line,
  with his words where he said it.
- What was found and not fixed goes under `open` with its ticket. Nothing is left out because it
  is unflattering.
- The entry is a factual description of the system: what was observed, what changed, where it is
  enforced, what is not built yet. No story, no confession, no self-assessment, no praise.
- The subject of each sentence is the system, a part of it, or a named actor ("Kit", "Ola",
  "Bart", "the sweep", "the steer counter"). No "I", "me", "my", "we" or "our". Bart's own words
  appear only as a direct quote, in double quotes, where they are the evidence.
- Present tense for how the system works, past tense for what happened. Give dates ("Nov 18"),
  times and counts.
- A weakness name is a neutral noun phrase of 4 to 10 words that names the cause, in sentence
  case, with no pronouns ("Design judged without an outside reference").
- Plain words, normal sentence length, no em dashes, no metaphors, no judging adjectives.
- A day with nothing to change says so.

## 5. Checkpoint

`node scripts/venture/sync.mjs push` (it also refreshes the two percentages). Commit and push code
changes with their ticket. Add one line to `LOG.md`.
