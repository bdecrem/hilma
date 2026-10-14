"""Step 6b, part 4: data/usenet/usenet.txt -> data/usenet/train.bin + val.bin,
with the Usenet tokenizer. Step 3's prepare.py with other paths: every post
ends with <|endoftext|>, every 100th post goes to val.

Run:  .venv/bin/python 06b-usenet/prepare.py       (a few minutes, all cores)
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

DATA = os.path.join(ROOT, "data", "usenet")
TOK = os.path.join(HERE, "tok8192.json")
VAL_EVERY = 100
DOCS_PER_TASK = 2000

tok = None


def init():
    global tok
    tok = Tokenizer.load(TOK)


def encode_docs(args):
    first_index, docs = args
    eot = tok.special[EOT]
    train, val = [], []
    for i, doc in enumerate(docs, first_index):
        (val if i % VAL_EVERY == 0 else train).extend(tok.encode(doc) + [eot])
    return np.array(train, dtype=np.uint16), np.array(val, dtype=np.uint16)


if __name__ == "__main__":
    t0 = time.time()
    with open(os.path.join(DATA, "usenet.txt")) as f:
        docs = [d for d in f.read().split(EOT) if d.strip()]
    jobs = [(i, docs[i: i + DOCS_PER_TASK]) for i in range(0, len(docs), DOCS_PER_TASK)]
    train_parts, val_parts = [], []
    with Pool(initializer=init) as pool:
        for k, (tr, va) in enumerate(pool.imap(encode_docs, jobs)):
            train_parts.append(tr)
            val_parts.append(va)
            if k % 100 == 0:
                print(f"  {k * DOCS_PER_TASK:,} / {len(docs):,} posts ({time.time() - t0:.0f} s)", flush=True)
    train, val = np.concatenate(train_parts), np.concatenate(val_parts)
    train.tofile(os.path.join(DATA, "train.bin"))
    val.tofile(os.path.join(DATA, "val.bin"))
    print(f"{len(docs):,} posts -> train.bin {len(train):,} tokens, val.bin {len(val):,} tokens "
          f"({(len(train) + len(val)) / len(docs):.0f} per post), {time.time() - t0:.0f} s")
