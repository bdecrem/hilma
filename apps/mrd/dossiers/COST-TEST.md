# What each part of the plan costs: a week of tests

Bart, 2026-11-20. The checks of 2026-11-17 used up the $200 plan and a full reset in a few hours.
Before any part of `PLAN.md` runs again, measure what each part costs by model and effort, on one
country, on a plan we can afford to empty: the MacBook Neo on the $100 Max plan. The result is a
final plan with a cost per answer and per country for every step.

The pause of 2026-11-18 stays in force for everything except the runs listed here.

## What we already know

| Fact | Number | Source |
|---|---|---|
| A 5-hour window on the $20 plan | about $17 of work at API prices | `apps/pro-usage`, run of 2026-11-12 |
| A week on the $20 plan | about $190, 11 windows | same |
| The $100 plan, if it is 5 times that | about $85 a window, $940 a week | **not measured: test 0** |
| Checking one country (source check, second reader, redo) | $238 to $281 | `CAUGHT.md` |
| Source check, Sonnet 5.5 low | $1.61 a chunk, about $0.45 an answer | `PLAN.md` |
| Second reader, Opus 5.5 high | $4.22 a chunk, about $1.20 an answer | `PLAN.md` |
| Redo, Fable 5.2 high | about $8 an answer (Portugal: $133 for 16) | derived from `CAUGHT.md` |
| Redo, Fable 5.2 xhigh | $14 for one answer | `PLAN.md` |

So one country's checks are about three full windows of the $100 plan, a quarter of its week, and
the whole of `PLAN.md` ($19,000) is twenty of its weeks. Half of a country's check cost is the Fable
redo of 16 to 26 answers.

## The unit

One **chunk** of Costa Rica: 3 or 4 related indicators, chosen from answers that are already
verified (17 Costa Rica answers still wait for their redo). The same chunk goes through every test,
so the only things that change are the step, the model and the effort. A second chunk repeats the
winners, to see how much a chunk varies.

Costa Rica is one of our six dossiers, not one of the MRD's 46, so it has no human-coded 2023
answer. For Costa Rica the forward test starts from our own answer and asks what changed in the
window; the work per answer is the same. One chunk of Colombia (in the 46, Latin America) checks on
Monday that the number holds when the starting point is the MRD's 2023 answer.

## What every run records

`cc/cost.mjs` runs one job and writes one row to `cost/LOG.md` and one file to `cost/results/`,
then commits and pushes, so nothing is lost when the limit closes:

- step, chunk, model, effort, start and end time, turns, pages read
- tokens (input, output, cache read, cache write) and the API-equivalent dollars from the SDK
- the plan's three meters before and after (5-hour window, week, week Fable), read with
  `claude -p /usage`, which costs nothing
- the answers themselves, with sources and quotes, so the attorney can compare models side by side

Test runs never write to the dossier tables. Nothing is published from them.

## The tests

| # | Part of the plan | What runs | Models and effort |
|---|---|---|---|
| 0 | Calibration | The source check and the second reader on the chunk, exactly as on 2026-11-17, whose dollar cost is known. Gives dollars per 1% of a window and of the week on this plan, for Sonnet and for Opus. | Sonnet 5.5 low; Opus 5.5 high |
| A | Part 3, forward | For each answer: was the cited law amended, repealed or replaced between 1 January 2023 and 1 January 2026, did practice shift; answered in the instrument's change scale. | Opus 5.5 high (the plan), Opus 5.5 medium, Sonnet 5.5 medium |
| B | Part 4, back | For each answer: the full amendment history of the provision, the answer on 1 January 2020; for a No today, a search for a right that existed and was repealed; rulings dated and checked for later ones. | same three |
| AB | Parts 3 and 4 in one pass | One dated history per provision, from enactment, then the answers for 2020, 2023 and 2026 read off it. If this costs little more than B alone, Parts 3 and 4 merge and earlier dates come nearly free. | Opus 5.5 high, then the cheapest setting that held up in A and B |
| C | The checks on new work | Source check and second reader over the outputs of A and B. | Sonnet 5.5 low; Opus 5.5 high, Opus 5.5 medium |
| D | The stronger model where it is uncertain | The answers of A, B and AB marked low confidence, or where two models disagree, coded again. Also the 17 pending Costa Rica redos, which are real work. | Fable 5.2 high, against Opus 5.5 xhigh on the same answers |
| E | Part 2, a new country | The law map and 3 chunks of Panama. | Opus 5.5 high (the plan), Sonnet 5.5 high |

Quality is judged apart from cost: for each test the attorney sees the answers of every model for
the same indicators, unlabeled, with their sources.

## The schedule

Meters on 2026-11-20 at 11:03: window 0% (resets 16:00), week 34%, week Fable 61% (both reset
23:00 tonight). What is left of this week cannot be carried over, so today runs to the limit.

| When | What | Limit |
|---|---|---|
| Today, to 16:00 | Set up this Mac (database login from the iMac). Build `cc/cost.mjs` and the forward / back prompts. Test 0, then A on Opus high and Sonnet medium. | To the window's limit |
| Today, 16:00 to 21:00 | A on Opus medium. B on all three. AB on Opus high. C on what A and B produced. | To the window's limit |
| Today, 21:00 to 22:50 | D: Fable 5.2 high on the uncertain answers, then the pending Costa Rica redos until 22:50. Stop at 22:50 so nothing runs across the weekly reset. | To the Fable week's limit |
| After 23:00 tonight | The cheapest recipe that held up, over all 18 chunks of Costa Rica for A, unattended: the first whole-country number. | One window, about 9% of the new week |
| Monday | B (or AB if it won) over all of Costa Rica. One chunk of Colombia for A from the MRD's 2023 answer. | Two windows, about 18% |
| Tuesday to Thursday | E on Panama; C and D on Monday's output; a second run of anything whose two chunks disagreed by more than a third. | Two windows a day |
| Friday | The final plan: cost per answer and per country for every step and model, what fits which plan in how many weeks, where Fable is worth it. | |

From tonight's reset on, no run starts when the window is above 85% or the week above 90%, and the
week is planned to end near 80%. Today only, runs go to 100%; a run cut off by the limit loses at
most its own chunk, and its row is written as cut off.

## Who runs what

The tests are scripts; the session that starts them does not sit and wait on a strong model.
Code and pages are built by subagents on Sonnet 5.5 or Opus 5.5; a Fable session is used to design
the prompts and to read results, not to watch runs.
