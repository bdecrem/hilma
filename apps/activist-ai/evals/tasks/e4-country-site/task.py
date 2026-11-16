import re
from pathlib import Path
from evalkit import page, write_csv, has_number, read_csv, numbers_in
from fam_site import loaded

NAMES = ["Arvania", "Belmora", "Corvenia", "Dastria", "Elyria", "Fennmark", "Galvoria", "Hesperia", "Istrava", "Jorlund", "Kaltra", "Lumen"]
CATS = ["labour", "health", "education", "family", "residence"]


def generate(work, seed, rng):
    rows, avg, cells = [], {}, {}
    for n in NAMES:
        code = n[:3].upper()
        base = rng.randint(25, 80)
        s20 = [max(0, min(100, base + rng.randint(-15, 15))) for _ in CATS]
        s23 = [max(0, min(100, v + rng.randint(-10, 12))) for v in s20]
        rows.append([code, n] + s20 + s23)
        avg[n] = round(sum(s23) / 5, 1)
        cells[code] = {"name": n, "s20": s20, "s23": s23}
    rng.shuffle(rows)
    write_csv(work / "scores.csv", ["code", "country"] + [f"{c}_2020" for c in CATS] + [f"{c}_2023" for c in CATS], rows)
    order = sorted(NAMES, key=lambda n: (-avg[n], n))
    return {"avg": avg, "order": order, "cells": cells, "ties": len(set(avg.values())) < len(avg), "sample": rng.sample(sorted(cells), 3)}


def check(work, truth, session, C):
    names = ["index_loads", "ranked_order", "averages_shown", "links_to_every_country", "chart_present", "fits_phone", "country_pages_correct"]
    if not C.exists(work, "index.html"):
        C.skip(names, "stopped_early")
        return
    r = page(work, {"path": "index.html"})
    loaded(C, "index_loads", r)
    text = r.get("text", "")
    pos = [text.find(n) for n in truth["order"]]
    C.add("ranked_order", all(p >= 0 for p in pos) and (pos == sorted(pos) or truth["ties"] and _order_ok(text, truth)), "numbers_wrong")
    C.add("averages_shown", all(any(has_number(l, a) for l in text.splitlines() if n in l) for n, a in truth["avg"].items()), "numbers_wrong")
    links = [re.sub(r"^\./", "", l or "") for l in r.get("links", [])]
    ok = all(any(l.lower().endswith(f"countries/{code.lower()}.html") for l in links) and (Path(work) / "countries" / f"{code}.html").exists() or
             (Path(work) / "countries" / f"{code.lower()}.html").exists() and any(l.lower().endswith(f"countries/{code.lower()}.html") for l in links)
             for code in truth["cells"])
    C.add("links_to_every_country", ok, "page_broken")
    C.add("chart_present", (r.get("charts") or 0) >= 1, "page_broken")
    p = page(work, {"path": "index.html", "width": 390})
    C.add("fits_phone", p.get("ok") and (p.get("scroll") or 0) <= 1, "page_broken", f"scroll {p.get('scroll')}")
    good = True
    for code in truth["sample"]:
        c = truth["cells"][code]
        f = next((x for x in (f"countries/{code}.html", f"countries/{code.lower()}.html") if (Path(work) / x).exists()), None)
        if not f:
            good = False
            continue
        q = page(work, {"path": f})
        nums = numbers_in(q.get("text", ""))
        need = c["s20"] + c["s23"]
        good &= q.get("ok") and all(nums.count(v) >= need.count(v) for v in set(need))
    C.add("country_pages_correct", good, "numbers_wrong")


def _order_ok(text, truth):
    pos = {n: text.find(n) for n in truth["order"]}
    seq = sorted(truth["order"], key=pos.get)
    return all(truth["avg"][a] >= truth["avg"][b] for a, b in zip(seq, seq[1:]))


SVG = '<svg width="300" height="200" viewBox="0 0 300 200">{bars}</svg>'


def _site(work, reverse=False):
    rows = read_csv(work / "scores.csv")
    (work / "countries").mkdir(exist_ok=True)
    av = {}
    for x in rows:
        s20 = [int(x[f"{c}_2020"]) for c in CATS]
        s23 = [int(x[f"{c}_2023"]) for c in CATS]
        av[x["code"]] = (x["country"], sum(s23) / 5)
        tr = "".join(f"<tr><td>{c}</td><td>{a}</td><td>{b}</td><td>{b - a:+d}</td></tr>" for c, a, b in zip(CATS, s20, s23))
        (work / "countries" / f"{x['code']}.html").write_text(f"<!doctype html><title>{x['country']}</title><h1>{x['country']}</h1><table>{tr}</table>")
    ranked = sorted(av.items(), key=lambda kv: (-kv[1][1], kv[1][0]), reverse=reverse)
    li = "".join(f"<li><a href='countries/{c}.html'>{n}</a> {a:.1f}</li>" for c, (n, a) in ranked)
    bars = "".join(f'<rect x="{i * 24}" y="{200 - 2 * a:.0f}" width="20" height="{2 * a:.0f}"/>' for i, (c, (n, a)) in enumerate(ranked))
    (work / "index.html").write_text(f"<!doctype html><meta name=viewport content='width=device-width'><title>Scores</title><ol>{li}</ol>" + SVG.format(bars=bars))


def solve(work, truth):
    _site(work)


def wrong(work, truth):
    _site(work, reverse=True)
