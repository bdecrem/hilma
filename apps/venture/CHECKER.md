# The checker

Since 2026-11-20 nobody closes their own ticket. A builder builds, makes it live, and runs
`issues.mjs ready <id> --on <release>`. A checker, who did not build it and starts with none of the
builder's context, then does each check on the live thing the way Bart would, and records what
happened. `issues.mjs done` refuses until every check has passed.

Since 2026-11-21 (OLA-338, Bart: "Ola-338 yes", after a 30-minute fix took almost five hours under
the Nov 20 rules), lighter:
1. Anything Bart will touch is tried once by a checker on the live site or the real build before he
   is told it works. That part is unchanged.
2. The project's own tools (scripts/venture, apps/venture, hooks, Ola's ops tools) get no checker:
   the builder's tests, and the lead running them once. The ticket is marked internal and closes with
   `issues.mjs done <id> --proof "no user path: <why>; lead ran <test>: n of n"`; `done` refuses it
   without that line, and `unchecked` does not list it.
3. One check pass per update of the test server, not per ticket: one checker gets every ready ticket
   that update carried. Each check is tried three times on his exact path, unless its text says more.
4. Agents report only when finished.

Why there are checkers at all: in eight days Bart made 99 corrections, and 15 times he met something broken after being told
it worked. On Nov 20 publishing failed for him four times in one morning. Each time the builder had
tested its own work in one place, written "walked:" and closed the ticket; the last proof even said
which place had not been tried. The rule "use it the way he will" had been written four times. A
rule the author applies to their own work did not hold, so the check moved to someone else.

## The brief for a checker (the lead pastes this, with the ticket id)

You are the checker for ticket OLA-n (or for every ticket listed: the ones one update of the test
server carried; do each ticket's checks in turn). You did not build it and you are not here to confirm it. Your
job is to find where it fails for Bart before he does. A check you pass that then fails for him is
your failure, not the builder's.

1. Read the ticket and its checks: `node scripts/venture/issues.mjs show OLA-n` and
   `node scripts/venture/issues.mjs check OLA-n`. Do not read the builder's report or its tests
   first; read Bart's words on the ticket.
2. Judge the checks before doing them. Each one says where he is, what he types or taps, and what
   he must see. Ask: is this what he would really do? Is a place missing or skipped with a weak
   reason (a cloud project or his Mac; the website, the Mac app, the iPhone; asked in chat or done
   on a screen)? If he could ask Ola for it in words, is there a check that is that sentence? Add
   what is missing: `issues.mjs check OLA-n add --at … --do … --see … --by checker`.
3. Do each check on the live thing: the live server at app.ola.cx, the installed or shipped build,
   a phone-size screen where he would be on his phone. Use a test account, never Bart's. No
   stand-ins: not a fake service, not a local copy, not the test suite, not a neighbouring path
   that "uses the same code". If you cannot reach a place (a phone app with no device), the check
   stays not checked: say so, do not pass it.
   The Mac app and the iPhone app: `apps/activist-ai/apple/tools/drive.sh` on the Mac mini types a
   sentence in either app and answers its cards (apple/README.md, "Using the apps as a checker").
4. Type what he would type, in his words, not the words the builder's instructions expect. Do each
   check three times on his exact path (more only when the check's text says so): the second time in
   a row, and once the awkward way (in a new project, with the sentence phrased differently).
5. Record each one, with a screenshot or a log file that shows what you saw:
   `issues.mjs check OLA-n pass <k> --by checker --on "<release or build>" --saw "…" --shot <file>`
   `issues.mjs check OLA-n fail <k> --by checker --saw "what happened instead"`
   Keep the files under `~/Desktop/Ola/checks/OLA-n/` on Bart's Macs.
6. You do not fix code. A failed check goes back to the builder with what you saw.
7. Report once, when you are finished, in five lines at most: passed, failed, not checked, and
   anything that looked wrong that no check covered (open a ticket for it). No progress reports.

## The builder's brief: the lines it always carries (since OLA-338)

The lead writes the task; every builder's brief also carries these, word for word:

- Start with `node scripts/venture/issues.mjs start OLA-n --who builder --wait 20`; renew with
  `issues.mjs claim OLA-n` at least every 45 minutes. You do not close tickets.
- If Bart will touch it: build, test, push, and when it is live `issues.mjs ready OLA-n --on <release>`;
  one checker takes every ticket of that update later. Do not start a checker yourself.
- If it is the project's own tools (scripts/venture, apps/venture, hooks, Ola's ops tools): mark it
  `issues.mjs check OLA-n internal --why "…"`, run its tests, and give the lead the exact test
  commands and counts; the lead runs them once and closes it with
  `done --proof "no user path: …; lead ran <test>: n of n"`. No checker.
- Never update the test server yourself: `runner.mjs deploy` does it, with no spacing, one at a time.
- Report once, when you are finished; no progress messages. Wait in one blocking command with a
  ceiling, never a polling loop.

## A ticket that is an analysis, a plan or a proposal

It reaches Bart as something to read, so it has checks too. The checker opens it the way he will
(from the link he gets, at phone width) and checks what it is built from: it names the outside
sources read for it, each link opens and says what the text says it says, and it does not rest only
on this project's own notes. Bart, Nov 20, about the review of the learning system: "did the agent
do any web searches to understand what best practices are?" It had not.

## For the lead

- Start one checker per update of the test server, once it is live: it gets every ticket
  `issues.mjs unchecked` lists as ready on that release. Checkers come before new work. Never start
  a checker for an internal ticket (the project's own tools).
- The test server is updated by `runner.mjs deploy` with no spacing between updates (OLA-338): one
  update at a time, never while a checker works on the live server, only the suites the change
  touches, each under a time limit, a failed suite rerun once by itself (deploys.log names it).
- Builders: one at a time on Ola's server code, counting the runner on the mini (OLA-251).
  `issues.mjs start <id> --who builder` refuses a second server builder and names who holds the
  lane; add `--wait` in the builder's brief and it starts when the lane frees. Checkers claim with
  `--who checker`, investigators `--who investigator`, the lead holds with `--who lead` (a hold):
  none of them takes the lane, unless the ticket gets commits changing the server's code.
- A pass is refused from the agent that built the ticket, claimed it as builder, marked it ready
  or committed for it, whatever `--by` says; a checker passes as `--by checker` from its own agent.
  A pass by `--case` must name the request test exactly as its result file does, passing there.
- What Bart is told about a ticket is what `issues.mjs say <id>` prints: what works, what does not,
  what nobody checked, in that order. Never "it works" from a builder's report.
- A ticket where nothing a person does or sees changes is marked
  `issues.mjs check <id> internal --why "…"` and closes on proof: "walked: …" on the live thing, or
  "no user path: <why>; lead ran <test>: n of n" after the lead ran the builder's tests once.
- When something a checker passed fails for Bart, that is a correction filed with
  `correct.mjs add … --escape`, and the question it has to answer is what the check did not do.
