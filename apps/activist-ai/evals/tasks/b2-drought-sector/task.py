import fam_sql, fam_studies

SQL = """SELECT s.sector, COUNT(DISTINCT s.id) AS n FROM studies s JOIN hazards h ON h.study_id = s.id
WHERE h.hazard = 'drought' AND s.included = 1 GROUP BY s.sector ORDER BY n DESC"""
WRONG = """SELECT s.sector, COUNT(*) AS n FROM studies s JOIN findings f ON f.study_id = s.id
WHERE f.hazard = 'drought' GROUP BY s.sector ORDER BY n DESC"""


def generate(work, seed, rng):
    for k in range(50):  # the corpus for this seed is the first one without a tie for first place
        dbseed = seed * 100 + k
        db = fam_studies.write(work, dbseed)
        rows = db.execute(SQL).fetchall()
        db.close()
        if rows[0][1] != rows[1][1]:
            break
    return {"seed": dbseed, "sector": rows[0][0], "studies": rows[0][1], "tie": rows[0][1] == rows[1][1], "db_hash": fam_sql.db_hash(work)}


def check(work, truth, session, C):
    def rows_ok(rows):
        return bool(rows) and str(rows[0][0]).lower() == truth["sector"] and fam_sql.close(rows[0][1], truth["studies"], 0)

    def ans_ok(a):
        a = fam_sql.lower_keys(a)
        return str(a.get("sector", "")).strip().lower() == truth["sector"] and fam_sql.close(a.get("studies"), truth["studies"], 0)
    fam_sql.check(work, truth, C, rows_ok, ans_ok)


def solve(work, truth):
    fam_sql.solve_with(work, SQL, {"sector": truth["sector"], "studies": truth["studies"]})


def wrong(work, truth):
    import sqlite3
    r = sqlite3.connect(work / "studies.db").execute(WRONG).fetchone()
    fam_sql.solve_with(work, WRONG, {"sector": r[0], "studies": r[1] + (1 if r[1] == truth["studies"] else 0)})
