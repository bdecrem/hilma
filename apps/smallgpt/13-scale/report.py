"""Step 13: the loss curve, 92M against step 6b's 10M, by tokens read.

Run:  .venv/bin/python 13-scale/report.py   -> 13-scale/figures/loss.png
"""

import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def curve(path, tokens_per_step):
    rows = [json.loads(l) for l in open(path)]
    rows = [r for r in rows if "val" in r]
    return [r["step"] * tokens_per_step / 1e9 for r in rows], [r["val"] for r in rows]


small = curve(os.path.join(ROOT, "out", "usenet", "log.jsonl"), 64 * 256)
big = curve(os.path.join(ROOT, "out", "scale", "log.jsonl"), 524288)
os.makedirs(os.path.join(HERE, "figures"), exist_ok=True)
plt.figure(figsize=(8, 4.5))
plt.plot(*small, label=f"10M, 6 layers, one pass, 7.8 h on the mini (ends {small[1][-1]:.2f})")
plt.plot(*big, label=f"92M, 12 layers, four passes, 9 min on 8 H100s (ends {big[1][-1]:.2f})")
for k in (1, 2, 3):
    plt.axvline(k * 0.497, color="#bbb", lw=0.8, ls=":")
plt.ylim(2.6, 5)
plt.xlabel("billions of tokens read (dotted: each new pass over the Usenet data)")
plt.ylabel("held-out loss")
plt.title("Same data, nine times the model")
plt.legend()
plt.tight_layout()
plt.savefig(os.path.join(HERE, "figures", "loss.png"), dpi=150)
print("wrote 13-scale/figures/loss.png", small[1][-1], big[1][-1])
