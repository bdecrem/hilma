# The weather page: one brief, four builders (Nov 25, 2026, OLA-435)

Bart asked the Mac Studio to build "a gorgeous hello world app that shows the weather in Palo Alto"
with the local Inkling 2 Mini model, then asked for the same from Claude and from Nemotron, to compare
time, tokens and quality. This folder holds what is needed to run it again.

- `task.txt`: the brief, the same words for every builder.
- `run-inkling.sh`: on the Studio as `ola`; starts an Inkling server on :8081 if none answers
  (that stops Nemotron's job, the two do not fit in memory together) and runs opencode on the brief.
- `serve-q4.sh [effort]`: the 4-bit Inkling on :8081, with an optional thinking level.
- `run-nemotron.sh`: the same brief against the Studio's model job on :8080.
- `speed-prompt.txt`: the one-shot prompt used for the speed and thinking-level measurements.
- `mlx-box-offline.sb`: the `sandbox-exec` profile the unreleased MLX code ran under (no network,
  no access to `~/.ola`, writes only in `~/mlx-test`).
- `scripts/shot-page.mjs <page> <out dir> [saved weather reply]` (repo root): phone and desktop
  screenshots. Open-Meteo timed out often that morning, so every page was shot with one saved reply.

After a run, put Nemotron back: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cx.ola.model.plist`.

## Results (one run each: the spread between two identical runs is not measured)

| Builder | Time | Model calls | Tokens written | Page |
|---|---|---|---|---|
| Inkling 2 Mini, 8-bit (28 GB) | 58 min | 61 | ~106,000 | works, polished |
| Inkling 2 Mini, 4-bit IQ4_NL (18 GB) | 30 min | 33 | ~61,000 | works; on desktop the moon covers the forecast |
| the same, reply cap 48,000 instead of 16,000 | 50 min | 35 | ~103,000 | works |
| Nemotron 3.5 Super 120B, Q4 (72 GB) | 20 min | 9 | ~25,000 to 30,000 | works; clouds over the text, a black curve on a dark sky, day names one day off |
| Claude Opus 5.5, in Claude Code | 2 min | 3 | ~5,000 of code (thinking not counted) | works |

The pages and screenshots are on the M1 iMac in `~/Desktop/Ola/hello-weather/` and on the Studio in
`~ola/hello-weather*/work/`.

## What was learned

1. **Inkling was running at its highest thinking level.** Its chat template takes `reasoning_effort`
   (none, minimal, low, medium, high) and defaults to high (0.9). On `speed-prompt.txt`: high wrote
   12,000 tokens and was cut off unfinished, medium 4,162, low 2,928, both complete.
   llama.cpp sets it per request (`reasoning_effort`) or for the server (`--reasoning-effort`).
2. **Where Inkling's tokens went (8-bit run):** about 60% thinking; the page written in chunks after
   the first whole-file reply hit the 16,000-token cap; 56 shell commands, mostly test rigs of its own.
3. **Raising the reply cap did not help.** A runaway reply simply ran to the new cap (47,945 tokens).
4. **Inkling checked its work, Nemotron did not.** Inkling found and fixed five bugs of its own;
   Nemotron took 9 steps, ran no test and shipped three visible faults.
5. **MLX against llama.cpp (4-bit Inkling, same prompts, on the Studio):** writing 49 against 51
   tokens a second; reading a 32,600-token prompt 1,675 against 457. MLX's Inkling support is
   mlx-lm pull request 2086: a draft by Jun Kim (Hugging Face, author of oMLX), unreviewed by the
   maintainers, and tool calling does not work through its server. Not usable for Ola yet.
6. **Tool failures cost steps:** a shell that rejected long here-documents, a file write that failed
   on large content, and no network from the shell.

## Not done (OLA-436, OLA-437, OLA-438, OLA-439)

- The weather page at medium and low thinking, three runs each, to learn the spread and the effect on quality.
- 4-bit Inkling through Ola's own checks beside Nemotron (the survey task passed 16 of 16 on the 8-bit).
- A ready-made page check for the agent (open the page, report errors, return a screenshot).
