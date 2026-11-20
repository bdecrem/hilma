# Cost tests: the log

One row per run of `cc/cost.mjs` (see `../COST-TEST.md`). Dollars are API-equivalent (the SDK's `total_cost_usd`); the run itself counts
against the plan, whose meters are read before and after with `claude -p /usage`. The full record of each run, answers included, is in `results/`.

| time | step | chunk | model | effort | min | turns | out tokens | total tokens | $ API-eq | window % | week % | Fable week % | pages | status | job |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-20 11:40 | sources | expulsion_b | claude-sonnet-5-5 | low | 2.1 | 13 | 5,272 | 181,852 | 0.40 | 9→10 | 35→35 | 62→62 | 11 | ok | `sources costa_rica expulsion_b claude-sonnet-5-5 low` |
| 2026-11-20 11:42 | verify | expulsion_b | claude-opus-5-5 | high | 4.21 | 23 | 19,848 | 2,161,118 | 1.84 | 10→12 | 35→36 | 62→62 | 14 | ok | `verify costa_rica expulsion_b claude-opus-5-5 high` |
| 2026-11-20 11:46 | forward | expulsion_b | claude-opus-5-5 | high | 3.73 | 19 | 14,180 | 1,422,839 | 1.53 | 12→13 | 36→36 | 62→62 | 16 | ok | `forward costa_rica expulsion_b claude-opus-5-5 high` |
| 2026-11-20 11:50 | forward | expulsion_b | claude-sonnet-5-5 | medium | 0.4 | 3 | 3,439 | 106,460 | 0.34 | 13→13 | 36→36 | 62→62 | 1 | ok | `forward costa_rica expulsion_b claude-sonnet-5-5 medium` |
| 2026-11-20 11:52 | forward | vulnerable | claude-opus-5-5 | high | 4.15 | 23 | 19,914 | 1,994,495 | 1.81 | 15→17 | 36→36 | 63→63 | 16 | ok | `forward costa_rica vulnerable claude-opus-5-5 high` |
| 2026-11-20 11:56 | forward | life | claude-opus-5-5 | high | 2.05 | 14 | 8,124 | 737,106 | 1.06 | 17→18 | 36→36 | 63→63 | 11 | ok | `forward costa_rica life claude-opus-5-5 high` |
| 2026-11-20 11:59 | forward | liberty_a | claude-opus-5-5 | high | 4.47 | 18 | 22,208 | 1,334,525 | 1.62 | 18→20 | 36→36 | 63→63 | 12 | ok | `forward costa_rica liberty_a claude-opus-5-5 high` |
| 2026-11-20 12:03 | forward | liberty_b | claude-opus-5-5 | high | 5.04 | 24 | 21,401 | 1,449,836 | 1.64 | 20→21 | 36→36 | 63→63 | 17 | ok | `forward costa_rica liberty_b claude-opus-5-5 high` |
| 2026-11-20 12:09 | forward | personhood | claude-opus-5-5 | high | 4.92 | 31 | 25,984 | 2,106,875 | 1.97 | 21→23 | 36→37 | 63→63 | 22 | ok | `forward costa_rica personhood claude-opus-5-5 high` |
| 2026-11-20 12:14 | forward | due_process | claude-opus-5-5 | high | 3.18 | 16 | 15,796 | 1,015,076 | 1.52 | 23→25 | 37→37 | 63→63 | 13 | ok | `forward costa_rica due_process claude-opus-5-5 high` |
| 2026-11-20 12:17 | forward | expulsion_a | claude-opus-5-5 | high | 7.16 | 31 | 29,077 | 2,744,529 | 2.14 | 25→27 | 37→37 | 63→63 | 20 | ok | `forward costa_rica expulsion_a claude-opus-5-5 high` |
| 2026-11-20 12:25 | forward | nationality_a | claude-opus-5-5 | high | 2.88 | 16 | 17,944 | 937,039 | 1.33 | 27→28 | 37→37 | 63→63 | 9 | ok | `forward costa_rica nationality_a claude-opus-5-5 high` |
| 2026-11-20 12:28 | forward | nationality_b | claude-opus-5-5 | high | 5.58 | 32 | 33,755 | 1,901,862 | 1.99 | 28→30 | 37→37 | 63→63 | 18 | ok | `forward costa_rica nationality_b claude-opus-5-5 high` |
| 2026-11-20 12:34 | forward | family | claude-opus-5-5 | high | 2.86 | 17 | 15,943 | 1,340,707 | 1.47 | 30→31 | 37→37 | 63→63 | 11 | ok | `forward costa_rica family claude-opus-5-5 high` |
| 2026-11-20 12:37 | forward | civil_liberties | claude-opus-5-5 | high | 3.31 | 23 | 24,459 | 1,097,085 | 1.53 | 31→33 | 37→37 | 63→63 | 15 | ok | `forward costa_rica civil_liberties claude-opus-5-5 high` |
| 2026-11-20 12:40 | forward | political | claude-opus-5-5 | high | 1.96 | 10 | 7,240 | 466,451 | 0.87 | 33→34 | 37→37 | 63→63 | 5 | ok | `forward costa_rica political claude-opus-5-5 high` |
| 2026-11-20 12:42 | forward | labor_a | claude-opus-5-5 | high | 3.64 | 23 | 22,099 | 1,560,953 | 1.69 | 34→35 | 37→38 | 63→63 | 15 | ok | `forward costa_rica labor_a claude-opus-5-5 high` |
| 2026-11-20 12:46 | forward | labor_b | claude-opus-5-5 | high | 3.07 | 20 | 15,195 | 1,817,961 | 1.62 | 35→37 | 38→38 | 63→63 | 15 | ok | `forward costa_rica labor_b claude-opus-5-5 high` |
| 2026-11-20 12:50 | forward | labor_c | claude-opus-5-5 | high | 3.72 | 25 | 20,822 | 1,323,879 | 1.53 | 37→39 | 38→38 | 63→63 | 17 | ok | `forward costa_rica labor_c claude-opus-5-5 high` |
