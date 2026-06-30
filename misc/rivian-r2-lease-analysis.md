# Rivian R2 Lease Analysis — Bart

Personal car-finance analysis. Not a hilma project doc. Saved so the conversation can be resumed later.
All numbers pulled **live from rivian.com's Payment Estimator** on 2026-06-30 (lease offer valid through 6/30/2026).

## The car / config Bart is pricing

- **R2 Performance** + Launch Package (the only R2 trim leasing now; Premium = "coming late 2026", Standard = "coming spring 2027")
- **Glacier White** paint (+$1,000) → vehicle price **$58,990** (base Esker Silver is $57,990, included)
- 21" Liquid Tungsten All-Season wheels, Black Crater interior (default build)
- 330 mi EPA range, 0–60 in 3.6 s, 656 hp

## Bart's chosen lease parameters

- Term: **24 months**
- Mileage: **15,000 mi/yr** (= 30,000 total)
- Credit: **Excellent (740+)**
- ZIP **94306** (Palo Alto, CA — taxes & fees included in the monthly figures below)

## Lease terms — at $3,500 down (the baseline Bart settled on)

| Item | Value |
|---|---|
| **Monthly payment (w/ CA tax & fees)** | **$1,137/mo** |
| Monthly (before tax/fees) | ~$1,057/mo |
| Residual value | $41,735 (~71% of $58,990) |
| Due at signing | $7,367 |
| — Down payment | $3,500 |
| — Order deposit | $500 |
| — Acquisition fee | $895 |
| — Taxes & fees | $1,335 (+ first month) |
| Money factor | ~.00369 → **≈ 8.86% APR** |
| Excess mileage | $0.30/mile over 30,000 |
| Disposition fee (end of lease) | $495 |
| Security deposit | $0 |
| Destination fee | $1,495 |

### Reference points (other configs, from earlier in the convo)
- 36 mo / 10k mi / $3,500 down, Esker Silver $57,990: **$829/mo** base, **$909/mo** w/ tax; residual $38,070; due at signing $5,724 / $7,100.
- 24 mo / 10k mi: $949/mo base; residual $42,829.
- Headline "$939/mo" in the press = the $0-down base number.

## The $15,000-down question

Tested live in the calculator — **$15k down was accepted, no cap warning.**

| | $3,500 down | $15,000 down |
|---|---|---|
| Monthly (w/ tax) | $1,137 | **$557** |
| Due at signing | $7,367 | $19,408 |
| Residual | $41,735 | $41,735 |

- Monthly drops **−$580/mo** → ~$13,920 less in total payments over 24 mo.
- But **$11,500 of that is just your own money returned early.** The *real* savings (finance charge avoided) ≈ **$1,018** over the 2 years.
- CA taxes the extra down payment upfront (due-at-signing tax jumped $1,335 → $2,456, ≈ 9.75% × $11,500), roughly offsetting the monthly tax you'd otherwise pay — so tax is ~a wash, just front-loaded.

## The four questions — answers

1. **What happens with $15k down?** Monthly → $557 (−$580/mo). Mostly just prepaying with your own cash; real benefit is small.
2. **Will they allow it?** Yes — calculator accepted $15k fine.
3. **Does it change the effective rate?** **No.** Money factor stays ~.00369 (≈8.86% APR). You pay the same rate on a smaller balance. The extra $11,500 down saves only ~$1,018 in finance charges = equivalent to earning 8.86% on that cash — guaranteed, but **locked up and lost if the car is totaled** (gap insurance covers the lease, not your down payment). Rule of thumb: never put big money down on a lease.
4. **Is this clever for Bart, given (i) can pay cash, (ii) will swap in ~24 mo, (iii) dislikes the implied rate?**
   - **$15k down: no.** Doesn't fix the rate; ties up cash; adds total-loss exposure.
   - Disliking the rate → the *only* real way to avoid 8.86% is to **not finance** (pay cash). Money "down" on a lease is a half-measure.
   - **BUT the residual is unusually high (~71% for 24 mo).** High residual favors the lessee — Rivian is betting the car holds value, and Bart can **walk away in 24 months and let Rivian eat any depreciation shortfall.** First-gen Rivians have depreciated hard historically, so that's real risk to offload.
   - **Recommendation:** since Bart plans to swap in 2 years anyway, **lease with the minimum down ($3,500)**, keep cash invested, and treat the 8.86% as the price of making Rivian carry depreciation risk. The only thing that truly beats the rate is **buy with cash + sell in 24 mo** — but then *Bart* owns the resale risk on a new EV, which is exactly what the high-residual lease lets him avoid. $15k down is the worst of both.
   - *Caveat: this is the math, not formal financial advice; the resale-risk call hinges on how the R2 actually holds value, which is genuinely uncertain.*

## Open / next steps

- [ ] Pull the **buy-with-cash comparison**: full price + CA tax vs. likely 2-yr resale, to find the breakeven vs. the lease.
- [ ] Optional: 36-month white-paint number for comparison.

## Sources

- Rivian R2 Payment Estimator (driven directly): https://rivian.com/configurations/builder/r2/calculator
- Leasehackr, "At $939/Month, the New Rivian R2 Leases Horribly, So Buy It Instead": https://leasehackr.com/blog/2026/6/10/at-939-month-the-new-rivian-r2-leases-horribly-so-buy-it-instead
- RivianTrackr breakdown: https://riviantrackr.com/news/r2-performance-leases-for-model-y-money-full-breakdown/
