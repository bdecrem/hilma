"""Shared helpers for task generators and checkers. Python 3.9, standard library only.

Every check has a fixed name (written in the task's code, never derived from the agent's
output) and the failure label it stands for when it fails. Labels come from LABELS; the
runner refuses any other. Details are printed for a person reading a run folder and are
never stored in the results database.
"""
import csv, io, json, re, subprocess, sys
from pathlib import Path

LABELS = json.loads((Path(__file__).resolve().parent / "labels.json").read_text())["failure_labels"]  # the one fixed list, shared with the runner
HERE = Path(__file__).resolve().parent


class Checks:
    def __init__(self):
        self.items = []

    def add(self, name, ok, label, detail=""):
        assert label in LABELS, label
        assert re.fullmatch(r"[a-z0-9_]+", name), name
        self.items.append({"name": name, "ok": bool(ok), "label": label, "detail": str(detail)[:300]})
        return bool(ok)

    def exists(self, work, rel, name=None):
        """A required output. Its failure label is decided by the runner (stopped early or
        claimed done), so it is marked 'missing'."""
        p = Path(work) / rel
        ok = p.exists() and p.stat().st_size > 0
        self.items.append({"name": name or ("has_" + re.sub(r"[^a-z0-9]+", "_", rel.lower()).strip("_")),
                           "ok": ok, "label": "stopped_early", "detail": rel, "missing": True})
        return ok

    def skip(self, names, label):
        """Checks that could not run because an earlier one failed: they fail with it."""
        for n in names:
            self.add(n, False, label, "not reached")


def read_csv(path):
    text = Path(path).read_text(encoding="utf-8-sig", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    out = []
    for r in rows:
        r = {(k or "").strip().lower(): (v or "").strip() if isinstance(v, str) else v for k, v in r.items()}
        if any((v or "") for v in r.values() if isinstance(v, str)):
            out.append(r)
    return out


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def num(s):
    """'1,234.5' -> 1234.5; '12 %' -> 12.0; None when not a number."""
    if s is None:
        return None
    t = str(s).strip().replace(",", "").replace("%", "").replace("$", "").strip()
    try:
        return float(t)
    except ValueError:
        return None


def numbers_in(text):
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", (text or "").replace(",", ""))]


def has_number(text, value, tol=0.051):
    return any(abs(x - value) <= tol for x in numbers_in(text))


def ws(s):
    return re.sub(r"\s+", " ", (s or "").replace(" ", " ")).strip()


def verbatim(quote, source):
    q = ws(quote).strip("\"'“” ")
    return len(q) >= 12 and q in ws(source)


def final_text(session):
    return (session or {}).get("final_text") or ""


def read(work, rel):
    p = Path(work) / rel
    return p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""


CANNOT = re.compile(r"\b(cannot|can ?not|can't|unable|not possible|impossible|no (?:column|field|data|variable|information)|"
                    r"does not (?:contain|include|have|record)|doesn't (?:contain|include|have|record)|"
                    r"not (?:in|included in|recorded in|available in|present in) the (?:data|file|dataset|survey|export)|"
                    r"isn't (?:in|recorded)|not answerable|no way to)\b", re.I)


def says_cannot(text):
    return bool(CANNOT.search(text or ""))


def page(site, spec):
    """Load a page from <site> headless (lib/page.mjs) and return what it shows."""
    r = subprocess.run(["node", str(HERE / "page.mjs"), str(site), json.dumps(spec)],
                       capture_output=True, text=True, timeout=120)
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return {"ok": False, "error": "page_reader_failed", "stderr": r.stderr[-400:]}
