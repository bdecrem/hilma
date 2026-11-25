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
| the same 4-bit, thinking on medium (cap 16,000) | 15 min | 23 | ~33,000 | works; day names one day off, the 12-hour chart too tall on desktop |
| Nemotron 3.5 Super 120B, Q4 (72 GB) | 20 min | 9 | ~25,000 to 30,000 | works; clouds over the text, a black curve on a dark sky, day names one day off |
| Claude Opus 5.5, in Claude Code | 2 min | 3 | ~5,000 of code (thinking not counted) | works |

The pages and screenshots are on the M1 iMac in `~/Desktop/Ola/hello-weather/` and on the Studio in
`~ola/hello-weather*/work/`.

## What was learned

1. **Inkling was running at its highest thinking level.** Its chat template takes `reasoning_effort`
   (none, minimal, low, medium, high) and defaults to high (0.9). On `speed-prompt.txt`: high wrote
   12,000 tokens and was cut off unfinished, medium 4,162, low 2,928, both complete.
   llama.cpp sets it per request (`reasoning_effort`) or for the server (`--reasoning-effort`).
   On the weather page, medium halved both time and tokens against high (15 min and ~33,000 against
   30 min and ~61,000) and the page is about as good. One run each.
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

## MTPLX: the same model on a faster engine (Nov 25, 2026, OLA-440)

Bart asked how fast Inkling 2 Mini can run on the Studio apart from Ola. MTPLX 2.13.3 (one
developer's MLX engine, Apache 2.0) uses the draft head the model ships with, so it writes several
tokens per step. Run on the Studio's `admin` account, Ola's model loaded beside it the whole time.

- `mtplx/serve.sh <pack> [effort] [flags]`: one pack on 127.0.0.1:8000 (`Bare-Speed`, `Optimized-Quality`).
- `mtplx/speed.mjs <prompt file> …`: times one request at the client (first token, tokens a second).
- `mtplx/run-page.sh <name>`: the weather brief through OpenCode 2.3.2, the settings of `run-inkling.sh`.

| | llama.cpp, 4-bit (Nov 24) | MTPLX Bare Speed (16 GB) | MTPLX Optimized Quality (20 GB, the official weights) |
|---|---|---|---|
| Writing, speed prompt, thinking medium | 51 tok/s | 119, 115, 121 tok/s | 99, 96, 98 tok/s |
| The same with the draft head off | | 66, 66 tok/s | |
| Reading a long prompt | 457 tok/s (32,600 tokens) | 1,810, 1,907, 1,890 tok/s (39,800 tokens) | 1,893, 1,926, 1,926 tok/s |
| Weather page: time | 15 min | 5 min 25 s | 5 min 0 s |
| Weather page: model calls, tokens written | 23, ~33,000 | 18, 33,177 | 25, 25,285 |
| Weather page: speed while writing | | 100 tok/s | 86 tok/s |
| The page | works; day names one day off, chart too tall | works; the moon sits behind the big temperature | works; the moon covers "Overcast" and the update time |

Page builds are one run each. Two conditions differ from Nov 24: the shell had network (the model
fetched the live weather reply itself), and MTPLX samples at temperature 1.0.

What was learned:

1. **The developer's speed claims hold on this machine.** He lists 128.8 tok/s at peak for Bare
   Speed and 103.8 for Optimized Quality on an M5 Max; over whole 4,000 to 5,000-token answers the
   Studio wrote 115 to 121 and 96 to 99.
2. **The draft head is most of it.** With it off the same engine writes 66 tok/s: 1.8 times from the
   draft head, 1.3 times from the engine against llama.cpp.
3. **Beside Ola's model it needs a memory cap.** Left to its own plan (90 GB) it refused a request
   for lack of memory on the first page build. With `--memory-limit 22G` (Bare Speed) and `28G`
   (Optimized Quality) both builds finished; the second had one request refused and retried.
   Ola's model job kept the same process throughout.
4. `mtplx start` on a 128 GB Mac offers Qwen models first: always name the Inkling pack.
5. `mtplx inspect <repo id>` reports on the copy on Hugging Face and says "cannot run"; give it the
   local folder.

On the Studio: packs in `~admin/.mtplx/models` (36 GB), everything else in `~admin/mtplx-test`
(`results.jsonl`, the server logs, both pages). Pages and screenshots on the M1 iMac in
`~/Desktop/Ola/hello-weather/inkling-mtplx-bare` and `inkling-mtplx-quality`.

## Not done (OLA-436, OLA-437, OLA-438, OLA-439)

- The weather page at medium and low thinking, three runs each, to learn the spread and the effect on quality.
- 4-bit Inkling through Ola's own checks beside Nemotron (the survey task passed 16 of 16 on the 8-bit).
- A ready-made page check for the agent (open the page, report errors, return a screenshot).
