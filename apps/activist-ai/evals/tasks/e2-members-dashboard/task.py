from evalkit import page, write_csv, num, read_csv
from fam_site import loaded, vals

REGIONS = ["North", "Harbor", "Valley", "Uplands"]


def generate(work, seed, rng):
    rows = [[f"M{i:04d}", f"20{rng.randint(15, 25)}-{rng.randint(1, 12):02d}-01", rng.choice(REGIONS), rng.choices(["active", "lapsed"], [3, 1])[0],
             rng.choice([60, 120, 180, 240])] for i in range(1, rng.randint(150, 260))]
    write_csv(work / "members.csv", ["member_id", "joined", "region", "status", "yearly_dues"], rows)
    act = [r for r in rows if r[3] == "active"]
    return {"members": len(rows), "active_percent": round(100 * len(act) / len(rows), 1), "dues_active": sum(r[4] for r in act),
            "regions": {g: sum(1 for r in rows if r[2] == g) for g in REGIONS}}


def check(work, truth, session, C):
    names = ["page_loads", "members_stat", "active_percent_stat", "dues_active_stat", "region_rows", "works_offline", "fits_phone"]
    if not C.exists(work, "index.html"):
        C.skip(names, "stopped_early")
        return
    sels = ['[data-stat="members"]', '[data-stat="active_percent"]', '[data-stat="dues_active"]'] + [f'[data-region="{g}"]' for g in truth["regions"]]
    r = page(work, {"path": "index.html", "read": sels})
    loaded(C, "page_loads", r)
    n = lambda s: num(__import__("re").sub(r"[^\d.]", "", vals(r, s)) or None)
    C.add("members_stat", n(sels[0]) == truth["members"], "numbers_wrong", vals(r, sels[0]))
    C.add("active_percent_stat", n(sels[1]) is not None and abs(n(sels[1]) - truth["active_percent"]) < 0.051, "numbers_wrong", vals(r, sels[1]))
    C.add("dues_active_stat", n(sels[2]) == truth["dues_active"], "numbers_wrong", vals(r, sels[2]))
    from evalkit import has_number
    C.add("region_rows", all(has_number(vals(r, f'[data-region="{g}"]'), v, 0) for g, v in truth["regions"].items()), "numbers_wrong")
    C.add("works_offline", r.get("ok") and not r.get("external") and not r.get("missing"), "page_broken", f"external {r.get('external')}, missing {r.get('missing')}")
    p = page(work, {"path": "index.html", "width": 390})
    C.add("fits_phone", p.get("ok") and (p.get("scroll") or 0) <= 1, "page_broken", f"scroll {p.get('scroll')}")


def _page(work, bad=False):
    rows = read_csv(work / "members.csv")
    act = [x for x in rows if x["status"] == "active"]
    pct = 100 * len(act) / len(rows)
    reg = {}
    for x in rows:
        reg[x["region"]] = reg.get(x["region"], 0) + 1
    tr = "".join(f'<tr data-region="{g}"><td>{g}</td><td>{k}</td></tr>' for g, k in reg.items())
    (work / "index.html").write_text(f"<!doctype html><meta name=viewport content='width=device-width'><title>Members</title>"
                                     f"<p>Members <b data-stat=members>{len(rows)}</b></p><p>Active <b data-stat=active_percent>{pct:.1f}%</b></p>"
                                     f"<p>Dues <b data-stat=dues_active>${sum(int(x['yearly_dues']) for x in (rows if bad else act)):,}</b></p><table>{tr}</table>")


def solve(work, truth):
    _page(work)


def wrong(work, truth):
    _page(work, bad=True)
