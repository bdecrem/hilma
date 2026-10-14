# 6 · Pretraining the GPT

Two files:

- `train.py` — step 5's `model.py` with bigger numbers (6 blocks, 8 heads,
  vectors of 320, windows of 256; the output head shares the embedding
  table, as GPT-2 does: 10,096,000 parameters) and the training loop everyone
  uses: AdamW with the learning rate warmed up over 500 rounds and then
  decayed on a cosine to a tenth, weight decay on the matrices, gradients
  clipped at 1.0, train + val loss every 200 rounds, three samples and a
  checkpoint every 1,000 rounds, all appended to `out/pretrain/log.jsonl`.
  Two passes over the 99 M training tokens = 12,099 rounds of 64 × 256.
  `--resume` continues from the last checkpoint.
- `report.py` — reads the log, prints the samples at every checkpoint,
  draws `figures/loss.png`. Works while the run goes.

```bash
cd apps/smallgpt
nohup .venv/bin/python -u 06-pretrain/train.py > out/pretrain/run.log 2>&1 &
.venv/bin/python 06-pretrain/report.py
```

The run is on the Mac mini (`admin@171.66.240.175`, same checkout, the token
files copied over with scp); `out/pretrain/final.pt` comes back here for the
steps after this one.

## Two things that were wrong on the first try

- PyTorch's default embedding init is N(0, 1). With the output head tied to
  the embedding table, the first logits were enormous and the loss started at
  211 instead of 9; the samples were "named named named named". GPT-2's init
  — every weight N(0, 0.02), biases 0 — is now in `model.py`.
- Three passes over the data would have been 7 hours; two is 200 M tokens,
  about the right amount for a 10 M model (twenty tokens per parameter), and
  a working afternoon.

## What we saw

12,099 rounds in 3.1 hours on the mini (0.92 s a round). Loss: 9.07 at round
0, 4.93 at 200, 3.09 at 1,000, 2.52 at 2,000, 2.28 at 6,000, 2.08 at the end
(train 2.03 / val 2.08). The bigram's 4.19 and the one-layer model's 3.72
were both passed before round 400. Train and val never separated — two passes
over 99 M tokens is nowhere near enough to memorize anything.

The samples, same three prompts every 1,000 rounds (all in
`out/pretrain/log.jsonl`, printed by `report.py`):

- Round 0: `named|econd.)  �ass pear pur programmers evening forget col crawled`
- Round 1,000: `named| Amy. Amy liked to draw. She would make painted inside the fireworks now.`
- Round 2,000: `named| Mia. She had a cat named Max. Mia and Max liked to play together. One day, Mia and Max were playing in the park.`
- Round 12,099: `park to| play. They saw a big slide and wanted to slide. Tim said, "Let's race to the point at the right time!" Sue said, "Yes, let's go!"`

The Usenet quarter of the corpus comes out when the prompt is a Mac:
`problem is| that no one wants to do the bug. The bug contains bad several
manuals. It has no idea how to do it like RFS disk so it can't fit in AFS` —
the vocabulary of 1985, not yet its sentences. Stories are the easier three
quarters of the data and the model is much better at them.

`out/pretrain/final.pt` (53 MB) is the base model for every step after this.
