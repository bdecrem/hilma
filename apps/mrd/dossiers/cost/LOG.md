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
