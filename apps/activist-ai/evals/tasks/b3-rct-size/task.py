import fam_sql, fam_studies

SQL = """SELECT region, ROUND(AVG(n_participants), 1) FROM studies
WHERE design = 'RCT' AND included = 1 AND n_participants >= 0 GROUP BY region"""
WRONG = """SELECT region, ROUND(AVG(n_participants), 1) FROM studies WHERE design = 'RCT' AND included = 1 GROUP BY region"""


def generate(work, seed, rng):
    db = fam_studies.write(work, seed)
    rows = {r: v for r, v in db.execute(SQL).fetchall()}
    db.close()
    return {"seed": seed, "avg": rows, "db_hash": fam_sql.db_hash(work)}


def _match(pairs, truth):
    got = {str(k).strip().lower(): v for k, v in pairs}
    return len(got) == len(truth) and all(fam_sql.close(got.get(k.lower()), v, 0.051) for k, v in truth.items())


def check(work, truth, session, C):
    fam_sql.check(work, truth, C, lambda rows: all(len(r) >= 2 for r in rows) and _match([(r[0], r[-1]) for r in rows], truth["avg"]),
                  lambda a: _match(list(fam_sql.lower_keys(a).items()), truth["avg"]))


def solve(work, truth):
    fam_sql.solve_with(work, SQL, truth["avg"])


def wrong(work, truth):
    import sqlite3
    rows = sqlite3.connect(work / "studies.db").execute(WRONG).fetchall()
    fam_sql.solve_with(work, WRONG, {r: v for r, v in rows})
