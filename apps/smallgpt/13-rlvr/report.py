"""Step 13: the figure.

  figures/grpo.png   held-out accuracy per level, KL from the starting model and
                     answer length per GRPO round, with the level openings marked

Run:  .venv/bin/python 13-rlvr/report.py [run name, default grpo]
"""

import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from shared import OUT  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, "figures")
INK, RED, BLUE, SUN, DIM = "#16121c", "#ff4b1f", "#3d3bff", "#e0a400", "#8a8172"


def smooth(ys, k=5):
    return [sum(ys[max(0, i - k + 1):i + 1]) / len(ys[max(0, i - k + 1):i + 1]) for i in range(len(ys))]


if __name__ == "__main__":
    run = sys.argv[1] if len(sys.argv) > 1 else "grpo"
    recs = [json.loads(l) for l in open(os.path.join(OUT, run, "log.jsonl"))]
    rounds = [r for r in recs if "reward" in r]
    evals = [r for r in recs if "eval" in r]
    opens = [r for r in recs if "open" in r]
    os.makedirs(FIG, exist_ok=True)
    plt.rcParams.update({"font.family": "monospace", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})

    fig, axes = plt.subplots(1, 3, figsize=(13, 3.8))
    ax = axes[0]
    for lv, color, label in ((1, BLUE, "level 1: 3 + 5"), (2, SUN, "level 2: 47 + 8"), (3, RED, "level 3: 47 + 38")):
        ax.plot([e["round"] for e in evals], [100 * e["eval"][str(lv)] if str(lv) in e["eval"] else 100 * e["eval"][lv] for e in evals], color=color, lw=2, marker="o", ms=3, label=label)
    ax.set_ylim(0, 100)
    ax.set_title("held-out accuracy (%, greedy, unseen phrasing)", fontsize=10, loc="left")
    ax.legend(frameon=False, loc="upper left")
    x = [r["round"] for r in rounds]
    for ax, key, title in ((axes[1], "kl", "KL from the starting model (nats per answer)"), (axes[2], "length", "answer length (tokens)")):
        ys = [r[key] for r in rounds]
        ax.plot(x, ys, color=INK, alpha=0.2, lw=1)
        ax.plot(x, smooth(ys), color=INK, lw=2)
        ax.set_title(title, fontsize=10, loc="left")
    for ax in axes:
        ax.set_xlabel("GRPO round (32 problems x 8 answers)")
        for o in opens:
            ax.axvline(o["round"], color=DIM, lw=1, ls="--")
    for o in opens:
        axes[0].text(o["round"] + 2, 4, f"level {o['open']} opens", color=DIM, fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "grpo.png"), dpi=150)
    print(f"-> {FIG}/grpo.png   final: " + "  ".join(f"level {lv} {100 * v:.0f}%" for lv, v in evals[-1]["eval"].items()))
