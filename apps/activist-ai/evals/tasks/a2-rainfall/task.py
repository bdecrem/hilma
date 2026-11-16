"""Monthly rainfall at four made-up gauges: unit column mm/in, four month formats, name variants, duplicates."""
import csv, re
from evalkit import read_csv, read, num, write_csv, has_number

STATIONS = ["Kestrel Ridge", "Low Fen", "Marrow Bay", "Pine Hollow"]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def generate(work, seed, rng):
    rows, truth = [], {}
    for s in STATIONS:
        for m in range(1, 13):
            mm = round(rng.uniform(2, 180) * (1.6 if m in (1, 2, 11, 12) else 1), 1)
            name = rng.choice([s, s.upper(), s.lower(), " " + s, s + " ", s.replace(" ", "  ")])
            month = rng.choice([f"2025-{m:02d}", f"{MON[m-1]} 2025", f"{m:02d}/2025", f"{FULL[m-1]} 2025"])
            if rng.random() < 0.4:
                inches = round(mm / 25.4, 2)
                mm = round(inches * 25.4, 1)
                rows.append([name, month, f"{inches:.2f}", rng.choice(["in", "inches", "IN"])])
            else:
                rows.append([name, month, f"{mm:.1f}", rng.choice(["mm", "MM", "millimetres"])])
            truth[f"{s}|2025-{m:02d}"] = mm
    rng.shuffle(rows)
    for i in rng.sample(range(len(rows)), 5):
        rows.append(list(rows[i]))
    rng.shuffle(rows)
    write_csv(work / "rain.csv", ["station", "month", "amount", "unit"], rows)
    totals = {s: round(sum(v for k, v in truth.items() if k.startswith(s + "|")), 1) for s in STATIONS}
    wet = max(truth, key=truth.get)
    return {"cells": truth, "totals": totals, "wettest": wet.split("|")}


def check(work, truth, session, C):
    names = ["rows_one_per_station_month", "month_format", "station_one_spelling", "rain_mm_correct"]
    if C.exists(work, "rain_clean.csv"):
        rows = read_csv(work / "rain_clean.csv")
        canon = {x.lower(): x for x in STATIONS}
        keys = [f"{canon.get(r.get('station','').lower(), r.get('station',''))}|{r.get('month','')}" for r in rows]
        C.add(names[0], len(rows) == 48 and len(set(keys)) == 48, "numbers_wrong", len(rows))
        C.add(names[1], all(re.fullmatch(r"\d{4}-\d{2}", r.get("month", "")) for r in rows), "wrong_format")
        got = {r.get("station", "") for r in rows}
        C.add(names[2], len(got) == 4 and {g.lower() for g in got} == set(canon), "wrong_format", sorted(got)[:6])
        bad = [k for k, r in zip(keys, rows) if k not in truth["cells"] or num(r.get("rain_mm")) is None or abs(num(r.get("rain_mm")) - truth["cells"][k]) > 0.15]
        C.add(names[3], not bad and len(rows) == 48, "numbers_wrong", f"{len(bad)} wrong")
    else:
        C.skip(names, "stopped_early")
    if C.exists(work, "summary.md"):
        text = read(work, "summary.md")
        for s, t in truth["totals"].items():
            m = re.search(re.escape(s) + r"[^\n]{0,60}", text, re.I)
            C.add("total_" + s.lower().replace(" ", "_"), bool(m) and has_number(m.group(0), t, 1.0), "numbers_wrong", f"expected {t}")
        st, mo = truth["wettest"]
        month_words = [mo, FULL[int(mo[5:]) - 1], MON[int(mo[5:]) - 1]]
        C.add("wettest_named", st.lower() in text.lower() and any(w.lower() in text.lower() for w in month_words), "numbers_wrong", f"{st} {mo}")
    else:
        C.skip(["total_" + s.lower().replace(" ", "_") for s in STATIONS] + ["wettest_named"], "stopped_early")


def _month(s):
    s = s.strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})", s) or None
    if m:
        return s
    m = re.fullmatch(r"(\d{2})/(\d{4})", s)
    if m:
        return f"{m.group(2)}-{m.group(1)}"
    word, year = s.split()
    return f"{year}-{[w[:3] for w in FULL].index(word[:3]) + 1:02d}"


def _solve(work, convert=True):
    seen = {}
    for r in read_csv(work / "rain.csv"):
        st = " ".join(r["station"].split()).title()
        v = float(r["amount"]) * (25.4 if convert and r["unit"].lower().startswith("in") else 1)
        seen[(st, _month(r["month"]))] = round(v, 1)
    write_csv(work / "rain_clean.csv", ["station", "month", "rain_mm"], [[s, m, f"{v:.1f}"] for (s, m), v in sorted(seen.items())])
    tot = {}
    for (s, m), v in seen.items():
        tot[s] = tot.get(s, 0) + v
    (s, m), v = max(seen.items(), key=lambda kv: kv[1])
    (work / "summary.md").write_text("".join(f"- {k}: {t:.1f} mm\n" for k, t in tot.items()) + f"\nWettest: {s}, {m} ({v} mm)\n")


def solve(work, truth):
    _solve(work)
    return "Done."


def wrong(work, truth):
    _solve(work, convert=False)
    return "Done."
