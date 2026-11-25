#!/usr/bin/env python3
"""score.py <key.json> <the model's votes.json>: how much of the housing-vote table is right. Prints one JSON line.

found / missed / extra: motions in the key that the model listed, did not list, or listed although
they are not housing votes. Of the found ones: how many have the right date, the right result, and
every member in the right list (that last one is "fully right"). Then the four totals.
"""
import json, re, sys

key = json.load(open(sys.argv[1]))
LAST = sorted({m for v in key["votes"] for k in ("yes", "no", "abstain", "absent") for m in v[k]} | {key["totals"]["most_no"]})
try:
    got = json.load(open(sys.argv[2]))
except Exception as e:
    print(json.dumps({"error": "votes.json missing or not JSON: " + str(e)[:80]})); sys.exit(0)
votes = got.get("votes", []) if isinstance(got, dict) else got
totals = got.get("totals", {}) if isinstance(got, dict) else {}

def mid(s):
    m = re.search(r"\d{2}-\d{3}", str(s)); return m.group(0) if m else str(s)
def who(xs):
    out = set()
    for x in xs or []:
        hit = [m for m in LAST if m.lower() in str(x).lower()]
        out.add(hit[0] if hit else str(x))
    return out

K = {v["motion"]: v for v in key["votes"]}
G = {}
for v in votes:
    if isinstance(v, dict): G[mid(v.get("motion", ""))] = v
found = [m for m in K if m in G]
res = dict(expected=len(K), listed=len(G), found=len(found), missed=sorted(set(K) - set(G)), extra=sorted(set(G) - set(K)),
           date_right=0, result_right=0, fully_right=0, wrong=[])
for m in found:
    k, g = K[m], G[m]
    d = str(g.get("date", ""))[:10] == k["date"]
    r = str(g.get("result", "")).strip().lower() == k["result"]
    lists = all(who(g.get(f)) == set(k[f]) for f in ("yes", "no", "abstain", "absent"))
    res["date_right"] += d; res["result_right"] += r; res["fully_right"] += (d and r and lists)
    if not (d and r and lists): res["wrong"].append(m + (":date" if not d else "") + (":result" if not r else "") + (":names" if not lists else ""))
t = key["totals"]
res["totals_right"] = sum([totals.get("votes") == t["votes"], totals.get("passed") == t["passed"], totals.get("failed") == t["failed"],
                           t["most_no"].lower() in str(totals.get("most_no", "")).lower()])
res["totals_given"] = totals; res["totals_key"] = t
print(json.dumps(res))
