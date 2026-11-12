# How far does a Claude plan go?

A test that measures how much real work a Claude plan (made for the $20/month Pro plan)
allows in Claude Code, in **tokens** and in **real time**. It runs twelve tasks modeled on our
own work back to back until the plan's 5-hour limit stops it, then reads the weekly meter
to extrapolate to a week and a month. Built 2026-11-12.

- **Coding**: CASBS Quest (an easter egg, a bug report on the mockups, a sixth neighborhood,
  a code review), the Migrant Rights Database (a comparison page, a movers script).
- **Knowledge work**: a lunch-talk deck from the MRD data, six questions answered with quotes
  from the MRD's legal text for six countries, a synthesis memo on 40 GAMI adaptation studies.
- **Data collection**: two countries pulled live from the MRD's open API, 15 GAMI studies
  looked up in OpenAlex, a web-research table (minimum wages and ILO C189 in six countries).

Opus 5.5 does the hard coding, the review, the synthesis and the research; Sonnet 5.5 does
the rest (`tasks.json`, field `tier`). The order interleaves the kinds and repeats.

## Get it on another computer

The hilma repo is public, so a sparse clone fetches only this folder:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/bdecrem/hilma.git
cd hilma && git sparse-checkout set apps/pro-usage && cd apps/pro-usage
```

(Or `git pull` in an existing hilma checkout.) Needs Python 3.8+ (standard library only),
Claude Code logged in with the plan to test, and optionally node for the code checks.

## Run it

Before you start: **turn off extra usage** on the account (claude.ai → Settings → Usage), or
the run continues past the limit and costs money; start on a **fresh 5-hour window** (no
Claude use for 5 hours, so `/usage` shows the session meter at 0%); make sure the **weekly
reset** (shown in `/usage`, a fixed time per account) is more than 6 hours away, or the week's
extrapolation breaks; plug the computer in.

```bash
python3 run.py --smoke      # two tiny calls, one per model: is everything wired up?
python3 run.py              # the test, until the limit (or 5.5 h); Ctrl-C stops and still writes the report
python3 run.py --once       # each task once, then stop (calibration)
python3 run.py --only C1,D2 # just these
python3 run.py --dry-run    # the plan, no calls
python3 report.py results/<run>   # rebuild a report
```

Options: `--bare` (no MCP servers or connectors on the task calls), `--no-claude-md` (leave
hilma's CLAUDE.md out of the workspaces), `--opus-model` / `--sonnet-model` (e.g. if the plan
has no Opus in Claude Code), `--max-hours`, `--yes` (don't ask about a window already in use).

To hand the whole thing to Claude Code on that machine, give it **START.md**: it checks the
setup, starts the run detached and gets out of the way.

## What it measures, and how

- **The referee is this script, not Claude.** `run.py` is plain Python, so running the test
  costs the plan nothing; only the task calls do. Each task is one `claude -p` call in a fresh
  copy of `fixture/` (a frozen snapshot: the CASBS Quest game and mockups, MRD data and text,
  a GAMI sample; nothing secret, nothing that writes anywhere real).
- **Real time** comes from the computer's clock: each task from the moment its `claude` call
  starts to the moment it exits, and the window from the first call to the limit. The clock is
  checked against three outside servers at the start and the end; the machine is kept awake
  (`caffeinate`), and a heartbeat every 20 s proves it stayed awake. The report sets this next
  to Claude Code's own count of its run time.
- **Tokens** come from Claude Code's report of every call: input, output, cache reads and cache
  writes, per model (including the small helper model Claude Code uses for housekeeping), plus
  what the same tokens would cost on the API.
- **The plan's meters** come from `claude -p /usage`, which uses no tokens: read at the start,
  after every task and at the end. One window's movement on the weekly meter gives the week:
  if the window moved it 15 points, a week holds about 100/15 ≈ 6.7 such windows. The meter
  has whole-percent steps, so 15 points is good to about ±7%.
- **Did the work get done?** `checks.py` checks each deliverable's shape (files there, code
  still parses, tables complete). It doesn't grade quality; it keeps a model that gives up
  early from looking cheap.

Results go to `results/<start time>/` (git-ignored): `report.md` (rewritten after every task),
`report.json`, `events.jsonl` (one line per task), `run.json`, and every task's workspace with
its full Claude Code stream in `.claude-stream.jsonl`.

## Things to know

- Every call starts with a large fixed context: Claude Code's system prompt, CLAUDE.md files
  and tool lists. On Bart's iMac that was ~80k tokens per call before any work (MCP servers
  were only 5–14k of it). The workspaces include hilma's CLAUDE.md on purpose (~16k tokens,
  as in real sessions); the Pro machine's own `~/.claude/CLAUDE.md` and MCP servers also count.
  The report shows the starting context it saw.
- Most tokens are cache reads (the context re-read on every turn). The plan's meter weighs
  token types its own way, so read the meter percentages as the truth and the token counts as
  the explanation.
- Validated on the iMac (a Max plan) on 2026-11-12: the smoke test and two real tasks (C2 in
  21 s and 792k tokens, of which 1.4k output; C5 in 55 s and 922k tokens). The Max plan's
  `/usage` showed only weekly meters; Pro's is expected to show the 5-hour session meter too.
  If it doesn't, the run still stops on Claude Code's limit message.
- `build_fixture.py` rebuilds `fixture/` from this repo (needs `openpyxl`). C2's bug is planted
  there on purpose.
