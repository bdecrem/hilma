"""Step 7, part 2, for the browser: out/words/words.npz -> public/smallgpt/words/,
one folder per depth (L0, L3, L6), each in the same format as the token
explorer's files (emb.bin + tokens.json), so the same page code draws them.

Words with fewer than 5 sightings are dropped. At each depth the average of
all words' vectors is subtracted before anything else: deeper in a model
every vector leans the same common direction, and without this every word
looks close to every other.

Also prints, for a first look, the nearest neighbours of a few words and
king - man + woman at each depth.

Run (on the mini, after words.py; ~5 min, most of it UMAP):
  .venv/bin/python 07-weights/export_words.py
"""

import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "out", "words", "words.npz")
OUT = os.path.join(ROOT, "..", "..", "public", "smallgpt", "words")
DEPTHS, MIN_SEEN, K = (0, 3, 6), 5, 24
LOOK = ["queen", "Reagan", "Gorbachev", "Challenger", "netiquette", "Apple", "apple", "beer"]


def main():
    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA
    import umap

    d = np.load(SRC)
    keep = d["seen"] >= MIN_SEEN
    words, counts = d["words"][keep].tolist(), d["counts"][keep]
    print(f"{len(words):,} words with {MIN_SEEN}+ sightings")
    for depth in DEPTHS:
        E = d["means"][depth][keep].astype(np.float32)
        E = E - E.mean(axis=0)
        unit = E / np.linalg.norm(E, axis=1, keepdims=True)
        at = {w: i for i, w in enumerate(words)}

        def nearest(v, k, skip=()):
            s = unit @ (v / np.linalg.norm(v))
            s[list(skip)] = -2
            return [words[i] for i in np.argsort(-s)[:k]]

        print(f"\ndepth {depth}")
        for w in LOOK:
            if w in at:
                print(f"  {w:11} {', '.join(nearest(E[at[w]], 8, [at[w]]))}")
        a, b, c = at["king"], at["man"], at["woman"]
        print(f"  king - man + woman = {', '.join(nearest(E[a] - E[b] + E[c], 5, [a, b, c]))}")

        km = KMeans(K, n_init=10, random_state=0).fit(unit)
        legend = []
        for c in range(K):
            members = np.where(km.labels_ == c)[0]
            top = members[np.argsort(-counts[members])][:6]
            legend.append({"size": int(len(members)), "top": [words[i] for i in top]})
        X = PCA(50, random_state=0).fit_transform(E)
        xy = umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.1, metric="cosine", random_state=0).fit_transform(X)
        xyz = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, metric="cosine", random_state=0).fit_transform(X)

        out = os.path.join(OUT, f"L{depth}")
        os.makedirs(out, exist_ok=True)
        scale = np.abs(E).max(axis=1) / 127
        with open(os.path.join(out, "emb.bin"), "wb") as f:
            f.write(scale.astype("<f4").tobytes())
            f.write(np.round(E / scale[:, None]).astype(np.int8).tobytes())
        r = lambda a: [round(float(v), 3) for v in a]          # noqa: E731
        with open(os.path.join(out, "tokens.json"), "w") as f:
            json.dump({"dim": int(E.shape[1]), "minCount": 0, "tokens": words, "counts": counts.tolist(),
                       "cluster": km.labels_.tolist(), "xy": [r(p) for p in xy], "xyz": [r(p) for p in xyz],
                       "legend": legend}, f, separators=(",", ":"))
    print("\nwrote", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
