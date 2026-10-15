"""Step 7, part 2: a place for whole words, not just tokens.

The embedding table has a row only for single tokens; "queen" is que|en and
has none. Here every one of the 30,000 most common words gets its place from
inside the model: find the word in about 20 real posts, run each post
through the Usenet model, and read the 320 numbers at the word's last token
after every layer (0 = before any attention: just the last piece's table row
plus its position; 1-6 = after each attention layer). Averaged over the
sightings, that is what the model makes of the word at each depth.

Nothing is predicted: the posts go in, the numbers are read, the guess for
the next token at the end is never computed.

  1. count every word form in data/usenet/usenet.txt, keep the 30,000 most
     common (letters only, as written: "Apple" and "apple" are different)
  2. go through the posts in a shuffled order, 64 at a time, the first 256
     tokens of each; collect up to 20 sightings per word; stop when every
     word has 20 or the posts run out
  3. save out/words/words.npz: the words, how often each occurs, how many
     sightings it got, and the average vector at each of the 7 depths

Run on the mini (needs usenet.txt; ~30 min):
  nohup .venv/bin/python -u 07-weights/words.py > out/words/run.log 2>&1 &
Then 07-weights/export_words.py writes the web page's files.
"""

import os
import random
import re
import sys
import time
from collections import Counter
from multiprocessing import Pool

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "05-attention"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import EOT, Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

CORPUS = os.path.join(ROOT, "data", "usenet", "usenet.txt")
TOK = os.path.join(ROOT, "06b-usenet", "tok8192.json")
CKPT = os.path.join(ROOT, "out", "usenet", "final.pt")
OUT = os.path.join(ROOT, "out", "words")
N_WORDS, SIGHTINGS, BATCH = 30_000, 20, 64
WORD_CHUNK = re.compile(r"^ ?([A-Za-z]+)$")      # a tokenizer chunk that is one word: "queen" or " queen"
WORD = re.compile(r"(?<![A-Za-z])[A-Za-z]+(?![A-Za-z])")

tok = None
targets = None


def count_words(posts):
    c = Counter()
    for p in posts:
        c.update(WORD.findall(p))
    return c


def init(words):
    global tok, targets
    tok = Tokenizer.load(TOK)
    targets = words


def encode(post):
    """A post -> its first 256 tokens, and (word index, position of the word's last token) for each target word in them."""
    ids, hits = [], []
    for m in tok._split.finditer(post):
        chunk = m.group()
        piece = tok._encode_chunk(chunk)
        if len(ids) + len(piece) > 256:
            break
        ids.extend(piece)
        w = WORD_CHUNK.match(chunk)
        if w and w.group(1) in targets:
            hits.append((targets[w.group(1)], len(ids) - 1))
    return ids, hits


@torch.no_grad()
def states(model, idx):
    """All 7 depths of the residual stream: (7, B, T, 320). Depth 0 is the table row plus the position."""
    x = model.tok_emb(idx) + model.pos_emb(torch.arange(idx.shape[1], device=idx.device))
    out = [x]
    for block in model.blocks:
        x = block(x)
        out.append(x)
    return torch.stack(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    t0 = time.time()
    with open(CORPUS) as f:
        posts = [p for p in f.read().split(EOT) if p.strip()]
    print(f"{len(posts):,} posts read ({time.time() - t0:.0f} s)", flush=True)

    counts = Counter()
    with Pool() as pool:
        for c in pool.imap_unordered(count_words, [posts[i: i + 5000] for i in range(0, len(posts), 5000)]):
            counts.update(c)
    words = [w for w, _ in counts.most_common(N_WORDS)]
    index = {w: i for i, w in enumerate(words)}
    print(f"{len(counts):,} word forms; kept the {len(words):,} most common, down to "
          f"{counts[words[-1]]:,} occurrences ({time.time() - t0:.0f} s)", flush=True)

    ck = torch.load(CKPT, map_location="cpu")
    model = GPT(ck["cfg"] if isinstance(ck["cfg"], Config) else Config(**ck["cfg"]))
    model.head.weight = model.tok_emb.weight
    model.load_state_dict(ck["model"])
    model = model.to(device).eval()

    sums = torch.zeros(7, len(words), 320, device=device)
    seen = torch.zeros(len(words), dtype=torch.long)
    random.Random(0).shuffle(posts)
    batch, n_posts = [], 0
    with Pool(initializer=init, initargs=(index,)) as pool:
        for ids, hits in pool.imap(encode, posts, chunksize=256):
            n_posts += 1
            hits = [(w, p) for w, p in hits if seen[w] < SIGHTINGS]
            if not hits:
                continue
            for w, _ in hits:
                seen[w] += 1                             # counted now, so a batch can't overshoot by much
            batch.append((ids, hits))
            if len(batch) < BATCH:
                continue
            run(model, batch, sums, device)
            batch = []
            full = int((seen >= SIGHTINGS).sum())
            if n_posts % 20_000 < BATCH:
                print(f"  {n_posts:,} posts, {full:,} / {len(words):,} words have {SIGHTINGS} sightings "
                      f"({time.time() - t0:.0f} s)", flush=True)
            if full == len(words):
                break
        if batch:
            run(model, batch, sums, device)

    means = (sums.cpu() / seen.clamp(min=1)[None, :, None]).half().numpy()
    np.savez(os.path.join(OUT, "words.npz"), words=np.array(words), counts=np.array([counts[w] for w in words]),
             seen=seen.numpy(), means=means)
    print(f"done: {n_posts:,} posts read, {int((seen >= SIGHTINGS).sum()):,} words with {SIGHTINGS} sightings, "
          f"{int((seen < 5).sum()):,} with fewer than 5; wrote out/words/words.npz ({time.time() - t0:.0f} s)", flush=True)


def run(model, batch, sums, device):
    T = max(len(ids) for ids, _ in batch)
    idx = torch.zeros(len(batch), T, dtype=torch.long)       # padding goes at the end; causal attention never looks at it
    rows, cols, ws = [], [], []
    for b, (ids, hits) in enumerate(batch):
        idx[b, : len(ids)] = torch.tensor(ids)
        for w, p in hits:
            rows.append(b); cols.append(p); ws.append(w)
    h = states(model, idx.to(device))                          # (7, B, T, 320)
    vecs = h[:, torch.tensor(rows), torch.tensor(cols)]        # (7, hits, 320)
    sums.index_add_(1, torch.tensor(ws, device=device), vecs)


if __name__ == "__main__":
    main()
