#!/usr/bin/env python3
"""The publish skill's own tests. No network, no GitHub, no Vercel: the steps that would reach them
run as dry runs. Run anywhere, and inside the workspace image:
    python3 /opt/ola/skills/publish/tests/test_publish.py
"""
import importlib.util, io, json, os, subprocess, sys, tempfile
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SCRIPT = HERE / "scripts" / "publish.py"
results = []


def case(name, ok, detail=""):
    results.append(bool(ok))
    print(f"{'pass' if ok else 'FAIL'}  publish: {name}" + (f"  ({detail})" if detail and not ok else ""))


spec = importlib.util.spec_from_file_location("publish", SCRIPT)
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


def project(files):
    d = Path(tempfile.mkdtemp(prefix="olapub-"))
    for rel, body in files.items():
        f = d / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(body.encode() if isinstance(body, str) else body)
    return d


def quiet(fn, *a):
    out = io.StringIO()
    with redirect_stdout(out):
        code = fn(*a)
    return code, out.getvalue()


KEY = "sk-ant-api03-" + "abcdefghij" * 3

# ---- prepare: a page with an absolute link, a file from outside its folder, a CDN script
d = project({
    "pages/meeting.html": '<!doctype html><title>Meeting</title><link rel="stylesheet" href="/css/site.css"><img src="../logo.png" alt="logo"><img src="pics/room.png" alt="room"><script src="https://cdn.example.com/lib.js"></script><a href="https://example.org">the city</a>',
    "css/site.css": "body { background: url('/img/paper.png') }",
    "img/paper.png": b"\x89PNG paper",
    "logo.png": b"\x89PNG logo",
    "pages/pics/room.png": b"\x89PNG room",
    "members.csv": "name,email\nAna,ana@example.org\nBen,ben@example.org\nCe,ce@example.org\n",
    ".env": "API_KEY=" + KEY,
})
cwd = os.getcwd()
os.chdir(d)
try:
    r = P.prepare("pages/meeting.html", "site")
finally:
    os.chdir(cwd)
site = d / "site"
case("prepare makes a ready folder from a page with outside and absolute links", r["ok"], json.dumps(r)[:300])
names = sorted(p.relative_to(site).as_posix() for p in site.rglob("*") if p.is_file())
case("prepare copies the page as index.html with exactly what it uses", [n for n in names if n != ".ola-source.json"] == ["assets/css/site.css", "assets/img/paper.png", "assets/logo.png", "index.html", "pics/room.png"], names)
rec = json.loads((site / ".ola-source.json").read_text())
case("prepare records the page it copied and every source's sha256 (OLA-267)", rec.get("page") == "pages/meeting.html" and "pages/meeting.html" in rec.get("sources", {}), rec)
html = (site / "index.html").read_text()
case("prepare makes the links relative and inside the folder", 'href="assets/css/site.css"' in html and 'src="assets/logo.png"' in html and 'src="pics/room.png"' in html, html[:300])
css = (site / "assets/css/site.css").read_text()
case("prepare rewrites a stylesheet's own links", "url('../img/paper.png')" in css, css)
case("prepare notes the load from another site, not the plain link", any("cdn.example.com" in n for n in r["notes"]) and not any("example.org" in n for n in r["notes"]), r["notes"])
case("prepare leaves the people list and the .env behind", not (site / "members.csv").exists() and not (site / ".env").exists())
case("the person's own files are untouched", "/css/site.css" in (d / "pages/meeting.html").read_text())

# ---- check: the ready folder passes; secrets, a list of people, a database, links out fail
c = P.check(site)
case("check passes the prepared folder and lists every file with its size", not c["problems"] and len(c["files"]) == 5 and all(f["size"] > 0 for f in c["files"]), c["problems"])
bad = project({
    "index.html": '<script src="app.js"></script><a href="/about">about</a><img src="../x.png">',
    "app.js": f'const key = "{KEY}"',
    "people.csv": "name,phone\nA,+1 555 201 3344\nB,+1 555 201 3345\nC,+1 555 201 3346\n",
    "data.sqlite": b"SQLite format 3\x00rest",
    "prod.env": "TOKEN=abcdefghijkl",
    ".DS_Store": b"\x00",
})
c = P.check(bad)
text = "\n".join(c["problems"])
case("check refuses a key, naming the file and line, never the key", "app.js: line 1 seems to hold an Anthropic API key" in text and KEY not in json.dumps(c), text[:400])
case("check refuses a list of people", "people.csv" in text and "list of people" in text, text[:400])
case("check refuses a database and a .env file", "data.sqlite" in text and "prod.env" in text, text[:400])
case("check refuses an absolute link and one that leaves the folder", "/about" in text and "../x.png" in text, text[:400])
case("check leaves hidden files out without calling them problems", ".DS_Store" in c["left_out"] and ".DS_Store" not in text)
noindex = P.check(project({"page.html": "<p>hi</p>"}))
case("check wants an index.html", any("index.html" in p for p in noindex["problems"]))

# A secret in the page itself stops prepare, and nothing is written.
leaky = project({"signup.html": '<script>const config = { apiKey: "AIzaSyD-1234567890abcdefghijklmnopqrstu" }</script>'})
os.chdir(leaky)
try:
    r = P.prepare("signup.html", "site")
finally:
    os.chdir(cwd)
case("prepare stops on a key in the page and writes nothing", not r["ok"] and not (leaky / "site").exists() and "Google API key" in " ".join(r["problems"]), r)

# ---- repo and vercel: dry runs only (no GitHub, no Vercel here)
code, out = quiet(P.repo, site, "meeting-page", False, True)
case("repo, dry run: a private repository, pushed", code == 0 and "gh repo create meeting-page --private --source . --remote origin --push" in out and "git init -b main" in out, out)
code, out = quiet(P.repo, site, "meeting-page", True, True)
case("repo makes it public only when asked", code == 0 and "--public" in out)
code, out = quiet(P.repo, bad, "x", False, True)
case("repo refuses a folder that is not ready, before any command", code == 1 and "would run" not in out and "Not ready" in out, out)
code, out = quiet(P.repo, site, "bad name; rm -rf", False, True)
case("repo refuses a name that is not a plain name", code == 1 and "would run" not in out)
code, out = quiet(P.vercel, site, "meeting-page", "ana/meeting-page", True)
case("vercel, dry run: link, connect the repository, first deploy", code == 0 and "vercel link --yes --project meeting-page" in out and "vercel git connect https://github.com/ana/meeting-page" in out and "vercel deploy --prod" in out, out)

# ---- where, and the command line itself
case("where says local outside Ola's workspace", P.runtime() == ("cloud" if os.environ.get("HOME", "").startswith("/work/.ola") and Path("/opt/ola/skills").is_dir() else "local"))
# ---- Ola's sites address from a Mac (OLA-223): open only with ola-publish and the app's door on this Mac
bin_dir = Path(tempfile.mkdtemp(prefix="olapub-bin-"))
(bin_dir / "ola-publish").write_text("#!/bin/sh\nexit 0\n")
(bin_dir / "ola-publish").chmod(0o755)
saved = {k: os.environ.get(k) for k in ("PATH", "OLA_GATEWAY_HOSTPORT", "BOX_API_KEY")}
try:
    os.environ["PATH"] = "/usr/bin:/bin"
    case("where: no ola-publish, no Ola sites address", P.ola_sites() == "no")
    os.environ["PATH"] = f"{bin_dir}:/usr/bin:/bin"
    os.environ["OLA_GATEWAY_HOSTPORT"], os.environ["BOX_API_KEY"] = "127.0.0.1:50123", "oladoor-made-up"
    case("where: the app's door on this Mac, Ola's sites address is open", P.ola_sites() == "yes")
    os.environ["OLA_GATEWAY_HOSTPORT"] = "10.0.0.1:4311"
    case("where: a forwarder with no account behind it is not signed in", P.ola_sites() == "not signed in")
    r = subprocess.run([sys.executable, "-I", str(SCRIPT), "where"], capture_output=True, text=True)
    case("the command line: where names Ola's sites address on a Mac", P.runtime() == "cloud" or "ola sites: not signed in" in r.stdout, r.stdout)
finally:
    for k, val in saved.items():
        if val is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = val
skill = (HERE / "SKILL.md").read_text()
case("the skill offers Ola's address locally, asks which only when the request does not say, and always asks before publishing",
     all(s in skill for s in ("## Locally, at Ola's address", "Ask only when the request does not say", "ola-publish preview site --name", "ola-publish publish site --name", "ola-publish unpublish --name", "even with \"Lots of permissions\" on", "ola login")))

# In the cloud the skill publishes from the conversation (OLA-230): ola-publish, one yes, never "go press Publish".
cloud = skill[skill.index("## In the cloud"):skill.index("## Locally, at Ola's address")]
case("the cloud: ola-publish with the list, publish again, take it down; never sends the person to press Publish",
     all(x in cloud for x in ("ola-publish site --files", "ola-publish unpublish", "do not ask again in words")) and "press **Publish**" not in skill.split("## In the cloud")[0] and "the person presses Publish" not in skill)

r = subprocess.run([sys.executable, "-I", str(SCRIPT), "check", str(bad), "--json"], capture_output=True, text=True)
case("the command line: check --json exits 1 with the problems", r.returncode == 1 and json.loads(r.stdout)["problems"])
r = subprocess.run([sys.executable, "-I", str(SCRIPT), "check", str(site)], capture_output=True, text=True)
case("the command line: check says ready to publish", r.returncode == 0 and r.stdout.strip().endswith("ready to publish"), r.stdout[-200:])

# ---- an old copy (OLA-267): a project that published before has a site/ from then
def stale_project():
    d = project({"index.html": "<h1>Cedar</h1>"})
    cwd = os.getcwd()
    os.chdir(d)
    try:
        P.prepare("index.html", "site")
    finally:
        os.chdir(cwd)
    return d

d = stale_project()
case("a fresh copy is ready (OLA-267)", not P.check(d / "site")["problems"], P.check(d / "site")["problems"])
(d / "index.html").write_text("<h1>Bart</h1>")
probs = P.check(d / "site")["problems"]
case("the page changed after the copy: check refuses the old copy and says to prepare again (OLA-267)", any("old copy" in x and "prepare index.html --out site" in x for x in probs), probs)
cwd = os.getcwd(); os.chdir(d)
try:
    P.prepare("index.html", "site")
finally:
    os.chdir(cwd)
case("made again from the page as it is now: ready, and it says Bart (OLA-267)", not P.check(d / "site")["problems"] and "Bart" in (d / "site/index.html").read_text())
d = stale_project()
(d / "site/.ola-source.json").unlink()
t = (d / "site/index.html").stat().st_mtime
(d / "maple").mkdir()
(d / "maple/index.html").write_text("<h1>Maple</h1>")
os.utime(d / "maple/index.html", (t + 5, t + 5))
probs = P.check(d / "site")["problems"]
case("no record, and a newer page outside it (a new page in a subfolder): refused, naming that page (OLA-267)", any("maple/index.html changed after site/" in x for x in probs), probs)

# ---- live against a local server (no outside network)
import http.server, threading

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(site), **k)

    def log_message(self, *a):
        pass

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/"
code, out = quiet(P.live, url, str(site), 0)
case("live says live when the address answers with the published page", code == 0 and out.startswith("live"), out)
(site / "index.html").write_text("<p>changed after publishing</p>")
other = project({"index.html": "<p>the old one</p>"})
code, out = quiet(P.live, url, str(other), 0)
case("live says not yet when the address answers with another page", code == 1 and "older page" in out, out)
srv.shutdown()

print(f"publish tests: {sum(results)} of {len(results)} pass")
sys.exit(0 if all(results) else 1)
