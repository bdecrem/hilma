# evals: how well does Ola do a task, measured

Ola tells a user, before a task, how well it is likely to go. That sentence comes from here: a set
of checkable tasks shaped like our first users' work, run against a named **configuration** (model +
serving setup + harness version), with a result row per run in SQLite and a readout per task family.
Made-up data only. Nothing here ever holds a user's content.

```bash
npm install                                   # in evals/: the Claude Agent SDK, for the baseline only
python3 lib/task.py selftest tasks/a1-survey  # reference solution passes, nothing and a wrong output fail
evals/start-gateway.sh                        # our own gateway on 127.0.0.1:4391, 6,000,000 tokens a week
node run.mjs --config configs/glm-5.3-flash.json --seeds 1,2 --concurrency 3 --time 600 --tokens 300000
node run.mjs --config configs/opus-5.5-claude-code.json --seeds 1,2 --concurrency 2 --max-usd 14.9
node report.mjs --md /tmp/readout.md --json results/summary.json
```

## A task

One folder per task in `tasks/`, named `<family letter><n>-<name>`:

| File | What it is |
|---|---|
| `task.json` | id, family, level (easy, medium, hard), honesty (bool), version, the outputs it asks for |
| `instruction.md` | the request, written the way a user would write it |
| `task.py` | `generate(work, seed, rng)` makes the input files and returns the truth (kept outside the agent's folder); `check(work, truth, session, C)` scores the output files and the agent's final message with deterministic checks; `solve` is a reference solution; `wrong` an obviously wrong output |

Shared code is in `lib/`: `evalkit.py` (checks, CSV and number helpers, verbatim matching, the page
reader), `task.py` (the CLI the runner calls), `page.mjs` (loads a page headless from a local server,
the way a visitor would, and reports its text, selected values, scroll width, links, charts, errors and
any outside request), and one generator per family (`fam_studies.py`, `fam_sql.py`, `fam_docs.py`,
`fam_laws.py`, `fam_site.py`, `fam_honest.py`).

**Every task is proven solvable and its checker proven to bite:** `lib/task.py selftest <task> 1 2`
generates each seed, then checks three outputs: the reference solution (must pass every check), an
empty folder (must fail) and the task's `wrong` output, a plausible mistake (must fail). All 24 pass.
A checker that is fixed after a run gets a new `version` in `task.json`; the runner reruns it and the
report counts only each task's latest version.

**Check names and failure labels are fixed vocabulary**, written in the task's code, never taken from
the agent's output. `lib/labels.json` is the one list of failure labels and end reasons; the database
has `CHECK` constraints on both. A run's label is its end reason when it was cut off (timeout,
token_limit, budget_limit), `success` when every check passed, `stopped_early` or
`claimed_done_not_done` when a required output is missing (without or with a final message), else the
label of its first failed check.

## The 24 tasks

| Family | Easy | Medium | Medium | Hard |
|---|---|---|---|---|
| **clean**: messy tables | `a1-survey` (the spike's survey) | `a2-rainfall` (mm and inches, four month formats) | `a3-grants` (join on hand-typed names) | `a4-panel` (wide statistics export: notes, footnotes, separators, totals row) |
| **sql**: a research question over a study database | `b1-count` | `b2-drought-sector` (join, distinct) | `b3-rct-size` (-1 means not reported) | `b4-flood-decades` (share per decade, each study once) |
| **coding**: documents against a scheme, quotes verbatim | `c1-code-small` (8 reports) | `c2-code-traps` (20 reports, negated look-alikes) | `c3-code-pages` (page cited, quote on that page) | `c4-code-corpus` (40 wrapped reports, counts that agree) |
| **legal**: provisions across laws | `d1-detention` (3 English laws) | `d2-work-wait` (+ Spanish, French; quote in the original) | `d3-appeal-deadlines` (weeks and words to days; German) | `d4-compare-laws` (6 laws, 3 rules, amending articles) |
| **site**: pages from data, read back headless | `e1-events-page` | `e2-members-dashboard` (data-stat values, offline, 390 px) | `e3-live-filter` (fetch at run time: the data file is swapped under it) | `e4-country-site` (ranked index, chart, 12 country pages) |
| **honesty**: the right answer is to say no, or flag | `f1-no-column` (no gender column) | `f2-duplicate-gifts` (4 gifts entered twice) | `f3-unit-mixup` (one sensor in Fahrenheit) | `f4-missing-quarter` (q3.csv missing, rows from 2026) |

The kinds of work come from the two first users (a research agent over a corpus of coded studies; a
law library over a migrant-rights database). No data of theirs is used: every study, law, country,
person and number is generated.

Checks are built to be hard to fool: a query is rerun read-only on a freshly built copy of the
database (so editing `studies.db` cannot help, and editing it is itself a failed check); every quote is
matched against its source, and for laws against the cited article; a live page is reloaded with its
data file swapped; counts must agree with the agent's own rows and with the truth.

## The runner

`run.mjs --config <file>`: for every task and seed not yet in the database for this configuration, a
fresh folder `runs/<config>/<task>-s<seed>-<stamp>/` with `work/` (what the agent sees), `home/` (an
empty home), `truth.json` (outside `work/`), `events.jsonl`, `session.json`, `check.json`.

- **Configuration identity:** name + a hash of its settings, the harness version (opencode's package
  version or the Agent SDK's), our opencode config, and the runner version. Change any and it is a new
  configuration with its own rows.
- **Limits:** `--time` seconds per run (the agent's whole process group is killed), `--tokens` per run
  for opencode (counted from each step's usage in the event stream), `max_usd_per_run` per run and
  `--max-usd` overall for the paid baseline: a run starts only when what is spent plus the cap of every
  run in flight plus its own cap stays under the ceiling.
- **Resumable and safe to stop:** rows are written only when a run is checked; Ctrl-C kills every agent
  and records nothing for the runs it cut short.
- **Results** (`results/evals.db`, not committed): `configurations`, `results` (one row per run: task,
  family, level, seed, pass, checks passed and total, time, tokens in and out, cost, requests, tool
  calls, tool errors, end reason, failure label, limits), `result_checks` (pass per named check),
  `result_tools` (calls and errors per tool). No free-text column except the configuration's own
  settings. `results/summary.json` (committed) is what `report.mjs --json` writes.

**Harnesses.** `opencode`: opencode run with the spike's config (web denied, nothing outside the
folder) through our gateway, with an empty home and an emptied environment. `claude-agent-sdk`: Claude
Code's engine through the Claude Agent SDK (Claude Code's system prompt and tools, web tools removed,
no settings files, an empty config folder, telemetry off); the key is read from the ops vault in
process, and a run that does not report `apiKeySource: ANTHROPIC_API_KEY` is stopped, so the baseline
can never fall back to a personal login. Cost is the larger of the SDK's estimate and our own count
from its token usage at list price.

**Departures from the flywheel design.** The runs are not inside the sealed workspace VM: on the iMac
the agent runs as a local process in a throwaway folder (the spike's setup). The baseline is the Agent
SDK, not Harbor's `claude-code` agent (no Docker needed, and the same task folders). Repeats are k = 2
for this first run (the design says 5 for a baseline), so every family number is preliminary.

## The gateway

`start-gateway.sh` starts `gateway/server.mjs` unchanged, on its own port, with one caller (`evals`), a
token in `.state/gw-token` and `GATEWAY_WEEKLY_TOKENS=6000000`. Gateway changes that would help evals
(not made; that code is under review): a per-caller usage line keyed to a run id, so tokens could be
read from the gateway rather than from the agent's own event stream.

## First run (2026-11-16, the iMac, k = 2)

| Configuration | Pass | Tasks passed on both seeds | Median time | Median tokens | Cost |
|---|---|---|---|---|---|
| GLM-5.3-Flash, Together through our gateway, opencode 2.3.0 | 46/48 (96%) | 22/24 | 20 s | 69k | about $1 (4.86M tokens) |
| Opus 5.5, Claude Code's engine (Agent SDK 0.3.316, effort high) | 48/48 (100%) | 24/24 | 23 s | 95k | $6.26 including a smoke run and 4 superseded runs |

GLM's two failures: wrong article numbers on `d4-compare-laws`, and the 300k-token cap on
`e4-country-site`. The suite does not yet separate the two: every family reads "about 9 or 10 in 10
for both". It works as an instrument and a floor check; the next tasks have to be bigger (past the
context window), longer (multi-step, follow-up edits) and harder on honesty. Three checkers were
wrong before either model was (`f1` v1, `f3` v1 and v2); when the baseline fails a task, read the
checker first. `results/summary.json` has every number.

One run (GLM, `e4`) found the iMac's own Chrome and ran it headless to screenshot its pages:
opencode's folder rule covers its file tools, not its shell. Runs on a host with anything on it belong
in the sealed workspace.
