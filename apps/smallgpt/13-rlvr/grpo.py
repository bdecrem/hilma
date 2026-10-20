"""Step 13b: GRPO, reinforcement learning against the checker.

Two models in memory, not four:

  policy     step 11's PPO model (the cranky hacker after RLHF, leash 0.2), the one being trained
  reference  a frozen copy of it, for the leash

No reward model: the reward is arith.check(), 1 or 0. No value model: the
baseline each answer is measured against is the other answers to the same
problem. That is the "group relative" in GRPO.

Each round:

  1. 32 problems, drawn from the levels that are open; the policy answers each
     one 8 times at temperature 1 (256 answers, one generate() call)
  2. the checker scores every answer 1 or 0
  3. advantage = (score - the group's mean) / the group's spread. A group
     that is all right or all wrong has spread 0 and advantage 0 everywhere:
     nothing to learn from, and it is dropped from the update
  4. two passes over the mixed groups in minibatches of 64: raise the
     log-probability of every token in an answer with positive advantage and
     lower the others, with the ratio new/old clipped to 0.8-1.2, plus
     beta x KL(policy || reference) per token as the leash, so the hacker
     stays a hacker while it learns to add

The curriculum: training starts at level 1 (one digit plus one digit). Every
10 rounds the policy answers 100 held-out problems per level, greedily. When
the highest open level is at 60% or better, the next level opens; the newest
open level gets half the problems in a round and the others share the rest.

Writes out/rlvr/<out>/final.pt (a plain GPT checkpoint), round checkpoints,
and log.jsonl: one line per round (reward, mixed groups, KL, length, per-level
sample accuracy) and one per evaluation (held-out accuracy per level, samples).

Run:  .venv/bin/python 13-rlvr/grpo.py                    (~1-2 h on the mini)
      .venv/bin/python 13-rlvr/grpo.py --levels 3 --out grpo-l3   (no curriculum: straight to two-digit sums)
"""

import argparse
import json
import os
import random
import time

import torch
import torch.nn.functional as F

from shared import LEVELS, MAX_ANSWER, OUT, START, accuracy, chat, check, device, generate, held_out, load, pad, text, train_problem

PROBES = [(3, 5), (9, 8), (47, 8), (62, 9), (47, 38), (85, 76)]


def logprobs(model, x, n_resp, starts):
    """log p of each answer token under model, (B, T-1), and the mask of answer positions."""
    logits = model(x)[:, :-1].float()
    lp = torch.gather(F.log_softmax(logits, dim=-1), 2, x[:, 1:].unsqueeze(-1)).squeeze(-1)
    pos = torch.arange(x.shape[1] - 1, device=device).unsqueeze(0)
    mask = (pos >= starts.unsqueeze(1) - 1) & (pos < (starts + n_resp).unsqueeze(1) - 1)
    return lp, mask


def masked_mean(t, m):
    return (t * m).sum() / m.sum().clamp(min=1)


def evaluate(policy, c, log, rnd, out_dir, args, save_name):
    policy.eval()
    ev = {}
    for lv in LEVELS:
        ev[lv] = accuracy(policy, c, held_out(lv), group=1, top_k=1)[0]
    torch.manual_seed(1000 + rnd)
    samples = generate(policy, [c.prompt(f"What is {a} + {b}?") for a, b in PROBES], c.eot, n=MAX_ANSWER, temperature=0.7, top_k=40)
    ss = [{"q": f"What is {a} + {b}?", "answer": a + b, "a": text(c, s)} for (a, b), s in zip(PROBES, samples)]
    print(f"  eval: " + "  ".join(f"level {lv} {100 * ev[lv]:5.1f}%" for lv in LEVELS), flush=True)
    for s in ss:
        print(f"    {s['q']} [{s['answer']}] -> {s['a']!r}", flush=True)
    log.write(json.dumps({"round": rnd, "eval": ev, "samples": ss}) + "\n"); log.flush()
    if save_name:
        torch.save({"model": policy.state_dict(), "cfg": policy.cfg.__dict__, "round": rnd, "beta": args.beta}, os.path.join(out_dir, save_name))
    policy.train()
    return ev


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--beta", type=float, default=0.04, help="the leash: KL penalty per token")
    ap.add_argument("--start", default=START, help="the checkpoint to train from")
    ap.add_argument("--out", default="grpo")
    ap.add_argument("--rounds", type=int, default=200)
    ap.add_argument("--batch", type=int, default=32, help="problems per round")
    ap.add_argument("--group", type=int, default=8, help="answers per problem")
    ap.add_argument("--mini", type=int, default=64)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--lr", type=float, default=5e-6)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--levels", default="", help="fixed levels, e.g. 1,2,3 (default: the curriculum from level 1)")
    ap.add_argument("--promote", type=float, default=0.6, help="held-out accuracy that opens the next level")
    ap.add_argument("--max-answer", type=int, default=MAX_ANSWER, help="tokens per answer while training")
    ap.add_argument("--eval-every", type=int, default=10)
    ap.add_argument("--save-every", type=int, default=50)
    args = ap.parse_args()
    out_dir = os.path.join(OUT, args.out)
    os.makedirs(out_dir, exist_ok=True)

    c = chat()
    rng = random.Random(13); torch.manual_seed(13)
    policy = load(args.start, device).train()
    ref = load(args.start, device).eval().requires_grad_(False)
    opt = torch.optim.AdamW(policy.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.0)
    curriculum = not args.levels
    active = [int(l) for l in args.levels.split(",")] if args.levels else [1]
    print(f"device {device}; from {args.start}; beta {args.beta}; answers of up to {args.max_answer} tokens; {args.rounds} rounds of {args.batch} x {args.group}; "
          f"{'curriculum from level 1' if curriculum else 'levels ' + args.levels}", flush=True)
    log = open(os.path.join(out_dir, "log.jsonl"), "w")
    t0 = time.time()
    G = args.group

    for rnd in range(args.rounds + 1):
        if rnd % args.eval_every == 0:
            save = "final.pt" if rnd == args.rounds else (f"round{rnd}.pt" if rnd % args.save_every == 0 else None)
            ev = evaluate(policy, c, log, rnd, out_dir, args, save)
            if curriculum and ev[active[-1]] >= args.promote and active[-1] + 1 in LEVELS:
                active.append(active[-1] + 1)
                print(f"  level {active[-1]} opens", flush=True)
                log.write(json.dumps({"round": rnd, "open": active[-1]}) + "\n"); log.flush()
        if rnd == args.rounds:
            break

        # 1. problems and answers
        weights = [1.0] if len(active) == 1 else [0.5 / (len(active) - 1)] * (len(active) - 1) + [0.5]
        levels = rng.choices(active, weights, k=args.batch)
        probs = [train_problem(lv, rng) for lv in levels]
        prompts = [c.prompt(p["q"]) for p in probs for _ in range(G)]
        policy.eval()
        answers = generate(policy, prompts, c.eot, n=args.max_answer, temperature=1.0)
        policy.train()

        # 2. the checker
        reward = torch.tensor([float(check(text(c, a), probs[i // G]["answer"])) for i, a in enumerate(answers)], device=device)

        # 3. group-relative advantages
        r = reward.view(args.batch, G)
        mean, std = r.mean(1, keepdim=True), r.std(1, keepdim=True)
        mixed = (std.squeeze(1) > 0)
        adv = ((r - mean) / (std + 1e-6)).view(-1)
        keep = mixed.repeat_interleave(G).nonzero().squeeze(1)
        ended = torch.tensor([bool(a) and a[-1] == c.eot for a in answers], device=device)
        n_resp = torch.tensor([len(a) for a in answers], device=device)
        starts = torch.tensor([len(p) for p in prompts], device=device)
        x, _ = pad([p + a for p, a in zip(prompts, answers)], c.eot)

        with torch.no_grad():
            old_lp, mask, ref_lp = [], [], []
            for s in range(0, len(answers), args.mini):
                sl = slice(s, s + args.mini)
                lp, m = logprobs(policy, x[sl], n_resp[sl], starts[sl])
                old_lp.append(lp); mask.append(m)
                ref_lp.append(logprobs(ref, x[sl], n_resp[sl], starts[sl])[0])
            old_lp, mask, ref_lp = (torch.cat(t) for t in (old_lp, mask, ref_lp))
            maskf = mask.float()
            kl_seq = ((old_lp - ref_lp) * maskf).sum(1)

        # 4. the update, on the mixed groups only
        clipped, approx_kl, steps = 0.0, 0.0, 0
        for _ in range(args.epochs if len(keep) else 0):
            order = keep[torch.randperm(len(keep), device=device)]
            for s in range(0, len(order), args.mini):
                idx = order[s:s + args.mini]
                lp, m = logprobs(policy, x[idx], n_resp[idx], starts[idx])
                mf = m.float()
                ratio = torch.exp(lp - old_lp[idx])
                a = adv[idx].unsqueeze(1)
                pg = torch.max(-a * ratio, -a * ratio.clamp(1 - args.clip, 1 + args.clip))
                d = ref_lp[idx] - lp
                kl = torch.exp(d) - d - 1          # the k3 estimator of KL(policy || reference), per token
                loss = masked_mean(pg + args.beta * kl, mf)
                opt.zero_grad(set_to_none=True)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(policy.parameters(), 1.0)
                opt.step()
                with torch.no_grad():
                    clipped += masked_mean(((ratio - 1).abs() > args.clip).float(), mf).item()
                    approx_kl += masked_mean(old_lp[idx] - lp, mf).item()
                steps += 1

        by_level = {}
        for lv in active:
            sel = torch.tensor([l == lv for l in levels], device=device).repeat_interleave(G)
            by_level[lv] = round(reward[sel].mean().item(), 3) if sel.any() else None
        rec = {"round": rnd, "reward": round(reward.mean().item(), 4), "by_level": by_level, "mixed": round(mixed.float().mean().item(), 3),
               "kl": round(kl_seq.mean().item(), 4), "length": round(n_resp.float().mean().item(), 2), "ended": round(ended.float().mean().item(), 3),
               "clipped": round(clipped / max(steps, 1), 4), "approx_kl": round(approx_kl / max(steps, 1), 5), "active": active[:], "elapsed": round(time.time() - t0)}
        log.write(json.dumps(rec) + "\n"); log.flush()
        print(f"round {rnd:3d}/{args.rounds}  right {100 * rec['reward']:5.1f}%  " + " ".join(f"L{lv} {100 * v:3.0f}%" for lv, v in by_level.items() if v is not None)
              + f"  mixed {100 * rec['mixed']:3.0f}%  KL {rec['kl']:5.2f}  length {rec['length']:4.1f}  ended {100 * rec['ended']:3.0f}%  "
              f"clipped {100 * rec['clipped']:4.1f}%  ({rec['elapsed'] / 60:.1f} min)", flush=True)
    print(f"DONE in {(time.time() - t0) / 60:.1f} min -> {out_dir}/final.pt")
