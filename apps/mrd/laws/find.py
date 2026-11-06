"""Step 2: find each law's text online, download it, store it.

    python3 find.py [--country slug] [--limit N] [--workers 4] [--redo-missing]

Per law: build search queries (official name + number, steered at the country's
law portal), let Haiku rank the hits, download the best one, check with Haiku
that the document really is that law, store the file in the 'sources' bucket and
its text in laws.text. Every attempt goes to find_log.
"""
import argparse, hashlib, html, json, re, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from lib import sb, sb_all, claude, search, upload, USAGE, SEARCHES, beat, run_base
from portals import PORTALS, TRUSTED, is_official

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
SEARCH_LOCK = threading.Lock()   # paid Brave plan: 50 req/s; we stay near 10
MIN_TEXT = 1500                  # below this a page is a shell, an index or a login wall


def throttled_search(q):
    with SEARCH_LOCK:
        res = search(q)
        time.sleep(0.1)
        return res


# ---------- text extraction ----------
class _Text(HTMLParser):
    SKIP = {"script", "style", "nav", "header", "footer", "noscript", "svg", "form", "button"}

    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP: self.skip += 1
        if tag in ("p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "section", "article"): self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip: self.skip -= 1

    def handle_data(self, d):
        if not self.skip: self.out.append(d)


def html_text(raw):
    p = _Text(); p.feed(raw)
    t = html.unescape("".join(p.out))
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n\n", t).strip()


def pdf_text(data):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data); f.flush()
        r = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", f.name, "-"], capture_output=True, timeout=120)
        return r.stdout.decode("utf-8", "ignore").strip()


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/pdf,*/*",
                                               "Accept-Language": "en,*;q=0.5"})
    with urllib.request.urlopen(req, timeout=30) as r:
        # a slow server can trickle bytes forever under a per-read timeout: cap the whole download
        start, chunks, size = time.time(), [], 0
        while size < 40_000_000:
            if time.time() - start > 90:
                raise TimeoutError("download took over 90 s")
            c = r.read(65536)
            if not c:
                break
            chunks.append(c); size += len(c)
        data = b"".join(chunks)
        ctype = (r.headers.get("Content-Type") or "").lower()
        final = r.geturl()
    if data[:5] == b"%PDF-" or "pdf" in ctype:
        return final, "pdf", data, pdf_text(data)
    enc = re.search(r"charset=([\w-]+)", ctype)
    raw = data.decode(enc.group(1) if enc else "utf-8", "ignore")
    return final, "html", data, html_text(raw)


def pdf_links(data, base):
    raw = data.decode("utf-8", "ignore")
    out = []
    for href in re.findall(r'href=["\']([^"\']+?\.pdf(?:\?[^"\']*)?)["\']', raw, re.I):
        u = urllib.parse.urljoin(base, html.unescape(href))
        if u not in out:
            out.append(u)
    return out[:4]


# ---------- the model's two jobs ----------
RANK_SYS = """You help locate the full text of a specific legal instrument online. Given the instrument and web search results, rank the results most likely to BE the full text of that exact instrument (or, for a court decision, the judgment itself).
Prefer, in order: the government's own legislation portal, official gazette or court site; then trusted free collections (Refworld, ILO NATLEX, LII sites, Constitute); never commentary, news, law-firm blogs, summaries, or paywalled databases.
A consolidated/current version is better than the original as enacted. The country's own language is fine.
Return up to 3 URLs, best first. Return an empty list if none is plausibly the document itself."""
RANK_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["urls", "paywalled_only"],
               "properties": {"urls": {"type": "array", "items": {"type": "string"}},
                              "paywalled_only": {"type": "boolean"}}}

CHECK_SYS = """You verify a downloaded document. Decide whether it is the full text (or a substantial official excerpt) of the named legal instrument — for a court decision, the judgment. A table of contents, search page, news item, summary or a different law is not a match. An amended or consolidated version of the same instrument IS a match.
Also report the instrument's official name in its own language, the language of the document (ISO 639-1), the enactment or decision date if visible (YYYY-MM-DD, or YYYY-01-01 if only the year), and whether it is in force, amended or repealed if the document says so."""
CHECK_SCHEMA = {"type": "object", "additionalProperties": False,
                "required": ["match", "reason", "name_official", "language", "date", "status"],
                "properties": {"match": {"type": "boolean"}, "reason": {"type": "string"},
                               "name_official": {"type": ["string", "null"]}, "language": {"type": ["string", "null"]},
                               "date": {"type": ["string", "null"]},
                               "status": {"type": "string", "enum": ["in_force", "amended", "repealed", "unknown"]}}}


def describe(law, country):
    bits = [f"Country: {country['name_en']}", f"Kind: {law['kind']}", f"Name: {law['name_en']}"]
    if law.get("name_official"): bits.append(f"Official name: {law['name_official']}")
    if law.get("name_cited") and law["name_cited"] != law["name_en"]: bits.append(f"As cited: {law['name_cited']}")
    if law.get("number"): bits.append(f"Number: {law['number']}")
    if law.get("court"): bits.append(f"Court: {law['court']}")
    if law.get("enacted_year"): bits.append(f"Year: {law['enacted_year']}")
    return "\n".join(bits)


def queries(law, country):
    iso = country["iso"]
    name = law.get("name_official") or law["name_en"]
    num = law.get("number") or ""
    year = str(law.get("enacted_year") or "")
    portal = (PORTALS.get(iso) or [None])[0]
    q = []
    if law["kind"] == "court_decision":
        q.append(f"{law['name_en']} {num} judgment".strip())
    else:
        if portal: q.append(f"site:{portal} {name} {num or year}".strip())
        q.append(f"{name} {num or year} {country['name_en']} full text".strip())
    return q


def domain(url):
    return urllib.parse.urlparse(url).netloc.lower().removeprefix("www.")


def find_one(law, country):
    desc = describe(law, country)
    qs = queries(law, country)
    hits, seen = [], set()
    for q in qs:
        for h in throttled_search(q):
            if h["url"] not in seen:
                seen.add(h["url"]); hits.append(h)
    if not hits:
        return {"outcome": "not_found", "queries": qs, "candidates": [], "notes": "no search results"}
    listing = "\n".join(f"{i+1}. {h['url']}\n   {h['title']}\n   {h['snippet'][:240]}" for i, h in enumerate(hits[:16]))
    ranked = claude(RANK_SYS, f"{desc}\n\nSearch results:\n{listing}", schema=RANK_SCHEMA)
    tried, blocked, queue = [], [], list(ranked["urls"][:3])
    while queue:
        url = queue.pop(0)
        try:
            final, fmt, data, text = fetch(url)
        except Exception as e:
            tried.append({"url": url, "error": str(e)[:200]})
            if re.search(r"HTTP Error (401|403|429)|timed out|SSL", str(e)) and url in ranked["urls"]:
                blocked.append(url)
            continue
        if fmt == "html":
            # a landing page often links the law itself as a PDF: try those first when the
            # page is thin, otherwise keep them as fallbacks in case the page isn't the text
            more = [u for u in pdf_links(data, final)[:2] if u not in queue and all(t["url"] != u for t in tried)]
            queue = more + queue if len(text) < MIN_TEXT else queue + more
        if len(text) < MIN_TEXT:
            tried.append({"url": url, "error": f"only {len(text)} chars of text"}); continue
        sample = text[:5000] + ("\n…\n" + text[len(text)//2: len(text)//2 + 1500] if len(text) > 9000 else "")
        chk = claude(CHECK_SYS, f"Instrument:\n{desc}\n\nDocument from {final}:\n{sample}", schema=CHECK_SCHEMA)
        if not chk["match"]:
            tried.append({"url": final, "error": "not a match: " + chk["reason"][:200]}); continue
        return {"outcome": "found", "queries": qs, "candidates": hits[:16], "url": final, "format": fmt,
                "data": data, "text": text, "check": chk, "tried": tried}
    if blocked:
        return {"outcome": "linked", "queries": qs, "candidates": hits[:16], "url": blocked[0], "tried": tried,
                "notes": "site refused the download; link is the top-ranked result: " +
                         "; ".join(f"{t['url']}: {t['error']}" for t in tried)[:1200]}
    outcome = "paywalled" if ranked["paywalled_only"] and not tried else "not_found"
    return {"outcome": outcome, "queries": qs, "candidates": hits[:16], "tried": tried,
            "notes": "; ".join(f"{t['url']}: {t['error']}" for t in tried)[:1500] or "no plausible result"}


def process(law, countries):
    country = countries[law["country_id"]]
    try:
        r = find_one(law, country)
    except Exception as e:
        r = {"outcome": "error", "queries": [], "candidates": [], "notes": str(e)[:500]}
    patch = {"find_status": r["outcome"], "find_notes": r.get("notes"), "fetched_at": "now()"}
    if r["outcome"] == "found":
        chk = r["check"]
        ext = "pdf" if r["format"] == "pdf" else "html"
        path = f"{country['iso']}/{law['id']}.{ext}"
        try:
            upload(path, r["data"], "application/pdf" if ext == "pdf" else "text/html")
        except Exception as e:
            path = None; print("upload failed", law["id"], e, file=sys.stderr)
        date = chk.get("date")
        patch.update({"source_url": r["url"], "source_domain": domain(r["url"]),
                      "source_official": is_official(domain(r["url"]), country["iso"]),
                      "source_format": r["format"], "storage_path": path, "text": r["text"].replace("\x00", ""),
                      "language": chk.get("language"), "status": chk.get("status"),
                      "name_official": law.get("name_official") or chk.get("name_official"),
                      "enacted_date": date if date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) else None,
                      "find_notes": "; ".join(f"{t['url']}: {t['error']}" for t in r.get("tried", []))[:1500] or None})
    if r["outcome"] == "linked":
        patch.update({"source_url": r["url"], "source_domain": domain(r["url"]),
                      "source_official": is_official(domain(r["url"]), country["iso"])})
    sb("PATCH", f"laws?id=eq.{law['id']}", patch)
    sb("POST", "find_log", [{"law_id": law["id"], "queries": r.get("queries", []),
                             "candidates": [{"url": c["url"], "title": c["title"]} for c in r.get("candidates", [])],
                             "chosen_url": r.get("url"), "outcome": r["outcome"], "notes": r.get("notes")}])
    return r["outcome"]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--country"); ap.add_argument("--limit", type=int); ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--redo-missing", action="store_true")
    a = ap.parse_args()
    countries = {c["id"]: c for c in sb_all("countries?select=id,iso,slug,name_en")}
    want = "find_status=in.(pending,not_found,error)" if a.redo_missing else "find_status=eq.pending"
    q = f"laws?select=id,country_id,name_en,name_cited,name_official,kind,number,court,enacted_year&{want}&order=country_id,name_en"
    if a.country:
        cid = next(c["id"] for c in countries.values() if c["slug"] == a.country); q += f"&country_id=eq.{cid}"
    laws = sb_all(q)[: a.limit or None]
    total = len(sb_all("laws?select=id"))
    base = run_base("find")
    print(f"{len(laws)} laws to find")
    done_before = total - len(sb_all("laws?select=id&find_status=eq.pending"))
    counts, done = {}, 0
    beat("find", done_before, total, note="searching official portals", force=True, base=base)
    with ThreadPoolExecutor(a.workers) as ex:
        for outcome in ex.map(lambda l: process(l, countries), laws):
            done += 1; counts[outcome] = counts.get(outcome, 0) + 1
            beat("find", done_before + done, total, note="searching official portals", base=base)
            if done % 10 == 0:
                print(f"  {done}/{len(laws)} {counts} ${USAGE['cost']:.2f} {SEARCHES['n']} searches", flush=True)
    final = total - len(sb_all("laws?select=id&find_status=eq.pending"))
    beat("find", final, total, status="done" if final == total else "stopped", note=f"last batch: {counts}", force=True, base=base)
    print(f"done: {done} laws {counts}, {USAGE['calls']} model calls ${USAGE['cost']:.2f}, {SEARCHES['n']} searches")
