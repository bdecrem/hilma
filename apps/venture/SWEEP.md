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

Then two questions for the day as a whole:

- **The pattern.** What do today's findings have in common, with each other and with earlier
  days (the ledger shows what keeps coming back)? One or two sentences in the entry's `pattern`.
- **What to build next.** Not another patch: the one thing (a tool, a test, a skill, a check)
  that would remove a whole weakness, chosen from the ones seen most that still rest on a rule.
  It gets a ticket and goes in the entry's `build`, and in the weakness's `bet`. Before naming a
  new one, look at the last one named: is it built, and did the weakness stop?

### What to look at for Kit (how the project is run)

- A correction, a steer, or anything he had to say twice.
- Something he said in passing that has no ticket.
- Something that went wrong and he did not see: a failed deploy, a check that could not run, a
  wrong time or number in a note, a watcher that was not running, a tool that read the wrong place.
- Something that worked and should be kept: an approach he confirmed, a check that caught a fault.
  That is a lesson (`LESSONS.md`) or a step in a skill.
- Notes that no longer match the system (NOW.md, a README, a handoff, the overview).

### What to look at for Ola (agents, skills, orchestration)

- Each request handed to Claude after Ola's own model tried: a result that was not good enough.
  It becomes a test task (`apps/activist-ai/evals/`), and the largest group of them gets a fix (a
  skill, an instruction, a tool, the choice of model), measured before and after.
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

## 4. Write the entry

    node scripts/venture/sweep.mjs template --day 2026-11-18 > apps/venture/private/data/sweeps/2026-11-18.json

Fill it in and post it (posting also refreshes the ledger on the page):

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
      "build": { "text": "the one thing to build next that removes a whole weakness", "issue": "OLA-175" } }

Rules for the entry:

- Every change is real and finished: a file changed today, and `where` names it in words Bart
  understands (a rule's number, "the prompt hook", "the steer counter", "the design skill").
- Every change names its `weakness` (posting refuses one that is not in the ledger).
- `enforced: true` only when code now does it without Kit having to remember.
- `changed` leads: it says what is different from tomorrow on. `saw` is the evidence in one line,
  with his words where he said it.
- What was found and not fixed goes under `open` with its ticket. Nothing is left out because it
  is unflattering.
- Plain words, no praise of the work, no em dashes. A day with nothing to change says so.

## 5. Checkpoint

`node scripts/venture/sync.mjs push` (it also refreshes the two percentages). Commit and push code
changes with their ticket. Add one line to `LOG.md`.
