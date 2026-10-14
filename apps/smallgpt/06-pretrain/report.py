"""Read out/pretrain/log.jsonl (while the run goes, or after): the loss curve as
figures/loss.png and the samples at each checkpoint, so the model can be
watched going from noise to words to sentences.

Run:  .venv/bin/python 06-pretrain/report.py [path/to/log.jsonl]
"""

import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "pretrain", "log.jsonl")

losses, samples = [], []
with open(LOG) as f:
    for line in f:
        rec = json.loads(line)
        (samples if "samples" in rec else losses).append(rec)

last = losses[-1]
print(f"{len(losses)} evaluations, last at step {last['step']}: train {last['train']:.3f}  val {last['val']:.3f}  ({last['elapsed'] / 3600:.1f} h)\n")
for rec in samples:
    print(f"--- step {rec['step']}")
    for s in rec["samples"]:
        print("  " + s)
    print()

os.makedirs(os.path.join(HERE, "figures"), exist_ok=True)
steps = [r["step"] for r in losses]
plt.figure(figsize=(7, 4))
plt.plot(steps, [r["train"] for r in losses], label="train")
plt.plot(steps, [r["val"] for r in losses], label="val")
plt.axhline(4.19, ls="--", c="gray", lw=0.8, label="bigram (step 4)")
plt.axhline(3.72, ls=":", c="gray", lw=0.8, label="one attention layer (step 5)")
plt.ylim(0, 6); plt.xlabel("step (64 x 256 tokens each)"); plt.ylabel("loss"); plt.legend(); plt.title("pretraining, 10 M parameters")
plt.tight_layout(); plt.savefig(os.path.join(HERE, "figures", "loss.png"), dpi=150)
print("wrote figures/loss.png")
