"""Step 11: the pieces every part of RLHF shares.

  generate   many answers at once, with a KV cache: each layer keeps the keys
             and values it already computed, so each new token costs one
             position instead of the whole sequence again. PPO samples
             thousands of answers, and without the cache that is most of the run.
  Scorer     a GPT whose last layer is one number per position instead of
             8,194 token scores. The reward model reads it at the answer's
             last token; the value model reads it at every token.
  pad        sequences of different lengths in one tensor (right-padded, so
             causal attention never looks at the padding).
  claude     one call to Claude through the `claude` CLI on the Max login,
             with a JSON schema for the reply.
"""

import json
import os
import subprocess
import sys

import torch
import torch.nn as nn
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "13-scale"))
sys.path.insert(0, os.path.join(ROOT, "09-sft"))
sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
from bpe import Tokenizer  # noqa: E402
from model import load  # noqa: E402
from sft import TOK, Chat  # noqa: E402

SFT = os.path.join(ROOT, "out", "sft-usenet-big", "final.pt")   # the cranky hacker on the 92M model
OUT = os.environ.get("RLHF_OUT", os.path.join(ROOT, "out", "rlhf"))     # overridable for rehearsals
DATA = os.environ.get("RLHF_DATA", os.path.join(HERE, "data"))
MAX_ANSWER = 120   # tokens, as on the chat page

device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"


def chat():
    return Chat(Tokenizer.load(TOK))


def rows(name):
    return [json.loads(l) for l in open(os.path.join(DATA, name))]


def write(name, rs):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w") as f:
        for r in rs:
            f.write(json.dumps(r) + "\n")


# ---------------------------------------------------------------- generation

def _qkv(attn):
    return torch.cat([torch.cat([h.query.weight for h in attn.heads]),
                      torch.cat([h.key.weight for h in attn.heads]),
                      torch.cat([h.value.weight for h in attn.heads])])


@torch.no_grad()
def generate(model, prompts, eot, n=MAX_ANSWER, temperature=1.0, top_k=None):
    """Answer every prompt (lists of token ids) at once; returns the answers' token ids, <|endoftext|> included when written.

    All rows walk the same positions together. A row whose prompt is longer
    than the shortest one is fed its own prompt tokens until they run out, and
    only then starts sampling, so no row ever needs padding or a mask.
    """
    cfg = model.cfg
    B, H, C = len(prompts), cfg.n_head, cfg.n_embd
    hs = C // H
    lens = [len(p) for p in prompts]
    total = min(max(lens) + n, cfg.block)
    dev = next(model.parameters()).device
    seq = torch.full((B, total), eot, dtype=torch.long, device=dev)
    known = torch.zeros(B, total, dtype=torch.bool, device=dev)
    for b, p in enumerate(prompts):
        seq[b, :len(p)] = torch.tensor(p, device=dev)
        known[b, :len(p)] = True
    W = [_qkv(blk.attn) for blk in model.blocks]
    K = [torch.zeros(B, H, total, hs, device=dev) for _ in model.blocks]
    V = [torch.zeros(B, H, total, hs, device=dev) for _ in model.blocks]

    def step(t0, t1):
        """Run positions t0..t1-1 through the model, filling the cache; logits at t1-1."""
        x = model.tok_emb(seq[:, t0:t1]) + model.pos_emb(torch.arange(t0, t1, device=dev))
        for i, blk in enumerate(model.blocks):
            h = blk.ln1(x)
            q, k, v = F.linear(h, W[i]).split(C, dim=2)
            q, k, v = (t.view(B, t1 - t0, H, hs).transpose(1, 2) for t in (q, k, v))
            K[i][:, :, t0:t1], V[i][:, :, t0:t1] = k, v
            a = F.scaled_dot_product_attention(q, K[i][:, :, :t1], V[i][:, :, :t1], is_causal=t1 - t0 > 1)
            x = x + blk.attn.proj(a.transpose(1, 2).reshape(B, t1 - t0, C))
            x = x + blk.mlp(blk.ln2(x))
        return model.head(model.ln_f(x[:, -1])).float()

    lens_t = torch.tensor(lens, device=dev)
    done = torch.zeros(B, dtype=torch.bool, device=dev)
    t = min(lens)
    logits = step(0, t)
    while t < total and not done.all():
        logits = logits / temperature
        if top_k:
            v, _ = torch.topk(logits, top_k)
            logits[logits < v[:, [-1]]] = float("-inf")
        nxt = torch.multinomial(F.softmax(logits, dim=-1), 1).squeeze(1)
        nxt = torch.where(known[:, t], seq[:, t], torch.where(done, eot, nxt))
        seq[:, t] = nxt
        answering = ~known[:, t]
        done |= answering & ((nxt == eot) | (t - lens_t + 1 >= n))
        t += 1
        if t < total and not done.all():
            logits = step(t - 1, t)
    out = []
    for b in range(B):
        a = seq[b, lens[b]:t].tolist()
        out.append(a[:a.index(eot) + 1] if eot in a else a[:n])
    return out


def text(chat, ids):
    """An answer's text, without the <|endoftext|>."""
    return chat.tok.decode([i for i in ids if i != chat.eot]).strip()


# ---------------------------------------------------------------- one number per position

class Scorer(nn.Module):
    """The GPT's body with a one-number head: how good is the text up to here."""

    def __init__(self, gpt):
        super().__init__()
        self.gpt = gpt
        self.score = nn.Linear(gpt.cfg.n_embd, 1)
        nn.init.normal_(self.score.weight, std=0.02)
        nn.init.zeros_(self.score.bias)
        self.cfg = gpt.cfg

    def forward(self, idx):
        g = self.gpt
        x = g.tok_emb(idx) + g.pos_emb(torch.arange(idx.shape[1], device=idx.device))
        return self.score(g.ln_f(g.blocks(x))).squeeze(-1)   # (B, T)

    def save(self, path, **extra):
        torch.save({"model": self.gpt.state_dict(), "score": self.score.state_dict(), "cfg": self.cfg.__dict__, **extra}, path)

    @classmethod
    def load(cls, path, dev=device):
        """From a Scorer checkpoint, or from a plain GPT checkpoint with a fresh head."""
        ck = torch.load(path, map_location="cpu")
        s = cls(load(path))
        if "score" in ck:
            s.score.load_state_dict(ck["score"])
        s.extra = {k: v for k, v in ck.items() if k not in ("model", "score", "cfg")}
        return s.to(dev)


def pad(seqs, value):
    """(B, T) right-padded, and each row's length."""
    T = max(len(s) for s in seqs)
    x = torch.full((len(seqs), T), value, dtype=torch.long)
    for b, s in enumerate(seqs):
        x[b, :len(s)] = torch.tensor(s)
    return x.to(device), torch.tensor([len(s) for s in seqs], device=device)


def with_eot(chat, answer):
    """The answer ending in <|endoftext|>: a cut-off answer is scored as if it had stopped there."""
    return answer if answer and answer[-1] == chat.eot else answer + [chat.eot]


# ---------------------------------------------------------------- Claude

def claude(prompt, schema, model="claude-sonnet-5-5", tries=3):
    """One `claude -p` call on the Max login; the structured reply, or None."""
    cmd = ["claude", "-p", prompt, "--model", model, "--output-format", "json", "--json-schema", json.dumps(schema),
           "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence"]
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    for attempt in range(tries):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd="/tmp", timeout=900)
            return json.loads(r.stdout)["structured_output"]
        except (json.JSONDecodeError, KeyError, TypeError, subprocess.TimeoutExpired):
            print(f"  retry ({attempt + 1})", flush=True)
    return None
