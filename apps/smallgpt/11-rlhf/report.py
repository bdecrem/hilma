"""Step 11: the figures.

  figures/ppo.png   reward-model score, KL from the SFT model and answer length
                    per PPO round, with the leash and without
  figures/reward.png  the reward model's agreement with Claude on held-out pairs

Run:  .venv/bin/python 11-rlhf/report.py
"""

import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from common import HERE, OUT  # noqa: E402

FIG = os.path.join(HERE, "figures")
INK, RED, BLUE, SUN, DIM = "#16121c", "#ff4b1f", "#3d3bff", "#e0a400", "#8a8172"


def read(path):
    return [json.loads(l) for l in open(path)] if os.path.exists(path) else []


def smooth(ys, k=5):
    return [sum(ys[max(0, i - k + 1):i + 1]) / len(ys[max(0, i - k + 1):i + 1]) for i in range(len(ys))]


if __name__ == "__main__":
    os.makedirs(FIG, exist_ok=True)
    plt.rcParams.update({"font.family": "monospace", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})

    runs = [("ppo", "leash 0.2", BLUE), ("ppo-0.05", "leash 0.05 (stopped)", SUN), ("ppo-noleash", "no leash", RED)]
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.8))
    for name, label, color in runs:
        recs = [r for r in read(os.path.join(OUT, name, "log.jsonl")) if "score" in r]
        if not recs:
            continue
        x = [r["round"] for r in recs]
        for ax, key in zip(axes, ("score", "kl", "length")):
            ys = [r[key] for r in recs]
            ax.plot(x, ys, color=color, alpha=0.2, lw=1)
            ax.plot(x, smooth(ys), color=color, lw=2, label=label)
    for ax, title in zip(axes, ("reward model's score (0 = the average judged answer)", "KL from the SFT model (nats per answer)", "answer length (tokens)")):
        ax.set_title(title, fontsize=10, loc="left")
        ax.set_xlabel("PPO round (64 answers each)")
    axes[0].legend(frameon=False)
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "ppo.png"), dpi=150)

    recs = [r for r in read(os.path.join(OUT, "reward.jsonl")) if "val_acc" in r and "step" in r]
    if recs:
        fig, ax = plt.subplots(figsize=(6, 3.4))
        ax.plot([r["step"] for r in recs], [100 * r["val_acc"] for r in recs], color=INK, lw=2)
        ax.axhline(50, color=DIM, lw=1, ls="--")
        ax.set_title("reward model agrees with Claude (held-out pairs, %)", fontsize=10, loc="left")
        ax.set_xlabel("training step (16 pairs each)")
        fig.tight_layout()
        fig.savefig(os.path.join(FIG, "reward.png"), dpi=150)
    print("wrote", FIG)
