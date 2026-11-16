import re
import fam_sql, fam_studies

SQL = """WITH f AS (SELECT DISTINCT s.id, (s.year / 10) * 10 AS decade FROM studies s JOIN hazards h ON h.study_id = s.id
                WHERE h.hazard = 'flood' AND s.included = 1),
     neg AS (SELECT DISTINCT study_id FROM findings WHERE hazard = 'flood' AND direction = 'negative')
SELECT decade || 's' AS decade, ROUND(100.0 * SUM(CASE WHEN f.id IN (SELECT study_id FROM neg) THEN 1 ELSE 0 END) / COUNT(*), 1)
FROM f GROUP BY decade ORDER BY decade"""
WRONG = """SELECT (s.year / 10) * 10 || 's', ROUND(100.0 * SUM(f.direction = 'negative') / COUNT(*), 1)
FROM studies s JOIN findings f ON f.study_id = s.id WHERE f.hazard = 'flood' GROUP BY 1"""


def generate(work, seed, rng):
    db = fam_studies.write(work, seed)
    rows = {d: v for d, v in db.execute(SQL).fetchall()}
    db.close()
    return {"seed": seed, "pct": rows, "db_hash": fam_sql.db_hash(work)}


def dk(k):
    m = re.search(r"(20[012])", str(k))
    return m.group(1) + "0s" if m else str(k)


def _match(pairs, truth):
    got = {dk(k): v for k, v in pairs}
    return len(got) == len(truth) and all(fam_sql.close(got.get(k), v, 0.051) for k, v in truth.items())


def check(work, truth, session, C):
    fam_sql.check(work, truth, C, lambda rows: all(len(r) >= 2 for r in rows) and _match([(r[0], r[-1]) for r in rows], truth["pct"]),
                  lambda a: _match(list((a or {}).items()), truth["pct"]))


def solve(work, truth):
    fam_sql.solve_with(work, SQL, truth["pct"])


def wrong(work, truth):
    import sqlite3
    rows = sqlite3.connect(work / "studies.db").execute(WRONG).fetchall()
    fam_sql.solve_with(work, WRONG, {d: v for d, v in rows})
