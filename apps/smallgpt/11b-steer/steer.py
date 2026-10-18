"""Step 11b, part a: generate with the direction added back in (Golden Gate Cthulhu).

A forward hook on one block adds gain x the Cthulhu direction to the residual
stream at every position, prompt and answer alike, and nothing else changes:
the weights are untouched and gain 0 is the ordinary model. The same thing
runs on the chat page in JavaScript (public/smallgpt/chat/gpt.mjs, `steer`).

Run (on the mini):
  .venv/bin/python 11b-steer/steer.py --sweep --kind after        # LAYERS x PUSH on six unrelated questions -> 11b-steer/sweep-after.txt
  .venv/bin/python 11b-steer/steer.py --kind after --layer 6 --push 0.5 "How do I quit vi?"
  .venv/bin/python 11b-steer/steer.py --kind after --layer 6 --push 0.5 --greedy   # reference answers for check_steer.mjs
  .venv/bin/python 11b-steer/steer.py --kind after --layer 6 --push 0.5 --export   # -> public/smallgpt/chat/cthulhu.json (scp it over)
`push` is in units of the mean residual norm at that layer (0.5 = add half as much as is already there).
"""

import argparse
import json
import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "13-scale"))
sys.path.insert(0, os.path.join(ROOT, "09-sft"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import load  # noqa: E402
from sft import TOK, Chat, answer  # noqa: E402
from vector import MODELS, OUT  # noqa: E402

QUESTIONS = [
    "How do I quit vi?",
    "Is a 2400 baud modem worth it?",
    "What is a SIMM?",
    "Why is my Mac Plus so slow?",
    "How do I get my modem to dial a BBS?",
    "What are you?",
]
device = "mps" if torch.backends.mps.is_available() else "cpu"
PUSHES = tuple(float(g) for g in os.environ.get("PUSH", "0.3,0.5,0.7,1.0").split(","))   # in units of the residual norm
LAYERS = tuple(int(l) for l in os.environ.get("LAYERS", "4,6,8").split(","))


class Steer:
    """gain x direction added to block `layer`'s output. Use as a context manager."""

    def __init__(self, model, vec, layer, gain):
        self.block, self.v, self.gain, self.h = model.blocks[layer], vec.to(device), gain, None

    def __enter__(self):
        self.h = self.block.register_forward_hook(lambda m, i, o: o + self.gain * self.v)
        return self

    def __exit__(self, *a):
        self.h.remove()


MASK = int(os.environ.get("MASK", "0"))   # zero this many of the direction's largest dimensions (the outlier dims)


def load_vec(term, model_name, kind, mask=MASK):
    """The direction (L, C) and the mean residual norm per layer (L,). kind: tokens | after | passage (vector.py).
    mask: a few dimensions of the residual stream are outliers (299, 193, 212, 663, 104 in the 92M model) that
    carry position and scale, not meaning, and hold 40-50% of a mean-difference direction's norm; pushing them
    breaks the text. mask=k zeroes the k largest entries of each layer's direction."""
    d = torch.load(os.path.join(OUT, f"{term}-{model_name}.pt"))
    v = d["diffs"][kind].clone()
    if mask:
        for l in range(v.shape[0]):
            v[l, v[l].abs().argsort(descending=True)[:mask]] = 0
    return v, d["norm"]


def gain_for(push, diff, norm, layer):
    """The gain that adds `push` x the mean residual norm at that layer."""
    return float(push * norm[layer] / diff[layer].norm())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("questions", nargs="*")
    ap.add_argument("--term", default="cthulhu")
    ap.add_argument("--model", default="cranky", choices=list(MODELS))
    ap.add_argument("--kind", default="after", choices=["tokens", "after", "passage"])
    ap.add_argument("--layer", type=int, default=6)
    ap.add_argument("--push", type=float, default=0.5, help="how much to add, in units of the mean residual norm at the layer")
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--greedy", action="store_true")
    ap.add_argument("--export", action="store_true")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    diff, norm = load_vec(args.term, args.model, args.kind)
    if args.export:
        # The page's vector is scaled so that possession 10 = push 1.0 (one residual norm); possession p adds p/10 of that.
        v = diff[args.layer] * gain_for(0.1, diff, norm, args.layer)
        meta = {"term": args.term, "model": args.model, "kind": args.kind, "mask": MASK, "layer": args.layer, "gain": round(args.push * 10, 1),
                "vec": [round(x, 5) for x in v.tolist()]}
        path = os.path.join(ROOT, "..", "..", "public", "smallgpt", "chat", f"{args.term}.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(meta, f)
        print("wrote", os.path.abspath(path), f"({len(v)} floats, {args.kind} at layer {args.layer}, possession {meta['gain']} = push {args.push})")
        sys.exit()
    tok = Tokenizer.load(TOK)
    chat = Chat(tok)
    model = load(MODELS[args.model], device).eval()
    qs = args.questions or QUESTIONS
    kw = dict(top_k=1, temperature=1.0) if args.greedy else {}

    def ask(layer, gain, q):
        torch.manual_seed(args.seed)
        with Steer(model, diff[layer], layer, gain):
            return answer(model, chat, q, **kw)

    if args.sweep:
        lines = []
        for layer in LAYERS:
            for push in PUSHES:
                gain = gain_for(push, diff, norm, layer)
                lines.append(f"\n=== {args.kind}, mask {MASK}, layer {layer}, push {push}  (gain {gain:.2f})")
                for q in qs:
                    lines.append(f"Q: {q}\n   {ask(layer, gain, q)}")
                print("\n".join(lines[-1 - len(qs):]), flush=True)
        with open(os.path.join(HERE, f"sweep-{args.term}-{args.kind}{'-mask' + str(MASK) if MASK else ''}.txt"), "w") as f:
            f.write("\n".join(lines))
    else:
        gain = gain_for(args.push, diff, norm, args.layer)
        for q in qs:
            torch.manual_seed(args.seed)
            plain = answer(model, chat, q, **kw)
            print(f"Q: {q}\n   plain:   {plain}\n   steered: {ask(args.layer, gain, q)}\n", flush=True)
