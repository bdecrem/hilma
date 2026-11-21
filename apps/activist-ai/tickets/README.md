# Ola on our own tickets (OLA-300)

Bart, Nov 20: Ola takes designated tickets from our own tracker; Kit hands them off, checks the
result, and Ola runs the best coding model on Together for them. Why: "1- we sometimes use up all
our tokens 2- dog feeding our work, in this case on real work we care about." He allowed Chinese
models **for this use only** ("performance is the only criteria"): our own code, never a person's
project. Everywhere else in Ola the rule on Chinese models stands.

Goals: by Monday Nov 23, one real ticket built by Ola end to end; a week on, half of the tickets.

## Step 1: the model trial (`trial.mjs`)

Each candidate redoes a closed ticket of ours from the commit before it, and the ticket's own tests
decide. `cases.json` holds the tickets (the commit, the request as Kit would hand it off, the test
files given, the test commands); `models.json` the candidates with Together's prices.

```bash
apps/activist-ai/tickets/gateway.sh kimi-k3.1-pro glm-5.3        # one loopback gateway per model (port 4460 + its place in models.json)
node apps/activist-ai/tickets/trial.mjs --models reference,empty # self-test: the real commit must pass every case, no change must fail
node apps/activist-ai/tickets/trial.mjs --models kimi-k3.1-pro,glm-5.3 --concurrency 12 --time 1500 --tokens 3000000
node apps/activist-ai/tickets/trial.mjs --report                 # pass count, cost and minutes per model
```

A run: `git archive <commit>^ -- <the case's paths>` (only the folders the ticket needs, about 8 MB; a whole copy is gigabytes, and on Nov 21 twelve of them filled the mini's disk for a few minutes; a run refuses to start with less than 10 GB free) into `~/ola-trials/runs/<case>-<model>-<time>/work` (its own git,
no link to this checkout), the ticket's test files put in from `<commit>`, then opencode 2.3.0
(`run --auto`) with the request. It runs under `sandbox-exec`: the home folder is out of reach
except its run folder and the two `node_modules` (read only), the network is loopback only, so the
model can reach nothing but its gateway and no secret on the machine. Its gateway is the ticket
lane's own (`gateway.sh`: caller `tickets`, the model under the name `code`, 20M tokens a week per
model), never Ola's. When it stops, the given tests are put back from the real commit (editing a
test never helps), the tests run in the same sandbox, and one line goes to `~/ola-trials/results.jsonl`.

Self-test (Nov 21): the real commits pass all three cases (4/4, 8/8, 54/54); no change fails all three.

**Result, Nov 21 (incomplete):** Kimi K3.1 Pro passed 2 of 3 (OLA-324 4/4, OLA-337 54/54; OLA-283
2/8 when it reached the 3M-token cap), $17.90 for the three. Muse Spark Open 1 of 3. GLM-5.3 and
DeepSeek V4 Pro 0 of 3, but at about 9:08 am the Together account hit its credit limit (this trial,
about $45, pushed it over; OLA-346) and five of their six runs ended on Together's 402, so they are
not measured yet. Kimi K3.1 Pro is the ticket model (`_ticket_model`) until those runs are redone:
`--models glm-5.3,deepseek-v4-pro,muse-spark --max-usd 30`. The hard case (OLA-283) beat every model
at 3M tokens; the next round gives it 6M.

Candidates (Nov 21, Together serverless): Kimi K3.1 Pro, DeepSeek V4 Pro, GLM-5.3, Muse Spark Open.
Qwen3.7-Max is listed but Together refuses it on the serverless API ("the model server rejected the
request"), so it is not in the trial.

## Step 2: the hand-off (`handoff.mjs`)

```bash
node scripts/venture/issues.mjs edit OLA-n --who ola          # Kit marks a ticket for Ola
node apps/activist-ai/tickets/handoff.mjs list                 # open tickets marked for Ola
node apps/activist-ai/tickets/handoff.mjs run OLA-n [--model <alias>] [--dry]
```

`run` makes the ticket and its whole thread the request, exports origin/main into
`~/ola-trials/handoff/OLA-n-<time>/work` (about 630 MB, removed after the run; it refuses under 12 GB
free), and runs Ola's opencode on the ticket model (`_ticket_model` in models.json, the trial's
winner) in the trial's sandbox. Ola's change goes on branch `ola/OLA-n` from the exact main it started
from, committed by "Ola" with the model, minutes and cost in the message, and pushed (never to main);
a comment on the ticket names the branch, the files, the cost and Ola's own words. Then the usual
path: Kit reviews the branch, runs the folder's checks, merges it, marks the ticket ready, and a
checker checks it. `--dry` does everything but the push and the comment. The sandbox code is shared
with the trial in `lib.mjs`.

Still to build: who built each ticket on the board, and the day's count (tickets closed, how many Ola
built).
