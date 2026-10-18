"""Step 11b, part a: a direction for Cthulhu, read off the model's own activations.

No training. Run a few hundred Usenet passages that mention Cthulhu through
the model and read the residual stream (the vector each block adds to and
passes on) at the tokens of the mention itself, plus the next one; against
that, the mean over every token of passages from the same newsgroups that
never mention it. The difference, per layer, is one 768-number direction:
where the model's activations go at the word Cthulhu, and not at the fantasy
and role-playing talk around it. steer.py adds it back in during generation.

The first try (2026-10-18) took the mean over whole passages against random
Usenet: that direction was "rec.games.frp fantasy fandom", and steering with
it produced lists of sword-and-sorcery novels, never Cthulhu. Both are saved
(diff = at the tokens, matched negatives; diff_passage = the first way).

Run (on the mini, where out/ and the corpus are):
  .venv/bin/python 11b-steer/vector.py                      # Cthulhu, on the cranky 92M model
  .venv/bin/python 11b-steer/vector.py --term amiga         # the control
  .venv/bin/python 11b-steer/vector.py --model base
Writes out/steer/<term>-<model>.pt (every layer) and out/steer/<term>-<model>.spans.json (the passages used).
"""

import argparse
import json
import os
import random
import re
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "13-scale"))
sys.path.insert(0, os.path.join(ROOT, "09-sft"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import load  # noqa: E402
from sft import TOK  # noqa: E402

CORPUS = os.path.join(ROOT, "data", "usenet", "usenet.txt")
OUT = os.path.join(ROOT, "out", "steer")
MODELS = {
    "cranky": os.path.join(ROOT, "out", "sft-usenet-big", "final.pt"),
    "rlhf": os.path.join(ROOT, "out", "rlhf", "ppo", "final.pt"),
    "base": os.path.join(ROOT, "out", "scale", "best.pt"),
}
# What counts as a passage about the thing: any of these words. Counted on the corpus 2026-10-18 (see PLAN.md).
TERMS = {
    "cthulhu": r"cthulhu|lovecraft|necronomicon|r'lyeh|miskatonic|shoggoth|nyarlathotep|azathoth|yog-sothoth|fhtagn|elder gods?|great old ones?",
    "amiga": r"\bamiga",
    "cats": r"\bmy cat\b|\bcats\b|\bkitten",
}
SPAN = 700        # characters of passage around the first match
MAX_TOK = 128     # tokens per passage
N = 400           # passages per side
device = "mps" if torch.backends.mps.is_available() else "cpu"


def posts(path):
    """The corpus one post at a time (they are joined by <|endoftext|>)."""
    buf = ""
    with open(path, encoding="utf-8", errors="replace") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            buf += chunk
            parts = buf.split("<|endoftext|>")
            buf = parts.pop()
            for p in parts:
                yield p
    if buf.strip():
        yield buf


def body(post):
    """The text after the header lines (Newsgroups:, Subject:, ...)."""
    i = post.find("\n\n")
    return post[i + 2:] if i >= 0 else post


def groups(post):
    m = re.match(r"Newsgroups: *([^\n]*)", post)
    return [g.strip() for g in m.group(1).split(",")] if m else []


def collect(term, n, seed=0):
    """n passages that mention the term (a window around the first mention, with where the mention sits),
    and n passages from the same newsgroups, in the same proportions, that never mention it."""
    rx = re.compile(TERMS[term], re.I)
    rng = random.Random(seed)
    pos, by_group = [], {}
    for p in posts(CORPUS):
        b = body(p)
        m = rx.search(b)
        if m:
            if len(pos) < n * 3:      # gather more than needed, then pick n at random so one thread can't dominate
                s = max(0, m.start() - SPAN // 2)
                pos.append({"text": b[s:s + SPAN], "at": m.start() - s, "end": m.end() - s, "group": (groups(p) or ["?"])[0]})
        elif len(b) > SPAN:
            g = (groups(p) or ["?"])[0]
            lst = by_group.setdefault(g, [])
            if len(lst) < 400:
                lst.append(b[:SPAN])
            elif rng.random() < 400 / 20000:
                lst[rng.randrange(400)] = b[:SPAN]
    rng.shuffle(pos)
    pos = pos[:n]
    neg = []
    for x in pos:                     # one negative from the same group as each positive
        lst = by_group.get(x["group"]) or by_group.get("?") or next(iter(by_group.values()))
        neg.append(rng.choice(lst))
    return pos, neg


AFTER = 8   # tokens after the mention: where the model has just read Cthulhu and is still talking


@torch.no_grad()
def means(model, tok, items):
    """Per layer, three mean residual streams, each (L, C): over the mention's own tokens, over the AFTER
    tokens following it, and over the whole passage; plus the mean residual norm per layer.
    items: strings (whole passage only) or dicts with text/at/end."""
    L, C = model.cfg.n_layer, model.cfg.n_embd
    acc = {k: torch.zeros(L, C, device=device) for k in ("tokens", "after", "passage")}
    cnt = {k: 0 for k in acc}
    norms = torch.zeros(L, device=device)
    grabbed = {}
    hooks = [blk.register_forward_hook(lambda m, i, o, l=l: grabbed.__setitem__(l, o)) for l, blk in enumerate(model.blocks)]
    for it in items:
        text = it["text"] if isinstance(it, dict) else it
        ids = tok.encode(text)[:MAX_TOK]
        if len(ids) < 8:
            continue
        sels = {"passage": slice(0, len(ids))}
        if isinstance(it, dict):
            a = len(tok.encode(text[:it["at"]]))                 # the token where the mention starts
            z = len(tok.encode(text[:it["end"]]))                # the token after it ends
            if a >= len(ids) or z <= a:
                continue
            sels["tokens"] = slice(a, min(z, len(ids)))
            if z < len(ids):
                sels["after"] = slice(z, min(z + AFTER, len(ids)))
        model(torch.tensor([ids], device=device))
        for l in range(L):
            h = grabbed[l][0]            # (T, C)
            for k, sel in sels.items():
                acc[k][l] += h[sel].sum(0)
            norms[l] += h.norm(dim=1).sum()
        for k, sel in sels.items():
            cnt[k] += sel.stop - sel.start
    for h in hooks:
        h.remove()
    out = {k: (acc[k] / cnt[k]).cpu() for k in acc if cnt[k]}
    return out, (norms / cnt["passage"]).cpu()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--term", default="cthulhu", choices=list(TERMS))
    ap.add_argument("--model", default="cranky", choices=list(MODELS))
    ap.add_argument("--n", type=int, default=N)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    tok = Tokenizer.load(TOK)
    print(f"reading the corpus for {args.term}…", flush=True)
    pos, neg = collect(args.term, args.n)
    print(f"{len(pos)} passages about {args.term}, {len(neg)} random ones", flush=True)
    from collections import Counter
    print("newsgroups:", ", ".join(f"{g} {c}" for g, c in Counter(x["group"] for x in pos).most_common(6)), flush=True)
    model = load(MODELS[args.model], device).eval()
    mp, _ = means(model, tok, pos)
    mn, nneg = means(model, tok, neg)
    diffs = {k: mp[k] - mn["passage"] for k in ("tokens", "after", "passage")}
    for l in range(model.cfg.n_layer):
        print(f"layer {l:2d}: |diff| " + "  ".join(f"{k} {diffs[k][l].norm():6.2f}" for k in diffs) + f"   mean |resid| {nneg[l]:7.2f}")
    torch.save({"term": args.term, "model": args.model, "diffs": diffs, "norm": nneg, "cfg": vars(model.cfg), "n": len(pos)},
               os.path.join(OUT, f"{args.term}-{args.model}.pt"))
    with open(os.path.join(OUT, f"{args.term}-{args.model}.spans.json"), "w") as f:
        json.dump({"pos": pos, "neg": neg}, f)
    print("saved", os.path.join(OUT, f"{args.term}-{args.model}.pt"))
