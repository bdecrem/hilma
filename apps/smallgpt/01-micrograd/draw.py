"""Draw the graph behind a Value: every node with its data and grad, every operation.

Run:  .venv/bin/python 01-micrograd/draw.py
Writes figures/expression.png — one neuron's worth of math (w1*x1 + w2*x2 + b,
then tanh), after backward() has filled in the gradients.
"""

import os
import sys

from graphviz import Digraph

sys.path.insert(0, os.path.dirname(__file__))
from micrograd import Value  # noqa: E402


def draw(root, path):
    nodes, edges = set(), set()

    def collect(v):
        if v not in nodes:
            nodes.add(v)
            for child in v._prev:
                edges.add((child, v))
                collect(child)
    collect(root)

    g = Digraph(format="png", graph_attr={"rankdir": "LR"})  # left to right: inputs → result
    for v in nodes:
        label = getattr(v, "name", "")
        g.node(str(id(v)), label=f"{{ {label} | data {v.data:.4f} | grad {v.grad:.4f} }}", shape="record")
        if v._op:
            # a small circle for the operation, feeding into the value it made
            g.node(str(id(v)) + v._op, label=v._op)
            g.edge(str(id(v)) + v._op, str(id(v)))
    for a, b in edges:
        g.edge(str(id(a)), str(id(b)) + b._op)
    g.render(path, cleanup=True)


if __name__ == "__main__":
    # One neuron, by hand: two inputs, two weights, a bias, tanh.
    x1, x2 = Value(2.0), Value(0.0)
    w1, w2 = Value(-3.0), Value(1.0)
    b = Value(6.8813735870195432)  # chosen so the sum lands at 0.8814 and tanh gives a round 0.7071
    x1w1 = x1 * w1
    x2w2 = x2 * w2
    s = x1w1 + x2w2
    n = s + b
    o = n.tanh()
    for v, name in [(x1, "x1"), (x2, "x2"), (w1, "w1"), (w2, "w2"), (b, "b"),
                    (x1w1, "x1*w1"), (x2w2, "x2*w2"), (s, "x1*w1 + x2*w2"), (n, "n"), (o, "o")]:
        v.name = name

    o.backward()

    out = os.path.join(os.path.dirname(__file__), "figures", "expression")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    draw(o, out)
    print(f"o = {o.data:.4f}")
    print("gradients: how much o moves per unit nudge of each input")
    for v in [x1, w1, x2, w2, b]:
        print(f"  {v.name:>3}  data {v.data:+.4f}  grad {v.grad:+.4f}")
    print(f"wrote {out}.png")
