# The night town (OLA-527)

A little town in one web page that grows all night on the Mac Studio. Each round Qwen (Qwen3.8-Flash-Next, the
mayor, one chat call with a JSON answer) reads the town and hands out a few small, different jobs; Inkling 2 Mini
("Inkmini") builds them in opencode, three at a time, each in its own copy; a script with a headless browser and
no model judges each change (loads clean, runs two days, its check true, every earlier check still true, frame not
blank) and merges what passes into the town's git repository. Every job, kept or not, is one line in the journal.

Qwen and Inkmini do not fit in memory together, so the mayor works in turns: `big-model.sh start qwen`, one call,
`big-model.sh back`, then the builders. Qwen is used only here, behind the scenes, never in front of Ola's users.

- `seed/`: the starting town: `core.js` (map, clock, registry, helpers, test surface), `parts/` (ground, road,
  three houses, six people), `TOWN.md` (the API both models get every time), `check.js` (the checks without a
  browser, for the builders).
- `town.mjs`: the loop, the judge, status and report.

On the Studio (`ssh ola@100.100.60.59`, `export PATH=/opt/homebrew/bin:$PATH`, repo `~/big-test/hilma`;
Playwright lives in `~/night-town-tools`):

```sh
cd ~/big-test/hilma
nohup caffeinate -i node apps/night-town/town.mjs night --fresh --until 07:00 > ~/night-town.out 2>&1 &   # start
node apps/night-town/town.mjs status      # rounds, kept / rejected, the last five jobs, running or not
node apps/night-town/town.mjs stop        # ends after the jobs in progress, Ola's own model loaded
node apps/night-town/town.mjs report      # writes ~/night-town/REPORT.md (works on a partial night)
node apps/night-town/town.mjs look        # judge the town as it is and take a screenshot (no model)
```

`--minutes 30` instead of `--until` for a short run; `--jobs 6` jobs per mayor visit; `NIGHT_TOWN_DIR` for another
folder. In `~/night-town`: `town/` (the town, `git log` is its growth; open `town/index.html`), `journal.jsonl` (every
job: Qwen's words and check, the builder's minutes, steps, tokens, the diff's path, the verdict, the judge's output,
the kind of failure), `rounds.jsonl`, `night.log`, `shots/` (day and night after every round), `runs/` (each job's copy).

The night stops on its own at the time given, on `stop`, after three failed mayor turns in a row, with under 20 GB
of disk free, or if Ola's own model does not come back; it always puts Ola's own model back first.
