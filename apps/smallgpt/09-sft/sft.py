"""Step 9, part 2: SFT — pretraining again, on conversations, with a mask.

Start from the Usenet base model (out/usenet/final.pt) and train it on
09-sft/qa.jsonl. Three things are new, and only three:

  format  two new tokens, <|user|> and <|assistant|>, so a conversation reads
             <|user|> question <|assistant|> answer <|endoftext|>
          The vocabulary grows from 8,192 to 8,194: two new rows in the
          embedding table (which is also the output head), started at the
          average of the existing rows plus a little noise.
  mask    the loss only counts the tokens the model should learn to write:
          the answer and the <|endoftext|> after it. The question is input,
          not something to imitate. (--no-mask trains on every token, to compare.)
  data    3,000 short conversations instead of 1.9 million posts, so a few
          hundred rounds at a tenth of the pretraining learning rate.

Everything else is step 6's loop: AdamW, warmup + cosine, gradient clipping.

Run:  .venv/bin/python 09-sft/sft.py          (a few minutes on the iMac)
Writes out/sft/final.pt and out/sft/log.jsonl.
"""

import argparse
import json
import math
import os
import random
import sys
import time

import torch
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "05-attention"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import EOT, Tokenizer  # noqa: E402
from model import GPT, Config  # noqa: E402

BASE = os.path.join(ROOT, "out", "usenet", "final.pt")
DATA = os.path.join(HERE, "qa.jsonl")
TOK = os.path.join(ROOT, "06b-usenet", "tok8192.json")
OUT = os.path.join(ROOT, "out", "sft")

EPOCHS = 4
BATCH = 32
LR, MIN_LR = 1e-4, 1e-5   # a tenth of pretraining: nudge the model, don't overwrite it
WARMUP = 30
WEIGHT_DECAY = 0.1
GRAD_CLIP = 1.0
EVAL_EVERY = 25
VAL_EVERY_NTH = 20        # every 20th pair is held out

device = "mps" if torch.backends.mps.is_available() else "cpu"


class Chat:
    """The base tokenizer plus the two conversation tokens."""

    def __init__(self, tok):
        self.tok = tok
        self.eot = tok.special[EOT]
        self.user = len(tok.vocab) + len(tok.special)        # 8192
        self.assistant = self.user + 1                       # 8193
        self.vocab = self.assistant + 1

    def prompt(self, q):
        return [self.user] + self.tok.encode(q) + [self.assistant]

    def example(self, q, a):
        """Token ids and where the answer starts."""
        p = self.prompt(q)
        return p + self.tok.encode(a) + [self.eot], len(p)

    def decode(self, ids):
        names = {self.user: "<|user|>", self.assistant: "<|assistant|>"}
        out, run = [], []
        for i in ids:
            if i in names:
                out.append(self.tok.decode(run)); run = []
                out.append(names[i])
            else:
                run.append(i)
        out.append(self.tok.decode(run))
        return "".join(out)


def load_base(chat):
    """The pretrained model with two new rows in its embedding table."""
    ck = torch.load(BASE, map_location="cpu")
    cfg = Config(**{**ck["cfg"], "vocab": chat.vocab})
    model = GPT(cfg)
    model.head.weight = model.tok_emb.weight
    sd = ck["model"]
    old = sd["tok_emb.weight"]
    torch.manual_seed(0)
    new = old.mean(0, keepdim=True) + 0.02 * torch.randn(chat.vocab - old.shape[0], old.shape[1])
    sd["tok_emb.weight"] = sd["head.weight"] = torch.cat([old, new])
    model.load_state_dict(sd)
    return model


def load_sft(path, chat=None):
    ck = torch.load(path, map_location="cpu")
    model = GPT(Config(**ck["cfg"]))
    model.head.weight = model.tok_emb.weight
    model.load_state_dict(ck["model"])
    return model.eval()


def batches(examples, mask, shuffle):
    """Pad each batch to its longest example. y = -100 where the loss should not look."""
    order = list(range(len(examples)))
    if shuffle:
        random.shuffle(order)
    for s in range(0, len(order), BATCH):
        chunk = [examples[i] for i in order[s:s + BATCH]]
        T = max(len(ids) for ids, _ in chunk) - 1
        x = torch.zeros(len(chunk), T, dtype=torch.long)
        y = torch.full((len(chunk), T), -100, dtype=torch.long)
        for b, (ids, a0) in enumerate(chunk):
            n = len(ids) - 1
            x[b, :n] = torch.tensor(ids[:-1])
            y[b, :n] = torch.tensor(ids[1:])
            if mask:
                y[b, :a0 - 1] = -100        # y[j] is ids[j+1]: only predictions of answer tokens count
        yield x.to(device), y.to(device)


def loss_of(model, x, y):
    logits = model(x)
    return F.cross_entropy(logits.view(-1, logits.shape[-1]), y.view(-1), ignore_index=-100)


@torch.no_grad()
def val_loss(model, val):
    """Loss on the held-out answers only, whichever way the model was trained."""
    model.eval()
    tot, n = 0.0, 0
    for x, y in batches(val, mask=True, shuffle=False):
        k = (y != -100).sum().item()
        tot += loss_of(model, x, y).item() * k
        n += k
    model.train()
    return tot / n


@torch.no_grad()
def answer(model, chat, q, n=120, temperature=0.7, top_k=40):
    """Sample after <|assistant|> until <|endoftext|>."""
    idx = torch.tensor([chat.prompt(q)], device=next(model.parameters()).device)
    out = []
    for _ in range(n):
        logits = model(idx[:, -model.cfg.block:])[:, -1, :] / temperature
        v, _ = torch.topk(logits, top_k)
        logits[logits < v[:, [-1]]] = -float("inf")
        nxt = torch.multinomial(F.softmax(logits, dim=-1), 1)
        if nxt.item() == chat.eot:
            break
        out.append(nxt.item())
        idx = torch.cat([idx, nxt], dim=1)
    return chat.decode(out).strip()


def split(rows):
    train = [r for i, r in enumerate(rows) if i % VAL_EVERY_NTH]
    val = [r for i, r in enumerate(rows) if i % VAL_EVERY_NTH == 0]
    return train, val


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-mask", action="store_true", help="train on every token, question included")
    ap.add_argument("--lr", type=float, default=LR, help="peak learning rate")
    ap.add_argument("--out", default="", help="output folder name under out/ (default sft, or sft-nomask)")
    args = ap.parse_args()
    LR, MIN_LR = args.lr, args.lr / 10
    mask = not args.no_mask
    out_dir = os.path.join(ROOT, "out", args.out) if args.out else (OUT if mask else OUT + "-nomask")
    os.makedirs(out_dir, exist_ok=True)

    chat = Chat(Tokenizer.load(TOK))
    rows = [json.loads(l) for l in open(DATA)]
    train_rows, val_rows = split(rows)
    enc = lambda rs: [chat.example(r["q"], r["a"]) for r in rs]  # noqa: E731
    train, val = enc(train_rows), enc(val_rows)
    longest = max(len(ids) for ids, _ in train + val)
    assert longest <= 256, longest
    answer_tokens = sum(len(ids) - a0 for ids, a0 in train)
    all_tokens = sum(len(ids) - 1 for ids, _ in train)

    random.seed(1337); torch.manual_seed(1337)
    model = load_base(chat).to(device)
    total = EPOCHS * math.ceil(len(train) / BATCH)
    decay = [p for n, p in model.named_parameters() if p.dim() >= 2]
    no_decay = [p for n, p in model.named_parameters() if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": WEIGHT_DECAY}, {"params": no_decay, "weight_decay": 0.0}], lr=LR, betas=(0.9, 0.95))

    def lr_at(step):
        if step < WARMUP:
            return LR * (step + 1) / WARMUP
        p = (step - WARMUP) / max(1, total - WARMUP)
        return MIN_LR + 0.5 * (LR - MIN_LR) * (1 + math.cos(math.pi * p))

    probe = [r["q"] for r in val_rows[:4]]
    print(f"device {device}; {len(train):,} train / {len(val):,} val conversations; longest {longest} tokens; "
          f"{answer_tokens:,} of {all_tokens:,} training tokens are answers ({100 * answer_tokens / all_tokens:.0f}%); "
          f"mask {'on' if mask else 'off'}; {total} rounds of {BATCH}", flush=True)
    log = open(os.path.join(out_dir, "log.jsonl"), "w")
    t0, step = time.time(), 0
    for epoch in range(EPOCHS):
        for x, y in batches(train, mask, shuffle=True):
            if step % EVAL_EVERY == 0:
                v = val_loss(model, val)
                print(f"step {step:4d}  epoch {epoch}  val {v:.3f}  ({time.time() - t0:.0f} s)", flush=True)
                log.write(json.dumps({"step": step, "val": round(v, 4)}) + "\n"); log.flush()
            for g in opt.param_groups:
                g["lr"] = lr_at(step)
            loss = loss_of(model, x, y)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
            opt.step()
            step += 1
        model.eval()
        for q in probe[:2]:
            print(f"    {q}\n      -> {answer(model, chat, q)}", flush=True)
        model.train()
    v = val_loss(model, val)
    print(f"step {step:4d}  done  val {v:.3f}  ({time.time() - t0:.0f} s)", flush=True)
    log.write(json.dumps({"step": step, "val": round(v, 4)}) + "\n")
    torch.save({"model": model.state_dict(), "cfg": model.cfg.__dict__, "step": step, "mask": mask}, os.path.join(out_dir, "final.pt"))
    print(f"wrote {os.path.join(out_dir, 'final.pt')}")
