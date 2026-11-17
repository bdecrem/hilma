"""The leak check, the generator's sandbox and the checks of a made-up copy (lib/olatwin.py).

    python3 -I workspace/twin_test.py        (workspace/check.mjs runs it on the host and in the VM)

Made-up data only. A project with a volunteer survey and a council memo; copies with one planted
leak each (a person's name, a number, a distinctive phrase, a file name, a column), one unsure
(a rare lowercase word), and a clean copy that must pass.
"""
import json, os, sys, tempfile
from pathlib import Path

sys.path.insert(0, "/opt/ola/lib")
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import olatwin as T  # noqa: E402

results = []


def ok(name, cond, detail=""):
    results.append(bool(cond))
    print(("pass  " if cond else "FAIL  ") + name + (f"  ({detail})" if detail and not cond else ""))


PROJECT_CSV = """volunteer,joined,hours,shift
Marisol Quennell,2026-03-04,12,Harbor kitchen
Teodor Vashkin,04/03/2026,7,Harbor kitchen
marisol quennell ,2026-03-04,12,Harbor kitchen
Ilse Brandvold,,31,Night patrol
"""
PROJECT_MEMO = "The Ostrander committee agreed the winter shelter keeps 4,817 beds open until the thaw. Totals were 4817, 2291 and 365 across the three sites."
REQUEST = "Clean ostrander_volunteers_2026.csv, drop the duplicates and tell me the total hours per shift for the Harbor kitchen."

idx = T.Index()
idx.add_text(REQUEST)
idx.add_text(PROJECT_CSV)
idx.add_text(PROJECT_MEMO)
idx.add_name("ostrander_volunteers_2026.csv")
idx.add_name("memo.md")

CLEAN = {
    "request": "Clean data.csv: remove the repeated rows, fill in what can be filled, and tell me the total hours for each team.",
    "checks": [{"type": "csv_unique", "name": "no_repeats", "path": "clean.csv", "column": "name"}],
    "files": [{"name": "data.csv", "columns": ["name", "joined", "hours", "team"],
               "text": "name,joined,hours,team\nAda Lin,2025-01-02,5,North\nBo Reyes,02/01/2025,9,North\nada lin,2025-01-02,5,North\nCy Moss,,14,South\n"}],
}


def variant(**kw):
    t = json.loads(json.dumps(CLEAN))
    for k, v in kw.items():
        if k == "text":
            t["files"][0]["text"] += v
        elif k == "file":
            t["files"][0]["name"] = v
        elif k == "column":
            t["files"][0]["columns"].append(v)
        elif k == "request":
            t["request"] += " " + v
    return t


r = T.check_leaks(idx, CLEAN)
ok("a clean made-up copy passes", r["verdict"] == "clean", r["findings"])
for label, twin, kind in [
    ("a planted person's name", variant(text="Quennell,2025-03-01,3,South\n"), "name"),
    ("a planted number (4,817 written as 4817)", variant(text="Dee Ray,2025-03-01,4817,South\n"), "number"),
    ("a planted sequence of numbers", variant(request="Report 4817, 2291 and 365."), "numbers"),
    ("a distinctive phrase carried over", variant(request="Note that the winter shelter keeps beds open."), "phrase"),
    ("the project's file name", variant(file="ostrander_volunteers_2026.csv"), "file_name"),
    ("a column named after the project", variant(column="harbor"), "column"),
]:
    r = T.check_leaks(idx, twin)
    ok(f"the leak check catches {label}", r["verdict"] == "leak" and r["counts"].get(kind), json.dumps(r["counts"]))
r = T.check_leaks(idx, variant(request="Mark each thaw date."))
ok("a rare lowercase word shared with the project is unsure, not clean", r["verdict"] == "unsure" and r["counts"].get("word"), r)
r = T.check_leaks(idx, variant(request="It covers 2026."))
ok("a year shared with the project is unsure", r["verdict"] == "unsure" and r["counts"].get("year"), r)
r = T.check_leaks(idx, variant(request="Ref Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg== attached."))
ok("a long encoded-looking run is unsure", r["verdict"] in ("unsure", "leak") and r["counts"].get("encoded"), r)
ok("digits are normalized: '4 817' and '4,817' and '4817.0' are one number", T.normalize("4 817") == T.normalize("4,817") == T.normalize("4817.0") == "4817")

# Review 5: the leak check read only the text it knew how to read. A copy's files in any other form
# (a Word file, a PDF whose text is compressed, a spreadsheet's properties, UTF-16 text, a zip, a
# file of an unknown kind) or a name broken by an invisible character or a letter from another
# alphabet carried the project's words out as "clean". Each of these must be caught or held.
import io, zipfile, zlib  # noqa: E402

def _zip(members):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        for n, t in members.items():
            z.writestr(n, t)
    return b.getvalue()

_pdf_stream = zlib.compress(b"BT /F1 12 Tf 72 700 Td [(Marisol) -250 (Quennell)] TJ ET")
HIDDEN = {
    "notes.docx": _zip({"[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Marisol Quennell</w:t></w:r></w:p></w:body></w:document>"}),
    "data.xlsx": _zip({"[Content_Types].xml": "<Types/>", "docProps/core.xml": "<cp:coreProperties><dc:title>Marisol Quennell</dc:title></cp:coreProperties>", "xl/workbook.xml": "<workbook/>"}),
    "report.pdf": b"%PDF-1.4\n1 0 obj << /Length " + str(len(_pdf_stream)).encode() + b" /Filter /FlateDecode >>\nstream\n" + _pdf_stream + b"\nendstream\nendobj\n%%EOF\n",
    "data16.csv": "name,hours\nMarisol Quennell,12\n".encode("utf-16"),
    "bundle.zip": _zip({"inner.txt": "Marisol Quennell"}),
    "blob.bin": b"\x00\x01Marisol Quennell\x00",
    "zw.csv": "name,hours\nMari​sol Quen­nell,12\n".encode(),
    "homoglyph.csv": "name,hours\nMаrisol Quеnnell,12\n".encode(),
}
with tempfile.TemporaryDirectory() as hd:
    for fname, data in HIDDEN.items():
        (Path(hd) / fname).write_bytes(data)
        t = dict(CLEAN, files=T.twin_view(Path(hd), [fname]))
        r = T.check_leaks(idx, t)
        ok(f"the leak check does not pass a copy that hides a project name in {fname}", r["verdict"] != "clean", r["counts"])
    # ...and a plain made-up workbook (openpyxl, in the VM) is still clean against a project that
    # talks about Excel in 2026: the library's own words and the time it wrote the file do not count.
    try:
        import openpyxl
    except ImportError:
        openpyxl = None
    if openpyxl:
        wi = T.Index()
        wi.add_text(REQUEST + " Send the Excel file back by Friday, 2026-11-20.")
        wi.add_text(PROJECT_CSV)
        wb = openpyxl.Workbook()
        ws_ = wb.active
        ws_.append(["name", "joined", "hours", "team"])
        for row in (["Ada Lin", "2024-01-02", 5, "North"], ["Bo Reyes", "2024-02-01", 9, "South"]):
            ws_.append(row)
        wb.save(Path(hd) / "made.xlsx")
        r = T.check_leaks(wi, dict(CLEAN, files=T.twin_view(Path(hd), ["made.xlsx"])))
        ok("a plain made-up workbook stays clean once its parts are read too", r["verdict"] == "clean", r["findings"])

# ------------------------------------------------------------------ the generator's sandbox
GOOD = """
import csv
def make(out, rng):
    rows = [[f"P{i}", rng.randint(1, 9)] for i in range(20)]
    with open(out / "data.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["name", "hours"]); w.writerows(rows)
    return {"rows": 20, "total": sum(r[1] for r in rows)}
"""
with tempfile.TemporaryDirectory() as d:
    secret = Path(d) / "project-file.txt"
    secret.write_text("Marisol Quennell")
    out = Path(d) / "copy"
    truth, files = T.run_generator(GOOD, out, 7, python=sys.executable, allow_host=True)
    truth2, _ = T.run_generator(GOOD, Path(d) / "copy2", 7, python=sys.executable, allow_host=True)
    ok("a generator writes its files and returns its answers, the same for the same seed", files == ["data.csv"] and truth == truth2 and truth["rows"] == 20, truth)
    for label, src in [
        ("reading a project file", f"def make(out, rng):\n    (out / 'x.txt').write_text(open({str(secret)!r}).read())\n    return {{}}\n"),
        ("listing the project", f"import os\ndef make(out, rng):\n    (out / 'x.txt').write_text(str(os.listdir({d!r})))\n    return {{}}\n"),
        ("running a program", "import subprocess\ndef make(out, rng):\n    subprocess.run(['true'])\n    return {}\n"),
        ("opening a socket", "import socket\ndef make(out, rng):\n    socket.create_connection(('127.0.0.1', 4180))\n    return {}\n"),
        ("writing outside its folder", f"def make(out, rng):\n    open({str(Path(d) / 'planted.txt')!r}, 'w').write('x')\n    return {{}}\n"),
    ]:
        try:
            T.run_generator(src, Path(d) / ("bad-" + label.split()[0]), 1, python=sys.executable, allow_host=True)
            refused = False
        except RuntimeError as e:
            refused = "PermissionError" in str(e) or "not allowed" in str(e) or "may only" in str(e)
        ok(f"the generator's sandbox refuses {label}", refused and not (Path(d) / "planted.txt").exists())

    # Review 5: the audit hook alone is not a sandbox. A generator that rewrites the hook's rules
    # (through sys.modules["__main__"]) or its code (through the garbage collector) gets past it;
    # in the VM the kernel's jail (olatwin.JAIL_SH) must still keep the project, other processes,
    # the network and the folders outside its own out of reach. On the host no model's generator
    # runs at all.
    if not T.jail_available():
        try:
            T.run_generator(GOOD, Path(d) / "nohost", 1, python=sys.executable)
            refused = False
        except RuntimeError as e:
            refused = "only inside a project's VM" in str(e)
        ok("on a machine with no jail, a model's generator is not run", refused)
    else:
        unhook = {
            "main_globals": "import sys\n    m = sys.modules['__main__']\n    m.inside = lambda p, roots: True\n    m.WRITES = set()",
            "hook_code": "import gc\n    for f in gc.get_objects():\n        if getattr(f, '__name__', '') == 'hook' and hasattr(f, '__code__'):\n            f.__code__ = (lambda ev, args: None).__code__",
        }
        for how, undo in unhook.items():
            # Each act leaves "escaped" (or the secret) in x.txt only if it got through.
            for label, act in [
                ("read a file outside its folder", f"got = open({str(secret)!r}).read()"),
                ("see the project folder", "import os\n    got = 'escaped' if os.path.isdir('/work/.ola') or os.listdir('/work') else ''"),
                ("see another process", "import os\n    got = 'escaped' if [p for p in os.listdir('/proc') if p.isdigit() and int(p) > 1] else ''"),
                ("reach the gateway's loopback", "import socket\n    socket.create_connection(('127.0.0.1', 4180), timeout=2)\n    got = 'escaped'"),
                ("write outside its folder", f"open({str(Path(d) / 'planted.txt')!r}, 'w').write('x')\n    got = 'escaped'"),
                ("undo the jail", "import os\n    os.system('umount /tmp/out /tmp /work 2>/dev/null')\n    got = 'escaped' if os.path.isdir('/work/.ola') else ''"),
            ]:
                body = act.replace("\n    ", "\n        ")
                src = f"def make(out, rng):\n    {undo}\n    got = ''\n    try:\n        {body}\n    except Exception as e:\n        got = 'refused ' + type(e).__name__\n    (out / 'x.txt').write_text(str(got))\n    return {{}}\n"
                o = Path(d) / f"esc-{how}-{label.split()[0]}-{label.split()[-1]}"
                try:
                    T.run_generator(src, o, 1, python=sys.executable)
                    got = (o / "x.txt").read_text()
                except RuntimeError as e:
                    got = "refused " + str(e)[:80]
                leaked = got.startswith("escaped") or "Marisol" in got
                ok(f"the jail holds when the audit hook is undone ({how}): the generator cannot {label}", not leaked and not (Path(d) / "planted.txt").exists(), got[:120])

    # ------------------------------------------------------------------ the checks
    work = Path(d) / "work"
    work.mkdir()
    (work / "data.csv").write_text("name,hours\nA,2\nB,3\nB,3\n")
    (work / "clean.csv").write_text("name,hours\nA,2\nB,3\n")
    inputs = {"data.csv": T.sha256_file(work / "data.csv")}
    checks = T.valid_checks([
        {"type": "file", "name": "has_clean", "path": "clean.csv"},
        {"type": "csv_rows", "name": "rows", "path": "clean.csv", "truth": "unique"},
        {"type": "csv_unique", "name": "no_repeats", "path": "clean.csv", "column": "name"},
        {"type": "csv_sum", "name": "hours", "path": "clean.csv", "column": "hours", "truth": "total"},
        {"type": "says_number", "name": "says_total", "truth": "total"},
        {"type": "says", "name": "mentions_duplicate", "any": ["duplicate", "repeated", "twice"]},
        {"type": "inputs_unchanged", "name": "inputs_unchanged"},
        {"type": "nonsense", "name": "dropped"},
    ])
    ok("unknown check types are dropped, labels filled from the fixed list", [c["name"] for c in checks][-1] == "inputs_unchanged" and all(c["label"] in T.LABELS for c in checks))
    s = T.score(work, checks, {"unique": 2, "total": 5}, "Removed 1 duplicate row; 5 hours in all.", inputs)
    ok("a right result passes every check", s["all"] and s["label"] == "success", s)
    (work / "data.csv").write_text("changed")
    s = T.score(work, checks, {"unique": 2, "total": 5}, "Done: 7 hours.", inputs)
    ok("a wrong result fails, labeled by its first failed check", not s["all"] and s["label"] == "numbers_wrong" and not [c for c in s["checks"] if c["name"] == "inputs_unchanged"][0]["ok"], s)

print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
