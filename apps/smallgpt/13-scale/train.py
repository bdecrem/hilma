"""Step 13: pretraining at GPT-2 small's shape, on eight rented GPUs.

Step 6's loop with what a GPU run needs on top:

  model      12 blocks, 12 heads, vectors of 768, windows of 512; our 8,192
             token vocabulary, so ~92M parameters (GPT-2 small is 124M only
             because its vocabulary is 50k)
  data       6b's Usenet tokens, four passes (~2B tokens, ~20 per parameter)
  batch      ~0.5M tokens per update, as GPT-2: each GPU takes MICRO windows
             at a time and adds up gradients until the batch is full
  eight GPUs DDP: every GPU holds the whole model, trains on its own random
             windows, and after each backward pass the eight gradients are
             averaged, so all eight copies take the same step
  speed      bfloat16 matrix math, torch.compile, fused attention, fused AdamW
  saving     best.pt whenever the held-out loss is the lowest so far (weights
             only), last.pt every SAVE_EVERY updates (weights + optimizer, for
             --resume), final.pt at the end

Rehearsal at home:  .venv/bin/python 13-scale/train.py --size tiny --steps 30 --no-compile
                    .venv/bin/torchrun --nproc_per_node 2 13-scale/train.py --size tiny --steps 30 --no-compile
On the cluster:     torchrun --nproc_per_node 8 train.py --data /data --out /out
"""

import argparse
import json
import math
import os
import sys
import time

import numpy as np
import torch
import torch.distributed as dist
import torch.nn.functional as F
from torch.nn.parallel import DistributedDataParallel as DDP

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from model import GPT, Config  # noqa: E402

SIZES = {
    "big": Config(vocab=8192, block=512, n_embd=768, n_head=12, n_layer=12),
    "small": Config(vocab=8192, block=256, n_embd=320, n_head=8, n_layer=6),   # step 6b's
    "tiny": Config(vocab=8192, block=128, n_embd=128, n_head=4, n_layer=2),    # for rehearsals
}
PROMPTS = [
    "Newsgroups: comp.sys.mac\nSubject: Mac Plus won't boot\n\n",
    "Newsgroups: comp.unix.questions\nSubject: How do I quit vi?\n\n",
    "My Macintosh crashed again and I think the problem is",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="big", choices=SIZES)
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "usenet"), help="folder with train.bin and val.bin")
    ap.add_argument("--tok", default=os.path.join(ROOT, "06b-usenet", "tok8192.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out", "scale"))
    ap.add_argument("--epochs", type=float, default=4)
    ap.add_argument("--steps", type=int, default=0, help="override the number of updates")
    ap.add_argument("--batch-tokens", type=int, default=524288)
    ap.add_argument("--micro", type=int, default=64, help="windows per GPU per forward pass")
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--warmup", type=int, default=200)
    ap.add_argument("--eval-every", type=int, default=100)
    ap.add_argument("--save-every", type=int, default=500)
    ap.add_argument("--no-compile", action="store_true")
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args()

    # one process per GPU; torchrun tells each which one it is
    ddp = "RANK" in os.environ
    if ddp:
        cuda = torch.cuda.is_available()
        dist.init_process_group("nccl" if cuda else "gloo")
        rank, world = dist.get_rank(), dist.get_world_size()
        local = int(os.environ["LOCAL_RANK"])
        device = f"cuda:{local}" if cuda else "cpu"
        if cuda:
            torch.cuda.set_device(device)
    else:
        rank, world = 0, 1
        device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    main_proc = rank == 0
    say = (lambda *a: print(*a, flush=True)) if main_proc else (lambda *a: None)
    on_gpu = device.startswith("cuda")
    if on_gpu:
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    amp = torch.autocast("cuda", dtype=torch.bfloat16) if on_gpu else torch.autocast("cpu", enabled=False)

    cfg = SIZES[args.size]
    train = np.memmap(os.path.join(args.data, "train.bin"), dtype=np.uint16, mode="r")
    val = np.memmap(os.path.join(args.data, "val.bin"), dtype=np.uint16, mode="r")
    accum = max(1, args.batch_tokens // (args.micro * cfg.block * world))
    step_tokens = accum * args.micro * cfg.block * world
    total = args.steps or int(args.epochs * len(train) / step_tokens)
    gen = np.random.default_rng(1337 + rank)   # each GPU reads its own random windows

    def batch(data, n=args.micro):
        starts = gen.integers(0, len(data) - cfg.block - 1, n)
        w = np.stack([data[s: s + cfg.block + 1] for s in starts]).astype(np.int64)
        w = torch.from_numpy(w)
        if on_gpu:
            w = w.pin_memory().to(device, non_blocking=True)
        else:
            w = w.to(device)
        return w[:, :-1], w[:, 1:]

    def loss_of(m, x, y):
        with amp:
            logits = m(x)
        return F.cross_entropy(logits.float().view(-1, logits.shape[-1]), y.reshape(-1))

    torch.manual_seed(1337)
    raw = GPT(cfg).to(device)
    n_params = sum(p.numel() for p in raw.parameters())
    decay = [p for p in raw.parameters() if p.dim() >= 2]
    no_decay = [p for p in raw.parameters() if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": 0.1}, {"params": no_decay, "weight_decay": 0.0}],
                            lr=args.lr, betas=(0.9, 0.95), fused=on_gpu)
    os.makedirs(args.out, exist_ok=True)
    step, best = 0, float("inf")
    last_path = os.path.join(args.out, "last.pt")
    if args.resume and os.path.exists(last_path):
        ck = torch.load(last_path, map_location=device)
        raw.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"])
        step, best = ck["step"] + 1, ck.get("best", best)
        say(f"resumed at update {step}")
    model = raw if args.no_compile else torch.compile(raw)
    if ddp:
        model = DDP(model, device_ids=[int(os.environ["LOCAL_RANK"])] if on_gpu else None)

    def lr_at(s):
        if s < args.warmup:
            return args.lr * (s + 1) / args.warmup
        p = (s - args.warmup) / max(1, total - args.warmup)
        return args.lr / 10 + 0.5 * (args.lr - args.lr / 10) * (1 + math.cos(math.pi * p))

    @torch.no_grad()
    def evaluate(n=20):
        model.eval()
        out = {}
        for name, data in (("train", train), ("val", val)):
            t = torch.tensor(sum(loss_of(model, *batch(data)).item() for _ in range(n)) / n, device=device)
            if ddp:
                dist.all_reduce(t, op=dist.ReduceOp.AVG if on_gpu else dist.ReduceOp.SUM)
                if not on_gpu:
                    t /= world
            out[name] = t.item()
        model.train()
        return out

    def samples():
        sys.path.insert(0, os.path.join(ROOT, "02-tokenizer"))
        sys.path.insert(0, os.path.dirname(args.tok))
        from bpe import Tokenizer
        tok = Tokenizer.load(args.tok)
        raw.eval()
        res = []
        for p in PROMPTS:
            start = torch.tensor([tok.encode(p)], device=device)
            with amp:
                ids = raw.sample(start, 48, temperature=0.8, top_k=40)[0, start.shape[1]:].tolist()
            res.append(p.replace("\n", " ") + "|" + tok.decode(ids).replace("\n", " "))
        raw.train()
        return res

    def save(path, with_opt):
        ck = {"model": raw.state_dict(), "cfg": cfg.__dict__, "step": step, "best": best}
        if with_opt:
            ck["opt"] = opt.state_dict()
        torch.save(ck, path + ".tmp")
        os.replace(path + ".tmp", path)

    say(f"device {device} x {world}; {n_params:,} parameters; {len(train):,} train tokens; "
        f"{total:,} updates of {step_tokens:,} tokens ({accum} x {args.micro} x {cfg.block} x {world}) "
        f"= {total * step_tokens / len(train):.2f} passes")
    log = open(os.path.join(args.out, "log.jsonl"), "a") if main_proc else None
    t0, tl, seen = time.time(), time.time(), 0
    while step <= total:
        if step % args.eval_every == 0 or step == total:
            ev = evaluate()
            rec = {"step": step, "train": round(ev["train"], 4), "val": round(ev["val"], 4), "lr": lr_at(step), "elapsed": round(time.time() - t0)}
            if main_proc:
                log.write(json.dumps(rec) + "\n"); log.flush()
                mark = ""
                if ev["val"] < best:
                    best = ev["val"]
                    save(os.path.join(args.out, "best.pt"), False)
                    mark = "  (best)"
                say(f"EVAL update {step:5d}/{total}  train {ev['train']:.3f}  val {ev['val']:.3f}{mark}")
            if step % (args.eval_every * 5) == 0 or step == total:
                if main_proc:
                    ss = samples()
                    for s in ss:
                        say("    " + s)
                    log.write(json.dumps({"step": step, "samples": ss}) + "\n"); log.flush()
                if ddp:
                    dist.barrier()
        if step > 0 and step % args.save_every == 0 and main_proc:
            save(last_path, True)
        if step == total:
            break
        for g in opt.param_groups:
            g["lr"] = lr_at(step)
        for i in range(accum):
            x, y = batch(train)
            if ddp:
                model.require_backward_grad_sync = i == accum - 1   # average gradients across GPUs once per update
            loss = loss_of(model, x, y) / accum
            loss.backward()
        norm = torch.nn.utils.clip_grad_norm_(raw.parameters(), 1.0)
        opt.step()
        opt.zero_grad(set_to_none=True)
        seen += step_tokens
        if step % 10 == 0:
            if on_gpu:
                torch.cuda.synchronize()
            now = time.time()
            rate = seen / (now - tl)
            left = (total - step) * step_tokens / rate if rate else 0
            say(f"update {step:5d}/{total}  loss {loss.item() * accum:.3f}  norm {norm:.2f}  lr {lr_at(step):.2e}  "
                f"{rate / 1e6:.2f}M tok/s  {(now - t0) / 60:.1f} min in, ~{left / 60:.1f} min left")
            tl, seen = now, 0
        step += 1

    if main_proc:
        save(os.path.join(args.out, "final.pt"), False)
        say(f"DONE {total:,} updates in {(time.time() - t0) / 60:.1f} min; best val {best:.3f}; wrote best.pt and final.pt")
    if ddp:
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
