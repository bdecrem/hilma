"""Step 5: attention, written out by hand, and one Transformer block.

Head        one attention head: queries, keys, values, scaled dot product,
            the causal mask, softmax, the weighted sum of values
MultiHead   several heads side by side, their outputs glued together
MLP         a small neural net applied to each token on its own
Block       attention + MLP, each with a residual path and a layer norm
GPT         token + position embeddings, N blocks, final norm, the output row
            of 8,192 logits — the same row the bigram looked up, now computed

Every head, block and matrix size is a number in Config, so step 6 can run the
same code bigger. Nothing here calls PyTorch's built-in attention.
"""

import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class Config:
    vocab: int = 8192
    block: int = 256      # how many tokens a window holds
    n_embd: int = 128     # the width of each token's vector
    n_head: int = 4       # heads per block
    n_layer: int = 1      # blocks stacked
    dropout: float = 0.0


class Head(nn.Module):
    """One attention head. Each token asks a question (query), each token
    advertises what it holds (key) and what it would pass along (value)."""

    def __init__(self, cfg, head_size):
        super().__init__()
        self.query = nn.Linear(cfg.n_embd, head_size, bias=False)
        self.key = nn.Linear(cfg.n_embd, head_size, bias=False)
        self.value = nn.Linear(cfg.n_embd, head_size, bias=False)
        # the causal mask: a lower-triangular matrix of ones, so position t can
        # only look at positions 0..t. Registered, not learned.
        self.register_buffer("mask", torch.tril(torch.ones(cfg.block, cfg.block)))
        self.drop = nn.Dropout(cfg.dropout)
        self.last_weights = None   # kept for the heatmap

    def forward(self, x):
        B, T, C = x.shape
        q = self.query(x)                            # (B, T, head_size)
        k = self.key(x)
        v = self.value(x)
        # 1. every query against every key: how relevant is token j to token i
        scores = q @ k.transpose(-2, -1)             # (B, T, T)
        scores = scores / math.sqrt(k.shape[-1])     # 2. scale, so softmax isn't too peaky
        scores = scores.masked_fill(self.mask[:T, :T] == 0, float("-inf"))  # 3. no looking ahead
        weights = F.softmax(scores, dim=-1)          # 4. each row sums to 1
        self.last_weights = weights.detach()
        weights = self.drop(weights)
        return weights @ v                           # 5. the weighted sum of values (B, T, head_size)


class MultiHead(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        head_size = cfg.n_embd // cfg.n_head
        self.heads = nn.ModuleList([Head(cfg, head_size) for _ in range(cfg.n_head)])
        self.proj = nn.Linear(cfg.n_embd, cfg.n_embd)    # mix the heads' outputs
        self.drop = nn.Dropout(cfg.dropout)

    def forward(self, x):
        out = torch.cat([h(x) for h in self.heads], dim=-1)   # (B, T, n_embd)
        return self.drop(self.proj(out))


class MLP(nn.Module):
    """Step 1's net, per token: widen, nonlinearity, narrow back."""

    def __init__(self, cfg):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(cfg.n_embd, 4 * cfg.n_embd),
            nn.GELU(),
            nn.Linear(4 * cfg.n_embd, cfg.n_embd),
            nn.Dropout(cfg.dropout),
        )

    def forward(self, x):
        return self.net(x)


class Block(nn.Module):
    """Communicate (attention), then compute (MLP). Each on a residual path:
    the block adds to x rather than replacing it, and layer norm keeps the
    numbers going in at a sane scale."""

    def __init__(self, cfg):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.n_embd)
        self.attn = MultiHead(cfg)
        self.ln2 = nn.LayerNorm(cfg.n_embd)
        self.mlp = MLP(cfg)

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.mlp(self.ln2(x))
        return x


class GPT(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.tok_emb = nn.Embedding(cfg.vocab, cfg.n_embd)   # what the token is
        self.pos_emb = nn.Embedding(cfg.block, cfg.n_embd)   # where it sits in the window
        self.blocks = nn.Sequential(*[Block(cfg) for _ in range(cfg.n_layer)])
        self.ln_f = nn.LayerNorm(cfg.n_embd)
        self.head = nn.Linear(cfg.n_embd, cfg.vocab, bias=False)  # vector -> 8,192 logits
        # start small (GPT-2's init): weights ~ N(0, 0.02), biases 0. PyTorch's
        # default puts embeddings at N(0, 1), which makes the first logits huge.
        self.apply(self._init)

    @staticmethod
    def _init(m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, mean=0.0, std=0.02)
            if isinstance(m, nn.Linear) and m.bias is not None:
                nn.init.zeros_(m.bias)

    def forward(self, idx):
        B, T = idx.shape
        x = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        x = self.blocks(x)
        x = self.ln_f(x)
        return self.head(x)                                   # (B, T, vocab)

    @torch.no_grad()
    def sample(self, idx, n, temperature=1.0):
        """idx: (1, t) tokens to continue. Appends n tokens, one at a time."""
        for _ in range(n):
            ctx = idx[:, -self.cfg.block:]                    # the last `block` tokens at most
            logits = self(ctx)[:, -1, :] / temperature       # only the last position's row
            probs = F.softmax(logits, dim=-1)
            idx = torch.cat([idx, torch.multinomial(probs, 1)], dim=1)
        return idx
