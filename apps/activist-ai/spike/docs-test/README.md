# The documents test and three users at once (OLA-442)

Inkling 2 Mini under MTPLX on the Mac Studio (M5 Max, 128 GB), Nov 25, 2026. One run each.
Setup as in `../weather/README.md`: plain OpenCode talking to `mtplx serve`, thinking on medium, none of Ola's own code.

## The documents test

`make-minutes.py <dir> 7` writes 40 made-up council minutes and an answer key (24 housing votes, 16 passed,
8 failed, Tollefsen the most frequent no; three ways of writing a vote, amendments, items discussed without
a vote, votes on other subjects). The key never goes to the machine under test. `task.txt` is the brief;
`score.py <key.json> <votes.json>` counts what is right.

| Run | Votes fully right | Totals right | Time | Notes |
|---|---|---|---|---|
| Compressed pack, beside Ola's Nemotron | 24 of 24 | 4 of 4 | 6 min 13 s | 5 requests refused for memory; report page fine on a phone |
| Official weights, beside Nemotron | 24 of 24 | 4 of 4 | answers after about 6 min | 10 refusals, then OpenCode hung before the report page; stopped by hand after 68 min |
| Official weights, Nemotron paused, as one of three users | 24 of 24 | 4 of 4 | 21 min 15 s | no refusals |

"Fully right" means the date, the result and all seven members in the right list. Three perfect scores also
mean this test is too easy to tell the packs apart; a harder one needs messier documents.

## Memory: not beside Nemotron

Nemotron holds about 74 GB. With it loaded, MTPLX refuses requests (HTTP 507, "insufficient memory") even
with `--memory-limit 22G` / `28G`, and one run hung on the retries. Ola's watcher logged "memory ran low"
four times (a warning, never a text). With Nemotron paused there were no refusals in 21 minutes of three
concurrent runs. One model at a time on this machine.

## Three users at once

`../weather/mtplx/three-users.sh a Optimized-Quality 90G`: one server on the official weights with MTPLX's
defaults (requests are served one at a time, the rest wait), three OpenCode runs started together.

| Run | Alone | As one of three |
|---|---|---|
| Weather page | 5 min 0 s | 20 min 40 s |
| Paper Boat game | 11 min 36 s (with 10 memory refusals) | 19 min 30 s |
| Council minutes | about 6 min | 21 min 15 s |

All three finished, with no errors. The times are about the three jobs added together: nothing is gained or
lost by sharing, each person just waits for the others. Ola's own checks ran on the Studio for part of the
window (small VMs, no model), so the times read a little slow. The batched mode (`--scheduler-mode ar_batch`)
was not tried.

Afterwards Nemotron was started again and Ola's model check passed (200, a tool call).
