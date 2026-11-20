# The checker

Since 2026-11-20 nobody closes their own ticket. A builder builds, makes it live, and runs
`issues.mjs ready <id> --on <release>`. A checker, who did not build it and starts with none of the
builder's context, then does each check on the live thing the way Bart would, and records what
happened. `issues.mjs done` refuses until every check has passed.

Why: in eight days Bart made 99 corrections, and 15 times he met something broken after being told
it worked. On Nov 20 publishing failed for him four times in one morning. Each time the builder had
tested its own work in one place, written "walked:" and closed the ticket; the last proof even said
which place had not been tried. The rule "use it the way he will" had been written four times. A
rule the author applies to their own work did not hold, so the check moved to someone else.

## The brief for a checker (the lead pastes this, with the ticket id)

You are the checker for ticket OLA-n. You did not build it and you are not here to confirm it. Your
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
4. Type what he would type, in his words, not the words the builder's instructions expect. Try it
   the awkward way once: a second time in a row, in a new project, with the sentence phrased
   differently.
5. Record each one, with a screenshot or a log file that shows what you saw:
   `issues.mjs check OLA-n pass <k> --by checker --on "<release or build>" --saw "…" --shot <file>`
   `issues.mjs check OLA-n fail <k> --by checker --saw "what happened instead"`
   Keep the files under `~/Desktop/Ola/checks/OLA-n/` on Bart's Macs.
6. You do not fix code. A failed check goes back to the builder with what you saw.
7. Report in five lines at most: passed, failed, not checked, and anything that looked wrong that
   no check covered (open a ticket for it).

## A ticket that is an analysis, a plan or a proposal

It reaches Bart as something to read, so it has checks too. The checker opens it the way he will
(from the link he gets, at phone width) and checks what it is built from: it names the outside
sources read for it, each link opens and says what the text says it says, and it does not rest only
on this project's own notes. Bart, Nov 20, about the review of the learning system: "did the agent
do any web searches to understand what best practices are?" It had not.

## For the lead

- Start a checker as soon as a ticket is ready: `issues.mjs unchecked` lists them. Checkers come
  before new work.
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
  `issues.mjs check <id> internal --why "…"` and closes on proof. `issues.mjs unchecked` lists the
  day's internal closings: read each reason as a stranger would.
- When something a checker passed fails for Bart, that is a correction filed with
  `correct.mjs add … --escape`, and the question it has to answer is what the check did not do.
