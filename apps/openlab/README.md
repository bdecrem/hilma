# Openlab — open-source AI explorations

Started 2026-09-14. Runs to 2027-03-14.

## The goal

In six months: a solid working understanding of what can be built with
open-weights AI, and one meaningful thing built with it. Candidate endings:

- a model trained on a specific corpus of our own choosing, that is
  measurably better at that thing than the base model, or
- a model shaped by our own constitution (a written set of principles,
  trained in rather than prompted in), or
- something we discover along the way that is more interesting than either.

"Meaningful" means: we can show it to someone, it does something the base
model does not, and we can say how we know.

## The box

In:
- Open-weights models (Qwen, Gemma, Llama, Mistral, gpt-oss, and whatever
  ships this winter). Local first; cloud GPUs when training needs them.
- The whole stack, one layer at a time: inference and quantization, prompting
  and system-level steering, evals (how do we know it got better), data
  (building a corpus), fine-tuning (LoRA / SFT / DPO), and the constitutional
  loop (model critiques and revises its own outputs against written
  principles, then trains on the result).
- Agents on local models: can a 9B model on a Mac mini run a real tool loop.

Out:
- Anything that is really a product on a frontier API. That is the rest of
  hilma.
- Pre-training from scratch beyond toy scale (the autoresearch swarm covers
  the toy scale).
- Buying hardware before an experiment has demanded it.

## Hardware

- Mac mini M4, 16 GB, at Stanford (`admin@171.66.240.175`). Ollama 0.33
  with `qwen3.5:9b`. 16 GB caps local inference at roughly 12 GB models:
  the good open agentic coders of September 2026 (Laguna XS 2.1, North Mini
  Code, Qwen 3.6 35B-A3B) need 20 GB and up. 115 GB disk free as of today.
- This iMac M4 for scripts and harnesses.
- Cloud GPUs (Together was used in March, about $15 for a run) when training.

## Prior work

- March 2026: `docs/creative-model-plan.md`. LoRA fine-tune of Llama 3.1 8B
  on 91 literary passages (hilma-writer v1 to v4). Result: mostly generic
  text; base pre-training swamped the tune. Lessons in that doc (continued
  pre-training over SFT, LoRA on all layers plus embeddings, 500+ curated
  passages). The models were deleted from the mini 2026-09-14.
- `~/autoresearch-at-home` on the mini: Apple-Silicon fork of the
  collaborative small-model training swarm.

## Explorations

Each one is a numbered folder here with its own README, runnable code, and
outputs under `out/`. The number is the order they happened, not a plan.

| # | Folder | Question |
|---|--------|----------|
| 01 | `01-constitution/` | Does a written constitution change how the local 9B model answers, when it is only a system prompt? Baseline for everything after. |

Next in line (not started):
- An eval: a fixed probe set and a scoring rule, so "better" is a number.
- A real agent loop on the local model: tools, files, a multi-step task.
- A corpus: pick the thing the final model should be good at, build 500+
  clean examples.
- The constitutional loop: generate, critique against the constitution,
  revise, train on the revisions. Compare to the prompted version from 01.

## Log

- 2026-09-14 — Project opened. Freed 100 GB on the mini (old writer models,
  caches). Surveyed the field: on 16 GB, `qwen3.5:9b` is about the ceiling.
  Built 01.
  Result (`01-constitution/out/2026-09-14-qwen3.5-9b.md`): the constitution
  as a system prompt cuts the 9B's output 4.4x (1896 words bare across ten
  probes, 433 with it) and removes the flattery openers, emoji, bullet
  dumps and closing offers outright. It also over-applies: the one probe that
  asked for depth got four sentences, and the yes/no money question flipped
  from "No" to a hedged "Yes". Principle 3's "unless the person asks for
  depth" is not being honoured by a 9B on a prompt alone. That gap is the
  first thing training should close. Speed: about 11 tok/s on the mini.

## The chat page

hilma-nine.vercel.app/openlab is a chat with the mini's model under the
constitution. How it is wired:

- Mini: `apps/openlab/chat/mini-proxy.mjs` (launchd `com.openlab.proxy`,
  port 11440) is a bearer-token gate in front of Ollama; token in
  `~/.openlab.env` on the mini (chmod 600). `sh.tunn3l.openlab-mini` exposes
  it as https://openlab-mini.tunn3l.sh (`/health` is open, `/api/*` needs the
  token). Both plists live in `apps/openlab/chat/` and are installed in
  `~/Library/LaunchAgents/`; the proxy runs from `~/hilma-deploy`, so pull
  there after changing it.
- Vercel: `src/app/api/openlab/chat/route.ts` reads
  `01-constitution/constitution.md` (traced into the function via
  `outputFileTracingIncludes` in next.config.ts), prepends it as the system
  prompt, calls the proxy with `OPENLAB_MINI_URL` / `OPENLAB_MINI_TOKEN` (set
  in Vercel production and `.env.local`), streams the text back.
  `OPENLAB_MODEL` overrides `qwen3.5:9b`.
- Page: `src/app/openlab/Chat.tsx`, warm-paper look, phone first. Behind a
  passcode (`OPENLAB_PASSCODE`, Vercel production and `.env.local`): the
  gate in `Gate.tsx` posts to `/api/openlab/auth`, which sets a year-long
  httpOnly cookie holding a hash of the passcode (`src/lib/openlab/auth.ts`);
  the chat route and `/openlab/about` (this README, rendered) check it.

Editing `constitution.md` changes the chat on the next deploy, and the
baseline in 01 on the next run.
