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

## 2. Kit: how the project is run

Go through the day in order and stop at each of these:

- **A correction, a steer, or anything he had to say twice.** Is there a rule for it in `RULES.md`?
  Was it concrete enough to check, and was it in front of the session that broke it? Find why it
  did not hold. A repeat means the earlier fix was a note where it needed a guard.
- **Something he said in passing** (in a call, in the middle of another message) that has no ticket.
- **Something that went wrong and he did not see**: a failed deploy, a check that could not run, a
  wrong time or number in a note, a watcher that was not running, a tool that read the wrong place.
- **Something that worked and should be kept**: an approach he confirmed, a check that caught a
  fault. That is a lesson (`LESSONS.md`), or a step in a skill.
- **Notes that no longer match the system** (NOW.md, a README, a handoff, the overview).

For each, make the change now, in this order of preference: (1) the system does it by itself (a
hook, a guard in a script, a check, a test); (2) a checklist line a script prints at the right
moment; (3) a rule in `RULES.md` with the correction in `CORRECTIONS.md`; (4) a memory or a lesson.
A rule that Kit only has to remember is the weakest fix: use it when nothing stronger exists, and
say so in the entry (`enforced: false`).

## 3. Ola: agents, skills, orchestration

- **Each request handed to Claude after Ola's own model tried** is a result that was not good
  enough: it becomes a test task (`apps/activist-ai/evals/`), and the largest group of them gets a
  fix (a skill, an instruction, a tool, the choice of model), measured before and after.
- **Each failed test and each thing Bart said about Ola's output** (design, an app that did not
  build, a wrong answer): the same.
- **How the agents are orchestrated**: a request that went to the wrong engine, an approval that
  was asked too often or not at all, a step that took too long, an alarm on the machine.
- **The builders** (the agents that write Ola): a review finding that repeats, a deploy that failed,
  a check that is missing from the update command.

A change to Ola's code goes through a ticket and the usual checks, like any other change; a skill
or instruction change is measured with and without before it stays. The runner cannot change code:
it opens the ticket and lists it under `open`.

## 4. Write the entry

    node scripts/venture/sweep.mjs template --day 2026-11-18 > apps/venture/private/data/sweeps/2026-11-18.json

Fill it in and post it:

    node scripts/venture/sweep.mjs post apps/venture/private/data/sweeps/2026-11-18.json

The shape (`Sweep` in `src/lib/venture/board.ts`):

    { "day": "2026-11-18", "by": "Kit",
      "summary": "one or two sentences: what the day showed",
      "read":  [{ "n": "115", "what": "messages from you" }, …],       from gather, never from memory
      "kit":   [{ "saw": "what happened", "changed": "what is different now", "where": "rule 48; the prompt hook", "enforced": true, "issue": "OLA-171" }],
      "ola":   [ … the same … ],
      "open":  [{ "text": "found, not fixed today", "issue": "OLA-175" }] }

Rules for the entry:

- Every change is real and finished: a file changed today, and `where` names it in words Bart
  understands (a rule's number, "the prompt hook", "the steer counter", "the design skill").
- `enforced: true` only when code now does it without Kit having to remember.
- `changed` leads: it says what is different from tomorrow on. `saw` is the evidence in one line,
  with his words where he said it.
- What was found and not fixed goes under `open` with its ticket. Nothing is left out because it
  is unflattering.
- Plain words, no praise of the work, no em dashes. A day with nothing to change says so.

## 5. Checkpoint

`node scripts/venture/sync.mjs push` (it also refreshes the two percentages). Commit and push code
changes with their ticket. Add one line to `LOG.md`.
