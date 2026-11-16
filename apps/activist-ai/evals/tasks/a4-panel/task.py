"""A wide statistics export: notes above the header, footnotes on numbers and names, mixed
thousands separators, three missing markers, a totals row."""
import csv, re
from evalkit import read_csv, read, num, write_csv, has_number

COUNTRIES = ["Arvania", "Belmora", "Corvenia", "Dastria", "Elyria", "Fennmark", "Galvoria", "Hesper Isles", "Istrava", "Jorlund"]
YEARS = list(range(2015, 2021))


def fmt(v, rng):
    s = rng.choice([f"{v:,.1f}", f"{v:.1f}", f"{v:,.1f}".replace(",", " "), f"{v:.1f}"])
    return s + rng.choice(["", "", "", "a", "*", " b"])


def generate(work, seed, rng):
    data = {}
    for c in COUNTRIES:
        base = rng.uniform(300, 9000)
        for y in YEARS:
            if rng.random() < 0.12:
                continue
            data[(c, y)] = round(base * (1 + rng.uniform(-0.05, 0.12)) ** (y - 2015), 1)
    lines = [["Indicator: households reached by the program (thousands)"], ["Source: made-up ministry of statistics, generated for a test"], []]
    lines.append(["Country"] + [str(y) for y in YEARS])
    for c in COUNTRIES:
        name = c + rng.choice(["", "", " (b)", "*", " 1"])
        lines.append([name] + [fmt(data[(c, y)], rng) if (c, y) in data else rng.choice(["..", "—", "n/a"]) for y in YEARS])
    lines.append(["Total, all countries"] + [f"{sum(v for (c, yy), v in data.items() if yy == y):,.1f}" for y in YEARS])
    lines.append(["Note: a = provisional; b = break in series; * = estimate"])
    with open(work / "indicator_export.csv", "w", newline="") as f:
        csv.writer(f).writerows(lines)
    means = {str(y): round(sum(v for (c, yy), v in data.items() if yy == y) / sum(1 for (c, yy) in data if yy == y), 1) for y in YEARS}
    both = [c for c in COUNTRIES if (c, 2015) in data and (c, 2020) in data]
    grew = max(both, key=lambda c: data[(c, 2020)] - data[(c, 2015)])
    return {"cells": {f"{c}|{y}": v for (c, y), v in data.items()}, "means": means, "grew": grew}


def check(work, truth, session, C):
    names = ["one_row_per_value", "no_totals_row", "country_names_clean", "values_correct"]
    if C.exists(work, "long.csv"):
        rows = read_csv(work / "long.csv")
        keys = [f"{r.get('country','')}|{(r.get('year') or '').split('.')[0]}" for r in rows]
        C.add(names[0], len(rows) == len(truth["cells"]) and len(set(keys)) == len(keys), "numbers_wrong", f"{len(rows)} vs {len(truth['cells'])}")
        C.add(names[1], not any("total" in r.get("country", "").lower() for r in rows), "numbers_wrong")
        C.add(names[2], {r.get("country", "") for r in rows} <= set(COUNTRIES) and len({r.get("country", "") for r in rows}) == len(COUNTRIES), "wrong_format")
        bad = [k for k, r in zip(keys, rows) if k not in truth["cells"] or num(r.get("value")) is None or abs(num(r.get("value")) - truth["cells"][k]) > 0.05]
        C.add(names[3], not bad, "numbers_wrong", f"{len(bad)} wrong")
    else:
        C.skip(names, "stopped_early")
    if C.exists(work, "summary.md"):
        text = read(work, "summary.md")
        for y, m in truth["means"].items():
            line = re.search(rf"\b{y}\b[^\n]{{0,60}}", text)
            C.add(f"mean_{y}", bool(line) and has_number(line.group(0).replace(y, "", 1), m, 0.06), "numbers_wrong", f"expected {m}")
        C.add("largest_growth_named", truth["grew"].lower() in text.lower(), "numbers_wrong", truth["grew"])
    else:
        C.skip([f"mean_{y}" for y in truth["means"]] + ["largest_growth_named"], "stopped_early")


def _solve(work, keep_total=False):
    rows = list(csv.reader(open(work / "indicator_export.csv")))
    hi = next(i for i, r in enumerate(rows) if r and r[0] == "Country")
    years = rows[hi][1:]
    out = []
    for r in rows[hi + 1:]:
        if len(r) < 2 or (r[0].startswith("Total") and not keep_total):
            continue
        name = re.sub(r"(\s*\(b\)|\*|\s+1)$", "", r[0]).strip()
        for y, cell in zip(years, r[1:]):
            m = re.match(r"^[\d ,.]+", cell.strip())
            if not m or not re.search(r"\d", m.group(0)):
                continue
            out.append([name, y, float(m.group(0).replace(",", "").replace(" ", ""))])
    write_csv(work / "long.csv", ["country", "year", "value"], out)
    d = {(c, y): v for c, y, v in out}
    lines = []
    for y in years:
        vals = [v for (c, yy), v in d.items() if yy == y]
        lines.append(f"- {y}: {sum(vals) / len(vals):.1f}")
    both = [c for (c, y) in d if y == "2015" and (c, "2020") in d]
    g = max(both, key=lambda c: d[(c, "2020")] - d[(c, "2015")])
    (work / "summary.md").write_text("\n".join(lines) + f"\n\nGrew most: {g}\n")


def solve(work, truth):
    _solve(work)
    return "Done."


def wrong(work, truth):
    _solve(work, keep_total=True)
    return "Done."
