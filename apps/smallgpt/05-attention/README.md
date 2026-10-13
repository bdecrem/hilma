# 5 · Attention and the Transformer block

Two files:

- `model.py` — attention written out by hand (no PyTorch built-in): `Head`
  (query, key, value, the scaled dot product, the causal mask, softmax, the
  weighted sum), `MultiHead`, `MLP`, `Block` (attention + MLP on residual
  paths with layer norm), and `GPT` (token + position embeddings, N blocks,
  the output row of 8,192 logits). Every size is a number in `Config`; step 6
  runs this same file with bigger numbers.
- `train.py` — walks one head through one sentence and prints its weight
  table, trains a one-block model (4 heads, 128-wide vectors, windows of
  256, 2.3 M parameters) for 2,000 rounds, prints what the trained heads look
  at, draws `figures/attention.png` and `figures/loss.png`, samples, saves
  `out/block1.pt`.

```bash
cd apps/smallgpt
.venv/bin/python 05-attention/train.py     # ~6 minutes on the iMac's GPU
```

## How one head works

For a window of T tokens, each a vector of 128 numbers:

1. Three small matrices turn each vector into a query ("what am I looking
   for"), a key ("what I have") and a value ("what I pass along"), 32 wide.
2. Every query is dotted with every key: a T × T table of scores, "how
   relevant is token j to token i". Divided by √32 so softmax stays soft.
3. The mask sets every score above the diagonal to −∞: a token may look at
   itself and what came before, never ahead.
4. Softmax per row: the scores become weights that sum to 1.
5. Each token's output is the weighted sum of the values it looked at.

Four heads run side by side on the same input and their outputs are glued
together; a small MLP then works on each token alone. The block adds its
result to its input (residual) rather than replacing it, and layer norm
keeps the numbers in range. The final row of 8,192 logits, softmax and
cross-entropy are exactly step 4's — only the way the row is computed
changed.

## What we saw (2026-10-12)

```
model: 1 block, 4 heads, vectors of 128, windows of 256 = 2,328,064 parameters (the bigram had 67 M)

step     0  train 9.165  val 9.168
step   500  train 4.490  val 4.442
step  1000  train 3.914  val 4.086
step  2000  train 3.824  val 3.716   (310 s)

bigram: 4.19   one block: 3.716

head 1: '·He' looks at ·went 0.29, ·park 0.19, ·Sue 0.16
head 2: '·He' looks at ·He 0.58, ·to 0.12, . 0.12
```

- The untrained head's table (printed first) spreads each row's weight at
  random over the allowed columns; the mask shows as a triangle of dots.
- 2.3 M parameters beat the 67 M-number bigram: 3.72 against 4.19, and still
  falling at 2,000 rounds. Context is worth more than table size.
- `figures/attention.png`: the four trained heads have different habits.
  Head 2 is the "who is the subject" head: ` was`, ` happy`, ` and` after
  ` He` all look at ` He`; ` was`, ` sad` after ` she` look at ` she`. Head
  4 looks mostly at the previous token. Heads 1 and 3 keep looking back at
  ` Tim`, ` and`, ` Sue` from everywhere in the sentence.
- Samples now hold a thread for a few words: "named| Sarah. She loved very
  much. She loved to make flowers and drew pictures." "went to the park
  to| play and seek. Sue woke up and Sue." The Mac prompt still gets a story
  answer — one block, 2,000 rounds, 76% stories.
