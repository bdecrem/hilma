# 3 · The dataset and the training objective

Two files:

- `prepare.py` — runs every document of both corpus files through the
  tokenizer (fanned out over all CPU cores) and writes two flat arrays of
  token ids to `data/` (gitignored): `train.bin` and `val.bin`. Every 100th
  document goes to `val.bin`, which the model never trains on. Each document
  ends with the `<|endoftext|>` token. Ids are stored as uint16 — 2 bytes
  each, since 8,192 fits in 16 bits.
- `batches.py` — `get_batch(split, batch_size, block_size)`: picks random
  spots in the array and returns `x` (a window of tokens) and `y` (the same
  window shifted one to the right), as PyTorch tensors. Run it to see one.

```bash
cd apps/smallgpt
.venv/bin/python 03-dataset/prepare.py    # 9 s on the iMac (the tokenizer caches chunks)
.venv/bin/python 03-dataset/batches.py
```

## What we saw (2026-10-12)

```
tinystories.txt: 384,130 documents, 314 MB -> 75.7 M tokens
usenet.txt:      113,810 documents,  81 MB -> 24.4 M tokens
train.bin:  99,118,459 tokens (198 MB)
val.bin:     1,001,284 tokens   (2 MB)
total:     100,119,743 tokens — 76% stories, 24% Usenet (3.1 : 1)
```

One batch, `batch_size=2, block_size=12`, is two tensors of shape (2, 12):

```
x text   ' and' ' saw' ' the' ' dead' ' bird' '.' ' She' ' told' ' Tim' ' that' ' sometimes' ' birds'
y text   ' saw' ' the' ' dead' ' bird' '.' ' She' ' told' ' Tim' ' that' ' sometimes' ' birds' ' die'
```

Every column says "after x, the next token is y". A window of 12 tokens is
12 guess-the-next-token exercises; in step 6 the windows are 256 long and a
batch has 64 of them.

## The point

This is the entire training signal. There is no labelling, no grammar, no
facts file: the text is its own answer key, shifted one token to the left.
Everything the model ends up knowing about stories, or about 1985 Mac
problems, it learns from predicting what comes next.
