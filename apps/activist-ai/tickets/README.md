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

A run: `git archive <commit>^` into `~/ola-trials/runs/<case>-<model>-<time>/work` (its own git,
no link to this checkout), the ticket's test files put in from `<commit>`, then opencode 2.3.0
(`run --auto`) with the request. It runs under `sandbox-exec`: the home folder is out of reach
except its run folder and the two `node_modules` (read only), the network is loopback only, so the
model can reach nothing but its gateway and no secret on the machine. Its gateway is the ticket
lane's own (`gateway.sh`: caller `tickets`, the model under the name `code`, 20M tokens a week per
model), never Ola's. When it stops, the given tests are put back from the real commit (editing a
test never helps), the tests run in the same sandbox, and one line goes to `~/ola-trials/results.jsonl`.

Self-test (Nov 21): the real commits pass all three cases (4/4, 8/8, 54/54); no change fails all three.

Candidates (Nov 21, Together serverless): Kimi K3.1 Pro, DeepSeek V4 Pro, GLM-5.3, Muse Spark Open.
Qwen3.7-Max is listed but Together refuses it on the serverless API ("the model server rejected the
request"), so it is not in the trial.

## Step 2: the hand-off (next)

A ticket marked for Ola becomes a request in a project that holds a copy of the repo at main; Ola
(the trial's winner, under the ticket lane's own name in the model connection) works there; the
result comes back as a branch `ola/OLA-n` that Kit reviews, runs the checks on, and merges; the
ticket's checker checks it as every ticket. The tracker records who built each ticket, and the
count of tickets closed and built by Ola is shown each day.
