"""Step 1: backpropagation from scratch.

A Value is one number that remembers how it was made: which Values went into
it and which operation combined them. Chaining Values builds a graph. Calling
backward() on the final Value walks that graph in reverse and fills in every
Value's .grad: how much the final result would move if this number were
nudged up by a tiny amount. That is the chain rule, written as code.

Below the Value class: a neuron, a layer and a multi-layer net (MLP) built out
of Values, so the same backward() trains a neural network.

No PyTorch in this file. (After Karpathy's micrograd.)
"""

import math


class Value:
    def __init__(self, data, _children=(), _op=""):
        self.data = data          # the number
        self.grad = 0.0           # d(final result) / d(this number), filled in by backward()
        self._prev = set(_children)  # the Values this one was made from
        self._op = _op            # the operation that made it ("+", "*", "tanh" ...), for drawing
        self._backward = lambda: None  # how to pass gradient to _prev; set by each operation

    def __repr__(self):
        return f"Value(data={self.data:.4f}, grad={self.grad:.4f})"

    # --- the operations -------------------------------------------------------
    # Each one does two things: computes the forward result, and defines how the
    # gradient flows back to its inputs (the local derivative times out.grad —
    # the chain rule). "+=" because a Value used twice collects gradient twice.

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other), "+")

        def _backward():
            self.grad += 1.0 * out.grad   # d(a+b)/da = 1
            other.grad += 1.0 * out.grad  # d(a+b)/db = 1
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other), "*")

        def _backward():
            self.grad += other.data * out.grad  # d(a*b)/da = b
            other.grad += self.data * out.grad  # d(a*b)/db = a
        out._backward = _backward
        return out

    def __pow__(self, k):
        assert isinstance(k, (int, float)), "only constant exponents"
        out = Value(self.data ** k, (self,), f"**{k}")

        def _backward():
            self.grad += k * self.data ** (k - 1) * out.grad  # d(a^k)/da = k·a^(k-1)
        out._backward = _backward
        return out

    def exp(self):
        out = Value(math.exp(self.data), (self,), "exp")

        def _backward():
            self.grad += out.data * out.grad  # d(e^a)/da = e^a, which is out.data
        out._backward = _backward
        return out

    def tanh(self):
        # The squashing function a neuron applies to its sum: maps any number into (-1, 1).
        t = math.tanh(self.data)
        out = Value(t, (self,), "tanh")

        def _backward():
            self.grad += (1 - t ** 2) * out.grad  # d(tanh a)/da = 1 - tanh(a)^2
        out._backward = _backward
        return out

    # The rest are spelled with the ones above, so they need no backward of their own.
    def __neg__(self):
        return self * -1

    def __sub__(self, other):
        return self + (-other)

    def __truediv__(self, other):
        return self * other ** -1

    def __radd__(self, other):  # 2 + v
        return self + other

    def __rmul__(self, other):  # 2 * v
        return self * other

    def __rsub__(self, other):  # 2 - v
        return other + (-self)

    # --- backpropagation ------------------------------------------------------

    def backward(self):
        """Fill in .grad for every Value this one was computed from."""
        # Order the graph so every Value comes after the Values it depends on
        # (a topological sort), then visit in reverse: from the result back to the inputs.
        order = []
        seen = set()

        def visit(v):
            if v not in seen:
                seen.add(v)
                for child in v._prev:
                    visit(child)
                order.append(v)
        visit(self)

        self.grad = 1.0  # d(result)/d(result) = 1: the starting point of the chain rule
        for v in reversed(order):
            v._backward()


# --- a neural net made of Values ----------------------------------------------

import random


class Neuron:
    """One neuron: a weighted sum of its inputs plus a bias, squashed by tanh."""

    def __init__(self, n_inputs):
        self.w = [Value(random.uniform(-1, 1)) for _ in range(n_inputs)]
        self.b = Value(random.uniform(-1, 1))

    def __call__(self, x):
        act = sum((wi * xi for wi, xi in zip(self.w, x)), self.b)  # w·x + b
        return act.tanh()

    def parameters(self):
        return self.w + [self.b]


class Layer:
    """A row of neurons that all read the same inputs."""

    def __init__(self, n_inputs, n_outputs):
        self.neurons = [Neuron(n_inputs) for _ in range(n_outputs)]

    def __call__(self, x):
        outs = [n(x) for n in self.neurons]
        return outs[0] if len(outs) == 1 else outs

    def parameters(self):
        return [p for n in self.neurons for p in n.parameters()]


class MLP:
    """Layers stacked: the outputs of one are the inputs of the next."""

    def __init__(self, n_inputs, layer_sizes):
        sizes = [n_inputs] + layer_sizes
        self.layers = [Layer(sizes[i], sizes[i + 1]) for i in range(len(layer_sizes))]

    def __call__(self, x):
        for layer in self.layers:
            x = layer(x)
        return x

    def parameters(self):
        return [p for layer in self.layers for p in layer.parameters()]
