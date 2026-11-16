"""The spike's messy volunteer survey, seeded. Duplicates, blank lines, four spellings of each
city, hours written four ways, yes/no written four ways, three unusable ages."""
import csv, re
from evalkit import read_csv, read, num, write_csv

CITIES = ["Oakland", "Fresno", "Stockton", "Salinas"]


def generate(work, seed, rng):
    people = [{"id": f"R{i:03d}", "age": rng.randint(19, 78), "city": rng.choice(CITIES), "hours": rng.randint(0, 40),
               "satisfied": rng.random() < 0.7} for i in range(1, rng.randint(40, 56))]

    def messy(p, k):
        city = [p["city"], p["city"].upper(), " " + p["city"].lower(), p["city"] + " "][k % 4]
        hours = [str(p["hours"]), f"{p['hours']} hrs", f"{p['hours']}.0", f" {p['hours']}"][(k // 2) % 4]
        sat = (["yes", "Y", "Yes", "YES"] if p["satisfied"] else ["no", "N", "No", "NO"])[(k // 3) % 4]
        return [p["id"], str(p["age"]), city, hours, sat]

    rows = [messy(p, i) for i, p in enumerate(people)]
    for i, bad in zip(rng.sample(range(len(rows)), 3), ("n/a", "999", "")):
        rows[i][1] = bad
    for i in rng.sample(range(len(rows)), 6):
        rows.insert(rng.randint(i + 1, len(rows)), list(rows[i]))
    for _ in range(2):
        rows.insert(rng.randint(1, len(rows)), [""] * 5)
    write_csv(work / "survey.csv", ["respondent_id", "age", "city", "hours_volunteered", "satisfied"], rows)
    sat = sum(p["satisfied"] for p in people)
    return {"respondents": len(people), "total_hours": sum(p["hours"] for p in people),
            "per_city": {c: sum(1 for p in people if p["city"] == c) for c in CITIES},
            "satisfied": sat, "satisfied_percent": round(100 * sat / len(people), 1), "unknown_ages": 3}


def check(work, truth, session, C):
    if C.exists(work, "survey_clean.csv"):
        rows = read_csv(work / "survey_clean.csv")
        C.add("one_row_per_respondent", len(rows) == truth["respondents"], "numbers_wrong", f"{len(rows)} vs {truth['respondents']}")
        ids = [r.get("respondent_id", "") for r in rows]
        C.add("no_repeated_respondent", len(set(ids)) == len(ids), "numbers_wrong")
        got = {r.get("city", "") for r in rows}
        C.add("city_one_spelling", len(got) == len([c for c, n in truth["per_city"].items() if n]) and {g.lower() for g in got} <= {c.lower() for c in CITIES}, "wrong_format")
        try:
            total = sum(int(r["hours_volunteered"]) for r in rows)
            C.add("hours_whole_and_add_up", total == truth["total_hours"], "numbers_wrong", total)
        except (ValueError, KeyError) as e:
            C.add("hours_whole_and_add_up", False, "wrong_format", repr(e))
        C.add("satisfied_yes_no", {r.get("satisfied", "") for r in rows} <= {"yes", "no"}, "wrong_format")
        C.add("satisfied_count", sum(r.get("satisfied") == "yes" for r in rows) == truth["satisfied"], "numbers_wrong")
        C.add("unusable_ages_empty", sum(not r.get("age") for r in rows) == truth["unknown_ages"], "numbers_wrong")
    else:
        C.skip(["one_row_per_respondent", "no_repeated_respondent", "city_one_spelling", "hours_whole_and_add_up",
                "satisfied_yes_no", "satisfied_count", "unusable_ages_empty"], "stopped_early")
    if C.exists(work, "summary.md"):
        text = read(work, "summary.md")
        nums = re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))
        C.add("summary_respondents", str(truth["respondents"]) in nums, "numbers_wrong")
        C.add("summary_total_hours", str(truth["total_hours"]) in nums, "numbers_wrong")
        C.add("summary_percent_satisfied", f"{truth['satisfied_percent']:.1f}" in nums, "numbers_wrong")
        for city, n in truth["per_city"].items():
            m = re.search(rf"{city}\D{{0,20}}(\d+)", text, re.I)
            C.add(f"summary_{city.lower()}", bool(m) and int(m.group(1)) == n, "numbers_wrong")
    else:
        C.skip(["summary_respondents", "summary_total_hours", "summary_percent_satisfied"] + [f"summary_{c.lower()}" for c in CITIES], "stopped_early")


def _clean(work, dedupe=True):
    seen, out = set(), []
    for r in csv.reader(open(work / "survey.csv")):
        if r[0] == "respondent_id" or not any(x.strip() for x in r):
            continue
        if dedupe and tuple(r) in seen:
            continue
        seen.add(tuple(r))
        age = r[1].strip()
        age = age if age.isdigit() and 0 < int(age) < 120 else ""
        out.append([r[0], age, r[2].strip().title(), str(int(float(re.sub(r"[^\d.]", "", r[3])))),
                    "yes" if r[4].strip().lower().startswith("y") else "no"])
    return out


def _write(work, rows):
    write_csv(work / "survey_clean.csv", ["respondent_id", "age", "city", "hours_volunteered", "satisfied"], rows)
    n = len(rows)
    per = {}
    for r in rows:
        per[r[2]] = per.get(r[2], 0) + 1
    sat = sum(r[4] == "yes" for r in rows)
    (work / "summary.md").write_text(f"Respondents: {n}\n\nTotal hours: {sum(int(r[3]) for r in rows)}\n\n" +
                                     "".join(f"- {c}: {k}\n" for c, k in per.items()) + f"\nSatisfied: {100 * sat / n:.1f}%\n")


def solve(work, truth):
    _write(work, _clean(work))
    return "Cleaned the survey and wrote the summary."


def wrong(work, truth):
    _write(work, _clean(work, dedupe=False))
    return "Done."
