"""Step 5: one attention head walked through by hand, then a one-block model
trained to beat the bigram.

Run:  .venv/bin/python 05-attention/train.py       (a few minutes on mps)

1. One head on one short sentence, untrained: prints the (T x T) table of
   attention weights so the mask and the rows-sum-to-1 are visible.
2. Trains a GPT with one Transformer block (4 heads, 128-wide vectors, windows
   of 256) on step 3's batches. Prints train/val loss; the bigram got 4.19.
3. Draws the trained heads' attention on a sentence: figures/attention.png.
   Samples, and writes out/block1.pt.
"""

import math
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
sys.path.insert(0, os.path.join(ROOT, "03-dataset"))
from bpe import EOT, Tokenizer  # noqa: E402
from batches import get_batch  # noqa: E402
from model import GPT, Config, Head  # noqa: E402

BATCH, BLOCK = 64, 256
STEPS = 2000
LR = 1e-3
EVAL_EVERY = 100
BIGRAM_LOSS = 4.19

device = "mps" if torch.backends.mps.is_available() else "cpu"
torch.manual_seed(1337)
tok = Tokenizer.load(os.path.join(ROOT, "02-tokenizer", "tok8192.json"))
eot = tok.special[EOT]
SENTENCE = "Tim and Sue went to the park. He was happy and she was sad."


def loss_of(model, x, y):
    logits = model(x)
    return F.cross_entropy(logits.view(-1, logits.shape[-1]), y.view(-1))


@torch.no_grad()
def val_loss(model, n=20):
    model.eval()
    l = sum(loss_of(model, *get_batch("val", BATCH, BLOCK, device)).item() for _ in range(n)) / n
    model.train()
    return l


def show_weights(weights, words, title):
    print(title)
    print(" " * 10 + "".join(f"{w[:7]:>8}" for w in words))
    for i, row in enumerate(weights.tolist()):
        print(f"{words[i][:9]:>9} " + "".join(f"{v:8.2f}" if v > 0 else "       ." for v in row))
    print()


def heatmap(model, ids, words, path):
    model.eval()
    with torch.no_grad():
        model(ids.to(device))
    heads = model.blocks[0].attn.heads
    fig, axes = plt.subplots(1, len(heads), figsize=(4.2 * len(heads), 4.4))
    for h, (head, ax) in enumerate(zip(heads, axes)):
        w = head.last_weights[0].cpu()
        ax.imshow(w, cmap="Blues", vmin=0, vmax=1)
        ax.set_xticks(range(len(words))); ax.set_xticklabels(words, rotation=90, fontsize=7)
        ax.set_yticks(range(len(words))); ax.set_yticklabels(words, fontsize=7)
        ax.set_title(f"head {h + 1}", fontsize=10)
    fig.suptitle("who each token looks at (rows: the token; columns: where it looks)", fontsize=10)
    plt.tight_layout(); plt.savefig(path, dpi=150); plt.close(fig)
    model.train()


if __name__ == "__main__":
    ids = torch.tensor([tok.encode(SENTENCE)])
    words = [tok.decode([i]).replace(" ", "·") for i in ids[0].tolist()]
    T = ids.shape[1]

    # --- 1. one head, by hand, on one sentence (random weights) --------------
    cfg = Config(n_embd=128, n_head=4, block=BLOCK)
    head = Head(cfg, head_size=32)
    x = torch.randn(1, T, cfg.n_embd)          # pretend these are the tokens' vectors
    out = head(x)
    print(f"the sentence: {SENTENCE!r} = {T} tokens")
    print(f"one head: {T} vectors of 128 in -> {tuple(out.shape[1:])} out\n")
    show_weights(head.last_weights[0], words, "attention weights of an untrained head (each row sums to 1; '.' = masked, can't look ahead):")

    # --- 2. train a one-block model ------------------------------------------
    model = GPT(cfg).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"model: 1 block, 4 heads, vectors of 128, windows of 256 = {n_params:,} parameters (the bigram had 67 M)\n")
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
        loss = loss_of(model, x, y)
        opt.zero_grad()
        loss.backward()
        opt.step()
    final_val = log[-1][2]
    print(f"\nbigram: {BIGRAM_LOSS}   one block: {final_val:.3f}\n")

    # --- 3. what the trained heads look at, and samples ----------------------
    os.makedirs(os.path.join(HERE, "figures"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    heatmap(model, ids, words, os.path.join(HERE, "figures", "attention.png"))
    model.eval()
    with torch.no_grad():
        model(ids.to(device))
    for h, head in enumerate(model.blocks[0].attn.heads):
        w = head.last_weights[0].cpu()
        he = words.index("·He")
        top = w[he].topk(3)
        print(f"head {h + 1}: '·He' looks at " + ", ".join(f"{words[j]} {v:.2f}" for v, j in zip(top.values.tolist(), top.indices.tolist())))
    print()
    print("samples:")
    torch.manual_seed(7)
    for p in ["Once upon a time, there was a little girl named", "My Macintosh crashed again and I think the problem is", "Tim and Sue went to the park to"]:
        start = torch.tensor([tok.encode(p)], device=device)
        out = model.sample(start, 30)[0, start.shape[1]:].tolist()
        print("  " + p + "|" + tok.decode(out).replace("\n", " "))
    torch.save(model.state_dict(), os.path.join(ROOT, "out", "block1.pt"))

    steps, tl, vl = zip(*log)
    plt.figure(figsize=(7, 4))
    plt.plot(steps, tl, label="train"); plt.plot(steps, vl, label="val")
    plt.axhline(BIGRAM_LOSS, ls="--", c="gray", label="bigram (step 4)")
    plt.xlabel("step"); plt.ylabel("loss"); plt.legend(); plt.title("one Transformer block")
    plt.tight_layout(); plt.savefig(os.path.join(HERE, "figures", "loss.png"), dpi=150)
    print(f"\nwrote figures/attention.png, figures/loss.png, out/block1.pt  ({time.time() - t0:.0f} s)")
