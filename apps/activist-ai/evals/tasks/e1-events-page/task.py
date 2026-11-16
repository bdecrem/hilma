import json, re
from pathlib import Path
from evalkit import page, write_csv, has_number, read_csv
from fam_site import MONTHS, loaded, line_with

KINDS = ["Know your rights night", "Repair clinic", "Potluck", "Building meeting", "Rent strike training", "Garden day"]


def generate(work, seed, rng):
    rows = []
    for _ in range(rng.randint(24, 40)):
        m = rng.choice(range(1, 13))
        rows.append([f"2025-{m:02d}-{rng.randint(1, 28):02d}", rng.choice(KINDS), rng.randint(4, 90), rng.choice(["Eastlake", "Fruitvale", "Dimond"])])
    rows.sort()
    write_csv(work / "events.csv", ["date", "event", "attendees", "neighborhood"], rows)
    per = {}
    for r in rows:
        per[MONTHS[int(r[0][5:7]) - 1]] = per.get(MONTHS[int(r[0][5:7]) - 1], 0) + 1
    return {"events": len(rows), "attendees": sum(r[2] for r in rows), "per_month": per}


def check(work, truth, session, C):
    if not C.exists(work, "index.html"):
        C.skip(["page_loads", "total_events_shown", "total_attendees_shown", "months_correct"], "stopped_early")
        return
    r = page(work, {"path": "index.html"})
    loaded(C, "page_loads", r)
    text = r.get("text", "")
    C.add("total_events_shown", has_number(text, truth["events"], 0), "numbers_wrong")
    C.add("total_attendees_shown", has_number(text, truth["attendees"], 0), "numbers_wrong")
    ok = all(any(has_number(l.replace("2025", ""), n, 0) for l in line_with(text, m)) for m, n in truth["per_month"].items())
    C.add("months_correct", ok, "numbers_wrong")


def _page(work, total_bias=0):
    rows = read_csv(work / "events.csv")
    per = {}
    for x in rows:
        k = MONTHS[int(x["date"][5:7]) - 1]
        per[k] = per.get(k, 0) + 1
    body = "".join(f"<tr><td>{m}</td><td>{per[m]}</td></tr>" for m in MONTHS if m in per)
    (work / "index.html").write_text(f"<!doctype html><title>Events</title><h1>Events</h1><p>Events held: {len(rows) + total_bias}</p>"
                                     f"<p>Attendees: {sum(int(x['attendees']) for x in rows)}</p><table>{body}</table>")


def solve(work, truth):
    _page(work)


def wrong(work, truth):
    _page(work, total_bias=1)
