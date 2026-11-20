# App problems: "build me ..." requests, scored per model

The other evals in `evals/` measure document and data tasks. This list is the other kind: a person
types one sentence asking for a small app, and we check, with a program, whether what came back
works. It started from a real failure (2026-11-18): Bart asked the Mac app, in a Local session,
"build me a smart app that uses ai to generate a crossword puzzle on demand"; Ola's own model built
something that did not show a grid, and Claude Code built one that worked.

Columns: **open weights** (Ola's everyday model, Nemotron 3.5 Super VL, rented), **Claude Code**
(Ola's `/claude` fallback), and **local** (empty until the Mac Studio serves the model, December).
The current table is `results/results.md`; one JSON per cell beside it.

## Files

| | |
|---|---|
| `problems.json` | the list: id, the request word for word, where it came from, `needs_ai`, what a working result must do in plain words |
| `checks/<id>.mjs` | the check: fixed sub-check names (`NAMES`) and `check(env, got)`, which uses the page like a person |
| `fixtures/<id>/good`, `fixtures/<id>/wrong` | a working solution and a plausible wrong one (the crossword's `good` is Claude Code's version from `~/Documents/coding2025/yola`, page files only) |
| `lib/harness.mjs` | finds the page, serves the folder, stubs every AI call, opens headless Chromium, takes the 1280x800 screenshot |
| `run.mjs` | runs a request, checks it, records it; `run-all.sh` runs the open-weights column |

## Run

```bash
node run.mjs selftest                 # every check: empty folder fails, wrong fixture fails, good passes
node run.mjs run crossword ola        # one request through the frozen Ola copy, then the check
node run.mjs check crossword <folder> --shot /tmp/x.png   # check any folder
node run.mjs recheck                  # check the latest run of every cell again (after fixing a check)
node run.mjs report                   # rebuild results/results.md
./run-all.sh                          # the open-weights column, two at a time
```

A run is `Ola --cli "<request>"` from `~/Library/Caches/ola-eval/Ola.app` (a frozen copy, never the
installed app), in a fresh folder under `~/Library/Caches/ola-eval/runs-apps/`, with its own
settings suite and support folder, so it is a Local session as on Bart's Mac with "Lots of
permissions" on. The model is reached through the tunnel on 127.0.0.1:14311. Default limit 15
minutes. The run gets no keys from the shell (only PATH, HOME and the like), `BROWSER=/usr/bin/true`,
and do-nothing `open`, `xdg-open` and `osascript` first on its PATH (put into the run's own
`support/web-tools`, which the app empties and refills at start and puts first on the agent's PATH),
so a model that tries to show its result opens nothing. After the run, every process whose working
folder is inside the run's folder (a server the model started and left running) is stopped by id.

**The Claude column is refused by `run.mjs`** (`--can-open-windows` overrides). Claude Code's runner
sets its own PATH (`ClaudeRunner.swift`, `~/.local/bin` first), so the stand-ins cannot reach it, and
on 2026-11-18 a Claude run opened its memory game in the browser on Bart's screen with `open`. It
also passes no model, so it ran on Bart's default model (Fable 5.2 that day); set `ANTHROPIC_MODEL`
in the run's environment to choose one. Those four runs are the Claude column today. To run it
again, it needs a way to keep `open` away from it first (an Ola option for the PATH, or a separate
macOS user).

## Add a problem from a real failure

1. Add an entry to `problems.json`: the request exactly as typed, `source: "real"`, who and when in
   `from`, and in `must` what a working result does, in plain words and numbers a check can test.
2. Write `checks/<id>.mjs`: a short fixed list of sub-check names, then drive the page as a person
   would (type, click buttons found by their words, reload) and set each name true only on what it
   proves. Helpers: `open`, `findInput`, `setField`, `clickText`, `readAll` (harness), `addEntry` (forms).
3. Before trusting it: `fixtures/<id>/good` (hand-written or a known working result) must pass every
   sub-check, an empty folder and `fixtures/<id>/wrong` (a plausible mistake, not junk) must fail.
   `node run.mjs selftest <id>`.
4. Run the columns, then look at every screenshot: a verdict the picture contradicts means the check
   is wrong; fix it, `recheck`, and say so in the commit.

## Problems from switches to Claude: a private set (OLA-157)

A request handed to Claude after Ola's own model tried is a failure to learn from. For a person who
stores their conversations, the Ola machine keeps it as a draft: `node frontdesk/admin.mjs switches
tasks --json` there gives the request word for word with both attempts, in this list's shape. A
request from a real project never goes into `problems.json` here (this repo is public): it goes into
a private set on the machine, a folder outside the repo with the same layout (`problems.json`,
`checks/`, `fixtures/`, `results/`), run with `OLA_APP_PROBLEMS_DIR=<folder> node run.mjs …` (every
command works on it; the runner refuses a folder inside the repo). A private check imports the
harness by its absolute path (`…/apps/activist-ai/evals/apps/lib/harness.mjs`). The Friday sweep
(`apps/venture/SWEEP.md`) fills it from the week's largest group of switches.

## Checks corrected after looking at the first screenshots (2026-11-18)

- crossword: Claude's app builds the grid in its own server; the check now runs a model's Node
  server (`lib/preload.mjs` stubs its AI calls, empty HOME, fake keys) and serves the files only
  when it does not start. Buttons are tried before links and each control once (a "New puzzle" nav
  link was clicked three times instead of "Generate puzzle").
- tip-split: "30.00Per person" (no space) was missed; the amount no longer needs a word boundary.
- signup-sheet: a "Sign up" link elsewhere on the page was clicked instead of the form's button;
  the field's own form's button now comes first.
- memory-game: exact screenshot hashes differed for the same face at other positions, and an
  average over the tile hid small emoji showing face up at the start; looks are now 16x16 cells
  compared cell by cell, and pairs are matched by closest look.

## Limits

- The check serves the folder with its own static server and never runs a server the model wrote
  (it could read a key and call a real model). Any request for a path that is not a file gets the
  stub's answer: one JSON with the same words in the shapes of Anthropic, OpenAI, Ollama, Gemini
  and a plain `{words: [...]}`. An app whose own server does more than pass the AI's words through
  (builds the grid server-side, streams) is checked against the stub, not its server.
- Pages found by name: `index.html`, the only html file, or the one whose name or title has a
  problem keyword, one or two folders deep. A canvas-drawn grid or game is not seen.
- Finding inputs and buttons by their words is a heuristic; an unusual layout can fail a working
  app. That is why every verdict is checked against its screenshot after a run.
- One run per cell: a single run says what happened once, not how often.
- The memory game check plays by screenshots of each tile and takes about a minute and a half.
