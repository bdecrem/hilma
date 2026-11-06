"""Step 2: find each law's text online, download it, store it.

    python3 find.py [--country slug] [--limit N] [--workers 4] [--redo-missing] [--rescue]

--rescue is the second pass over everything the first pass could not store (not found,
link only, paywalled, error): it tries the law's predictable addresses first (treaties,
EU instruments, Colombian rulings, Austrian law through the RIS API), then the URLs the
first pass already had, through each portal's side door (adapters.py) and, when a site
refuses scripts, through a real browser (bfetch.mjs); only then does it search again,
with extra queries Haiku writes in the country's own language.

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
from adapters import expand, guess, ris_text
import browser

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
SEARCH_LOCK = threading.Lock()   # paid Brave plan: 50 req/s; we stay near 10
MIN_TEXT = 1500                  # below this a page is a shell, an index or a login wall
USE_BROWSER = False              # --rescue: fall back to headless Chrome when a plain fetch gets nothing
# their Cloudflare challenge beats headless Chrome too: never a download, keep as a link at most
CLOUDFLARE = {"refworld.org", "natlex.ilo.org", "nzlii.org", "legifrance.gouv.fr", "lawlibrary.org.za",
              "austlii.edu.au", "canlii.org", "ejustice.just.fgov.be"}


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


LEGACY = {"he": "cp1255", "ru": "cp1251", "ar": "cp1256", "el": "cp1253", "tr": "cp1254", "hu": "cp1250", "bn": "utf-8"}


def decode_html(data, ctype="", lang=None):
    """Valid UTF-8 first, then the page's declared charset (header, then <meta>), then the usual legacy
    code page for the law's language. Decoding Latin-1 or Windows-1255 pages as UTF-8 with errors ignored
    dropped every accented letter ("Artculo") and every Hebrew one."""
    if data[:2] in (b"\xff\xfe", b"\xfe\xff") or data[:400].count(b"\x00") > 40:   # UTF-16 (bdlaws.minlaw.gov.bd)
        return data.decode("utf-16" if data[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-16-le", "replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    enc = re.search(r"charset=[\"']?([\w-]+)", ctype) or re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:4000], re.I)
    if enc:
        name = enc.group(1).decode() if isinstance(enc.group(1), bytes) else enc.group(1)
        try:
            return data.decode(name)
        except (LookupError, UnicodeDecodeError):
            pass
    return data.decode(LEGACY.get(lang or "", "cp1252"), "replace")


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
    return final, "html", data, html_text(decode_html(data, ctype))


def pdf_links(data, base):
    raw = data.decode("utf-8", "ignore")
    out = []
    for href in re.findall(r'href=["\']([^"\']+?\.pdf(?:\?[^"\']*)?)["\']', raw, re.I):
        u = urllib.parse.urljoin(base, html.unescape(href))
        if u not in out:
            out.append(u)
    return out[:4]


# ---------- the model's two jobs ----------
def fetch_any(url):
    """A plain fetch, then the portal's side door, then a real browser. Returns the best attempt as
    (final, fmt, data, text, pdf_links, errors); text may still be thin."""
    best, links, errors = None, [], []
    if isinstance(url, tuple):                       # ("ris", gesetzesnummer): Austrian law through the open-data API
        final, text = ris_text(url[1])
        return final, "html", text.encode(), text, [], []
    alts = expand(url)
    for alt in alts:
        try:
            if isinstance(alt, tuple):
                final, text = ris_text(alt[1]); fmt, data = "html", text.encode()
            else:
                final, fmt, data, text = fetch(alt)
            if len(text) >= MIN_TEXT: return final, fmt, data, text, [], errors
            errors.append(f"{alt}: only {len(text)} chars")
        except Exception as e:
            errors.append(f"{alt}: {str(e)[:120]}")
    try:
        final, fmt, data, text = fetch(url)
        links = pdf_links(data, final)[:2] if fmt == "html" else []
        best = (final, fmt, data, text)
        if len(text) >= MIN_TEXT or not USE_BROWSER: return final, fmt, data, text, links, errors
        errors.append(f"{url}: only {len(text)} chars")
    except Exception as e:
        if not USE_BROWSER: raise
        errors.append(f"{url}: {str(e)[:120]}")
    if domain(url) in CLOUDFLARE:
        errors.append("cloudflare challenge, no browser attempt")
    else:
        for u in [a for a in alts if isinstance(a, str) and a.endswith("source.pdf")] + [url]:
            try:
                final, fmt, data, text, more = browser.browser_fetch(u)
                if fmt == "pdf": text = pdf_text(data)
                links = links + [m for m in more if m not in links]
                if len(text) >= MIN_TEXT: return final, fmt, data, text, links[:4], errors
                errors.append(f"browser {u}: only {len(text)} chars")
                if best is None or len(text) > len(best[3]): best = (final, fmt, data, text)
            except Exception as e:
                errors.append(f"browser {u}: {str(e)[:120]}")
    if best is None: raise RuntimeError("; ".join(errors)[:600])
    return (*best, links[:4], errors)


ALT_SYS = """You help find the full text of a legal instrument online. Write up to 3 web search queries that are likely to surface the document itself on an official or reputable free site. Use the instrument's title in the country's own language (translate it if only an English title is given), its number and year, and the usual portal or gazette for that country. Do not use site: operators. Return only the queries."""
ALT_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["queries"],
              "properties": {"queries": {"type": "array", "items": {"type": "string"}}}}


RANK_SYS = """You help locate the full text of a specific legal instrument online. Given the instrument and web search results, rank the results most likely to BE the full text of that exact instrument (or, for a court decision, the judgment itself).
Prefer, in order: the government's own legislation portal, official gazette or court site; then trusted free collections (Refworld, ILO NATLEX, LII sites, Constitute); never commentary, news, law-firm blogs, summaries, or paywalled databases.
A consolidated/current version is better than the original as enacted. The country's own language is fine.
Return up to 3 URLs, best first. Return an empty list if none is plausibly the document itself.
These sites refuse automated downloads, so rank them last and prefer any other copy of the document: refworld.org, natlex.ilo.org, nzlii.org, legifrance.gouv.fr, lawlibrary.org.za, austlii.edu.au, canlii.org, ejustice.just.fgov.be."""
RANK_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["urls", "paywalled_only"],
               "properties": {"urls": {"type": "array", "items": {"type": "string"}},
                              "paywalled_only": {"type": "boolean"}}}

CHECK_SYS = """You verify a downloaded document. Decide whether it is the full text (or a substantial official excerpt) of the named legal instrument — for a court decision, the judgment. A table of contents, search page, news item, summary or a different law is not a match. An amended or consolidated version of the same instrument IS a match.
For a treaty or convention the authentic text from its depositary (UN, OHCHR, Council of Europe, ILO, AU, OAS) in any official language IS a match, even when the country cites it through its own ratification act.
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


def find_one(law, country, seeds=(), rescue=False):
    desc = describe(law, country)
    tried, blocked, hits, qs = [], [], [], []

    def attempt(queue):
        """Try URLs in order; returns a found-result or None. Thin landing pages feed their PDF links into the queue."""
        queue = list(queue)
        while queue:
            url = queue.pop(0)
            if any(t["url"] == url for t in tried): continue
            try:
                final, fmt, data, text, more, errs = fetch_any(url)
            except Exception as e:
                tried.append({"url": url, "error": str(e)[:300]})
                if re.search(r"HTTP Error (401|403|429)|timed out|SSL|cloudflare", str(e)) and isinstance(url, str):
                    blocked.append(url)
                continue
            more = [u for u in more if u not in queue and all(t["url"] != u for t in tried)]
            queue = more + queue if len(text) < MIN_TEXT else queue + more
            if len(text) < MIN_TEXT:
                tried.append({"url": url, "error": f"only {len(text)} chars of text" + ("; " + "; ".join(errs) if errs else "")[:300]}); continue
            sample = text[:5000] + ("\n…\n" + text[len(text)//2: len(text)//2 + 1500] if len(text) > 9000 else "")
            chk = claude(CHECK_SYS, f"Instrument:\n{desc}\n\nDocument from {final}:\n{sample}", schema=CHECK_SCHEMA)
            if not chk["match"]:
                tried.append({"url": final, "error": "not a match: " + chk["reason"][:200]}); continue
            return {"outcome": "found", "queries": qs, "candidates": hits[:16], "url": final, "format": fmt,
                    "data": data, "text": text, "check": chk, "tried": tried}
        return None

    # 1. addresses that need no search, and in a rescue the URLs the first pass already had
    direct = guess(law, country) + [u for u in seeds if isinstance(u, str)]
    if direct:
        r = attempt(direct)
        if r: return r

    # 2. search, and in a rescue also with queries written for the country's own portals and language
    qs = queries(law, country)
    if rescue:
        try: qs += claude(ALT_SYS, desc, schema=ALT_SCHEMA)["queries"][:3]
        except Exception: pass
    seen = set()
    for q in qs:
        for h in throttled_search(q):
            if h["url"] not in seen:
                seen.add(h["url"]); hits.append(h)
    if hits:
        listing = "\n".join(f"{i+1}. {h['url']}\n   {h['title']}\n   {h['snippet'][:240]}" for i, h in enumerate(hits[:20]))
        ranked = claude(RANK_SYS, f"{desc}\n\nSearch results:\n{listing}", schema=RANK_SCHEMA)
        r = attempt(ranked["urls"][:3])
        if r: return r
        paywalled = ranked["paywalled_only"] and not tried
    else:
        paywalled = False
    if blocked:
        return {"outcome": "linked", "queries": qs, "candidates": hits[:16], "url": blocked[0], "tried": tried,
                "notes": "site refused the download; link is the top-ranked result: " +
                         "; ".join(f"{t['url']}: {t['error']}" for t in tried)[:1200]}
    return {"outcome": "paywalled" if paywalled else "not_found", "queries": qs, "candidates": hits[:16], "tried": tried,
            "notes": "; ".join(f"{t['url']}: {t['error']}" for t in tried)[:1500] or ("no search results" if not hits else "no plausible result")}


def process(law, countries, seeds=None, rescue=False):
    country = countries[law["country_id"]]
    try:
        r = find_one(law, country, seeds=(seeds or {}).get(law["id"], ()), rescue=rescue)
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
    if rescue and law.get("find_status") == "linked" and r["outcome"] != "found":
        patch = {"find_notes": "rescue: " + (r.get("notes") or "")[:1400], "fetched_at": "now()"}   # keep the link we had
    sb("PATCH", f"laws?id=eq.{law['id']}", patch)
    sb("POST", "find_log", [{"law_id": law["id"], "queries": r.get("queries", []),
                             "candidates": [{"url": c["url"], "title": c["title"]} for c in r.get("candidates", [])],
                             "chosen_url": r.get("url"), "outcome": r["outcome"], "notes": r.get("notes")}])
    return r["outcome"]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--country"); ap.add_argument("--limit", type=int); ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--redo-missing", action="store_true")
    ap.add_argument("--rescue", action="store_true", help="second pass over not found / link only / paywalled / error, with side doors and a browser")
    ap.add_argument("--kind"); ap.add_argument("--status", help="rescue only: restrict to one find_status")
    ap.add_argument("--before", help="rescue only: skip rows already touched after this ISO timestamp (lets a run resume)")
    a = ap.parse_args()
    countries = {c["id"]: c for c in sb_all("countries?select=id,iso,slug,name_en")}
    if a.rescue:
        USE_BROWSER = True
        want = f"find_status=eq.{a.status}" if a.status else "find_status=in.(not_found,linked,paywalled,error)"
    else:
        want = "find_status=in.(pending,not_found,error)" if a.redo_missing else "find_status=eq.pending"
    q = f"laws?select=id,country_id,name_en,name_cited,name_official,kind,number,court,enacted_year,find_status,find_notes,source_url&{want}&order=country_id,name_en"
    if a.kind: q += f"&kind=eq.{a.kind}"
    if a.before: q += f"&or=(fetched_at.is.null,fetched_at.lt.{a.before})"
    if a.country:
        cid = next(c["id"] for c in countries.values() if c["slug"] == a.country); q += f"&country_id=eq.{cid}"
    laws = sb_all(q)[: a.limit or None]
    total = len(sb_all("laws?select=id"))
    seeds = {}
    if a.rescue:   # every URL the first pass tried or ranked, so no search is repeated for nothing
        for l in laws:
            urls = ([l["source_url"]] if l.get("source_url") else []) + re.findall(r"https?://[^\s;]+?(?=: |;|$)", l.get("find_notes") or "")
            seeds[l["id"]] = list(dict.fromkeys(u.rstrip(".,)") for u in urls))
        for row in sb_all("find_log?select=law_id,chosen_url,candidates&order=id"):
            if row["law_id"] in seeds:
                extra = ([row["chosen_url"]] if row.get("chosen_url") else []) + [c["url"] for c in (row.get("candidates") or [])[:3]]
                seeds[row["law_id"]] = list(dict.fromkeys(seeds[row["law_id"]] + extra))
    step = "rescue" if a.rescue else "find"
    base = run_base(step)
    print(f"{len(laws)} laws to find")
    note = "side doors, a real browser, new queries" if a.rescue else "searching official portals"
    if a.rescue:
        done_before, total = 0, len(laws)
    else:
        done_before = total - len(sb_all("laws?select=id&find_status=eq.pending"))
    counts, done = {}, 0
    beat(step, done_before, total, note=note, force=True, base=base)
    with ThreadPoolExecutor(a.workers) as ex:
        for outcome in ex.map(lambda l: process(l, countries, seeds, a.rescue), laws):
            done += 1; counts[outcome] = counts.get(outcome, 0) + 1
            beat(step, done_before + done, total, note=note, base=base)
            if done % 10 == 0:
                print(f"  {done}/{len(laws)} {counts} ${USAGE['cost']:.2f} {SEARCHES['n']} searches", flush=True)
    final = done_before + done if a.rescue else total - len(sb_all("laws?select=id&find_status=eq.pending"))
    beat(step, final, total, status="done" if final == total else "stopped", note=f"last batch: {counts}", force=True, base=base)
    print(f"done: {done} laws {counts}, {USAGE['calls']} model calls ${USAGE['cost']:.2f}, {SEARCHES['n']} searches")
    browser.stop()
