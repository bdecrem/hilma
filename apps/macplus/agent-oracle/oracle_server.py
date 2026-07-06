#!/usr/bin/env python3
"""agent-oracle (:2338) -- THE ORACLE, hosted on the Mac mini.

Same 1985-Usenet model as the Plus runs locally, but the mini has real compute,
so this version is "everything better":
  - instant (numpy fp32 forward, no int8/no FPU limits)
  - conversation memory: each connection keeps a rolling token context, so it's
    a CHAT that remembers the last few turns (within the 256-token window)
  - better sampling: temperature + top-p (nucleus) + a repetition penalty that
    kills the "small small small" loops the raw model falls into
  - post-processing: trims a trailing half-word and collapses immediate
    repetition, so replies read as finished thoughts

The Plus app (Lab > Remote) connects, sends "<prompt>\\n", and streams the reply
until an EOT byte (0x04). One backend, two fronts -- same pattern as the other
agent-* services; deployed via git pull + backend/update.sh.

Model + tokenizer live next to this file (model_q.bin, tok2048.model), swapped
in when a better-trained same-voice model is exported.
"""
import os, sys, socket, struct, threading
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "model_q.bin")
SPM   = os.path.join(HERE, "tok2048.model")

# ---------------------------------------------------------------- model load
def load_model(path):
    b = open(path, "rb").read()
    magic, ver = struct.unpack("<II", b[:8])
    assert magic == 0x616b3432 and ver == 2, "not a v2 (ak42) checkpoint"
    dim, hidden, L, H, KV, V, seq = struct.unpack("<7i", b[8:36])
    shared = b[36]; GS = struct.unpack("<i", b[37:41])[0]
    off = [256]
    def fp32(n):
        a = np.frombuffer(b, dtype="<f4", count=n, offset=off[0]).astype(np.float32)
        off[0] += n * 4; return a
    def deq(numel):                      # int8 + per-group scale -> fp32
        q = np.frombuffer(b, dtype=np.int8, count=numel, offset=off[0]).astype(np.float32)
        off[0] += numel
        s = np.frombuffer(b, dtype="<f4", count=numel // GS, offset=off[0]).astype(np.float32)
        off[0] += (numel // GS) * 4
        return q * np.repeat(s, GS)
    hs = dim // H; kv_dim = dim * KV // H
    m = dict(dim=dim, hidden=hidden, L=L, H=H, KV=KV, V=V, seq=seq, hs=hs,
             kv_dim=kv_dim, kv_mul=H // KV)
    m["rms_att"]   = fp32(L * dim).reshape(L, dim)
    m["rms_ffn"]   = fp32(L * dim).reshape(L, dim)
    m["rms_final"] = fp32(dim)
    m["tok"] = deq(V * dim).reshape(V, dim)
    m["wq"] = [deq((H * hs) * dim).reshape(H * hs, dim) for _ in range(L)]
    m["wk"] = [deq((KV * hs) * dim).reshape(KV * hs, dim) for _ in range(L)]
    m["wv"] = [deq((KV * hs) * dim).reshape(KV * hs, dim) for _ in range(L)]
    m["wo"] = [deq(dim * (H * hs)).reshape(dim, H * hs) for _ in range(L)]
    m["w1"] = [deq(hidden * dim).reshape(hidden, dim) for _ in range(L)]
    m["w2"] = [deq(dim * hidden).reshape(dim, hidden) for _ in range(L)]
    m["w3"] = [deq(hidden * dim).reshape(hidden, dim) for _ in range(L)]
    m["wcls"] = m["tok"] if shared else deq(V * dim).reshape(V, dim)
    # precompute RoPE tables
    half = hs // 2
    inv = 1.0 / (10000.0 ** (np.arange(0, hs, 2) / hs))
    t = np.outer(np.arange(seq), inv)          # (seq, half)
    m["rope_cos"] = np.cos(t); m["rope_sin"] = np.sin(t)
    return m

def rmsnorm(x, w):
    return w * (x / np.sqrt(np.mean(x * x) + 1e-5))

def rope(vec, pos, m):                         # rotate pairs in each head
    hs, half = m["hs"], m["hs"] // 2
    v = vec.reshape(-1, hs)
    c = m["rope_cos"][pos]; s = m["rope_sin"][pos]
    a = v[:, 0::2].copy(); b = v[:, 1::2].copy()
    v[:, 0::2] = a * c - b * s
    v[:, 1::2] = a * s + b * c
    return v.reshape(-1)

def forward(tok_id, pos, kv, m):
    dim, H, KV, hs, kv_dim, kv_mul = m["dim"], m["H"], m["KV"], m["hs"], m["kv_dim"], m["kv_mul"]
    x = m["tok"][tok_id].copy()
    for l in range(m["L"]):
        xb = rmsnorm(x, m["rms_att"][l])
        q = m["wq"][l] @ xb
        k = m["wk"][l] @ xb
        v = m["wv"][l] @ xb
        q = rope(q, pos, m); k = rope(k, pos, m)
        kv["k"][l][pos] = k; kv["v"][l][pos] = v
        # attention per head
        out = np.zeros(H * hs, dtype=np.float32)
        for h in range(H):
            qh = q[h * hs:(h + 1) * hs]
            kvh = h // kv_mul
            K = kv["k"][l][:pos + 1, kvh * hs:(kvh + 1) * hs]     # (pos+1, hs)
            Vv = kv["v"][l][:pos + 1, kvh * hs:(kvh + 1) * hs]
            sc = (K @ qh) / np.sqrt(hs)
            sc -= sc.max(); e = np.exp(sc); a = e / e.sum()
            out[h * hs:(h + 1) * hs] = a @ Vv
        x = x + m["wo"][l] @ out
        xb = rmsnorm(x, m["rms_ffn"][l])
        h1 = m["w1"][l] @ xb; h3 = m["w3"][l] @ xb
        hh = (h1 * (1.0 / (1.0 + np.exp(-h1)))) * h3
        x = x + m["w2"][l] @ hh
    x = rmsnorm(x, m["rms_final"])
    return m["wcls"] @ x                          # logits

# ---------------------------------------------------------------- sampling
def sample(logits, temp, topp, recent, rep_penalty):
    logits = logits.astype(np.float32).copy()
    for t in recent:                              # discourage repeats
        logits[t] -= rep_penalty
    if temp <= 0:
        return int(logits.argmax())
    logits /= temp
    logits -= logits.max()
    p = np.exp(logits); p /= p.sum()
    idx = np.argsort(-p)
    cum = np.cumsum(p[idx])
    keep = idx[:max(1, int(np.searchsorted(cum, topp)) + 1)]
    pk = p[keep]; pk /= pk.sum()
    return int(np.random.choice(keep, p=pk))

# ---------------------------------------------------------------- generation
class Session:
    """One conversation. Keeps a rolling token context for chat memory."""
    def __init__(self, m, sp):
        self.m = m; self.sp = sp
        self.ctx = [1]                            # BOS
    def _clip(self):
        cap = self.m["seq"] - 40
        if len(self.ctx) > cap:                   # keep BOS + the tail
            self.ctx = [1] + self.ctx[-(cap - 1):]

    def reply(self, user_text):
        # frame the turn: the model learned "subject\n\nbody", so treat the
        # user line as a subject and let it write the body; the running ctx
        # gives it memory of earlier turns.
        add = self.sp.encode(user_text.strip() + "\n\n")
        self.ctx += add
        self._clip()
        kv = {"k": [np.zeros((self.m["seq"], self.m["kv_dim"]), np.float32) for _ in range(self.m["L"])],
              "v": [np.zeros((self.m["seq"], self.m["kv_dim"]), np.float32) for _ in range(self.m["L"])]}
        toks = list(self.ctx)
        logits = None
        for pos, tk in enumerate(toks):           # prime on the whole context
            logits = forward(tk, pos, kv, self.m)
        out_ids, recent = [], list(toks[-16:])
        pos = len(toks) - 1
        for _ in range(60):
            nxt = sample(logits, 0.85, 0.9, recent[-24:], 1.2)
            if nxt == 1:                          # BOS = post over
                break
            out_ids.append(nxt); recent.append(nxt)
            pos += 1
            if pos >= self.m["seq"] - 1:
                break
            logits = forward(nxt, pos, kv, self.m)
        self.ctx += out_ids
        self._clip()
        return self.sp.decode(out_ids)            # decode all at once = proper spacing

def postprocess(text):
    """Trim a trailing half-word and collapse immediate word repetition so the
    reply reads as a finished thought."""
    t = text.strip()
    if not t:
        return "(the oracle has nothing to say. ask again.)"
    # collapse 3+ immediate repeats of the same word ("small small small" -> "small")
    words = t.split(" ")
    out = []
    for w in words:
        if len(out) >= 2 and w and w == out[-1] == out[-2]:
            continue
        out.append(w)
    t = " ".join(out)
    # end at the last sentence punctuation if there is one past the halfway mark
    for i in range(len(t) - 1, len(t) // 2, -1):
        if t[i] in ".!?":
            return t[:i + 1]
    # otherwise drop a dangling partial last word
    if " " in t and t[-1] not in ".!?\"'":
        t = t[:t.rfind(" ")]
    return t

# ---------------------------------------------------------------- server
def serve(port):
    import sentencepiece as spm
    print(f"[oracle] loading {MODEL} ...", flush=True)
    m = load_model(MODEL)
    sp = spm.SentencePieceProcessor(model_file=SPM)
    print(f"[oracle] ready: dim={m['dim']} L={m['L']} vocab={m['V']}, listening on :{port}", flush=True)
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", port)); srv.listen(8)
    while True:
        conn, addr = srv.accept()
        threading.Thread(target=handle, args=(conn, m, sp), daemon=True).start()

def handle(conn, m, sp):
    conn.settimeout(600)
    sess = Session(m, sp)
    buf = b""
    try:
        while True:
            data = conn.recv(1024)
            if not data:
                break
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                prompt = line.decode("utf-8", "ignore").strip()
                if not prompt:
                    continue
                reply = postprocess(sess.reply(prompt))
                conn.sendall(reply.encode("utf-8", "ignore"))
                conn.sendall(b"\x04")             # EOT: reply complete
    except Exception as e:
        try:
            conn.sendall(("[oracle error: %s]\x04" % e).encode())
        except Exception:
            pass
    finally:
        conn.close()

if __name__ == "__main__":
    port = 2338
    if "--listen" in sys.argv:
        port = int(sys.argv[sys.argv.index("--listen") + 1])
    serve(port)
