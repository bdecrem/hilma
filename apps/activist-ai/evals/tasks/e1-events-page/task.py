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
    # v2 (2026-11-16): reads the named elements; v1 accepted the totals anywhere in the page text, which a page
    # listing every event satisfies by accident
    if not C.exists(work, "index.html"):
        C.skip(["page_loads", "total_events_shown", "total_attendees_shown", "months_correct"], "stopped_early")
        return
    r = page(work, {"path": "index.html", "read": ["#total-events", "#total-attendees", "#months tr"]})
    loaded(C, "page_loads", r)
    v = r.get("values") or {}
    one = lambda s: re.sub(r"[^0-9]", "", (v.get(s) or [""])[0])
    C.add("total_events_shown", one("#total-events") == str(truth["events"]), "numbers_wrong", v.get("#total-events"))
    C.add("total_attendees_shown", one("#total-attendees") == str(truth["attendees"]), "numbers_wrong", v.get("#total-attendees"))
    trs = v.get("#months tr") or []
    ok = all(any(m in t and has_number(t.replace("2025", ""), n, 0) for t in trs) for m, n in truth["per_month"].items())
    C.add("months_correct", ok, "numbers_wrong", trs[:3])


def _page(work, total_bias=0):
    rows = read_csv(work / "events.csv")
    per = {}
    for x in rows:
        k = MONTHS[int(x["date"][5:7]) - 1]
        per[k] = per.get(k, 0) + 1
    body = "".join(f"<tr><td>{m}</td><td>{per[m]}</td></tr>" for m in MONTHS if m in per)
    (work / "index.html").write_text(f"<!doctype html><title>Events</title><h1>Events</h1><p>Events held: <span id=total-events>{len(rows) + total_bias}</span></p>"
                                     f"<p>Attendees: <span id=total-attendees>{sum(int(x['attendees']) for x in rows)}</span></p><table id=months>{body}</table>")


def solve(work, truth):
    _page(work)


def wrong(work, truth):
    _page(work, total_bias=1)


def wrong2(work, truth):
    """Totals right, but written into the page text only, not in the named elements (what v1 accepted)."""
    _page(work)
    h = (work / "index.html").read_text().replace(" id=total-events", "").replace(" id=total-attendees", "")
    (work / "index.html").write_text(h)
