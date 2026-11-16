"""Checks shared by the database tasks: query.sql is run read-only on a fresh copy of the
database (rebuilt from the seed, so an edited studies.db cannot help), its result compared
with the truth, and answer.json compared with the truth."""
import hashlib, json, re, sqlite3, tempfile
from pathlib import Path
import fam_studies


def run_query(sql, seed):
    d = Path(tempfile.mkdtemp(prefix="olaeval-db-"))
    fam_studies.build(d / "studies.db", seed).close()
    db = sqlite3.connect(f"file:{d / 'studies.db'}?mode=ro", uri=True)
    db.set_progress_handler(lambda: 1, 50_000_000)  # stops a runaway query
    stmts = [s for s in sqlite3_split(sql) if s.strip()]
    rows = db.execute(stmts[-1]).fetchall()
    return rows, len(stmts)


def sqlite3_split(sql):
    sql = re.sub(r"--[^\n]*", "", sql)
    return [s for s in sql.split(";")]


def close(a, b, tol=0.051):
    try:
        return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return str(a).strip().lower() == str(b).strip().lower()


def db_hash(work):
    p = Path(work) / "studies.db"
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else ""


def check(work, truth, C, rows_ok, answer_ok):
    """rows_ok(rows) -> bool and answer_ok(answer dict) -> bool are the task's own comparisons."""
    if C.exists(work, "query.sql"):
        try:
            rows, n = run_query((Path(work) / "query.sql").read_text(), truth["seed"])
            C.add("query_runs", True, "query_wrong")
            C.add("query_gives_answer", rows_ok(rows), "query_wrong", repr(rows[:6])[:200])
        except Exception as e:
            C.add("query_runs", False, "query_wrong", repr(e)[:200])
            C.add("query_gives_answer", False, "query_wrong")
    else:
        C.skip(["query_runs", "query_gives_answer"], "stopped_early")
    if C.exists(work, "answer.json"):
        try:
            ans = json.loads((Path(work) / "answer.json").read_text())
            C.add("answer_parses", True, "wrong_format")
            C.add("answer_correct", answer_ok(ans), "numbers_wrong", json.dumps(ans)[:200])
        except Exception as e:
            C.add("answer_parses", False, "wrong_format", repr(e)[:200])
            C.add("answer_correct", False, "wrong_format")
    else:
        C.skip(["answer_parses", "answer_correct"], "stopped_early")
    C.add("database_untouched", db_hash(work) == truth["db_hash"], "touched_inputs")


def solve_with(work, sql, answer):
    (Path(work) / "query.sql").write_text(sql.strip() + "\n")
    (Path(work) / "answer.json").write_text(json.dumps(answer))


def lower_keys(d):
    return {str(k).strip().lower(): v for k, v in (d or {}).items()} if isinstance(d, dict) else {}
