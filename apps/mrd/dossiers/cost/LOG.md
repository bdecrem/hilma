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
| 2026-11-20 12:54 | forward | health_housing | claude-opus-5-5 | high | 3.11 | 23 | 13,888 | 1,183,951 | 1.34 | 39→40 | 38→38 | 63→63 | 18 | ok | `forward costa_rica health_housing claude-opus-5-5 high` |
| 2026-11-20 12:57 | forward | education | claude-opus-5-5 | high | 4.41 | 22 | 18,703 | 1,337,631 | 1.54 | 40→42 | 38→38 | 63→63 | 15 | ok | `forward costa_rica education claude-opus-5-5 high` |
| 2026-11-20 13:02 | forward | expulsion_b | claude-opus-5-5 | medium | 3.4 | 12 | 9,220 | 944,577 | 1.20 | 42→43 | 38→38 | 63→63 | 9 | ok | `forward costa_rica expulsion_b claude-opus-5-5 medium` |
| 2026-11-20 13:05 | forward | expulsion_b | claude-sonnet-5-5 | high | 1.44 | 14 | 13,862 | 670,647 | 0.63 | 43→44 | 38→38 | 63→63 | 9 | ok | `forward costa_rica expulsion_b claude-sonnet-5-5 high` |
| 2026-11-20 13:07 | back | expulsion_b | claude-opus-5-5 | high | 5.03 | 21 | 22,443 | 1,670,313 | 1.76 | 44→60 | 38→40 | 63→65 | 15 | ok | `back costa_rica expulsion_b claude-opus-5-5 high` |
| 2026-11-20 13:12 | back | expulsion_b | claude-opus-5-5 | medium | 2 |  | 0 | 0 | 0.00 | 60→66 | 40→40 | 65→66 | 5 | stopped | `back costa_rica expulsion_b claude-opus-5-5 medium` |
| 2026-11-20 16:13 | forward | vulnerable · argentina | claude-opus-5-5 | high | 47.8 | 27 | 22,500 | 1,814,022 | 1.67 | 6→11 | 44→44 | 67→67 | 18 | ok | `forward argentina vulnerable claude-opus-5-5 high` |
| 2026-11-20 16:13 | forward | vulnerable · chile | claude-opus-5-5 | high | 47.79 | 30 | 26,917 | 1,881,120 | 1.72 | 6→11 | 44→44 | 67→67 | 18 | ok | `forward chile vulnerable claude-opus-5-5 high` |
| 2026-11-20 17:03 | forward | life · argentina | claude-opus-5-5 | high | 13.76 | 18 | 12,525 | 1,004,526 | 1.12 | 11→13 | 44→44 | 67→67 | 12 | ok | `forward argentina life claude-opus-5-5 high` |
| 2026-11-20 17:03 | forward | life · chile | claude-opus-5-5 | high | 20.7 | 26 | 25,614 | 1,845,960 | 1.78 | 11→15 | 44→45 | 67→67 | 17 | ok | `forward chile life claude-opus-5-5 high` |
| 2026-11-20 17:17 | forward | liberty_a · argentina | claude-opus-5-5 | high | 13.38 | 20 | 19,516 | 1,168,950 | 1.33 | 13→16 | 44→45 | 67→67 | 12 | ok | `forward argentina liberty_a claude-opus-5-5 high` |
| 2026-11-20 17:24 | forward | liberty_a · chile | claude-opus-5-5 | high | 24.29 | 26 | 29,037 | 1,734,995 | 1.67 | 15→18 | 45→45 | 67→67 | 15 | ok | `forward chile liberty_a claude-opus-5-5 high` |
| 2026-11-20 17:32 | forward | liberty_b · argentina | claude-opus-5-5 | high | 17.82 | 24 | 20,604 | 634,658 | 0.86 | 16→18 | 45→45 | 67→67 | 16 | ok | `forward argentina liberty_b claude-opus-5-5 high` |
| 2026-11-20 18:24 | forward | liberty_b · chile | claude-opus-5-5 | high | 0.25 |  | 0 | 0 | 0.00 | 21→21 | 45→45 | 67→67 | 1 | stopped | `forward chile liberty_b claude-opus-5-5 high` |
| 2026-11-20 17:49 | forward | liberty_b · chile | claude-opus-5-5 | high | 36.62 | 28 | 22,385 | 1,886,302 | 1.57 | 18→25 | 45→45 | 67→67 | 19 | ok | `forward chile liberty_b claude-opus-5-5 high` |
| 2026-11-20 18:24 | forward | personhood · argentina | claude-opus-5-5 | high | 26.57 | 34 | 31,602 | 1,980,046 | 1.83 | 21→32 | 45→46 | 67→67 | 20 | ok | `forward argentina personhood claude-opus-5-5 high` |
| 2026-11-20 18:24 | forward | due_process · chile | claude-opus-5-5 | high | 28.18 | 29 | 33,163 | 1,991,214 | 1.95 | 21→35 | 45→46 | 67→67 | 17 | ok | `forward chile due_process claude-opus-5-5 high` |
| 2026-11-20 18:24 | forward | personhood · chile | claude-opus-5-5 | high | 32.94 | 38 | 32,215 | 2,817,150 | 2.07 | 21→37 | 45→47 | 67→67 | 21 | ok | `forward chile personhood claude-opus-5-5 high` |
| 2026-11-20 18:24 | forward | due_process · argentina | claude-opus-5-5 | high | 35.67 | 55 | 46,078 | 4,892,724 | 3.10 | 21→39 | 45→47 | 67→67 | 36 | ok | `forward argentina due_process claude-opus-5-5 high` |
| 2026-11-20 18:24 | forward | expulsion_a · argentina | claude-opus-5-5 | high | 37.34 | 36 | 46,365 | 2,549,659 | 2.46 | 21→42 | 45→47 | 67→67 | 25 | ok | `forward argentina expulsion_a claude-opus-5-5 high` |
| 2026-11-20 18:51 | forward | expulsion_b · argentina | claude-opus-5-5 | high | 12.01 | 32 | 32,719 | 2,509,454 | 2.25 | 32→44 | 46→47 | 67→67 | 23 | ok | `forward argentina expulsion_b claude-opus-5-5 high` |
| 2026-11-20 18:26 | forward | expulsion_a · chile | claude-opus-5-5 | high | 37.76 | 41 | 57,296 | 2,896,347 | 2.81 | 25→44 | 45→47 | 67→67 | 28 | ok | `forward chile expulsion_a claude-opus-5-5 high` |
| 2026-11-20 18:53 | forward | nationality_a · chile | claude-opus-5-5 | high | 16.25 | 30 | 25,771 | 2,100,279 | 1.39 | 35→46 | 46→47 | 67→67 | 21 | ok | `forward chile nationality_a claude-opus-5-5 high` |
| 2026-11-20 19:04 | forward | family · argentina | claude-opus-5-5 | high | 22.69 | 19 | 22,730 | 1,310,095 | 1.52 | 44→52 | 47→48 | 67→67 | 12 | ok | `forward argentina family claude-opus-5-5 high` |
| 2026-11-20 19:00 | forward | nationality_a · argentina | claude-opus-5-5 | high | 26.34 | 26 | 26,774 | 1,914,690 | 1.72 | 39→52 | 47→48 | 67→67 | 16 | ok | `forward argentina nationality_a claude-opus-5-5 high` |
| 2026-11-20 19:04 | forward | nationality_b · chile | claude-opus-5-5 | high | 23.85 | 29 | 25,189 | 2,007,127 | 1.33 | 44→54 | 47→48 | 67→67 | 21 | ok | `forward chile nationality_b claude-opus-5-5 high` |
| 2026-11-20 18:58 | forward | expulsion_b · chile | claude-opus-5-5 | high | 41.73 | 47 | 37,172 | 3,528,800 | 2.43 | 37→58 | 47→48 | 67→67 | 33 | ok | `forward chile expulsion_b claude-opus-5-5 high` |
| 2026-11-20 19:02 | forward | nationality_b · argentina | claude-opus-5-5 | high | 37.29 | 48 | 37,137 | 3,934,515 | 2.56 | 42→58 | 47→48 | 67→67 | 31 | ok | `forward argentina nationality_b claude-opus-5-5 high` |
| 2026-11-20 19:28 | forward | political · chile | claude-opus-5-5 | high | 12.74 | 20 | 15,056 | 935,516 | 1.12 | 54→58 | 48→48 | 67→67 | 13 | ok | `forward chile political claude-opus-5-5 high` |
| 2026-11-20 19:40 | forward | political · argentina | claude-opus-5-5 | high | 1.93 | 13 | 9,054 | 482,916 | 0.86 | 58→63 | 48→49 | 67→67 | 9 | ok | `forward argentina political claude-opus-5-5 high` |
| 2026-11-20 19:14 | forward | civil_liberties · chile | claude-opus-5-5 | high | 27.77 | 45 | 32,599 | 2,905,489 | 2.18 | 46→63 | 47→49 | 67→67 | 36 | ok | `forward chile civil_liberties claude-opus-5-5 high` |
| 2026-11-20 19:27 | forward | labor_a · argentina | claude-opus-5-5 | high | 15.17 | 22 | 28,015 | 986,207 | 1.57 | 52→63 | 48→49 | 67→67 | 14 | ok | `forward argentina labor_a claude-opus-5-5 high` |
| 2026-11-20 19:27 | forward | civil_liberties · argentina | claude-opus-5-5 | high | 15.1 | 21 | 26,740 | 1,461,752 | 1.58 | 52→63 | 48→49 | 67→67 | 13 | ok | `forward argentina civil_liberties claude-opus-5-5 high` |
| 2026-11-20 19:41 | forward | labor_c · chile | claude-opus-5-5 | high | 24.26 | 20 | 14,186 | 998,375 | 1.12 | 61→? | 48→? | 67→? | 14 | ok | `forward chile labor_c claude-opus-5-5 high` |
| 2026-11-20 19:40 | forward | family · chile | claude-opus-5-5 | high | 42.04 | 31 | 33,647 | 2,612,472 | 2.12 | 58→69 | 48→49 | 67→67 | 19 | ok | `forward chile family claude-opus-5-5 high` |
| 2026-11-20 19:51 | forward | health_housing · argentina | claude-opus-5-5 | high | 38.18 | 20 | 18,556 | 1,351,694 | 1.31 | 63→70 | 49→49 | 67→67 | 12 | ok | `forward argentina health_housing claude-opus-5-5 high` |
| 2026-11-20 19:51 | forward | labor_b · argentina | claude-opus-5-5 | high | 39.28 | 32 | 23,510 | 2,298,566 | 1.78 | 63→71 | 49→49 | 67→67 | 22 | ok | `forward argentina labor_b claude-opus-5-5 high` |
| 2026-11-20 19:51 | forward | labor_c · argentina | claude-opus-5-5 | high | 40 | 30 | 25,696 | 1,808,833 | 1.51 | 63→71 | 49→49 | 67→67 | 20 | ok | `forward argentina labor_c claude-opus-5-5 high` |
| 2026-11-20 20:31 | forward | education · argentina | claude-opus-5-5 | high | 23.28 | 23 | 14,734 | 1,092,064 | 1.15 | 71→74 | 49→50 | 67→67 | 14 | ok | `forward argentina education claude-opus-5-5 high` |
| 2026-11-20 20:29 | forward | labor_a · chile | claude-opus-5-5 | high | 26.31 | 30 | 26,708 | 2,168,713 | 1.69 | 70→74 | 49→50 | 67→67 | 19 | ok | `forward chile labor_a claude-opus-5-5 high` |
| 2026-11-20 21:00 | forward | health_housing · chile | claude-opus-5-5 | high | 6.41 | 26 | 18,358 | 1,236,731 | 1.28 | 0→2 | 50→50 | 68→68 | 18 | ok | `forward chile health_housing claude-opus-5-5 high` |
| 2026-11-20 21:08 | back2000 | life · argentina | claude-opus-5-5 | high | 21.88 | 20 | 17,505 | 1,068,550 | 1.30 | 2→? | 50→? | 68→? | 14 | ok | `back2000 argentina life claude-opus-5-5 high` |
| 2026-11-20 21:08 | back2000 | life · chile | claude-opus-5-5 | high | 48.83 | 21 | 18,058 | 1,497,636 | 1.31 | 2→15 | 50→51 | 68→68 | 12 | ok | `back2000 chile life claude-opus-5-5 high` |
| 2026-11-20 21:08 | back2000 | liberty_a · argentina | claude-opus-5-5 | high | 52.62 | 29 | 21,652 | 1,756,337 | 1.58 | 2→18 | 50→52 | 68→68 | 20 | ok | `back2000 argentina liberty_a claude-opus-5-5 high` |
