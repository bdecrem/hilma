# 4 · The simplest language model (bigram)

One file, `train.py`. The model is one table: 8,192 rows (one per token) by
8,192 columns (one per possible next token), 67 million numbers. Row *i* is
token *i*'s scores — logits — for everything that could come next. That is
the whole model: the current token looks up its row, and the row is the
prediction. It never sees anything before the current token.

```bash
cd apps/smallgpt
.venv/bin/python 04-bigram/train.py     # ~8 minutes on the iMac's GPU
```

What the script does, in order:

1. Takes one position from one batch and does the loss by hand: softmax the
   row into 8,192 probabilities, look up the one the real next token got, take
   minus its log. Prints that next to PyTorch's `cross_entropy`, which is the
   same number.
2. Samples 40 tokens from the untrained table (noise).
3. Trains: 3,000 rounds of batch → loss → `backward()` → nudge, with AdamW at
   learning rate 0.01, 64 fragments of 256 tokens per round. Every 100 rounds
   it prints the loss on a training batch and on 20 validation batches.
4. Samples three times from the trained table, prints the five most likely
   next tokens for ` the`, ` Tim`, ` Macintosh`, ` Once` and `.`, writes
   `figures/loss.png` and the table to `out/bigram.pt` (gitignored).

## What we saw (2026-10-12)

```
one position: x='Sure' -> real next ' enough'
  the random model gives the right answer p = 0.000050  (1/8192 = 0.000122)
  -log(p) = 9.904;  torch's cross_entropy = 9.904;  ln(8192) = 9.011

step     0  train 9.502  val 9.488
step   500  train 5.341  val 5.361
step  1000  train 4.481  val 4.572
step  2000  train 4.305  val 4.304
step  3000  train 4.148  val 4.190   (445 s)

  ' Tim'   -> ' was' 0.144, '.' 0.119, ' and' 0.111, "'s" 0.056, ' went' 0.046
  ' Once'  -> ' upon' 0.088, ' the' 0.015, ' you' 0.012
  '.'      -> ' They' 0.135, ' He' 0.126, ' The' 0.113, ' She' 0.105
```

- Before training the right next token gets about 1/8,192 of the probability
  and the loss sits near ln(8,192) = 9.01: pure guessing. The by-hand loss
  and PyTorch's agree to the third decimal.
- The loss falls fast for the first ~500 rounds, then slowly, and levels off
  around 4.2. One token of context cannot do better; that is the ceiling of
  this model, not of the data. Train and val stay together: 67 million
  numbers, 100 million tokens, nothing to memorize.
- The samples (`figures/loss.png`, full output in `step4-bigram-output.txt`
  on the Desktop) are gibberish with the corpus's flavor: "Once upon tie the
  stranger", "a big and cheerful little girl named Tim was safe". Each token
  is plausible after the one before it and nothing beyond that.
- ` Macintosh` is a rare token, so its row saw few updates; ` software` is
  its best guess at 1%.

## The point

Logits, softmax, cross-entropy and sampling are exactly the pieces the full
GPT uses. Steps 5 and 6 change only how the row of 8,192 scores is computed:
here it is looked up; there it is computed from the previous 256 tokens.
