#!/usr/bin/env python3
"""
usage-meter.py — rough Claude Max usage meter from local transcripts.

Sums per-message token usage from every ~/.claude/projects JSONL modified in
the current weekly window, weights it at API prices, and (given one
calibration point: a percent read off the client UI at a known time) turns
future runs into a live "estimated % of weekly limit" gauge.

Usage:
  python3 scripts/usage-meter.py                       # report window usage
  python3 scripts/usage-meter.py --calibrate 87        # "the UI says 87% right now"

Caveats: only sees THIS machine; Anthropic's real limit accounting is not
public (this assumes cost-weighted tokens ~ limit share); treat as +/-20%.
"""
import json, os, sys, glob
from datetime import datetime, timedelta

STATE = os.path.expanduser('~/.claude/usage-meter-state.json')

# API-equivalent $/Mtok (Opus-tier for opus/fable, Sonnet-tier, Haiku-tier)
PRICES = {
    'opus':   {'in': 15.0, 'out': 75.0, 'cw': 18.75, 'cr': 1.50},
    'fable':  {'in': 15.0, 'out': 75.0, 'cw': 18.75, 'cr': 1.50},
    'sonnet': {'in': 3.0,  'out': 15.0, 'cw': 3.75,  'cr': 0.30},
    'haiku':  {'in': 1.0,  'out': 5.0,  'cw': 1.25,  'cr': 0.10},
}

def tier(model):
    m = (model or '').lower()
    for t in ('fable', 'opus', 'sonnet', 'haiku'):
        if t in m: return t
    return 'opus'

def window_start(now=None):
    # weekly window anchored at Thu 2026-07-31 03:00 local (from the UI);
    # walk back/forward in 7-day steps to bracket "now"
    anchor = datetime(2026, 7, 31, 3, 0)
    now = now or datetime.now()
    ws = anchor
    while ws > now: ws -= timedelta(days=7)
    return ws

def scan(since):
    total = {}
    files = glob.glob(os.path.expanduser('~/.claude/projects/**/*.jsonl'), recursive=True)
    for fp in files:
        try:
            if datetime.fromtimestamp(os.path.getmtime(fp)) < since: continue
            with open(fp) as f:
                for line in f:
                    if '"usage"' not in line: continue
                    try: d = json.loads(line)
                    except Exception: continue
                    msg = d.get('message') or d
                    u = msg.get('usage')
                    if not u: continue
                    ts = d.get('timestamp')
                    if ts:
                        try:
                            t = datetime.fromisoformat(ts.replace('Z', '+00:00')).astimezone().replace(tzinfo=None)
                            if t < since: continue
                        except Exception: pass
                    mt = tier(msg.get('model'))
                    b = total.setdefault(mt, {'in': 0, 'out': 0, 'cw': 0, 'cr': 0, 'msgs': 0})
                    b['in'] += u.get('input_tokens', 0) or 0
                    b['out'] += u.get('output_tokens', 0) or 0
                    b['cw'] += u.get('cache_creation_input_tokens', 0) or 0
                    b['cr'] += u.get('cache_read_input_tokens', 0) or 0
                    b['msgs'] += 1
        except Exception:
            continue
    return total

def dollars(total):
    s = 0.0
    for t, b in total.items():
        p = PRICES[t]
        s += b['in']/1e6*p['in'] + b['out']/1e6*p['out'] + b['cw']/1e6*p['cw'] + b['cr']/1e6*p['cr']
    return s

def main():
    ws = window_start()
    total = scan(ws)
    usd = dollars(total)
    print(f"window: {ws:%Y-%m-%d %H:%M} -> resets {ws + timedelta(days=7):%Y-%m-%d %H:%M}")
    for t, b in sorted(total.items()):
        print(f"  {t:7s} in {b['in']/1e6:8.2f}M  out {b['out']/1e6:7.2f}M  cacheW {b['cw']/1e6:8.2f}M  cacheR {b['cr']/1e6:9.2f}M  ({b['msgs']} msgs)")
    print(f"cost-weighted usage this window: ${usd:,.0f} (API-equivalent)")

    if len(sys.argv) > 2 and sys.argv[1] == '--calibrate':
        pct = float(sys.argv[2])
        budget = usd / (pct / 100.0)
        json.dump({'calibrated_at': datetime.now().isoformat(), 'pct': pct,
                   'usd_at_calibration': usd, 'weekly_budget_usd': budget}, open(STATE, 'w'))
        print(f"calibrated: {pct}% == ${usd:,.0f}  ->  weekly budget ~ ${budget:,.0f}")
    if os.path.exists(STATE):
        st = json.load(open(STATE))
        est = usd / st['weekly_budget_usd'] * 100
        print(f"estimated limit used: {est:.0f}%  (budget ~${st['weekly_budget_usd']:,.0f}/wk, "
              f"remaining ~${st['weekly_budget_usd'] - usd:,.0f})")

if __name__ == '__main__':
    main()
