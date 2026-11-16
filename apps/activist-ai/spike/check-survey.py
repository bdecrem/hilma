#!/usr/bin/env python3
"""Check what the agent made of the made-up survey against the known answers.

    python3 spike/check-survey.py <workdir> <truth.json>

Prints one line per check and a count; exits 0 only when every check passes.
"""
import csv, json, re, sys
from pathlib import Path

work, truth = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text())
checks = []
def check(name, ok, detail=""):
    checks.append(ok)
    print(("pass  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail else ""))

clean = work / "survey_clean.csv"
check("survey_clean.csv exists", clean.exists())
if clean.exists():
    rows = [r for r in csv.DictReader(clean.open()) if any((v or "").strip() for v in r.values())]
    check("one row per respondent", len(rows) == truth["respondents"], f"{len(rows)} rows, expected {truth['respondents']}")
    ids = [r.get("respondent_id", "") for r in rows]
    check("no repeated respondent", len(set(ids)) == len(ids))
    cities = {r.get("city", "") for r in rows}
    check("city in one spelling", len(cities) == len(truth["per_city"]), ", ".join(sorted(cities)))
    try:
        total = sum(int(r["hours_volunteered"]) for r in rows)
        check("hours are whole numbers and add up", total == truth["total_hours"], f"{total}, expected {truth['total_hours']}")
    except (ValueError, KeyError) as e:
        check("hours are whole numbers and add up", False, repr(e))
    sat = {(r.get("satisfied") or "") for r in rows}
    check("satisfied is yes or no", sat <= {"yes", "no"}, ", ".join(sorted(sat)))
    yes = sum(1 for r in rows if r.get("satisfied") == "yes")
    check("satisfied count", yes == truth["satisfied"], f"{yes}, expected {truth['satisfied']}")
    empty_age = sum(1 for r in rows if not (r.get("age") or "").strip())
    check("unusable ages left empty", empty_age == truth["unknown_ages"], f"{empty_age}, expected {truth['unknown_ages']}")

summary = work / "summary.md"
check("summary.md exists", summary.exists())
if summary.exists():
    text = summary.read_text()
    nums = re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))
    check("summary: respondents", str(truth["respondents"]) in nums)
    check("summary: total hours", str(truth["total_hours"]) in nums)
    check("summary: percent satisfied", f"{truth['satisfied_percent']:.1f}" in nums, f"expected {truth['satisfied_percent']:.1f}")
    for city, n in truth["per_city"].items():
        m = re.search(rf"{city}\D{{0,20}}(\d+)", text, re.I)
        check(f"summary: {city}", bool(m) and int(m.group(1)) == n, f"expected {n}")

print(f"{sum(checks)} of {len(checks)} checks passed")
sys.exit(0 if all(checks) else 1)
