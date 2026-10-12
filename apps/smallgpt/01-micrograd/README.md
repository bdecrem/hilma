# 1 · Backpropagation from scratch (micrograd)

No PyTorch here. Three files:

- `micrograd.py` — the `Value` class (a number that remembers how it was made,
  and can pass a gradient back to its inputs) and a neural net built out of
  it: `Neuron` → `Layer` → `MLP`. About 150 lines; the comments say what each
  operation's local derivative is.
- `draw.py` — one neuron's math by hand (`tanh(x1*w1 + x2*w2 + b)`), drawn as
  a graph with every node's data and grad after `backward()`.
- `train.py` — the training loop: four example rows, an MLP with 41 weights,
  20 rounds of forward → loss → backward → nudge.

```bash
cd apps/smallgpt
.venv/bin/python 01-micrograd/draw.py    # → figures/expression.png
.venv/bin/python 01-micrograd/train.py   # → figures/loss.png
```

## What to look at

**`figures/expression.png`.** Read it left to right: inputs and weights on the
left, the result `o = 0.7071` on the right. Every box has `data` (the number)
and `grad` (how much `o` moves if that number goes up by one). `w2`'s grad is
0 because it is multiplied by `x2 = 0` — nudging it changes nothing. `x1`'s
grad is −1.5: it is multiplied by `w1 = −3`, then the `tanh` scales it by
0.5. That is the chain rule: each node's grad is the next node's grad times
the local derivative.

**`train.py`'s output.** The loss falls from 6.0 to 0.06 in 20 steps and the
predictions land next to the targets (`+0.86, −0.98, −0.86, +0.86` for
`+1, −1, −1, +1`). The four lines marked 1–4 in the loop are the whole
training algorithm; every later step of this project is those four lines on
bigger tensors.

## The two things worth staring at in the code

- Every operation (`__add__`, `__mul__`, `tanh`) builds its result **and**
  writes a tiny `_backward` closure saying how gradient flows to its inputs.
  `backward()` just calls those closures in reverse order. There is no other
  machinery.
- `p.grad = 0.0` before each round. Gradients add up (`+=`) because one Value
  can feed into several places; forgetting to clear them is the classic bug
  (PyTorch's `optimizer.zero_grad()` is the same line).
