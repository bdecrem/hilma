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
node apps/activist-ai/tickets/trial.mjs --models kimi-k3.1-pro,glm-5.3 --max-usd 30 [--run-usd 10] --time 1500 --tokens 3000000
node apps/activist-ai/tickets/trial.mjs --models kimi-k3.1-pro --cases ola-351-ready --lean --max-usd 2.5 --run-usd 2.5   # the lean configuration (OLA-356)
node apps/activist-ai/tickets/trial.mjs --report                 # pass count, cost and minutes per model
node apps/activist-ai/tickets/test.mjs                           # the stops, refusals, cache pricing and lean config, offline (14 tests)
```

**Spending stops (Nov 21, after the $45 morning).** Every run, trial or hand-off, stops itself after
the model call that takes it past its token ceiling (`--tokens`) or its dollar ceiling (`--run-usd`
in the trial, default 10; `--max-usd` in the hand-off, default 10), counted from the tokens opencode
reports and the prices in `models.json` (`overLimit` in `lib.mjs`). One call can overshoot by its own
size (about $0.40 on Kimi at 200k tokens of context). A trial refuses to start unless `--max-usd`
covers the worst case of all its runs (each the smaller of its dollar stop and its tokens at the
dearer price). The rule the lead set: write a run's expected cost on OLA-300 before it starts; at
most $10 a run and $30 a day. Measured cost so far: 2.2 to 3.1M tokens in a run, $2 to $6.30.

A run: `git archive <commit>^ -- <the case's paths>` (only the folders the ticket needs, about 8 MB; a whole copy is gigabytes, and on Nov 21 twelve of them filled the mini's disk for a few minutes; a run refuses to start with less than 10 GB free) into `~/ola-trials/runs/<case>-<model>-<time>/work` (its own git,
no link to this checkout), the ticket's test files put in from `<commit>`, then opencode 2.3.0
(`run --auto`) with the request. It runs under `sandbox-exec`: the home folder is out of reach
except its run folder and the two `node_modules` (read only), and so is every mounted disk (`/Volumes`; Nov 21,
OLA-370: Recursive Flint ran `find / -name select.mjs` and copied OLA-283's answer from the mini's backup disk), the network is loopback only, so the
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

**OpenRouter (OLA-370).** A model whose `models.json` entry has `provider: "openrouter"` gets a gateway
pointed at https://openrouter.ai/api/v1 (`lib.mjs PROVIDERS`), its key read by `gateway.sh` from
`~/.ola/openrouter.key` (mode 600, refused otherwise) into that gateway's environment only. For the
trial and the hand-off; Ola's own gateway settings know nothing of it. Listed: `flint` (Recursive
Flint 40B, the free listing) and `inkling-2-mini` (Inkling 2 Mini 26B), the two that fit the Mac Studio.

Candidates (Nov 21, Together serverless): Kimi K3.1 Pro, DeepSeek V4 Pro, GLM-5.3, Muse Spark Open.
Qwen3.7-Max is listed but Together refuses it on the serverless API ("the model server rejected the
request"), so it is not in the trial.

## Cost: the lean configuration and cache hits (OLA-356, Nov 21)

The OLA-351 hand-off was recorded at $4.78 (2.35M tokens in, 8k out, 20 calls). Two causes, both fixed:

- **Cache hits were hidden.** Together caches repeated input by itself and bills a hit at about a
  tenth (Kimi K3.1 Pro $0.20 against $2.00 per M; together.ai/pricing), but the gateway strips
  `prompt_tokens_details`, so opencode saw "cache read 0" and our cost line priced every token as
  new. `gateway.sh` now starts the ticket lane's gateways with `GATEWAY_REPORT_CACHED=1` (refused on
  a gateway with more than one caller: a hit count is a side channel between callers), opencode
  reports input as the new tokens and the hits apart, and `lib.mjs cost` prices hits at
  `models.json` `cached`. The same run, measured again: 90% of its input was hits.
- **Too much was read.** opencode puts the 80 KB root CLAUDE.md into every call's system prompt
  (22k of call 1's 28k tokens), and Ola then read it again, whole files and a skill on top. The
  lean configuration (`lib.mjs LEAN`; the hand-off's default, `--full` for the old one, `--lean` in
  the trial): no Claude-compat instruction files or skills (`OPENCODE_DISABLE_CLAUDE_CODE`), tool
  output capped at 12 KB, the subagent, question and image tools denied, 60 steps at most (40 cut the hard case short), and a
  request that says to search first and read line ranges. Call 1 is 4.7k tokens.

`node apps/activist-ai/tickets/probe.mjs [--default]` shows what a run sends before the model reads
anything, against a stand-in server (no model money).

Measured on case `ola-351-ready` (OLA-351 from ef725577, the test file given, 24 tests):

| setup | passed | calls | new in | cached in | out | dollars |
|---|---|---|---|---|---|---|
| Nov 21 record, Kimi, full (hits not counted) | 24/24 | 20 | 2.35M | (hidden) | 8k | 4.78 at list |
| Kimi K3.1 Pro, full, hits counted | 24/24 | 16 | 136k | 1.25M | 5k | 0.57 |
| Kimi K3.1 Pro, lean | 24/24 | 16 | 39k | 373k | 5k | 0.20 |
| DeepSeek V4 Pro 0813, lean | 24/24 | 20 | 21k | 344k | 14k | 0.13 |
| DeepSeek V4.1 Flash, lean | 24/24 | 21 | 26k | 355k | 12k | 0.02 |

Kimi's change matches main's (runner.mjs byte for byte); DeepSeek V4 Pro's is correct but wordier;
V4.1 Flash's is correct but put the new function between `deployGate` and its doc comment.

Harder cases, lean: `ola-337-deepseek` (54 tests) Kimi PASS 54/54, 30 calls, 68k new + 1.30M
cached, $0.50 (the Nov 21 full run: 3.1M tokens, $6.30 at list); V4.1 Flash FAIL 53/54, $0.14.
`ola-283-select` (8 tests, the hard one) Kimi FAIL 5/8 at the 40-step cap, 142k new + 4.09M cached, $1.44 (Nov 21 full: 2/8 at 3M tokens); the cap is 60 since.

**The Mac Studio candidates, Nov 21 (OLA-370), lean, through OpenRouter.** Recursive Flint 40B (free): small
0/24 then 24/24 (60 calls each, 18.6 and 7.3 min; the pass is correct, a little wordier than main), medium
53/54 (no edit, the 60-step cap, 4.5 min), hard not measured: the first run "passed" 8/8 by copying main's
`select.mjs` from the mini's backup disk (now closed, see the sandbox above), the rerun was cut at 16 min
by the ticket gateway's own 20M-token weekly cap. Inkling 2 Mini 26B: 0 of 4, $0.48 in all (small 0/24
twice, medium 53/54, hard 0/8); in every run it explored with shell commands until the step cap or the
clock and never made an edit. Both sent well-formed tool calls (no format errors, no rate limits). Neither
takes a ticket alone: Flint passes a small one about half the time.

**The Studio-sized models Ola already uses, Nov 21 (OLA-370), lean, through Together** (small, small at
`--steps 120`, medium, small #2, hard; $1.58 for the 15):

| model (4-bit size) | small | small, 120 steps | medium | small #2 | hard | dollars |
|---|---|---|---|---|---|---|
| Nemotron 3.5 Super VL 120B-A12B (72 GB Q4_0 + 1 GB vision) | 24/24, 4 min | 24/24, 1.5 min | 53/54, timeout | 24/24, 6 min | 0/8, timeout, no edit | 0.47 |
| gpt-oss-120b (about 63 GB, MXFP4) | 24/24, 8.6 min | Together 500s | 53/54, timeout | Together 500s | Together 500s | 0.19 |
| Muse Glimmer 30B (about 17 GB) | 0/24, step cap | 24/24, 5.4 min | 53/54, step cap | 0/24, step cap | 0/8, step cap | 0.92 |

Nemotron passed the small ticket three times out of three; the first change matches main's (the function
and the runner using it), the other two fix the runner inline beside an unused function (one with a latent
bug). Its medium and hard runs ran out of clock, not steps: Together's calls took up to 284 s (p90 84 s),
so 20 to 23 calls in 25 to 30 minutes. gpt-oss-120b's one pass is weaker than main (it drops
`in_progress` tickets, which the tests miss, and does not wire the runner); Together answered 500 on 39
of its 75 calls (the harmony parser, as on Nov 15), so its other runs died. Muse Glimmer explores until the
60-step cap; at 120 it passed, with the function added but the runner left unchanged. Flint at 120 steps
was not run: its ticket gateway had used its 20M-token weekly cap.

So a small ticket is about $0.20 on Kimi and $0.50 a medium one. The cheaper models are cheaper
again (V4 Pro $0.13), but only Kimi met main's bar on every case; Flash fails a medium one.
Other hosts of the same models, prices only (Nov 21, per M in / cached / out): DeepSeek's own API
V4 Pro 1.32 / 0.044 / 3.96, half off-peak (api-docs.deepseek.com/quick_start/pricing); DeepInfra Kimi
K3.1 Pro 1.90 / 0.19 / 9.50, GLM-5.3 0.563 / 0.125 / 2.50 (deepinfra.com); Fireworks Kimi K3.1 Pro the
same as Together (fireworks.ai/pricing). With 90% of input cached, output and new input dominate, so
none of them is more than about 10% cheaper for Kimi.

## Tickets cut into pieces (`--pieces`, OLA-370, Nov 22)

```bash
node apps/activist-ai/tickets/trial.mjs --models reference,empty --pieces --lean     # self-test: the real commit passes every piece check, no change fails every one
node apps/activist-ai/tickets/trial.mjs --models inkling-2-mini --cases ola-351-ready --pieces --lean --time 900 --run-usd 0.20 --max-usd 0.61 [--repeat 3 --concurrency 3]
```

`pieces/pieces.mjs` cuts each trial ticket the way a strong planner would (small 2 pieces, medium 5,
hard 4): each piece names the file, the function, the exact change and a check (a command; check files
in `pieces/`, given in the run's `.pieces/` and put back before each check, as the ticket's tests
are). A run does the pieces in order on one tree, the dollar stop over all of them, then the ticket's
tests; the row has `mode: "pieces"` and a line per piece. `--repeat n` runs each case n times (side by
side with `--concurrency`). The pieces were written with the real commit in view, so they are a best
case for the planner: 12 minutes for the three, instructions 60 to 100% of the size of the code.

| model, in pieces | small | medium | hard |
|---|---|---|---|
| Inkling 2 Mini 26B | 24/24 five of five, $0.01, 1 to 5 min | 54/54, $0.05, 22 min | fail: pieces 1 and 3 passed; 2 (an algorithm in prose) timed out with no edit, 4 model error; $0.09 |
| Nemotron 3.5 Super VL | 24/24, $0.02, 0.5 min | 54/54, $0.08, 11 min | 8/8, $0.05, 1 min |

Whole, Inkling made no edit in four runs; in pieces its small and medium changes are main's code. Three
Inkling runs side by side on the small ticket all passed, so extra tries bought nothing there. Note for
Bart, with the tracker sample and the cost comparison: app.kochitolabs.com/notes/chopping-tickets-2026-11-21.

## Step 2: the hand-off (`handoff.mjs`)

```bash
node scripts/venture/issues.mjs edit OLA-n --who ola          # Kit marks a ticket for Ola (or a builder claims it)
node apps/activist-ai/tickets/handoff.mjs list                 # open tickets marked for Ola
apps/activist-ai/tickets/gateway.sh kimi-k3.1-pro              # the ticket model's gateway (stop it by its pid after)
node apps/activist-ai/tickets/handoff.mjs run OLA-n --test "node scripts/venture/runner-test.mjs" [--claimed builder] [--max-usd 10] [--dry]
```

Run it from a clone of its own (on the mini: `~/ola-tickets-<name>`, with `pnpm install` at the root
and `npm ci` in `apps/activist-ai`), never from the runner's `~/hilma-venture`: the branch is made in
the clone the script lives in. `run` makes the ticket and its whole thread the request, exports
origin/main into `~/ola-trials/handoff/OLA-n-<time>/work` (about 630 MB, removed after the run; it
refuses under 12 GB free), and runs Ola's opencode on the ticket model (`_ticket_model` in
models.json, the trial's winner) in the trial's sandbox, stopping at `--tokens` or `--max-usd`. Then
each `--test` (required; the commands the ticket's folder names) runs in the same sandbox on Ola's
copy. Ola's change goes on the **local** branch `ola/OLA-n` of that clone, from the exact main it
started from, committed by "Ola" with the model, minutes, cost and test result in the message, and
as `change.patch` in the run folder. **Nothing is pushed, main is never touched.** A comment on the
ticket names the branch and where it is, the files, the tests, the cost and Ola's own words. Then
the usual path: the lead fetches the branch (`git fetch admin@<mini>:ola-tickets-<name> ola/OLA-n`),
reviews it, runs the folder's checks, merges it, and a checker checks it. `--dry` does everything
but the comment. Exit 0 only when every test passed. The sandbox code is shared with the trial in
`lib.mjs`.

**On the board** (app.kochitolabs.com): a ticket whose commit came from the hand-off shows Ola as Who
in the tracker and "Built by Ola, on <model>" on its page; each day under Done says how many of its
tickets Ola built, and Home has the day's count and the last seven days ("Closed today: 6, 1 built by
Ola"). The mark is read from the commit body's first words, `Built by Ola on <model>`, which
`handoff.mjs` writes; the lead keeps that line when merging (`git merge --ff-only` or a cherry-pick
keeps it). Code: `src/lib/venture/board.ts` (`OLA_BUILT`, `closedOn`); test
`npx tsx scripts/venture/ola-built-test.ts`.
