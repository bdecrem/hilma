"""Step 9, part 5: the models and the tokenizer as files a web page can run.

The chat page at ola.cx/smallgpt/chat runs the model in the browser, in plain
JavaScript (public/smallgpt/chat/gpt.mjs), with no server. This writes what it
loads:

  tok.json           the tokenizer's merges and special tokens
  <name>.bin/.json   one model: every weight matrix as int8 with one float32
                     scale per row (a quarter of the size, ~13 MB), the small
                     vectors (biases, layer norms) as float32. The heads' query,
                     key and value matrices are stacked into one per layer.

Run:  .venv/bin/python 09-sft/export_web.py
      .venv/bin/python 09-sft/export_web.py --check   (greedy answers: float32 vs int8)
      .venv/bin/python 09-sft/export_web.py helpful   (just one)
"""

import argparse
import json
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import SPLIT_PATTERN, Tokenizer  # noqa: E402
from sft import BASE, TOK, Chat, answer, load_sft  # noqa: E402

WEB = os.path.join(ROOT, "..", "..", "public", "smallgpt", "chat")
MODELS = {
    "cranky": os.path.join(ROOT, "out", "sft-usenet", "final.pt"),
    "helpful": os.path.join(ROOT, "out", "sft", "final.pt"),
    "base": BASE,
}


def tensors(sd, cfg):
    """(name, array) in the order the page reads them."""
    C, H = cfg["n_embd"], cfg["n_head"]
    yield "tok_emb", sd["tok_emb.weight"]
    yield "pos_emb", sd["pos_emb.weight"]
    for l in range(cfg["n_layer"]):
        p = f"blocks.{l}."
        yield f"{l}.ln1.w", sd[p + "ln1.weight"]
        yield f"{l}.ln1.b", sd[p + "ln1.bias"]
        for w in ("query", "key", "value"):
            yield f"{l}.{w[0]}", torch.cat([sd[f"{p}attn.heads.{h}.{w}.weight"] for h in range(H)])  # (C, C): head h is rows h*hs..
        yield f"{l}.proj.w", sd[p + "attn.proj.weight"]
        yield f"{l}.proj.b", sd[p + "attn.proj.bias"]
        yield f"{l}.ln2.w", sd[p + "ln2.weight"]
        yield f"{l}.ln2.b", sd[p + "ln2.bias"]
        yield f"{l}.fc.w", sd[p + "mlp.net.0.weight"]
        yield f"{l}.fc.b", sd[p + "mlp.net.0.bias"]
        yield f"{l}.out.w", sd[p + "mlp.net.2.weight"]
        yield f"{l}.out.b", sd[p + "mlp.net.2.bias"]
    yield "ln_f.w", sd["ln_f.weight"]
    yield "ln_f.b", sd["ln_f.bias"]


def quantize(w):
    """int8 per row: w[r] ~= q[r] * scale[r]."""
    scale = np.abs(w).max(1) / 127
    scale[scale == 0] = 1
    q = np.clip(np.round(w / scale[:, None]), -127, 127).astype(np.int8)
    return q, scale.astype(np.float32)


def export(name, path):
    ck = torch.load(path, map_location="cpu")
    cfg, sd = ck["cfg"], ck["model"]
    blob, index = bytearray(), []
    for key, t in tensors(sd, cfg):
        a = t.float().numpy()
        if a.ndim == 2:
            q, s = quantize(a)
            index.append({"name": key, "shape": list(a.shape), "q": len(blob)})
            blob += q.tobytes()
            blob += b"\0" * (-len(blob) % 4)
            index[-1]["s"] = len(blob)
            blob += s.tobytes()
        else:
            index.append({"name": key, "shape": list(a.shape), "f": len(blob)})
            blob += a.astype(np.float32).tobytes()
    with open(os.path.join(WEB, f"{name}.bin"), "wb") as f:
        f.write(blob)
    meta = {k: cfg[k] for k in ("vocab", "block", "n_embd", "n_head", "n_layer")}
    with open(os.path.join(WEB, f"{name}.json"), "w") as f:
        json.dump({"cfg": meta, "tensors": index, "bytes": len(blob)}, f)
    print(f"{name}: {len(blob) / 1e6:.1f} MB")


def dequantized(path):
    """The model as the page will see it: every matrix rounded through int8."""
    m = load_sft(path)
    with torch.no_grad():
        for n, p in m.named_parameters():
            if p.dim() == 2:
                q, s = quantize(p.numpy())
                p.copy_(torch.from_numpy(q.astype(np.float32) * s[:, None]))
    return m


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", default=list(MODELS), help="which models (default all)")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    tok = Tokenizer.load(TOK)
    if args.check:
        chat = Chat(tok)
        qs = ["How do I quit vi?", "Is a 2400 baud modem worth it?", "What is a SIMM?", "Should I buy an Amiga?"]
        for name in args.names:
            a, b = load_sft(MODELS[name]), dequantized(MODELS[name])
            for q in qs:
                print(f"{name} | {q}\n  f32:  {answer(a, chat, q, top_k=1)}\n  int8: {answer(b, chat, q, top_k=1)}")
        sys.exit()
    os.makedirs(WEB, exist_ok=True)
    with open(os.path.join(WEB, "tok.json"), "w") as f:
        json.dump({"pattern": SPLIT_PATTERN, "merges": [[a, b, c] for (a, b), c in tok.merges.items()], "special": tok.special}, f)
    for name in args.names:
        export(name, MODELS[name])
