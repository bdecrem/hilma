# 01 — a constitution as a system prompt

Question: does a written constitution change how the local 9B model
answers, when it is only a system prompt? This is the baseline. Later
explorations try to train the same principles in and compare against this.

- `constitution.md` — v0, ten principles. Drawn from how Bart wants to be
  talked to (the rules in `~/.claude/CLAUDE.md`), turned into rules for a
  model.
- `probes.json` — ten prompts, each baiting one principle (a hedge, a
  flattery opening, a caveat, a task that should be done rather than
  planned, one that is blocked, one to refuse).
- `run.mjs` — runs each probe bare and with the constitution, writes a
  side-by-side report to `out/`.

Run against the mini:

```
ssh -f -N -L 11435:localhost:11434 admin@171.66.240.175
OLLAMA=http://localhost:11435 MODEL=qwen3.5:9b node apps/openlab/01-constitution/run.mjs
```

Results are in `out/` and summarized in the project log.
