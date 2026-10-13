"""Step 6: pretraining the GPT — step 5's model with bigger numbers, trained
for hours, with the training loop everyone actually uses.

  model      6 blocks, 8 heads, vectors of 320, windows of 256; the output
             head shares the embedding table (as GPT-2 does): ~10 M parameters
  optimizer  AdamW, learning rate warmed up over the first 500 rounds and
             then decayed on a cosine down to 10% by the end; weight decay;
             gradients clipped at 1.0 so one bad batch can't throw the weights
  loop       train + val loss every EVAL_EVERY rounds, three samples and a
             checkpoint every SAMPLE_EVERY rounds, everything appended to
             out/pretrain/log.jsonl so the run can be read while it goes

Run:  nohup .venv/bin/python -u 06-pretrain/train.py > out/pretrain/run.log 2>&1 &
Resume after an interruption with --resume (continues from the last checkpoint).
"""

import argparse
import json
import math
import os
import sys
import time

import torch
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "05-attention"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
sys.path.insert(0, os.path.join(ROOT, "03-dataset"))
from batches import get_batch, tokens  # noqa: E402
from bpe import Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

CFG = Config(vocab=8192, block=256, n_embd=320, n_head=8, n_layer=6, dropout=0.0)
BATCH = 64
EPOCHS = 2      # 200 M tokens: about the right amount for a 10 M model
LR, MIN_LR = 6e-4, 6e-5
WARMUP = 500
WEIGHT_DECAY = 0.1
GRAD_CLIP = 1.0
EVAL_EVERY, EVAL_BATCHES = 200, 20
SAMPLE_EVERY = 1000
PROMPTS = [
    "Once upon a time, there was a little girl named",
    "Tim and Sue went to the park to",
    "My Macintosh crashed again and I think the problem is",
]
OUT = os.path.join(ROOT, "out", "pretrain")
CKPT = os.path.join(OUT, "ckpt.pt")

device = "mps" if torch.backends.mps.is_available() else "cpu"
tok = Tokenizer.load(os.path.join(ROOT, "02-tokenizer", "tok8192.json"))


def lr_at(step, total):
    """Warm up linearly, then cosine down to MIN_LR."""
    if step < WARMUP:
        return LR * (step + 1) / WARMUP
    progress = (step - WARMUP) / max(1, total - WARMUP)
    return MIN_LR + 0.5 * (LR - MIN_LR) * (1 + math.cos(math.pi * progress))


def loss_of(model, x, y):
    logits = model(x)
    return F.cross_entropy(logits.view(-1, logits.shape[-1]), y.view(-1))


@torch.no_grad()
def evaluate(model):
    model.eval()
    out = {}
    for split in ("train", "val"):
        out[split] = sum(loss_of(model, *get_batch(split, BATCH, CFG.block, device)).item() for _ in range(EVAL_BATCHES)) / EVAL_BATCHES
    model.train()
    return out


@torch.no_grad()
def samples(model, n=40):
    model.eval()
    res = []
    for p in PROMPTS:
        start = torch.tensor([tok.encode(p)], device=device)
        out = model.sample(start, n)[0, start.shape[1]:].tolist()
        res.append(p + "|" + tok.decode(out).replace("\n", " "))
    model.train()
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--steps", type=int, default=0, help="override the step count (0 = EPOCHS over the data)")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    n_train = len(tokens("train"))
    total = args.steps or EPOCHS * n_train // (BATCH * CFG.block)
    torch.manual_seed(1337)
    model = GPT(CFG).to(device)
    model.head.weight = model.tok_emb.weight           # weight tying: one table for in and out
    n_params = sum(p.numel() for p in model.parameters())

    # weight decay on the matrices, not on the biases and layer-norm scales
    decay = [p for n, p in model.named_parameters() if p.dim() >= 2]
    no_decay = [p for n, p in model.named_parameters() if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": WEIGHT_DECAY}, {"params": no_decay, "weight_decay": 0.0}], lr=LR, betas=(0.9, 0.95))

    step = 0
    if args.resume and os.path.exists(CKPT):
        ck = torch.load(CKPT, map_location=device)
        model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); step = ck["step"] + 1
        print(f"resumed at step {step}")
    else:
        with open(os.path.join(OUT, "log.jsonl"), "w"):
            pass

    print(f"device {device}; {n_params:,} parameters; {n_train:,} train tokens; {total:,} steps of {BATCH}x{CFG.block} = {EPOCHS} passes", flush=True)
    log = open(os.path.join(OUT, "log.jsonl"), "a")
    t0 = time.time()
    while step <= total:
        if step % EVAL_EVERY == 0:
            ev = evaluate(model)
            rec = {"step": step, "train": round(ev["train"], 4), "val": round(ev["val"], 4), "lr": lr_at(step, total), "elapsed": round(time.time() - t0)}
            print(f"step {step:6d}  train {ev['train']:.3f}  val {ev['val']:.3f}  lr {rec['lr']:.2e}  ({rec['elapsed']} s)", flush=True)
            log.write(json.dumps(rec) + "\n"); log.flush()
        if step % SAMPLE_EVERY == 0 or step == total:
            ss = samples(model)
            for s in ss:
                print("    " + s, flush=True)
            log.write(json.dumps({"step": step, "samples": ss}) + "\n"); log.flush()
            torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "step": step, "cfg": CFG.__dict__}, CKPT)
        if step == total:
            break
        for g in opt.param_groups:
            g["lr"] = lr_at(step, total)
        x, y = get_batch("train", BATCH, CFG.block, device)
        loss = loss_of(model, x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
        opt.step()
        step += 1

    torch.save({"model": model.state_dict(), "step": step, "cfg": CFG.__dict__}, os.path.join(OUT, "final.pt"))
    print(f"done: {total:,} steps in {(time.time() - t0) / 3600:.1f} h; wrote out/pretrain/final.pt", flush=True)
