"""Grants with hand-typed organization names joined to a clean org list by name."""
import re
from evalkit import read_csv, read, num, write_csv, has_number

ORGS = [("O1", "Riverbend Tenants Union", "North"), ("O2", "Eastside Food Collective", "East"), ("O3", "Harbor Youth Arts", "South"),
        ("O4", "Millbrook Legal Aid", "North"), ("O5", "Cedar Street Mutual Aid", "East"), ("O6", "Saltmarsh Climate Network", "South"),
        ("O7", "North Valley Library Friends", "North")]


def variants(name, rng):
    return rng.choice([name, name.upper(), name.lower(), " " + name + " ", name + ", Inc.", name + " Inc", "The " + name, name.replace(" ", "  ")])


def generate(work, seed, rng):
    write_csv(work / "orgs.csv", ["org_id", "name", "region"], ORGS)
    rows, agg = [], {}
    for _ in range(rng.randint(36, 48)):
        oid, name, region = rng.choice(ORGS)
        amt = rng.choice([500, 750, 1000, 1500, 2000, 2500, 5000, 7500, 12500])
        year = rng.choice([2023, 2024, 2025])
        fmt = rng.choice([f"${amt:,}.00", str(amt), f"{amt:,}", f"$ {amt}"])
        rows.append([variants(name, rng), fmt, year])
        a = agg.setdefault(f"{region}|{year}", [0, 0])
        a[0] += 1
        a[1] += amt
    write_csv(work / "grants.csv", ["organization", "amount", "year"], rows)
    per = {}
    for k, (n, t) in agg.items():
        per[k.split("|")[0]] = per.get(k.split("|")[0], 0) + t
    return {"agg": agg, "per_region": per}


def check(work, truth, session, C):
    names = ["one_row_per_region_year", "grant_counts", "totals"]
    if C.exists(work, "by_region.csv"):
        rows = read_csv(work / "by_region.csv")
        got = {f"{r.get('region','')}|{(r.get('year') or '').split('.')[0]}": r for r in rows}
        C.add(names[0], set(got) == set(truth["agg"]) and len(rows) == len(truth["agg"]), "numbers_wrong", f"{len(rows)} rows")
        C.add(names[1], all(k in got and num(got[k].get("grants")) == v[0] for k, v in truth["agg"].items()), "numbers_wrong")
        C.add(names[2], all(k in got and num(got[k].get("total_amount")) == v[1] for k, v in truth["agg"].items()), "numbers_wrong")
    else:
        C.skip(names, "stopped_early")
    if C.exists(work, "summary.md"):
        text = read(work, "summary.md")
        for reg, t in truth["per_region"].items():
            m = re.search(rf"\b{reg}\b[^\n]{{0,60}}", text)
            C.add("summary_" + reg.lower(), bool(m) and has_number(m.group(0), t, 0.5), "numbers_wrong", f"expected {t}")
    else:
        C.skip(["summary_" + r.lower() for r in ("North", "East", "South")], "stopped_early")


def key(s):
    s = re.sub(r"[^a-z ]", " ", s.lower())
    s = re.sub(r"\b(the|inc)\b", " ", s)
    return " ".join(s.split())


def _solve(work, strict=False):
    orgs = {key(r["name"]) if not strict else r["name"]: r["region"] for r in read_csv(work / "orgs.csv")}
    agg = {}
    for r in read_csv(work / "grants.csv"):
        region = orgs.get(key(r["organization"]) if not strict else r["organization"])
        if not region:
            continue
        a = agg.setdefault((region, r["year"]), [0, 0])
        a[0] += 1
        a[1] += int(float(re.sub(r"[^\d.]", "", r["amount"])))
    write_csv(work / "by_region.csv", ["region", "year", "grants", "total_amount"], [[k[0], k[1], v[0], v[1]] for k, v in sorted(agg.items())])
    per = {}
    for (reg, _), v in agg.items():
        per[reg] = per.get(reg, 0) + v[1]
    (work / "summary.md").write_text("".join(f"- {k}: ${v:,}\n" for k, v in per.items()) + "\nAll grants matched.\n")


def solve(work, truth):
    _solve(work)
    return "Done."


def wrong(work, truth):
    _solve(work, strict=True)
    return "Done."
