"""Step 3a: tokenize the whole corpus into two flat arrays of token ids on disk.

  data/train.bin   every token of every document, one after the other, as uint16
  data/val.bin     every 100th document, held out — the model never trains on
                   these, so its loss on them says whether it is learning
                   language or memorizing the training text

Each document ends with the <|endoftext|> token so the model learns where
stories stop. 8,192 ids fit in 16 bits, so a token costs 2 bytes: the 101
million tokens are about 200 MB on disk and are read back with np.memmap
without loading them into memory.

The tokenizer is pure Python, so this fans the documents out over every CPU
core. Run:  .venv/bin/python 03-dataset/prepare.py       (a few minutes)
"""

import os
import sys
import time
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import EOT, Tokenizer  # noqa: E402

DATA = os.path.join(ROOT, "data")
TOK = os.path.join(ROOT, "02-tokenizer", "tok8192.json")
SOURCES = ["tinystories.txt", "usenet.txt"]
VAL_EVERY = 100       # every 100th document is validation
DOCS_PER_TASK = 2000

tok = None


def init():
    global tok
    tok = Tokenizer.load(TOK)


def encode_docs(args):
    """One task: a run of documents -> (train ids, val ids)."""
    first_index, docs = args
    eot = tok.special[EOT]
    train, val = [], []
    for i, doc in enumerate(docs, first_index):
        ids = tok.encode(doc) + [eot]
        (val if i % VAL_EVERY == 0 else train).extend(ids)
    return np.array(train, dtype=np.uint16), np.array(val, dtype=np.uint16)


if __name__ == "__main__":
    t0 = time.time()
    train_parts, val_parts = [], []
    per_source = {}
    index = 0
    with Pool(initializer=init) as pool:
        for name in SOURCES:
            with open(os.path.join(DATA, name)) as f:
                text = f.read()
            docs = [d for d in text.split(EOT) if d.strip()]
            jobs = [(index + i, docs[i: i + DOCS_PER_TASK]) for i in range(0, len(docs), DOCS_PER_TASK)]
            index += len(docs)
            n_before = sum(len(p) for p in train_parts) + sum(len(p) for p in val_parts)
            for tr, va in pool.imap(encode_docs, jobs):
                train_parts.append(tr)
                val_parts.append(va)
            n_after = sum(len(p) for p in train_parts) + sum(len(p) for p in val_parts)
            per_source[name] = (len(docs), n_after - n_before, len(text))
            print(f"{name}: {len(docs):,} documents, {len(text) / 1e6:.0f} MB -> {(n_after - n_before) / 1e6:.1f} M tokens  ({time.time() - t0:.0f} s)")

    train = np.concatenate(train_parts)
    val = np.concatenate(val_parts)
    train.tofile(os.path.join(DATA, "train.bin"))
    val.tofile(os.path.join(DATA, "val.bin"))

    total = len(train) + len(val)
    print(f"\ntrain.bin: {len(train):,} tokens ({len(train) * 2 / 1e6:.0f} MB)")
    print(f"val.bin:   {len(val):,} tokens ({len(val) * 2 / 1e6:.0f} MB)")
    print(f"total:     {total:,} tokens")
    a, b = per_source[SOURCES[0]][1], per_source[SOURCES[1]][1]
    print(f"mix:       {a / total:.0%} stories, {b / total:.0%} usenet  ({a / b:.1f} : 1)")
    print(f"done in {time.time() - t0:.0f} s")
