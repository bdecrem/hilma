"""Step 4: the simplest language model — a bigram table.

The whole model is one table of 8,192 rows × 8,192 columns. Row i holds, for
token i, a score (a "logit") for every token that could come next. Softmax
turns a row of scores into probabilities; the loss (cross-entropy) is the
negative log of the probability the model gave the token that really came
next. Train with step 3's batches, then sample from it.

Run:  .venv/bin/python 04-bigram/train.py        (a few minutes on mps)
Prints the loss as it falls, samples before and after, the top next tokens for
a few words; writes figures/loss.png and out/bigram.pt.
"""

import math
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
sys.path.insert(0, os.path.join(ROOT, "03-dataset"))
from bpe import EOT, Tokenizer  # noqa: E402
from batches import get_batch  # noqa: E402

VOCAB = 8192
BATCH, BLOCK = 64, 256      # 64 fragments of 256 tokens = 16,384 exercises per step
STEPS = 3000
LR = 1e-2
EVAL_EVERY = 100

device = "mps" if torch.backends.mps.is_available() else "cpu"
torch.manual_seed(1337)
tok = Tokenizer.load(os.path.join(ROOT, "02-tokenizer", "tok8192.json"))
eot = tok.special[EOT]


class Bigram(nn.Module):
    def __init__(self, vocab):
        super().__init__()
        # one row per token: the scores it gives every possible next token
        self.table = nn.Embedding(vocab, vocab)

    def forward(self, x):
        return self.table(x)            # (batch, block) -> (batch, block, vocab) of logits

    @torch.no_grad()
    def sample(self, n, start=eot):
        ids = [start]
        for _ in range(n):
            logits = self.table.weight[ids[-1]]            # the row for the current token
            probs = F.softmax(logits, dim=-1)              # scores -> probabilities
            ids.append(torch.multinomial(probs, 1).item())  # roll the dice
        return ids[1:]

    @torch.no_grad()
    def top_next(self, token, k=5):
        probs = F.softmax(self.table.weight[token], dim=-1)
        p, i = probs.topk(k)
        return [(tok.decode([j]), round(q, 3)) for q, j in zip(p.tolist(), i.tolist())]


def loss_of(model, x, y):
    logits = model(x)                                   # (B, T, V)
    return F.cross_entropy(logits.view(-1, VOCAB), y.view(-1))


@torch.no_grad()
def val_loss(model, n=20):
    return sum(loss_of(model, *get_batch("val", BATCH, BLOCK, device)).item() for _ in range(n)) / n


if __name__ == "__main__":
    model = Bigram(VOCAB).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"device {device}; the model is one {VOCAB}x{VOCAB} table = {n_params:,} numbers, all random\n")

    # The loss, by hand, for one position — to see that cross-entropy is just
    # "minus the log of the probability given to the right answer".
    x, y = get_batch("train", 1, 4, device)
    logits = model(x)[0, 0]                     # scores for what follows x[0,0]
    probs = F.softmax(logits, dim=-1)           # 8,192 numbers that sum to 1
    p_right = probs[y[0, 0]].item()             # the one the real next token got
    print(f"one position: x={tok.decode([x[0,0].item()])!r} -> real next {tok.decode([y[0,0].item()])!r}")
    print(f"  the random model gives the right answer p = {p_right:.6f}  (1/8192 = {1/VOCAB:.6f})")
    print(f"  -log(p) = {-math.log(p_right):.3f};  torch's cross_entropy = {F.cross_entropy(logits, y[0,0]).item():.3f};  ln(8192) = {math.log(VOCAB):.3f}\n")

    print("sample before training:")
    print("  " + repr(tok.decode(model.sample(40))) + "\n")

    opt = torch.optim.AdamW(model.parameters(), lr=LR)
    log = []
    t0 = time.time()
    for step in range(STEPS + 1):
        if step % EVAL_EVERY == 0:
            vl = val_loss(model)
            tl = loss_of(model, *get_batch("train", BATCH, BLOCK, device)).item()
            log.append((step, tl, vl))
            print(f"step {step:5d}  train {tl:.3f}  val {vl:.3f}   ({time.time() - t0:.0f} s)")
        if step == STEPS:
            break
        x, y = get_batch("train", BATCH, BLOCK, device)
        loss = loss_of(model, x, y)         # 1. forward + how wrong
        opt.zero_grad()                     # 2. clear last round's gradients
        loss.backward()                     # 3. backprop (step 1's machine, PyTorch's version)
        opt.step()                          # 4. nudge every number in the table

    print("\nsample after training:")
    for _ in range(3):
        print("  " + repr(tok.decode(model.sample(40))))

    print("\nwhat the table learned — the top next tokens for:")
    for word in [" the", " Tim", " Macintosh", " Once", "."]:
        print(f"  {word!r:14} -> " + ", ".join(f"{w!r} {p}" for w, p in model.top_next(tok.encode(word)[-1])))

    os.makedirs(os.path.join(HERE, "figures"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    torch.save(model.state_dict(), os.path.join(ROOT, "out", "bigram.pt"))
    steps, tl, vl = zip(*log)
    plt.figure(figsize=(7, 4))
    plt.plot(steps, tl, label="train")
    plt.plot(steps, vl, label="val")
    plt.axhline(math.log(VOCAB), ls="--", c="gray", label="ln(8192): pure guessing")
    plt.xlabel("step"); plt.ylabel("loss (cross-entropy)"); plt.legend(); plt.title("bigram model")
    plt.tight_layout(); plt.savefig(os.path.join(HERE, "figures", "loss.png"), dpi=150)
    print(f"\nwrote figures/loss.png and out/bigram.pt  ({time.time() - t0:.0f} s)")
