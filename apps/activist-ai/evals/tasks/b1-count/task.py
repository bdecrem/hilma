import fam_sql, fam_studies

SQL = "SELECT COUNT(*) FROM studies WHERE region = 'Sahel' AND year >= 2018 AND included = 1"
WRONG = "SELECT COUNT(*) FROM studies WHERE region = 'Sahel' AND year >= 2018"


def generate(work, seed, rng):
    db = fam_studies.write(work, seed)
    n = db.execute(SQL).fetchone()[0]
    db.close()
    return {"seed": seed, "count": n, "db_hash": fam_sql.db_hash(work)}


def check(work, truth, session, C):
    fam_sql.check(work, truth, C, lambda rows: len(rows) == 1 and fam_sql.close(rows[0][0], truth["count"], 0),
                  lambda a: fam_sql.close(fam_sql.lower_keys(a).get("count"), truth["count"], 0))


def solve(work, truth):
    fam_sql.solve_with(work, SQL, {"count": truth["count"]})


def wrong(work, truth):
    import sqlite3
    n = sqlite3.connect(work / "studies.db").execute(WRONG).fetchone()[0]
    fam_sql.solve_with(work, WRONG, {"count": n})
