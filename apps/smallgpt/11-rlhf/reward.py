"""Step 11b: the reward model, a learned stand-in for Claude's judgment.

A copy of the cranky SFT model with its 8,194 token scores swapped for one
number, read at the answer's last token (<|endoftext|>). Trained on Claude's
pairs with one loss: the better answer's number should beat the worse one's,

    loss = -log sigmoid(r_better - r_worse)

(Bradley-Terry: the difference of the two numbers is read as the log-odds that
the first answer wins). Every 20th question is held out; accuracy there is how
often the reward model agrees with Claude on answers it never trained on.

At the end the numbers are centred and scaled over all the answers (mean 0,
spread 1), so PPO gets rewards on a known scale.

Writes out/rlhf/reward.pt and out/rlhf/reward.jsonl.
Run:  .venv/bin/python 11-rlhf/reward.py     (~15 min on the mini)
"""

import json
import math
import os
import random
import time

import torch
import torch.nn.functional as F

from common import OUT, SFT, Scorer, chat, device, pad, rows, with_eot

EPOCHS = 2
BATCH = 16          # pairs per step, so 32 answers
LR, MIN_LR = 1e-5, 1e-6
WARMUP = 30
EVAL_EVERY = 100
VAL_EVERY_NTH = 20


def pairs_of(judged, c):
    out = []
    for r in judged:
        p = c.prompt(r["q"])
        for a in range(4):
            for b in range(4):
                if r["scores"][a] > r["scores"][b]:
                    out.append((p + with_eot(c, r["ids"][a]), p + with_eot(c, r["ids"][b])))
    return out


def scores(model, seqs, c):
    x, n = pad(seqs, c.eot)
    return model(x)[torch.arange(len(seqs), device=device), n - 1]


@torch.no_grad()
def accuracy(model, pairs, c):
    model.eval()
    right = 0
    for s in range(0, len(pairs), 32):
        chunk = pairs[s:s + 32]
        r = scores(model, [a for a, _ in chunk] + [b for _, b in chunk], c)
        right += (r[:len(chunk)] > r[len(chunk):]).sum().item()
    model.train()
    return right / len(pairs)


if __name__ == "__main__":
    c = chat()
    judged = rows("judged.jsonl")
    train_q = [r for k, r in enumerate(judged) if k % VAL_EVERY_NTH]
    val_q = [r for k, r in enumerate(judged) if k % VAL_EVERY_NTH == 0]
    train, val = pairs_of(train_q, c), pairs_of(val_q, c)
    shorter = sum(len(a) < len(b) for a, b in val) / len(val)
    print(f"device {device}; {len(train):,} train pairs from {len(train_q)} questions, {len(val):,} val pairs from {len(val_q)}; "
          f"'the shorter one is better' agrees with Claude on {100 * shorter:.0f}% of val pairs", flush=True)

    random.seed(11); torch.manual_seed(11)
    model = Scorer.load(SFT)
    total = EPOCHS * math.ceil(len(train) / BATCH)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.95), weight_decay=0.0)

    def lr_at(step):
        if step < WARMUP:
            return LR * (step + 1) / WARMUP
        p = (step - WARMUP) / max(1, total - WARMUP)
        return MIN_LR + 0.5 * (LR - MIN_LR) * (1 + math.cos(math.pi * p))

    os.makedirs(OUT, exist_ok=True)
    log = open(os.path.join(OUT, "reward.jsonl"), "w")
    best, step, t0, run = 0.0, 0, time.time(), []
    for epoch in range(EPOCHS):
        random.shuffle(train)
        for s in range(0, len(train), BATCH):
            if step % EVAL_EVERY == 0:
                acc = accuracy(model, val, c)
                tr = sum(run) / len(run) if run else float("nan")
                mark = ""
                if acc > best:
                    best = acc
                    model.save(os.path.join(OUT, "reward.pt"), step=step, val_acc=acc)
                    mark = "  (best)"
                print(f"step {step:4d}/{total}  epoch {epoch}  train loss {tr:.3f}  val accuracy {100 * acc:.1f}%{mark}  ({time.time() - t0:.0f} s)", flush=True)
                log.write(json.dumps({"step": step, "loss": None if not run else round(tr, 4), "val_acc": round(acc, 4)}) + "\n"); log.flush()
                run = []
            chunk = train[s:s + BATCH]
            for g in opt.param_groups:
                g["lr"] = lr_at(step)
            r = scores(model, [a for a, _ in chunk] + [b for _, b in chunk], c)
            loss = -F.logsigmoid(r[:len(chunk)] - r[len(chunk):]).mean()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            run.append(loss.item())
            step += 1
    acc = accuracy(model, val, c)
    print(f"step {step:4d}  done  val accuracy {100 * acc:.1f}%", flush=True)
    log.write(json.dumps({"step": step, "val_acc": round(acc, 4)}) + "\n")
    if acc > best:
        best = acc
        model.save(os.path.join(OUT, "reward.pt"), step=step, val_acc=acc)

    # centre and scale on every judged answer, with the best checkpoint
    model = Scorer.load(os.path.join(OUT, "reward.pt")).eval()
    allr = []
    with torch.no_grad():
        seqs = [c.prompt(r["q"]) + with_eot(c, a) for r in judged for a in r["ids"]]
        for s in range(0, len(seqs), 64):
            allr += scores(model, seqs[s:s + 64], c).tolist()
    mu = sum(allr) / len(allr)
    sd = (sum((x - mu) ** 2 for x in allr) / len(allr)) ** 0.5
    model.save(os.path.join(OUT, "reward.pt"), **model.extra, mu=mu, sd=sd)
    # how well the number tracks Claude's 1-10 on held-out questions
    vr = [(r["scores"][k], allr[4 * j + k]) for j, r in enumerate(judged) if j % VAL_EVERY_NTH == 0 for k in range(4)]
    mx, my = sum(a for a, _ in vr) / len(vr), sum(b for _, b in vr) / len(vr)
    corr = sum((a - mx) * (b - my) for a, b in vr) / math.sqrt(sum((a - mx) ** 2 for a, _ in vr) * sum((b - my) ** 2 for _, b in vr))
    print(f"best val accuracy {100 * best:.1f}%; reward mean {mu:.3f}, spread {sd:.3f}; "
          f"correlation with Claude's scores on held-out answers {corr:.2f}", flush=True)
    log.write(json.dumps({"best_val_acc": round(best, 4), "mu": mu, "sd": sd, "corr": round(corr, 3)}) + "\n")
