# How far does the plan go?

Run started 2026-11-12T11:00:44-08:00 on MacBook-Neo.local · Claude Code 2.1.322 (Claude Code) · mode **until-limit** · stopped: session meter at 100%

## The answer

- **Continuous work hit the plan limit after 39 min of real time** (11:00 to 11:39).
- Finished **14 tasks** in that time: 7 coding, 3 data, 4 knowledge (6 on Opus, 8 on Sonnet); 13 passed their check.
- Tokens: **26,576,315 in all**: 193,237 output, 474 input, 24,698,969 read from cache, 1,683,635 written to cache. At API prices that is **$16.90**.
- The 5-hour meter went from 2% to 100%; it resets Nov 12 at 4pm (America/Los_Angeles).
- 1% of a 5-hour window ≈ 271,187 tokens (1,972 output) ≈ 0.4 real minutes of this work.

## The week

- The weekly meter (all models) went from 0% to 9%: this run used **9% of the week**.
- So a week holds about **11.1 windows like this one**: about **7 h 13 min of continuous work** a week, then the weekly cap stops you even if a 5-hour window is open.
- A week ≈ 295,292,389 tokens (2,147,078 output), $187.82 at API prices; a month (4.35 weeks) ≈ 1,284,521,892 tokens, $817.02.
- In tasks, a week holds about: 78 coding, 33 data, 44 knowledge tasks of the kinds in this mix.
- The meter has whole-percent steps: with 9 points of movement the weekly figures are good to about ±11%.
- Current week (Fable): 0% → 0%.

## Real time

Measured by this script from the computer clock (not by the model): each task from the moment its `claude` call starts to the moment it exits.

| | |
|---|---|
| Start of first task to the limit | 39 min |
| Inside tasks | 39 min |
| Reading the meters between tasks | 60 s |
| Claude Code's own count of its run time | 38 min |
| Time spent waiting on the model API | 32 min |

The computer clock agreed with outside servers to within 0.8 s at the start and end (www.apple.com, www.cloudflare.com, www.google.com).
A heartbeat written every 20 s shows the machine stayed awake throughout (longest gap 20 s).

## By kind of work

| kind | runs | passed | real min (median) | real min (total) | tokens (median) | output (median) | API $ eq (median) | 5-h meter per task (median) |
|---|---|---|---|---|---|---|---|---|
| coding | 7 | 6 | 3.3 | 18.1 | 1,538,128 | 9,955 | $1.42 | 7% |
| data | 3 | 3 | 1.1 | 9.3 | 1,084,300 | 6,944 | $0.52 | 5% |
| knowledge | 4 | 4 | 3.1 | 11.1 | 2,283,840 | 21,222 | $1.14 | 8% |

## By model

| model | tasks | real min | input | output | cache read | cache write | API $ eq |
|---|---|---|---|---|---|---|---|
| claude-opus-5-5 | 13 | 26.2 | 234 | 99,022 | 13,090,990 | 783,803 | $10.87 |
| claude-sonnet-5-5 | 21 | 12.8 | 240 | 94,215 | 11,607,979 | 899,832 | $5.70 |
| claude-haiku-5-5 | (helper) | – | 508,345 | 40,670 | 0 | 0 | $0.33 |

Claude Code also calls a small model for housekeeping (titles, summaries); it shows up here as a helper.

## By task

| task | model | runs | passed | real min (median) | tokens (median) | output (median) | 5-h meter (median) |
|---|---|---|---|---|---|---|---|
| C1 CASBS Quest: an easter egg on the Dish | opus | 2 | 2 | 3.4 | 2,015,402 | 11,128 | 9.5% |
| K2 Questions about ingested legal text | sonnet | 2 | 2 | 2.4 | 2,593,280 | 18,619 | 6.5% |
| D1 MRD: pull two countries from the live API | sonnet | 1 | 1 | 1.1 | 1,084,300 | 6,944 | 3% |
| C4 MRD: a two-country comparison page | sonnet | 1 | 1 | 1.3 | 1,392,618 | 9,955 | 4% |
| K3 A synthesis memo on 40 adaptation studies | opus | 1 | 1 | 3.0 | 1,590,096 | 17,925 | 9% |
| C2 CASBS Quest mockup: a bug report | sonnet | 1 | 1 | 0.3 | 509,009 | 1,466 | 0% |
| D2 GAMI: look up 15 studies in OpenAlex | sonnet | 1 | 1 | 0.8 | 519,385 | 4,552 | 5% |
| C3 CASBS Quest mockup: a sixth neighborhood | opus | 1 | 1 | 4.9 | 2,890,264 | 21,130 | 11% |
| K1 A lunch-talk deck on the MRD | sonnet | 1 | 1 | 3.3 | 2,958,228 | 26,657 | 8% |
| C5 MRD: a movers script | sonnet | 1 | 1 | 0.8 | 704,890 | 6,917 | 0% |
| D3 Web research: wages and domestic workers in six countries | opus | 1 | 1 | 7.4 | 3,924,758 | 19,000 | 15% |
| C6 CASBS Quest mockup: a code review | opus | 1 | 0 | 4.0 | 1,538,128 | 18,710 | 9% |

## Every call

| # | start | task | model | real min | tokens | output | API $ eq | 5-h meter | week | result |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 11:00:44 | C1 | opus | 3.5 | 1,835,259 | 9,889 | $1.42 | 14% | 2% | pass |
| 2 | 11:04:17 | K2 | sonnet | 3.2 | 3,577,110 | 24,518 | $1.21 | 22% | 2% | pass |
| 3 | 11:07:30 | D1 | sonnet | 1.1 | 1,084,300 | 6,944 | $0.52 | 25% | 3% | pass |
| 4 | 11:08:41 | C4 | sonnet | 1.3 | 1,392,618 | 9,955 | $0.59 | 29% | 3% | pass |
| 5 | 11:10:03 | K3 | opus | 3.0 | 1,590,096 | 17,925 | $1.71 | 38% | 4% | pass |
| 6 | 11:13:08 | C2 | sonnet | 0.3 | 509,009 | 1,466 | $0.37 | 38% | 4% | pass |
| 7 | 11:13:25 | D2 | sonnet | 0.8 | 519,385 | 4,552 | $0.41 | 43% | 4% | pass |
| 8 | 11:14:14 | C3 | opus | 4.9 | 2,890,264 | 21,130 | $2.23 | 54% | 5% | pass |
| 9 | 11:19:09 | K1 | sonnet | 3.3 | 2,958,228 | 26,657 | $1.06 | 62% | 6% | pass |
| 10 | 11:22:31 | C5 | sonnet | 0.8 | 704,890 | 6,917 | $0.47 | 62% | 6% | pass |
| 11 | 11:23:24 | D3 | opus | 7.4 | 3,924,758 | 19,000 | $2.66 | 77% | 7% | pass |
| 12 | 11:30:47 | C6 | opus | 4.0 | 1,538,128 | 18,710 | $1.68 | 86% | 8% | fail: missing/failed: REVIEW.md, 3+ file:line findings |
| 13 | 11:34:50 | C1 | opus | 3.3 | 2,195,544 | 12,368 | $1.50 | 93% | 8% | pass |
| 14 | 11:38:08 | K2 | sonnet | 1.6 | 1,609,451 | 12,720 | $0.75 | 98% | 9% | pass |
| 15 | 11:39:44 | D1 | sonnet | 0.1 | 247,275 | 486 | $0.32 | 98% | 9% | LIMIT |
| 16 | 11:39:52 | C4 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 17 | 11:39:54 | K3 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 18 | 11:39:57 | C2 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 19 | 11:40:00 | D2 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 20 | 11:40:02 | C3 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 21 | 11:40:05 | K1 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 22 | 11:40:08 | C5 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 23 | 11:40:10 | D3 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 24 | 11:40:13 | C6 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 25 | 11:40:16 | C1 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 26 | 11:40:18 | K2 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 27 | 11:40:21 | D1 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 28 | 11:40:24 | C4 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 29 | 11:40:27 | K3 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 30 | 11:40:30 | C2 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 31 | 11:40:33 | D2 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 32 | 11:40:36 | C3 | opus | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 33 | 11:40:40 | K1 | sonnet | 0.0 | 0 | 0 | $0.00 | 98% | 9% | LIMIT |
| 34 | 11:40:43 | C5 | sonnet | 0.0 | 0 | 0 | $0.00 | 100% | 9% | LIMIT |

What Claude Code said when the limit hit:

```
You've hit your 5-hour limit · resets 4pm (America/Los_Angeles)
```

## Setup

- Models: opus = claude-opus-5-5, sonnet = claude-sonnet-5-5. CLAUDE.md in every workspace: yes (hilma's, about 16k tokens, as in real sessions). MCP servers and connectors: the machine's own. node for the checks: yes.
- Context every call starts with (system prompt, CLAUDE.md files, tool lists), from the first call's cache: about 1,825,336 tokens.
- Meters at the start: Current session 2%, Current week (all models) 0%, Current week (Fable) 0%
- Every task ran in a fresh copy of fixture/ under work/; its full Claude Code stream is in `.claude-stream.jsonl` there.
