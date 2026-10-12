# smallgpt — building a GPT end to end, one step at a time

A learning project, started 2026-10-12. Bart builds a complete GPT at toy
scale and touches every mechanism along the way: the tokenizer,
backpropagation, attention, pretraining from random weights, SFT, preference
alignment (DPO, and the full reward-model + PPO recipe), and RLVR. The goal
is understanding, not a useful model.

The brief this came from is the Claude doc "Mini Frontier-Model Pipeline —
Brief for Claude Code" (2026-10-12).

## How this project works

- **The steps are in [PLAN.md](PLAN.md).** One step at a time, in order. A
  step starts only after Bart signs it off; nothing in a later step is built
  ahead of time.
- Each step gets its own folder, `NN-name/`, with the code and a README that
  explains what the code does and what to look at when it runs. Code is
  plain PyTorch written to be read, not a wrapper around a library — except
  where PLAN.md says a library (TRL) is the point.
- Every step ends with something Bart can see: a number going down, a plot,
  text coming out of the model. That is the proof the step worked.
- Data, checkpoints and virtual environments stay out of git (`data/`,
  `out/`, `.venv/` are ignored). Each README has the command that
  regenerates them.

## Where it runs

Toy scale: minutes-to-hours training loops. Two machines fit:

- **Mac mini M4, 16 GB** (Stanford, `admin@171.66.240.175`) — the brief's
  choice. Always on, so a multi-hour pretraining run doesn't tie up the
  iMac. Has a hilma checkout at `~/Documents/code/hilma`.
- **iMac M4** — fine for every step too, and quicker to iterate on.

PyTorch runs on Apple silicon through the `mps` backend. It is slower than
CUDA and some things are missing (bf16 matmuls in places, flash attention),
which doesn't matter at this scale.

## Three decisions made up front

- **BPE tokenizer on TinyStories, not character-level Shakespeare.**
  nanoGPT's Shakespeare config is character-level, so a word like "king" has
  no embedding to plot. TinyStories is a corpus small models visibly learn,
  and word-level embeddings exist.
- **The corpus is a mix: TinyStories + 1980s Usenet, about 3:1** (decided at
  step 2, 2026-10-12). The persona Bart wants at the end is a semi-sane coder
  from 1985 stuck inside a Mac Plus. The voice goes in at SFT/DPO, but the
  tokenizer and the base model need to have seen "SCSI" and "Macintosh", so
  the Oracle's cleaned Usenet corpus (`apps/macplus/drunk85/data/`) is in the
  pretraining pile. Vocabulary 8,192 — at 4,096 "queen", "Macintosh" and
  "unix" were still in pieces.
- **About 10M parameters, not 124M.** GPT-2 small on an M4 is days of
  pretraining; 10M is an afternoon. Scaling up is the last, optional step.
- **GRPO for RLVR; reward model + PPO is optional.** TRL's PPO trainer has
  been rewritten twice and is the shakiest tool in the chain. GRPO is stable
  and is what current labs use.
