#!/usr/bin/env python3
"""A made-up volunteer survey, deliberately messy, with the right answers known.

    python3 spike/make-survey.py <dir>

Writes <dir>/survey.csv (what the agent sees) and prints the truth as JSON on
stdout (what the check compares against; never placed in the workspace).
Every person, city and number is invented. Same seed, same file.
"""
import csv, json, random, sys
from pathlib import Path

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
rng = random.Random(20261115)
CITIES = ["Oakland", "Fresno", "Stockton", "Salinas"]
people = []
for i in range(1, 49):
    people.append({
        "id": f"R{i:03d}",
        "age": rng.randint(19, 78),
        "city": rng.choice(CITIES),
        "hours": rng.randint(0, 40),
        "satisfied": rng.random() < 0.7,
    })

def messy(p, k):
    city = [p["city"], p["city"].upper(), " " + p["city"].lower(), p["city"] + " "][k % 4]
    hours = [str(p["hours"]), f"{p['hours']} hrs", f"{p['hours']}.0", f" {p['hours']}"][(k // 2) % 4]
    sat = (["yes", "Y", "Yes", "YES"] if p["satisfied"] else ["no", "N", "No", "NO"])[(k // 3) % 4]
    return [p["id"], str(p["age"]), city, hours, sat]

rows = [messy(p, i) for i, p in enumerate(people)]
# three ages are unusable: the person still counts, the age is unknown
for i, bad in zip((5, 17, 33), ("n/a", "999", "")):
    rows[i][1] = bad
# six exact duplicates of earlier rows, and two blank lines
dups = [list(rows[i]) for i in (2, 9, 14, 21, 30, 41)]
rows = rows[:20] + dups[:3] + rows[20:40] + [[""] * 5] + dups[3:] + rows[40:] + [[""] * 5]

with open(out / "survey.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["respondent_id", "age", "city", "hours_volunteered", "satisfied"])
    w.writerows(rows)

truth = {
    "respondents": len(people),
    "total_hours": sum(p["hours"] for p in people),
    "per_city": {c: sum(1 for p in people if p["city"] == c) for c in CITIES},
    "satisfied": sum(1 for p in people if p["satisfied"]),
    "satisfied_percent": round(100 * sum(1 for p in people if p["satisfied"]) / len(people), 1),
    "unknown_ages": 3,
}
print(json.dumps(truth))
