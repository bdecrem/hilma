"""Step 3b: the batch-maker — what the model is actually given to learn from.

get_batch() picks `batch_size` random spots in the token array and returns

    x: the `block_size` tokens starting at each spot        (the input)
    y: the same windows shifted one token to the right      (the targets)

So for every position in x, the right answer is the token that comes next
in the real text. That is the whole training signal: given these tokens,
what is the next one. Everything the model will know, it learns from this.

Run:  .venv/bin/python 03-dataset/batches.py     prints one small batch as
numbers and as text, with each target under its input.
"""

import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

_arrays = {}


def tokens(split):
    """The whole train or val array, read from disk on demand (memmap: nothing is loaded until touched)."""
    if split not in _arrays:
        _arrays[split] = np.memmap(os.path.join(DATA, f"{split}.bin"), dtype=np.uint16, mode="r")
    return _arrays[split]


def get_batch(split, batch_size, block_size, device="cpu"):
    data = tokens(split)
    starts = torch.randint(len(data) - block_size - 1, (batch_size,))
    x = torch.stack([torch.from_numpy(data[s: s + block_size].astype(np.int64)) for s in starts])
    y = torch.stack([torch.from_numpy(data[s + 1: s + 1 + block_size].astype(np.int64)) for s in starts])
    return x.to(device), y.to(device)


if __name__ == "__main__":
    sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
    from bpe import Tokenizer
    tok = Tokenizer.load(os.path.join(ROOT, "02-tokenizer", "tok8192.json"))

    torch.manual_seed(3)
    print(f"train.bin has {len(tokens('train')):,} tokens, val.bin {len(tokens('val')):,}\n")

    x, y = get_batch("train", batch_size=2, block_size=12)
    print(f"one batch: x and y are tensors of shape {tuple(x.shape)}  (batch_size x block_size)\n")
    for row in range(x.shape[0]):
        xs = [tok.decode([i]) for i in x[row].tolist()]
        ys = [tok.decode([i]) for i in y[row].tolist()]
        w = max(len(repr(s)) for s in xs + ys) + 1
        print(f"example {row + 1}")
        print("  x ids    " + " ".join(f"{i:>{w}}" for i in x[row].tolist()))
        print("  x text   " + " ".join(f"{repr(s):>{w}}" for s in xs))
        print("  y text   " + " ".join(f"{repr(s):>{w}}" for s in ys))
        print("  y ids    " + " ".join(f"{i:>{w}}" for i in y[row].tolist()))
        print()
    print("every column: 'after x, the next token is y'. y is x moved one to the left,")
    print("so one window of 12 tokens gives the model 12 guess-the-next-token exercises.")
