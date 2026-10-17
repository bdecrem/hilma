"""Step 9, part 5: the models and the tokenizer as files a web page can run.

The chat page at ola.cx/smallgpt/chat runs the model in the browser, in plain
JavaScript (public/smallgpt/chat/gpt.mjs), with no server. This writes what it
loads:

  tok.json           the tokenizer's merges and special tokens
  <name>.bin/.json   one model: every weight matrix as int8 with one float32
                     scale per row (a quarter of the size, ~10 MB), the small
                     vectors (biases, layer norms) as float32. The heads' query,
                     key and value matrices are stacked into one per layer.

The 92M models of step 13 are ~92 MB each, too big for the repo: their .bin
is cut into 24 MB parts named by a hash of the content and uploaded to the
public Supabase Storage bucket `smallgpt`; their .json lists the parts' URLs
and stays in public/ (needs SUPABASE_URL and SUPABASE_SERVICE_KEY from
.env.local).

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
    "cranky": os.path.join(ROOT, "out", "sft-usenet-big", "final.pt"),   # step 13, 92M
    "base": os.path.join(ROOT, "out", "scale", "best.pt"),                # step 13, 92M
    "cranky-10m": os.path.join(ROOT, "out", "sft-usenet", "final.pt"),
    "helpful": os.path.join(ROOT, "out", "sft", "final.pt"),
    "base-10m": BASE,
}
REMOTE_ABOVE = 40e6   # bytes: bigger models go to Supabase Storage
PART = 24 * 2**20
BUCKET = "smallgpt"


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
    meta = {"cfg": {k: cfg[k] for k in ("vocab", "block", "n_embd", "n_head", "n_layer")}, "tensors": index, "bytes": len(blob)}
    local = os.path.join(WEB, f"{name}.bin")
    if len(blob) > REMOTE_ABOVE:
        meta["bin"], meta["part"] = upload(name, bytes(blob)), PART
        if os.path.exists(local):
            os.remove(local)
    else:
        with open(local, "wb") as f:
            f.write(blob)
    with open(os.path.join(WEB, f"{name}.json"), "w") as f:
        json.dump(meta, f)
    print(f"{name}: {len(blob) / 1e6:.1f} MB" + (f" in {len(meta['bin'])} parts on Supabase" if "bin" in meta else ""))


def env():
    vals = {}
    for line in open(os.path.join(ROOT, "..", "..", ".env.local")):
        if "=" in line and not line.startswith("#"):
            k, v = line.rstrip("\n").split("=", 1)
            vals.setdefault(k, v.strip('"'))
    return vals["SUPABASE_URL"], vals["SUPABASE_SERVICE_KEY"]


def upload(name, blob):
    """Cut the blob into parts, upload each (named by its hash, so a URL never changes content), return their URLs."""
    import hashlib
    import urllib.request
    url, key = env()
    auth = {"Authorization": f"Bearer {key}", "apikey": key}
    try:  # the bucket, once
        req = urllib.request.Request(f"{url}/storage/v1/bucket", method="POST", headers={**auth, "Content-Type": "application/json"},
                                     data=json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode())
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        if "already exists" not in e.read().decode().lower() and e.code not in (400, 409):
            raise
    h = hashlib.sha256(blob).hexdigest()[:10]
    urls = []
    for i in range(0, len(blob), PART):
        path = f"chat/{name}.{h}.{i // PART}.bin"
        req = urllib.request.Request(f"{url}/storage/v1/object/{BUCKET}/{path}", method="POST", data=blob[i:i + PART],
                                     headers={**auth, "Content-Type": "application/octet-stream", "x-upsert": "true",
                                              "Cache-Control": "public, max-age=31536000, immutable"})
        urllib.request.urlopen(req)
        urls.append(f"{url}/storage/v1/object/public/{BUCKET}/{path}")
    return urls


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
