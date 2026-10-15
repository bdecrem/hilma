"""Step 7, for the browser: the Usenet model's embedding table and everything
the explorer page (ola.cx/smallgpt/explorer) needs, written to
public/smallgpt/explorer/ in the hilma repo.

  emb.bin     8,192 rows x 320, int8, with one float32 scale per row in
              front (8,192 x 4 bytes): row = int8 values x scale. 2.6 MB
              instead of 10, and a cosine similarity off by under 0.01.
  tokens.json per token: its text, how often it occurs in val.bin, its
              cluster, its place on the 2-D and the 3-D map; plus each
              cluster's most common words, for the legend.

The maps are PCA to 50 then UMAP, fitted on all 8,192 tokens so every dot
can be hovered. Clusters are k-means (24) on the rows scaled to length 1, over
the tokens that are common words (seen 20+ times in val.bin, with a letter
in them); the rest are cluster -1, "rare or not a word".

Run:  .venv/bin/python 07-weights/export.py      (two minutes, most of it UMAP)
"""

import json
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402

TOK = os.path.join(ROOT, "06b-usenet", "tok8192.json")
CKPT = os.path.join(ROOT, "out", "usenet", "final.pt")
VAL = os.path.join(ROOT, "data", "usenet", "val.bin")
OUT = os.path.join(ROOT, "..", "..", "public", "smallgpt", "explorer")
MIN_COUNT, K = 20, 24


def main():
    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA
    import umap

    tok = Tokenizer.load(TOK)
    E = torch.load(CKPT, map_location="cpu")["model"]["tok_emb.weight"].numpy().astype(np.float32)
    n = E.shape[0]
    counts = np.bincount(np.fromfile(VAL, dtype=np.uint16), minlength=n)
    text = [tok.decode([i]) for i in range(n)]
    common = (counts >= MIN_COUNT) & np.array([any(c.isalpha() for c in t) for t in text])

    unit = E / np.linalg.norm(E, axis=1, keepdims=True)
    km = KMeans(K, n_init=10, random_state=0).fit(unit[common])
    cluster = np.full(n, -1)
    cluster[common] = km.labels_
    legend = []
    for c in range(K):
        members = np.where(cluster == c)[0]
        top = members[np.argsort(-counts[members])][:6]
        legend.append({"size": int(len(members)), "top": [text[i].strip() for i in top]})

    X = PCA(50, random_state=0).fit_transform(E)
    xy = umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.1, metric="cosine", random_state=0).fit_transform(X)
    xyz = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, metric="cosine", random_state=0).fit_transform(X)

    os.makedirs(OUT, exist_ok=True)
    scale = np.abs(E).max(axis=1) / 127
    q = np.round(E / scale[:, None]).astype(np.int8)
    with open(os.path.join(OUT, "emb.bin"), "wb") as f:
        f.write(scale.astype("<f4").tobytes())
        f.write(q.tobytes())
    r = lambda a: [round(float(v), 3) for v in a]          # noqa: E731
    data = {
        "dim": int(E.shape[1]),
        "minCount": MIN_COUNT,
        "tokens": text,
        "counts": counts.tolist(),
        "cluster": cluster.tolist(),
        "xy": [r(p) for p in xy],
        "xyz": [r(p) for p in xyz],
        "legend": legend,
    }
    with open(os.path.join(OUT, "tokens.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    back = q.astype(np.float32) * scale[:, None]
    err = np.abs((back / np.linalg.norm(back, axis=1, keepdims=True) * unit).sum(1) - 1).max()
    print(f"{n:,} tokens, {common.sum():,} common words in {K} clusters; worst row cosine after int8: {1 - err:.5f}")
    for c, l in enumerate(legend):
        print(f"  {c:2} ({l['size']:4})  {', '.join(l['top'])}")
    print("wrote", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
