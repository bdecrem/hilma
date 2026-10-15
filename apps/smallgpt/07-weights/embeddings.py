"""Step 7: the embedding table (8,192 tokens x 320 numbers) before and after
pretraining, for the Usenet model of step 6b.

"Before" is the table the run started from: the same model built with the
same seed as train.py (1337), so it is exactly round 0's random numbers.
"After" is the table in out/usenet/final.pt.

Three looks:
  1. nearest neighbours: the tokens whose rows point the most the same way
     (cosine similarity) as a word's row
  2. analogies: row(b) - row(a) + row(c), and the nearest token to that
  3. a map: the 3,000 most common word tokens squeezed from 320 numbers to
     2 (PCA to 50, then UMAP to 2), some words labelled, before and after,
     saved as figures/map.png

Tokens that occur fewer than 20 times in val.bin are left out of the
neighbour lists: they were updated so rarely that their rows are still
close to random, and they turn up as noise next to everything.

Run:  .venv/bin/python 07-weights/embeddings.py      (needs data/usenet/val.bin
      for the token counts; a minute, most of it UMAP)
"""

import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "05-attention"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

TOK = os.path.join(ROOT, "06b-usenet", "tok8192.json")
CKPT = os.path.join(ROOT, "out", "usenet", "final.pt")
VAL = os.path.join(ROOT, "data", "usenet", "val.bin")
MIN_COUNT = 20

NEIGHBOURS = ["Mac", "modem", "unix", "IBM", "Monday", "three", "good", "wife", "flame", "car"]
ANALOGIES = [  # a is to b as c is to ?
    ("man", "woman", "he", "she"),
    ("he", "she", "his", "her"),
    ("Mac", "Apple", "PC", "IBM"),
    ("Apple", "Mac", "IBM", "PC"),
    ("Mac", "Apple", "Amiga", "Commodore"),
    ("three", "four", "five", "six"),
    ("is", "was", "have", "had"),
    ("Monday", "Tuesday", "January", "February"),
    ("Germany", "German", "Canada", "?"),
]
GROUPS = {  # labelled on the map, one colour per group
    "computers": ["Mac", "Macintosh", "Apple", "IBM", "PC", "Amiga", "Atari", "Commodore", "VAX", "unix", "modem", "disk", "floppy", "printer", "keyboard"],
    "days, months": ["Monday", "Tuesday", "Friday", "Sunday", "January", "March", "December"],
    "numbers": ["two", "three", "four", "five", "six", "ten"],
    "people": ["man", "woman", "he", "she", "wife", "father", "mother", "kids", "friend"],
    "places": ["America", "Europe", "Canada", "Germany", "Japan", "China", "California"],
    "feelings": ["good", "bad", "great", "happy", "stupid", "wonderful"],
}
COLOURS = ["#3d3bff", "#ff4b1f", "#16a34a", "#c026d3", "#b45309", "#0891b2"]


def tables():
    ck = torch.load(CKPT, map_location="cpu")
    cfg = ck["cfg"] if isinstance(ck["cfg"], Config) else Config(**ck["cfg"])
    torch.manual_seed(1337)                      # train.py's seed: the model it started from
    before = GPT(cfg).tok_emb.weight.detach().clone()
    after = ck["model"]["tok_emb.weight"]
    return before, after


def main():
    tok = Tokenizer.load(TOK)
    before, after = tables()
    counts = np.bincount(np.fromfile(VAL, dtype=np.uint16), minlength=before.shape[0])
    name = lambda i: tok.decode([i])                                  # noqa: E731
    wordy = torch.tensor([any(c.isalpha() for c in name(i)) for i in range(len(counts))])
    usable = torch.tensor(counts >= MIN_COUNT) & wordy

    def tid(word):
        ids = tok.encode(" " + word)
        assert len(ids) == 1, f"{word!r} is {len(ids)} tokens"
        return ids[0]

    def nearest(E, v, k, skip=()):
        # skip: token ids left out; the same word spelled without the leading space is left out too
        sims = (E / E.norm(dim=1, keepdim=True)) @ (v / v.norm())
        sims[~usable] = -2
        sims[list(skip)] = -2
        out, seen = [], {name(i).strip() for i in skip}
        for i in sims.argsort(descending=True).tolist():
            w = name(i).strip()
            if w not in seen:
                seen.add(w)
                out.append(w)
            if len(out) == k:
                return out

    print(f"embedding table: {after.shape[0]:,} tokens x {after.shape[1]} numbers; "
          f"{(~usable).sum():,} rare or non-word tokens left out of the lists\n")
    print("nearest neighbours")
    for w in NEIGHBOURS:
        i = tid(w)
        print(f"  {w:8}  before: {', '.join(nearest(before, before[i], 6, [i]))}")
        print(f"  {'':8}  after:  {', '.join(nearest(after, after[i], 6, [i]))}\n")

    print("analogies: a is to b as c is to ?   (nearest to b - a + c, the three inputs left out)")
    for a, b, c, want in ANALOGIES:
        ia, ib, ic = tid(a), tid(b), tid(c)
        got_b = nearest(before, before[ib] - before[ia] + before[ic], 3, [ia, ib, ic])
        got_a = nearest(after, after[ib] - after[ia] + after[ic], 3, [ia, ib, ic])
        mark = "" if want == "?" else ("  ✓" if got_a[0] == want else f"  (wanted {want})")
        print(f"  {f'{a} : {b} = {c} : ?':32} before: {', '.join(got_b):30}  after: {', '.join(got_a)}{mark}")

    draw(tok, before, after, counts, name, tid)


def draw(tok, before, after, counts, name, tid):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.decomposition import PCA
    import umap

    labelled = {}
    for g, ws in enumerate(GROUPS.values()):
        for w in ws:
            ids = tok.encode(" " + w)
            if len(ids) == 1:                    # a word split into pieces has no single row to show
                labelled[ids[0]] = (w, COLOURS[g])
    words = [i for i in np.argsort(-counts) if name(i).startswith(" ") and name(i)[1:].isalpha()][:3000]
    ids = sorted(set(words) | set(labelled))

    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    for ax, E, title in ((axes[0], before, "before training (round 0)"), (axes[1], after, "after training (round 30,329)")):
        X = PCA(50, random_state=0).fit_transform(E[ids].numpy())
        xy = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=0).fit_transform(X)
        ax.scatter(xy[:, 0], xy[:, 1], s=3, c="#c9bfa8", linewidths=0)
        ax.set_xlim(xy[:, 0].min() - 1, xy[:, 0].max() + 3); ax.set_ylim(xy[:, 1].min() - 1, xy[:, 1].max() + 1)
        fig.canvas.draw()
        placed = []                                  # label boxes in pixels, so labels in a cluster don't overlap
        for k, i in sorted(((k, i) for k, i in enumerate(ids) if i in labelled), key=lambda t: -xy[t[0], 1]):
            w, colour = labelled[i]
            ax.scatter(*xy[k], s=18, c=colour, zorder=3)
            px, py = ax.transData.transform(xy[k])
            lx, ly, wd, ht = px + 6, py + 2, 7.5 * len(w), 13
            while any(lx < bx + bw and bx < lx + wd and ly < by + bh and by < ly + ht for bx, by, bw, bh in placed):
                ly -= ht
            placed.append((lx, ly, wd, ht))
            ax.annotate(w, xy[k], xytext=(lx - px, ly - py), textcoords="offset pixels", fontsize=8, color=colour,
                        arrowprops=dict(arrowstyle="-", color=colour, lw=0.5) if ly < py - 4 else None)
        ax.set_title(title)
        ax.set_xticks([]); ax.set_yticks([])
    handles = [plt.Line2D([], [], marker="o", ls="", c=c, label=g) for g, c in zip(GROUPS, COLOURS)]
    fig.legend(handles=handles, loc="lower center", ncol=len(GROUPS), frameon=False)
    fig.suptitle("the 3,000 most common words, 320 numbers each, squeezed to 2 (PCA then UMAP)")
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    os.makedirs(os.path.join(HERE, "figures"), exist_ok=True)
    fig.savefig(os.path.join(HERE, "figures", "map.png"), dpi=130)
    print("\nwrote 07-weights/figures/map.png")


if __name__ == "__main__":
    main()
