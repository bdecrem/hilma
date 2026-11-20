#!/usr/bin/env python3
"""Publish a page or a small site: the mechanical parts, standard library only.

    publish.py where                         cloud or local; on a Mac, whether Ola's sites address is open (signed
                                             in, with ola-publish) and which tools are there (git, gh, vercel)
    publish.py prepare <page.html> [--out site] [--json]
                                             a clean site folder: the page as index.html, the files it uses
                                             copied next to it, links made relative; nothing outside it needed
    publish.py check <folder> [--json]       what would go public (every file, its size), and the problems:
                                             secrets, private data, links that leave the folder, outside loads
    publish.py repo <folder> --name <repo> [--public] [--dry-run]
                                             git init, a commit, and a GitHub repository (private by default), pushed
    publish.py vercel <folder> --name <project> --repo <owner/name> [--dry-run]
                                             with the Vercel CLI: link the project, connect the repository
                                             (every push deploys), and the first deploy
    publish.py live <url> [--expect <folder>] [--wait 120]
                                             the address answers, with the page that was published
    publish.py dns <domain> [--wait 0]       the domain's records point at Vercel, and https answers

Every command prints plain lines (or JSON with --json) and exits 1 when something stands in the way, with the
sentence to say to the person. Nothing here prints a token or a key: a secret found is named by its file, line
and kind, never shown.
"""
import argparse, hashlib, json, os, re, shutil, socket, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path
import posixpath

# ------------------------------------------------------------------ which runtime
def runtime():
    """'cloud' inside Ola's sealed workspace (no network: the person presses Publish in the web app), else 'local'."""
    home = os.environ.get("HOME", "")
    skills = Path("/opt") / "ola" / "skills"  # built in parts: the Mac app rewrites that path in its copy of the skills
    return "cloud" if home.startswith("/work/.ola") and skills.is_dir() else "local"


def have(cmd):
    return shutil.which(cmd) is not None


def ola_sites():
    """On a Mac, whether Ola's own sites address (sites.ola.cx/<name>) is open from here: 'yes' (the Ola
    app or `ola` carries ola-publish and its door is on this Mac, so the Mac is signed in), 'not signed
    in' (the command is there, no account behind it), or 'no' (this Ola has no ola-publish)."""
    if not have("ola-publish"):
        return "no"
    host = os.environ.get("OLA_GATEWAY_HOSTPORT", "").rsplit(":", 1)[0]
    return "yes" if host in ("127.0.0.1", "localhost") and os.environ.get("BOX_API_KEY") else "not signed in"


# ------------------------------------------------------------------ what may not go public
SECRET_NAME = re.compile(r"(^|/)(\.env(\.[^/]*)?|[^/]*\.env|env|\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.htpasswd|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.json)?|[^/]*\.(pem|key|p8|p12|pfx|jks|keystore|kdbx|ovpn|gpg|asc))$", re.I)
SECRET_DIR = re.compile(r"(^|/)\.(git|ssh|aws|gnupg|config|opencode|claude|ola|vercel)(/|$)")
DATA_NAME = re.compile(r"\.(db|sqlite|sqlite3|db3|mdb|accdb)(-wal|-shm|-journal)?$", re.I)
SECRET_PATTERNS = [
    (re.compile(r"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----"), "a private key"),
    (re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}"), "an Anthropic API key"),
    (re.compile(r"\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}"), "an API key"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "an Amazon key"),
    (re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}"), "a GitHub token"),
    (re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"), "a Slack token"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"), "a Google API key"),
    (re.compile(r"\b[sr]k_live_[0-9A-Za-z]{20,}"), "a Stripe key"),
    (re.compile(r"\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b"), "a SendGrid key"),
    (re.compile(r"\b(?:vcp|vck|vca)_[A-Za-z0-9]{24,}"), "a Vercel token"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "a sign-in token"),
    (re.compile(r"^(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PASS)[A-Z0-9_]*\s*=\s*\S{8,}", re.M), "a password or key"),
    (re.compile(r"[\"']?\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|passw(?:or)?d|access[_-]?token|auth[_-]?token|private[_-]?key)\b[\"']?\s*[:=]\s*[\"'][^\"'\s]{12,}[\"']", re.I), "a password or key"),
]
# Personal data: a table with a column of email addresses or phone numbers is a list of people.
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}\b")


def secret_in(rel, data):
    """Why this file may not be published (a few words), or None. Never returns the secret itself."""
    if SECRET_NAME.search(rel) or SECRET_DIR.search(rel):
        return "its name says it holds passwords or keys"
    if DATA_NAME.search(rel):
        return "it is a database"
    if data is None:
        return None
    if data[:16] == b"SQLite format 3\x00":
        return "it is a database"
    text = data.decode("latin-1")
    for rx, what in SECRET_PATTERNS:
        m = rx.search(text)
        if m:
            return f"line {text.count(chr(10), 0, m.start()) + 1} seems to hold {what}"
    if rel.lower().endswith((".csv", ".tsv", ".xlsx", ".json")):
        lines = text.splitlines()[:400]
        people = sum(1 for l in lines if EMAIL.search(l) or PHONE.search(l))
        if people >= 3:
            return f"it looks like a list of people ({people} rows with an email address or a phone number)"
    return None


# ------------------------------------------------------------------ what a page uses
TAG = re.compile(r"<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>")
ATTR = re.compile(r"\b(src|href|poster|data|srcset|imagesrcset|action)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'>]+))", re.I)
CSS_URL = re.compile(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)'\"\s]+))\s*\)|@import\s+(?:\"([^\"]*)\"|'([^']*)')", re.I)
JS_IMPORT = re.compile(r"(?:\bfrom\s*|\bimport\s*\(?\s*)[\"'](\.{1,2}/[^\"']+)[\"']")


def references(rel, text):
    """[(ref, use, span)]: use is 'link' (an <a href>) or 'load' (something the page loads itself)."""
    out = []
    low = rel.lower()
    if low.endswith((".html", ".htm", ".svg")):
        for t in TAG.finditer(text):
            tag = t.group(1).lower()
            for a in ATTR.finditer(t.group(2)):
                name = a.group(1).lower()
                v = next(x for x in (a.group(2), a.group(3), a.group(4), "") if x is not None)
                start = t.start(2) + a.start(next(i for i in (2, 3, 4) if a.group(i) is not None)) if v else 0
                if name in ("srcset", "imagesrcset"):
                    for part in v.split(","):
                        out.append((part.strip().split(" ")[0], "load", None))
                else:
                    out.append((v, "link" if name == "href" and tag in ("a", "area") else "load", (start, start + len(v)) if v else None))
        for m in re.finditer(r"<style[^>]*>([\s\S]*?)</style>|style\s*=\s*\"([^\"]*)\"", text, re.I):
            g = 1 if m.group(1) is not None else 2
            out += [(r, u, (s[0] + m.start(g), s[1] + m.start(g)) if s else None) for r, u, s in references("x.css", m.group(g) or "")]
        for m in re.finditer(r"<script\b[^>]*>([\s\S]*?)</script>", text, re.I):
            out += [(r, u, (s[0] + m.start(1), s[1] + m.start(1)) if s else None) for r, u, s in references("x.js", m.group(1) or "")]
    elif low.endswith(".css"):
        for m in CSS_URL.finditer(text):
            g = next(i for i in (1, 2, 3, 4, 5) if m.group(i) is not None)
            out.append((m.group(g), "load", (m.start(g), m.end(g))))
    elif low.endswith((".js", ".mjs")):
        for m in JS_IMPORT.finditer(text):
            out.append((m.group(1), "load", (m.start(1), m.end(1))))
    return [x for x in out if x[0]]


def resolve(dirname, ref):
    """('local', path) | ('outside', ref) | ('absolute', ref) | ('external', host) | ('skip', None)"""
    r = ref.strip()
    if not r or r.startswith("#") or re.match(r"^(data|mailto|tel|javascript|blob|about|sms):", r, re.I):
        return ("skip", None)
    r = re.sub(r"[#?].*$", "", r)
    if not r:
        return ("skip", None)
    if re.match(r"^[a-z][a-z0-9+.-]*:", r, re.I) or r.startswith("//"):
        return ("external", urllib.parse.urlsplit(r if not r.startswith("//") else "https:" + r).hostname or "")
    if r.startswith("/"):
        return ("absolute", r)
    dec = urllib.parse.unquote(r)
    p = posixpath.normpath(posixpath.join(dirname or ".", dec))
    if dec.endswith("/"):
        p = posixpath.join(p, "index.html")
    if p == ".." or p.startswith("../"):
        return ("outside", r)
    return ("local", p[2:] if p.startswith("./") else p)


def walk(folder):
    folder = Path(folder)
    out = []
    for p in sorted(folder.rglob("*")):
        rel = p.relative_to(folder).as_posix()
        if p.is_symlink():
            out.append((rel, "link", 0))
        elif p.is_file():
            out.append((rel, "file", p.stat().st_size))
    return out


# ------------------------------------------------------------------ check
def check(folder):
    """What would go public from `folder`, and every problem. A folder is ready when problems is empty."""
    folder = Path(folder).resolve()
    files, problems, notes, left = [], [], [], []
    if not folder.is_dir():
        return {"folder": str(folder), "files": [], "problems": [f"{folder} is not a folder."], "notes": [], "left_out": []}
    entries = walk(folder)
    have_files = {rel for rel, kind, _ in entries if kind == "file"}
    total = 0
    for rel, kind, size in entries:
        if kind != "file":
            problems.append(f"{rel} is a link; a published site holds plain files only. Copy the file there instead.")
            continue
        parts = rel.split("/")
        if any(x in ("node_modules", "__pycache__", ".shots") for x in parts) or (any(x.startswith(".") for x in parts) and not SECRET_NAME.search(rel) and not SECRET_DIR.search(rel)):
            left.append(rel)
            continue
        data = (folder / rel).read_bytes() if size <= 20 * 1024 * 1024 else None
        why = secret_in(rel, data)
        if why:
            problems.append(f"{rel}: {why}. It must not be published: take it out of the folder (and the key out of the page, if the page needs it).")
            continue
        if size > 20 * 1024 * 1024:
            problems.append(f"{rel} is {size // 2**20} MB; keep published files under 20 MB.")
        files.append({"path": rel, "size": size})
        total += size
        if data is not None and rel.lower().endswith((".html", ".htm", ".css", ".js", ".mjs", ".svg")):
            here = posixpath.dirname(rel)
            for ref, use, _ in references(rel, data.decode("utf-8", "replace")):
                kind2, x = resolve(here, ref)
                if kind2 == "external" and use == "load":
                    notes.append(f"{rel} loads {ref.split('?')[0][:120]} from {x}: a page on Ola's sites address may only load its own files, so copy it into the folder (or drop it).")
                elif kind2 == "absolute":
                    problems.append(f"{rel} refers to {ref}: a path that starts with “/” breaks once the site is in a folder. Make it relative.")
                elif kind2 == "outside":
                    problems.append(f"{rel} uses {ref}, which is outside the folder: copy it in and change the link.")
                elif kind2 == "local" and x not in have_files and use == "load":
                    problems.append(f"{rel} uses {x}, which is not in the folder.")
    if "index.html" not in have_files:
        problems.append("There is no index.html, the page a visitor sees first.")
    return {"folder": str(folder), "files": files, "total": total, "problems": problems, "notes": sorted(set(notes)), "left_out": left}


# ------------------------------------------------------------------ prepare
def prepare(page, out="site"):
    """Copies `page` to <out>/index.html with every local file it uses, links made relative, inside <out>.
    The project's root is the current folder (where the page's absolute links point)."""
    page = Path(page).resolve()
    root = Path.cwd().resolve()
    if not page.is_file():
        return {"ok": False, "problems": [f"{page} is not a file."]}
    try:
        page_rel = page.relative_to(root).as_posix()
    except ValueError:
        return {"ok": False, "problems": ["Run this from the project's folder, with the page inside it."]}
    outdir = (root / out).resolve()
    if outdir == root or root not in outdir.parents:
        return {"ok": False, "problems": ["The site folder must be a new folder inside the project, like site/."]}
    base = posixpath.dirname(page_rel)
    plan = {}  # source rel -> public rel
    plan[page_rel] = "index.html"
    queue, problems, notes = [page_rel], [], []
    texts = {}
    while queue:
        src = queue.pop(0)
        data = (root / src).read_bytes()
        why = secret_in(src, data)
        if why:
            problems.append(f"{src}: {why}. Ola will not put it in the site. Take the secret out of the page (a page in the browser cannot keep a key secret), then run this again.")
            continue
        if not src.lower().endswith((".html", ".htm", ".css", ".js", ".mjs", ".svg")):
            continue
        text = data.decode("utf-8", "replace")
        texts[src] = text
        here = posixpath.dirname(src)
        for ref, use, _ in references(src, text):
            kind, x = resolve(here, ref)
            if kind == "absolute":
                x = posixpath.normpath(urllib.parse.unquote(re.sub(r"[#?].*$", "", ref)).lstrip("/"))
                kind = "local"
            elif kind == "outside":
                kind, x = "local", posixpath.normpath(posixpath.join(here, urllib.parse.unquote(re.sub(r"[#?].*$", "", ref))))
                if x.startswith(".."):
                    problems.append(f"{src} uses {ref}, which is outside the project.")
                    continue
            if kind == "external":
                if use == "load":
                    notes.append(f"{src} loads something from {x}: it will not show on Ola's sites address. Copy it into the project and link it, or drop it.")
                continue
            if kind != "local" or x in plan:
                continue
            f = root / x
            if not f.is_file():
                if use == "load":
                    notes.append(f"{src} uses {x}, which is not in the project.")
                continue
            if SECRET_DIR.search(x) or SECRET_NAME.search(x) or DATA_NAME.search(x):
                problems.append(f"{src} uses {x}: {secret_in(x, None)}. Ola will not put it in the site.")
                continue
            # Inside the page's folder: the same place. Outside it (or from the root): under assets/.
            inner = x[len(base) + 1:] if base and x.startswith(base + "/") else (x if not base else None)
            plan[x] = inner if inner and inner != "index.html" else posixpath.join("assets", x.replace("../", ""))
            queue.append(x)
    if problems:
        return {"ok": False, "problems": problems, "notes": sorted(set(notes))}
    if outdir.exists():
        shutil.rmtree(outdir)
    for src, pub in plan.items():
        dst = outdir / pub
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src in texts:
            dst.write_text(rewrite(src, pub, texts[src], plan, root), encoding="utf-8")
        else:
            shutil.copyfile(root / src, dst)
    result = check(outdir)
    return {"ok": not result["problems"], "folder": str(outdir), "files": [{"from": s, "as": p} for s, p in plan.items()], "problems": result["problems"], "notes": sorted(set(notes) | set(result["notes"]))}


def rewrite(src, pub, text, plan, root):
    """The references of one file, pointed at where their files are in the site."""
    here_src = posixpath.dirname(src)
    here_pub = posixpath.dirname(pub)
    spans = []
    for ref, use, span in references(src, text):
        if not span:
            continue
        kind, x = resolve(here_src, ref)
        if kind == "absolute":
            x, kind = posixpath.normpath(urllib.parse.unquote(re.sub(r"[#?].*$", "", ref)).lstrip("/")), "local"
        elif kind == "outside":
            x, kind = posixpath.normpath(posixpath.join(here_src, urllib.parse.unquote(re.sub(r"[#?].*$", "", ref)))), "local"
        if kind != "local" or x not in plan:
            continue
        tail = re.search(r"[#?].*$", ref)
        new = posixpath.relpath(plan[x], here_pub or ".") + (tail.group(0) if tail else "")
        if new != ref:
            spans.append((span, urllib.parse.quote(new, safe="/#?=&.-_~")))
    for (a, b), new in sorted(spans, reverse=True):
        text = text[:a] + new + text[b:]
    return text


# ------------------------------------------------------------------ git, GitHub, Vercel (the local runtime)
def run(cmd, cwd, dry):
    shown = " ".join(c if re.match(r"^[\w./:=@-]+$", c) else json.dumps(c) for c in cmd)
    if dry:
        print(f"would run: {shown}")
        return 0
    print(f"running: {shown}")
    return subprocess.call(cmd, cwd=cwd)


def repo(folder, name, public, dry):
    folder = Path(folder).resolve()
    c = check(folder)
    if c["problems"]:
        print("Not ready to publish:")
        for p in c["problems"]:
            print(f"  - {p}")
        return 1
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", name):
        print("A repository name is letters, digits, dots, dashes and underscores.")
        return 1
    if not dry and not have("git"):
        print("git is not installed. On a Mac: run `xcode-select --install` in Terminal (or install Xcode), then try again.")
        return 1
    if not dry and not have("gh"):
        print("GitHub's command line tool is not installed: `brew install gh` (Homebrew), then `gh auth login --web`.")
        return 1
    ignore = folder / ".gitignore"
    if not ignore.exists() and not dry:
        ignore.write_text(".env*\n*.env\n*.pem\n*.key\n*.db\n*.sqlite*\n.DS_Store\n.ola/\n.vercel/\nnode_modules/\n")
    steps = []
    if not (folder / ".git").exists():
        steps.append(["git", "init", "-b", "main"])
    steps += [["git", "add", "-A"], ["git", "commit", "-m", "Publish with Ola"], ["gh", "repo", "create", name, "--public" if public else "--private", "--source", ".", "--remote", "origin", "--push"]]
    for s in steps:
        if run(s, folder, dry) != 0:
            print(f"That step did not work: {' '.join(s[:3])}. Nothing after it ran.")
            return 1
    return 0


def vercel(folder, name, gh_repo, dry):
    folder = Path(folder).resolve()
    if not have("vercel") and not dry:
        print("The Vercel command line tool is not installed. Either install it (`npm i -g vercel`, then `vercel login`), or follow the steps in the publish skill's references/vercel.md in the browser.")
        return 1
    steps = [
        ["vercel", "link", "--yes", "--project", name],
        ["vercel", "git", "connect", f"https://github.com/{gh_repo}", "--yes"],
        ["vercel", "deploy", "--prod", "--yes"],
    ]
    for s in steps:
        if run(s, folder, dry) != 0:
            print(f"That step did not work: {' '.join(s[:3])}. Nothing after it ran.")
            return 1
    return 0


# ------------------------------------------------------------------ live, dns
def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"user-agent": "ola-publish-check"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(5 * 1024 * 1024)
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:  # noqa: BLE001: any network failure is "not yet"
        return 0, str(e).encode()


def live(url, expect, wait):
    want = hashlib.sha1((Path(expect) / "index.html").read_bytes()).hexdigest() if expect else None
    until = time.time() + wait
    while True:
        status, body = fetch(url)
        same = want is None or hashlib.sha1(body).hexdigest() == want
        if status == 200 and same:
            print(f"live: {url} answers with the published page")
            return 0
        if time.time() >= until:
            print(f"not yet: {url} answered {status or 'nothing'}{'' if same else ' with an older page'}. A first deploy can take a minute or two; try again.")
            return 1
        time.sleep(5)


def doh(name, rtype):
    q = urllib.parse.urlencode({"name": name, "type": rtype})
    status, body = fetch(f"https://dns.google/resolve?{q}", timeout=10)
    if status != 200:
        return None
    try:
        return [a["data"].rstrip(".") for a in json.loads(body).get("Answer", [])]
    except ValueError:
        return None


def dns(domain, wait):
    domain = domain.lower().strip().rstrip(".")
    until = time.time() + wait
    while True:
        a, cname = doh(domain, "A"), doh(domain, "CNAME")
        if a is None and cname is None:
            print("Could not ask DNS just now (no network?). Try again in a minute.")
            return 1
        to_vercel = any(c.endswith(("vercel-dns.com", "vercel-dns-017.com", "vercel.app")) for c in cname or []) or any(x.startswith("76.76.21.") or x.startswith("216.198.79.") for x in a or [])
        status, _ = fetch(f"https://{domain}/") if to_vercel else (0, b"")
        if to_vercel and 200 <= status < 400:
            print(f"live: {domain} points at Vercel and https://{domain}/ answers")
            return 0
        if time.time() >= until:
            if not to_vercel:
                print(f"not yet: {domain} does not point at Vercel (A {a or 'none'}, CNAME {cname or 'none'}). Check the records; a change can take up to an hour, rarely longer.")
            else:
                print(f"almost: {domain} points at Vercel, but https://{domain}/ answered {status or 'nothing'} yet. Vercel makes the certificate in a few minutes; try again.")
            return 1
        time.sleep(15)


# ------------------------------------------------------------------ the command line
def main(argv=None):
    ap = argparse.ArgumentParser(prog="publish.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("where")
    p = sub.add_parser("prepare"); p.add_argument("page"); p.add_argument("--out", default="site"); p.add_argument("--json", action="store_true")
    p = sub.add_parser("check"); p.add_argument("folder"); p.add_argument("--json", action="store_true")
    p = sub.add_parser("repo"); p.add_argument("folder"); p.add_argument("--name", required=True); p.add_argument("--public", action="store_true"); p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("vercel"); p.add_argument("folder"); p.add_argument("--name", required=True); p.add_argument("--repo", required=True); p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("live"); p.add_argument("url"); p.add_argument("--expect"); p.add_argument("--wait", type=int, default=120)
    p = sub.add_parser("dns"); p.add_argument("domain"); p.add_argument("--wait", type=int, default=0)
    a = ap.parse_args(argv)
    if a.cmd == "where":
        rt = runtime()
        print(rt)
        if rt == "local":
            print(f"ola sites: {ola_sites()}")
            for tool in ("git", "gh", "vercel"):
                print(f"{tool}: {'yes' if have(tool) else 'no'}")
        return 0
    if a.cmd in ("prepare", "check"):
        r = prepare(a.page, a.out) if a.cmd == "prepare" else check(a.folder)
        if a.json:
            print(json.dumps(r, indent=1))
        else:
            if r.get("folder"):
                print(f"folder: {r['folder']}")
            for f in r.get("files", []):
                print(f"  {f.get('as', f.get('path'))}" + (f"  ({f['size']} bytes)" if "size" in f else f"  from {f['from']}"))
            for n in r.get("notes", []):
                print(f"note: {n}")
            for p in r.get("problems", []):
                print(f"PROBLEM: {p}")
            print("ready to publish" if not r.get("problems") else "not ready to publish")
        return 0 if not r.get("problems") else 1
    if a.cmd == "repo":
        return repo(a.folder, a.name, a.public, a.dry_run)
    if a.cmd == "vercel":
        return vercel(a.folder, a.name, a.repo, a.dry_run)
    if a.cmd == "live":
        return live(a.url, a.expect, a.wait)
    if a.cmd == "dns":
        return dns(a.domain, a.wait)


if __name__ == "__main__":
    sys.exit(main())
