# The bigger models that fit the Mac Studio (OLA-482)

Bart, voice call Nov 26, 2026: find out how much memory the Studio has with Inkling 2 Mini unloaded
(about 100 GB, OLA-481), download every bigger model that fits, test them on hard tickets and a range
of coding tasks, "build a website, build a spreadsheet, then I can see those", and leave them
installed. The purpose: one big model for escalation by day and long work at night.

| what | where |
|---|---|
| which models, which build | `ops/studio/big-model.sh` (`list`), `tickets/models.json` (`studio-*`) |
| swap a model in and out on the Studio | `ops/studio/big-model.sh start <name>`, `use <name>`, `back` |
| five requests a person would make, easy to hard | `tasks.json`, run by `run.mjs` (website, memory game, a messy member list, a bug to find, the spreadsheet) |
| three tickets of our own tracker | `tickets/trial.mjs --lean` (small OLA-351, medium OLA-337, hard OLA-283) |
| the whole night, unattended | `ops/studio/big-models-night.sh` |

Scoring is by program: the app requests by `evals/apps`' checks, which use the page like a person;
the website by what it says, its form, script errors and whether it fits a phone (its look is for
Bart: `shot.png`, `shot-phone.png`); the data questions against `hidden/data-truth.json`; the bug by
28 hidden cases (`files/debug/formula.mjs` is the engine Inkling 2 Mini wrote on Nov 25, which passes
16). `node run.mjs --score <task> --folder <folder>` scores any folder; tried on a good and a bad
result for every task before the first run.

A model's page is opened over file:// with every other request refused, a model's code is run only
inside the run's sandbox, and a file that starts a server is never copied to where the checks look.
Qwen3.8-Flash-Next and DeepSeek V4 Flash are here on Bart's yes for this test (Nov 26); a Chinese
model in Ola itself still needs his yes each time.
