"""Step 13: step 5's GPT, made fast enough for a GPU run.

Same model, same math, same weight names: a checkpoint from this file loads
into step 5's GPT and the other way round. Two things change, both for speed:

  attention   step 5 runs each head on its own and builds the causal mask by
              hand. Here the heads' query, key and value matrices are stacked
              into one matrix multiply, and PyTorch's fused attention
              (flash attention on an H100) does scores, mask, softmax and the
              weighted sum in one kernel without ever writing the T x T
              scores to memory.
  no masks    step 5 keeps a block x block mask per head as a buffer, which
              also lands in every checkpoint (144 heads x 512 x 512 floats is
              150 MB at this size). The fused call needs none.

Everything after step 9 (SFT, the chat page export) loads models through
load() below, for the small model and the big one alike.
"""

import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class Config:
    vocab: int = 8192
    block: int = 256
    n_embd: int = 128
    n_head: int = 4
    n_layer: int = 1
    dropout: float = 0.0


class Head(nn.Module):
    """One head's weights. The math happens in MultiHead, all heads at once."""

    def __init__(self, cfg, head_size):
        super().__init__()
        self.query = nn.Linear(cfg.n_embd, head_size, bias=False)
        self.key = nn.Linear(cfg.n_embd, head_size, bias=False)
        self.value = nn.Linear(cfg.n_embd, head_size, bias=False)


class MultiHead(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.n_head = cfg.n_head
        self.heads = nn.ModuleList([Head(cfg, cfg.n_embd // cfg.n_head) for _ in range(cfg.n_head)])
        self.proj = nn.Linear(cfg.n_embd, cfg.n_embd)

    def forward(self, x):
        B, T, C = x.shape
        H = self.n_head
        # every head's query, key and value rows in one (3C, C) matrix: one multiply instead of 3 x H
        w = torch.cat([torch.cat([h.query.weight for h in self.heads]),
                       torch.cat([h.key.weight for h in self.heads]),
                       torch.cat([h.value.weight for h in self.heads])])
        q, k, v = F.linear(x, w).split(C, dim=2)
        q, k, v = (t.view(B, T, H, C // H).transpose(1, 2) for t in (q, k, v))   # (B, H, T, hs)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True)            # step 5's five lines, fused
        return self.proj(out.transpose(1, 2).reshape(B, T, C))


class MLP(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(cfg.n_embd, 4 * cfg.n_embd), nn.GELU(), nn.Linear(4 * cfg.n_embd, cfg.n_embd))

    def forward(self, x):
        return self.net(x)


class Block(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.n_embd)
        self.attn = MultiHead(cfg)
        self.ln2 = nn.LayerNorm(cfg.n_embd)
        self.mlp = MLP(cfg)

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        return x + self.mlp(self.ln2(x))


class GPT(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.tok_emb = nn.Embedding(cfg.vocab, cfg.n_embd)
        self.pos_emb = nn.Embedding(cfg.block, cfg.n_embd)
        self.blocks = nn.Sequential(*[Block(cfg) for _ in range(cfg.n_layer)])
        self.ln_f = nn.LayerNorm(cfg.n_embd)
        self.head = nn.Linear(cfg.n_embd, cfg.vocab, bias=False)
        self.apply(self._init)
        # GPT-2's one extra trick at depth: the layers that write back into the
        # residual path start smaller, so 12 of them adding up don't blow it up
        for n, p in self.named_parameters():
            if n.endswith("attn.proj.weight") or n.endswith("mlp.net.2.weight"):
                nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * cfg.n_layer))
        self.head.weight = self.tok_emb.weight   # weight tying, as in step 6

    @staticmethod
    def _init(m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, mean=0.0, std=0.02)
            if isinstance(m, nn.Linear) and m.bias is not None:
                nn.init.zeros_(m.bias)

    def forward(self, idx):
        B, T = idx.shape
        x = self.tok_emb(idx) + self.pos_emb(torch.arange(T, device=idx.device))
        return self.head(self.ln_f(self.blocks(x)))

    @torch.no_grad()
    def sample(self, idx, n, temperature=1.0, top_k=None):
        for _ in range(n):
            logits = self(idx[:, -self.cfg.block:])[:, -1, :].float() / temperature
            if top_k:
                v, _ = torch.topk(logits, min(top_k, logits.shape[-1]))
                logits[logits < v[:, [-1]]] = float("-inf")
            idx = torch.cat([idx, torch.multinomial(F.softmax(logits, dim=-1), 1)], dim=1)
        return idx


def clean(sd):
    """A state dict without step 5's mask buffers or torch.compile's prefix."""
    return {k.replace("_orig_mod.", ""): v for k, v in sd.items() if not k.endswith(".mask")}


def load(path, device="cpu", vocab=None):
    """A model from any checkpoint of steps 6-13. vocab: grow the token table to this size (new rows near the mean)."""
    ck = torch.load(path, map_location="cpu")
    sd = clean(ck["model"])
    cfg = Config(**ck["cfg"])
    if vocab and vocab > cfg.vocab:
        old = sd["tok_emb.weight"]
        g = torch.Generator().manual_seed(0)
        new = old.mean(0, keepdim=True) + 0.02 * torch.randn(vocab - old.shape[0], old.shape[1], generator=g)
        sd["tok_emb.weight"] = sd["head.weight"] = torch.cat([old, new])
        cfg.vocab = vocab
    model = GPT(cfg)
    model.load_state_dict(sd)
    return model.to(device)
