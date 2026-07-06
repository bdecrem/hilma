# agent-oracle (:2338) — THE ORACLE, hosted on the Mac mini

The same 1985-Usenet model the Plus runs locally, but served from the mini where
there's real compute. The Plus app reaches it via **Lab → Remote (mini)**; one
backend, two fronts (same pattern as the other `agent-*` services).

**Why hosted is better** (same model weights, no Plus constraints):
- **Instant** — numpy fp32 forward, no int8 / no-FPU slowness.
- **Chat memory** — each TCP connection keeps a rolling token context, so it
  remembers the last few turns (within the 256-token window).
- **Better sampling** — temperature + top-p (nucleus) + a repetition penalty
  that kills the "small small small" loops the raw model falls into.
- **Post-processing** — trims a trailing half-word and collapses immediate
  repetition, so replies read as finished thoughts.

## Protocol
Plus connects to `mini:2338`, sends `"<prompt>\n"`, reads the reply text until an
`EOT` byte (`0x04`). The connection is one conversation.

## Files
- `oracle_server.py` — the server (loads `model_q.bin` + `tok2048.model`).
- `model_q.bin` — v2 int8 checkpoint (tracked in git; swapped when a better
  same-voice model is trained). `tok2048.model` — sentencepiece tokenizer.

## Deploy (same as the rest of the fleet)
Push to `main`, then on the mini:
`bash ~/hilma-deploy/apps/macplus/backend/update.sh`
First launch builds a `.venv` with numpy + sentencepiece automatically
(`run-service.sh`'s `oracle)` case). Runs as LaunchAgent `sh.macplus.oracle`.

## Upgrading the model
Export a better-trained (same-voice) checkpoint to v2 int8, copy it over
`model_q.bin` (+ `tok2048.model` if the vocab changed), push, `update.sh`.
Bigger dims are fine here — the mini has the compute the Plus lacks.
