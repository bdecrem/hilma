"""Step 11c: PPO, the loop that moves the model toward what the reward model likes.

Four models in memory:

  policy     the cranky SFT model, the one being trained
  reference  a frozen copy of it, for the leash
  reward     11b's reward model, frozen: one number per finished answer
  value      a copy of the reward model, trained alongside the policy to guess,
             at every token, the reward the answer will end up with

Each round:

  1. 64 questions; the policy answers each once (temperature 1, no top-k, so
     the answers come from exactly the distribution PPO computes with)
  2. the reward model scores each finished answer (an answer cut off at 120
     tokens without stopping loses 1 more)
  3. the leash: every token pays beta x (log p_policy - log p_reference), so
     the further the policy drifts from the SFT model, the more it pays (the KL)
  4. credit per token (GAE): each token's advantage is how much better the
     rest of its answer went than the value model expected from that point
  5. four passes over the round in minibatches of 16: raise the log-probability
     of tokens with a positive advantage and lower the others, but clip the
     ratio new/old to 0.8-1.2 so no round moves the policy far (the "proximal"
     in PPO); fit the value model to what actually happened

Writes out/rlhf/<out>/final.pt (a plain GPT checkpoint, loadable by load()),
step checkpoints, and log.jsonl with reward, KL and length per round.

Run:  .venv/bin/python 11-rlhf/ppo.py                          (the leash at 0.05, ~1 h on the mini)
      .venv/bin/python 11-rlhf/ppo.py --beta 0 --out ppo-noleash   (no leash: watch the reward model get gamed)
"""

import argparse
import json
import os
import random
import time

import torch
import torch.nn.functional as F

from common import OUT, ROOT, SFT, Scorer, chat, device, generate, load, pad, rows, text, with_eot

HELD_OUT = 200
PROBES = [
    "Is the Korn shell available for Xenix on the 386?",
    "In NetHack, should I eat as much as I can, or wait until I'm Weak to save food?",
    "I want a computer for MIDI and music software. Should I get a Mac II, a Mac SE, or an IBM?",
    "How do I get my 2400 baud modem to work with Kermit on a PC?",
]


def logprobs(model, x, n_resp, starts):
    """log p of each answer token under model, (B, T-1), and the mask of answer positions."""
    logits = model(x)[:, :-1].float()
    lp = torch.gather(F.log_softmax(logits, dim=-1), 2, x[:, 1:].unsqueeze(-1)).squeeze(-1)
    pos = torch.arange(x.shape[1] - 1, device=device).unsqueeze(0)
    # y[j] = x[j+1]: answer tokens sit at x positions start..start+n-1, so at y positions start-1..start+n-2
    mask = (pos >= starts.unsqueeze(1) - 1) & (pos < (starts + n_resp).unsqueeze(1) - 1)
    return lp, mask


def masked_mean(t, m):
    return (t * m).sum() / m.sum()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--beta", type=float, default=0.05, help="the leash: KL penalty per token")
    ap.add_argument("--out", default="ppo")
    ap.add_argument("--rounds", type=int, default=150)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--mini", type=int, default=16)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--lr", type=float, default=5e-6)
    ap.add_argument("--vlr", type=float, default=1e-5)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--cutoff-penalty", type=float, default=1.0)
    ap.add_argument("--save-every", type=int, default=25)
    args = ap.parse_args()
    out_dir = os.path.join(OUT, args.out)
    os.makedirs(out_dir, exist_ok=True)

    c = chat()
    random.seed(11); torch.manual_seed(11)
    policy = load(SFT, device).train()
    ref = load(SFT, device).eval().requires_grad_(False)
    rm = Scorer.load(os.path.join(OUT, "reward.pt")).eval().requires_grad_(False)
    mu, sd = rm.extra["mu"], rm.extra["sd"]
    value = Scorer.load(os.path.join(OUT, "reward.pt")).train()
    popt = torch.optim.AdamW(policy.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.0)
    vopt = torch.optim.AdamW(value.parameters(), lr=args.vlr, betas=(0.9, 0.95), weight_decay=0.0)

    qs = [r["q"] for r in rows("questions.jsonl")[HELD_OUT:]]
    qs += [json.loads(l)["q"] for k, l in enumerate(open(os.path.join(ROOT, "09-sft", "qa-usenet.jsonl"))) if k % 20]
    print(f"device {device}; {len(qs):,} questions; beta {args.beta}; {args.rounds} rounds of {args.batch}", flush=True)
    log = open(os.path.join(out_dir, "log.jsonl"), "w")
    t0 = time.time()

    for rnd in range(args.rounds + 1):
        if rnd % args.save_every == 0:
            policy.eval()
            torch.manual_seed(1000 + rnd)
            samples = generate(policy, [c.prompt(q) for q in PROBES], c.eot, temperature=0.7, top_k=40)
            ss = [{"q": q, "a": text(c, a)} for q, a in zip(PROBES, samples)]
            for s in ss:
                print(f"    {s['q'][:70]}\n      -> {s['a']}", flush=True)
            log.write(json.dumps({"round": rnd, "samples": ss}) + "\n"); log.flush()
            torch.save({"model": policy.state_dict(), "cfg": policy.cfg.__dict__, "round": rnd, "beta": args.beta},
                       os.path.join(out_dir, "final.pt" if rnd == args.rounds else f"round{rnd}.pt"))
            policy.train()
        if rnd == args.rounds:
            break

        # 1. answers
        batch = random.sample(qs, args.batch)
        prompts = [c.prompt(q) for q in batch]
        policy.eval()
        answers = generate(policy, prompts, c.eot, temperature=1.0)
        policy.train()
        ended = torch.tensor([bool(a) and a[-1] == c.eot for a in answers], device=device)
        n_resp = torch.tensor([len(a) for a in answers], device=device)
        starts = torch.tensor([len(p) for p in prompts], device=device)
        x, _ = pad([p + a for p, a in zip(prompts, answers)], c.eot)

        with torch.no_grad():
            # 2. the reward model's verdict, on the answer as if it had stopped
            xs, ns = pad([p + with_eot(c, a) for p, a in zip(prompts, answers)], c.eot)
            score = (rm(xs)[torch.arange(len(answers), device=device), ns - 1] - mu) / sd
            reward = score - args.cutoff_penalty * (~ended).float()
            # 3. log-probs now, under the reference, and the value model's guesses
            old_lp, mask, ref_lp, old_v = [], [], [], []
            for s in range(0, len(answers), args.mini):
                sl = slice(s, s + args.mini)
                lp, m = logprobs(policy, x[sl], n_resp[sl], starts[sl])
                old_lp.append(lp); mask.append(m)
                ref_lp.append(logprobs(ref, x[sl], n_resp[sl], starts[sl])[0])
                old_v.append(value(x[sl])[:, :-1])
            old_lp, mask, ref_lp, old_v = (torch.cat(t) for t in (old_lp, mask, ref_lp, old_v))
            maskf = mask.float()
            kl = (old_lp - ref_lp) * maskf
            # per-token reward: the leash on every token, the verdict on the last
            r = -args.beta * kl
            last = starts + n_resp - 2
            r[torch.arange(len(answers), device=device), last] += reward
            # 4. GAE, from the last token back (gamma = 1)
            adv = torch.zeros_like(r)
            run = torch.zeros(len(answers), device=device)
            v = old_v * maskf
            for j in range(r.shape[1] - 1, -1, -1):
                nxt = v[:, j + 1] if j + 1 < r.shape[1] else torch.zeros_like(run)
                delta = r[:, j] + nxt - v[:, j]
                run = (delta + args.lam * run) * maskf[:, j]
                adv[:, j] = run
            returns = adv + v
            a_mean = masked_mean(adv, maskf)
            a_std = (masked_mean((adv - a_mean) ** 2, maskf) + 1e-8).sqrt()
            adv = (adv - a_mean) / a_std * maskf

        # 5. four passes
        clipped, approx_kl, vloss_sum, steps = 0.0, 0.0, 0.0, 0
        for _ in range(args.epochs):
            order = torch.randperm(len(answers), device=device)
            for s in range(0, len(answers), args.mini):
                idx = order[s:s + args.mini]
                lp, m = logprobs(policy, x[idx], n_resp[idx], starts[idx])
                mf = m.float()
                ratio = torch.exp(lp - old_lp[idx])
                pg = torch.max(-adv[idx] * ratio, -adv[idx] * ratio.clamp(1 - args.clip, 1 + args.clip))
                ploss = masked_mean(pg, mf)
                popt.zero_grad(set_to_none=True)
                ploss.backward()
                torch.nn.utils.clip_grad_norm_(policy.parameters(), 1.0)
                popt.step()
                vnew = value(x[idx])[:, :-1]
                vclip = old_v[idx] + (vnew - old_v[idx]).clamp(-args.clip, args.clip)
                vloss = 0.5 * masked_mean(torch.max((vnew - returns[idx]) ** 2, (vclip - returns[idx]) ** 2), mf)
                vopt.zero_grad(set_to_none=True)
                vloss.backward()
                torch.nn.utils.clip_grad_norm_(value.parameters(), 1.0)
                vopt.step()
                with torch.no_grad():
                    clipped += masked_mean(((ratio - 1).abs() > args.clip).float(), mf).item()
                    approx_kl += masked_mean(old_lp[idx] - lp, mf).item()
                    vloss_sum += vloss.item()
                steps += 1

        rec = {"round": rnd, "score": round(score.mean().item(), 4), "reward": round(reward.mean().item(), 4),
               "kl": round((kl.sum(1)).mean().item(), 4), "length": round(n_resp.float().mean().item(), 2),
               "ended": round(ended.float().mean().item(), 3), "clipped": round(clipped / steps, 4),
               "approx_kl": round(approx_kl / steps, 5), "vloss": round(vloss_sum / steps, 4), "elapsed": round(time.time() - t0)}
        log.write(json.dumps(rec) + "\n"); log.flush()
        print(f"round {rnd:3d}/{args.rounds}  score {rec['score']:+.3f}  KL {rec['kl']:6.2f}  length {rec['length']:5.1f}  "
              f"ended {100 * rec['ended']:3.0f}%  clipped {100 * rec['clipped']:4.1f}%  value loss {rec['vloss']:.3f}  "
              f"({rec['elapsed'] / 60:.1f} min)", flush=True)
    print(f"DONE in {(time.time() - t0) / 60:.1f} min -> {out_dir}/final.pt")
