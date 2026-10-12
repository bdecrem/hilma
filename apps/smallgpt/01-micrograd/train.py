"""Train a tiny neural net with micrograd: the whole training loop in 20 lines.

Run:  .venv/bin/python 01-micrograd/train.py
Prints the loss each round and the final predictions; writes figures/loss.png.

Four example inputs (three numbers each) with a target answer of +1 or -1.
The net has 3 inputs → 4 neurons → 4 neurons → 1 output: 41 weights in all.
"""

import os
import random
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(__file__))
from micrograd import MLP  # noqa: E402

random.seed(1337)

xs = [
    [2.0, 3.0, -1.0],
    [3.0, -1.0, 0.5],
    [0.5, 1.0, 1.0],
    [1.0, 1.0, -1.0],
]
ys = [1.0, -1.0, -1.0, 1.0]  # the answers we want for each row

net = MLP(3, [4, 4, 1])
print(f"{len(net.parameters())} weights, all random to start\n")

losses = []
for step in range(40):
    # 1. forward: a guess for every example
    preds = [net(x) for x in xs]
    # 2. loss: how wrong the guesses are, one number (sum of squared errors)
    loss = sum((p - y) ** 2 for p, y in zip(preds, ys))
    # 3. backward: for every weight, which way would reduce the loss, and how strongly
    for p in net.parameters():
        p.grad = 0.0  # gradients accumulate with +=, so clear last round's first
    loss.backward()
    # 4. gradient descent: nudge every weight against its gradient
    for p in net.parameters():
        p.data -= 0.05 * p.grad  # 0.05 is the learning rate: the size of the nudge
    losses.append(loss.data)
    print(f"step {step:2d}  loss {loss.data:.4f}")

print("\ntargets    ", [f"{y:+.0f}" for y in ys])
print("predictions", [f"{p.data:+.2f}" for p in preds])

out = os.path.join(os.path.dirname(__file__), "figures", "loss.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
plt.figure(figsize=(6, 3.5))
plt.plot(losses, marker="o")
plt.xlabel("step")
plt.ylabel("loss")
plt.title("micrograd: loss over 40 steps of gradient descent")
plt.tight_layout()
plt.savefig(out, dpi=150)
print(f"wrote {out}")
