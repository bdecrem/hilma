"""Compile an MRD-style dossier for a new country: Claude Opus 5.5 with web search and a page
reader, coding the 64 indicators of the MRD's 2023 instrument in 18 chunks, after a law map.

    python3 compile.py <slug> [--only KEY[,KEY]] [--redo] [--workers 3] [--dry]

Every row it writes carries experimental = true. Progress goes to dossier_runs / dossier_chunks /
dossier_log for ola.cx/mrd/dossiers. Restartable: finished chunks are skipped unless --redo.
"""
import argparse, datetime, hashlib, html, json, os, re, sys, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "laws"))
from lib import sb, sb_all, http, search as brave_search           # noqa: E402
from find import fetch as plain_fetch, UA                          # noqa: E402
import browser                                                     # noqa: E402

MODEL = "claude-opus-5-5"
PRICE = {"in": 4.0, "out": 20.0, "cache_write": 5.0, "cache_read": 0.20}   # $/M tokens
YEAR = 2026
TODAY = datetime.date.today().isoformat()
CODEBOOK = json.load(open(os.path.join(HERE, "codebook.json"), encoding="utf-8"))
Q = CODEBOOK["questions"]
CACHE = os.path.join(HERE, "cache"); os.makedirs(CACHE, exist_ok=True)

COUNTRIES = {
    "portugal": dict(id=1001, iso="PRT", name="Portugal", lang="Portuguese", examples=["ESP", "ITA", "FRA"],
        portals="diariodarepublica.pt (Diário da República Eletrónico: every law, with consolidated texts under 'Legislação Consolidada'), "
                "pgdlisboa.pt (consolidated codes and the Lei de Estrangeiros), dre.pt, aima.gov.pt (the migration agency AIMA, since 2023, formerly SEF), "
                "parlamento.pt, dgsi.pt (court decisions), provedor-jus.pt (Ombudsman). Key instruments: Constituição (CRP, art. 15 equality of foreigners), "
                "Lei n.º 23/2007 (Lei de Estrangeiros, as amended, incl. 2023-2025 changes), Decreto Regulamentar 84/2007, Lei n.º 27/2008 (asylum), "
                "Lei n.º 37/81 (nationality, as amended 2018/2020/2024), Código do Trabalho (Lei 7/2009), Lei n.º 134/99 and Lei 93/2017 (discrimination), "
                "Lei 23/2007 art. 122 family reunification regime arts. 98-108, Decreto-Lei 67/2004 (irregular children's registration), Lei 15/2024 and the 2024 'manifestação de interesse' repeal."),
    "norway": dict(id=1002, iso="NOR", name="Norway", lang="Norwegian (Bokmål)", examples=["SWE", "DNK", "FIN"],
        portals="lovdata.no (all acts and regulations; official English translations at lovdata.no/info/information_in_english and regjeringen.no), "
                "udiregelverk.no (UDI's regulations, circulars and practice), udi.no, une.no (appeals board), regjeringen.no, domstol.no and lovdata.no for court decisions, "
                "sivilombudet.no (Ombud), nhri.no (NIM). Key instruments: Grunnloven (Constitution, esp. §§ 92-113), Utlendingsloven LOV-2008-05-15-35 (Immigration Act) "
                "and Utlendingsforskriften FOR-2009-10-15-1286, Statsborgerloven LOV-2005-06-10-51 (Nationality Act), Arbeidsmiljøloven (Working Environment Act), "
                "Likestillings- og diskrimineringsloven 2017, Folketrygdloven (National Insurance Act), Menneskerettsloven 1999 (incorporates ECHR, ICCPR, ICESCR, CRC, CEDAW), "
                "Straffeloven §§ 257-258 (trafficking), Pasient- og brukerrettighetsloven and FOR-2011-12-16-1255 (health care for persons without lawful residence), Opplæringslova, Valgloven."),
    "philippines": dict(id=1003, iso="PHL", name="Philippines", lang="English (and Filipino)", examples=["IDN", "IND", "KOR"],
        portals="lawphil.net (Arellano Law Foundation: statutes, jurisprudence), officialgazette.gov.ph, elibrary.judiciary.gov.ph (Supreme Court), chanrobles.com, "
                "immigration.gov.ph (Bureau of Immigration), dole.gov.ph, doj.gov.ph (Refugees and Stateless Persons Protection Unit), chr.gov.ph (Commission on Human Rights). "
                "Key instruments: 1987 Constitution (Art. III Bill of Rights, Art. IV citizenship, Art. XIII labor), Commonwealth Act No. 613 (Philippine Immigration Act of 1940, as amended), "
                "Alien Employment Permit rules (DOLE Department Order 221-21), Labor Code (PD 442, as amended), Commonwealth Act 473 (Revised Naturalization Law) and RA 9139 (administrative naturalization), "
                "RA 9225 (Citizenship Retention and Re-acquisition), RA 9208 as amended by RA 10364 and RA 11862 (anti-trafficking), DOJ Circular 058 (2012) refugee and stateless status determination procedure, "
                "RA 8042/RA 10022 (migrant workers, mostly Filipinos abroad), RA 7610 (children), RA 9710 (Magna Carta of Women), RA 7277/10754 (disabilities), RA 11199 (Social Security Act), RA 11223 (Universal Health Care), RA 9344 (juvenile justice), BI Operations Orders and the 2024 BI Memorandum Circulars on detention."),
    "costa_rica": dict(id=1004, iso="CRI", name="Costa Rica", lang="Spanish", examples=["COL", "MEX", "CHL"],
        portals="pgrweb.go.cr/scij (SCIJ, Sistema Costarricense de Información Jurídica: consolidated laws, regulations, decrees), migracion.go.cr (Dirección General de Migración y Extranjería), "
                "nexuspj.poder-judicial.go.cr (court decisions, Sala Constitucional), dhr.go.cr (Defensoría de los Habitantes), asamblea.go.cr. Key instruments: Constitución Política (arts. 19, 33, 50, 78), "
                "Ley General de Migración y Extranjería N.º 8764 (2009) and its Reglamento de Extranjería (Decreto 37112-GOB) and Reglamento de Personas Refugiadas (Decreto 36831-G, 2011, and Decreto 43809, 2022), "
                "Ley de Opciones y Naturalizaciones N.º 1155, Código de Trabajo, Ley 9095 (trafficking), Ley 7739 (Código de la Niñez y la Adolescencia), Ley 7600 (disabilities), Ley 7142 (women), "
                "Ley 8720 (victims and witnesses), Ley 9343 (labor procedure), Ley 17 and Ley 5905 (CCSS social security), Ley 7184 (adult education), Decreto 43069 (categoría especial temporal 2021), the 2023 asylum restrictions (Decreto 44049)."),
    "qatar": dict(id=1005, iso="QAT", name="Qatar", lang="Arabic", examples=["SAU", "ARE", "JOR"],
        portals="almeezan.qa (Al Meezan, the official legal portal, Arabic with English translations), mol.gov.qa and adlsa.gov.qa (Ministry of Labour), moi.gov.qa, nhrc-qa.org (National Human Rights Committee), "
                "ILO Qatar project reports (ilo.org/qatar). Key instruments: Constitution of 2004 (arts. 18-58), Law No. 21 of 2015 regulating the entry, exit and residence of expatriates (as amended by Law 13/2018 and Law 19/2020 ending the exit permit for most workers), "
                "Law No. 14 of 2004 (Labour Law, as amended by Law 18/2020 on the minimum wage and Law 19/2020 removing the NOC for changing employer), Law No. 15 of 2017 (domestic workers), Law No. 38 of 2005 (nationality), "
                "Law No. 21 of 1989 (marriage to foreigners), Law No. 11 of 2018 (political asylum), Law No. 15 of 2011 (trafficking), Law No. 8 of 2009 (Human Resources), Law No. 16 of 2011 (health insurance) and Law 22/2021, "
                "Law No. 12 of 2004 (associations), Law No. 18 of 2004 (public meetings), Law No. 7 of 2010 (CMC elections), Law 13/2024 (workers' support fund), Decree 95/2019 (wage protection), the 2018 Committees for Settlement of Labour Disputes (Law 13/2017), Ministerial Decision 51/2020 (change of employer)."),
    "china": dict(id=1006, iso="CHN", name="China", lang="Chinese", examples=["RUS", "KOR", "JAP"],
        portals="flk.npc.gov.cn (National Database of Laws and Regulations, official, Chinese), npc.gov.cn (English translations), gov.cn, nia.gov.cn (National Immigration Administration), mohrss.gov.cn, "
                "pkulaw.com and lawinfochina.com (English), chinalawtranslate.com. Key instruments: Constitution (art. 32 protection of foreigners, art. 33 equality), Exit and Entry Administration Law 2012 (出境入境管理法), "
                "Regulations on the Administration of the Entry and Exit of Foreigners 2013 (State Council Order 637), Nationality Law 1980 (国籍法), Measures for the Administration of Examination and Approval of Foreigners' Permanent Residence 2004, "
                "Provisions on the Administration of Employment of Foreigners in China 1996 (amended 2017), Labor Law 1994, Labor Contract Law 2007, Social Insurance Law 2010 and the 2011 Interim Measures on foreigners' participation, "
                "Criminal Law (arts. 240-241 trafficking, 318-322 smuggling), Criminal Procedure Law, Administrative Litigation Law, Civil Procedure Law (art. 5 foreigners' equal litigation rights), Administrative Reconsideration Law, Trade Union Law, Marriage Registration Regulations, Regulations on Religious Affairs 2017, "
                "the 1982 provisional measures on refugees are absent: China is party to the 1951 Convention but has no refugee status determination law (UNHCR does RSD); Law on Assemblies, Processions and Demonstrations 1989."),
}

# ---------- cost + progress ----------
class Meter:
    def __init__(self):
        self.lock = threading.Lock()
        self.z = dict(calls=0, searches=0, reads=0, in_tokens=0, out_tokens=0, cost_usd=0.0)

    def add(self, **kw):
        with self.lock:
            for k, v in kw.items():
                self.z[k] += v

    def snapshot(self):
        with self.lock:
            return dict(self.z)


RUN = Meter()      # this process, this country
RUN_BASE = {}      # dossier_runs row when the process started (restarts keep the totals)
RUN_LOCK = threading.Lock()
COUNTRY = None
DRY = False
_last_beat = {"t": 0}


def log(kind, text, chunk=None, url=None):
    print(f"[{time.strftime('%H:%M:%S')}] {chunk or '-':14} {kind:7} {text[:140]}{(' ' + url) if url else ''}", flush=True)
    if DRY:
        return
    try:
        sb("POST", "dossier_log", [{"country_id": COUNTRY["id"], "chunk": chunk, "kind": kind, "text": text[:600], "url": url}])
    except SystemExit as e:
        print("log failed:", e, file=sys.stderr)


def beat(status=None, note=None, force=False, **fields):
    """Keep dossier_runs current: counters are base + this process's meter."""
    if DRY:
        return
    if not force and time.time() - _last_beat["t"] < 4:
        return
    _last_beat["t"] = time.time()
    z = RUN.snapshot()
    row = {k: RUN_BASE.get(k, 0) + z[k] for k in ("calls", "searches", "reads", "in_tokens", "out_tokens")}
    row["cost_usd"] = round(float(RUN_BASE.get("cost_usd", 0)) + z["cost_usd"], 4)
    row["updated_at"] = "now()"; row["model"] = MODEL
    if status: row["status"] = status
    if note is not None: row["note"] = note
    row.update(fields)
    with RUN_LOCK:
        try:
            sb("PATCH", f"dossier_runs?country_id=eq.{COUNTRY['id']}", row, prefer="return=minimal")
        except SystemExit as e:
            print("beat failed:", e, file=sys.stderr)


# ---------- tools ----------
def fold(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))


def cached_fetch(url):
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".json")
    if os.path.exists(key):
        return json.load(open(key, encoding="utf-8"))
    out = None; err = None
    try:
        final, fmt, data, text = plain_fetch(url)
        out = {"final": final, "fmt": fmt, "text": text, "via": "plain"}
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    if out is None or len(out["text"]) < 800:
        try:
            final, fmt, data, text, _links = browser.browser_fetch(url)
            if fmt == "pdf":
                from find import pdf_text
                text = pdf_text(data)
            if len(text) > len((out or {}).get("text", "")):
                out = {"final": final, "fmt": fmt, "text": text, "via": "browser"}
        except Exception as e:
            err = err or f"{type(e).__name__}: {e}"
    if out is None:
        raise RuntimeError(err or "no content")
    out["text"] = re.sub(r"\n{3,}", "\n\n", out["text"])
    json.dump(out, open(key, "w", encoding="utf-8"), ensure_ascii=False)
    return out


def windows(text, terms, width=900, cap=8):
    ft = fold(text); found = []
    for term in terms:
        t = fold(term.strip())
        if not t:
            continue
        hits = [m.start() for m in re.finditer(re.escape(t), ft)]
        for h in hits[:4]:
            found.append((max(0, h - width), min(len(text), h + len(t) + width), term))
    if not found:
        return [], terms
    found.sort()
    merged = []
    for a, b, term in found:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b), merged[-1][2] + [term])
        else:
            merged.append((a, b, [term]))
    missing = [t for t in terms if not re.search(re.escape(fold(t.strip())), ft)]
    return merged[:cap], missing


def tool_read(inp, chunk):
    url = inp["url"].strip()
    find = (inp.get("find") or "").strip()
    max_chars = int(inp.get("max_chars") or 8000)
    max_chars = max(2000, min(max_chars, 20000))
    page = cached_fetch(url)
    RUN.add(reads=1)
    text = page["text"]
    u = urllib.parse.urlsplit(page["final"] or url)
    title = (u.netloc.replace("www.", "") + u.path)[:90]
    log("read", (title if page["fmt"] == "html" else f"PDF · {title}")[:120], chunk, url)
    head = f"[{page['fmt']}, {len(text):,} characters, fetched via {page['via']}; final URL {page['final']}]\n"
    if not text.strip():
        return head + "The document has no extractable text (a scanned PDF or an empty page)."
    if find:
        terms = [t for t in re.split(r"\s*\|\s*", find) if t.strip()]
        wins, missing = windows(text, terms)
        if not wins:
            return head + f"None of the terms {terms} occur in the text. The document begins:\n\n" + text[:3000]
        out = [head + f"Passages around {', '.join(repr(t) for t in terms if t not in missing)}" + (f" (not found: {missing})" if missing else "") + ":"]
        budget = max_chars
        for a, b, ts in wins:
            seg = text[a:b]
            if budget <= 0:
                break
            seg = seg[:budget]; budget -= len(seg)
            out.append(f"\n--- at character {a:,} ---\n{seg}")
        return "\n".join(out)
    return head + text[:max_chars] + ("\n\n[truncated; use `find` for the articles you need]" if len(text) > max_chars else "")


# Search: Brave when its key works (cheaper, $3-5 per 1,000), else Anthropic's server-side web search
# ($10 per 1,000); Brave's plan returned 402 on 2026-11-06. The reader is ours either way.
SEARCH = os.environ.get("MRD_SEARCH", "auto")   # auto | brave | anthropic


def brave_works():
    try:
        brave_search("test", count=1); return True
    except urllib.error.HTTPError as e:
        print(f"brave search unavailable ({e.code}); using Anthropic web search", flush=True); return False
    except Exception as e:
        print(f"brave search unavailable ({e}); using Anthropic web search", flush=True); return False


def pick_search():
    global SEARCH
    if SEARCH == "auto":
        SEARCH = "brave" if brave_works() else "anthropic"
    return SEARCH


BRAVE_TOOL = {"name": "web_search", "description": "Web search (Brave). Write the query the way a lawyer in the country would: the instrument's official name and number, the article, the portal's name; in the country's language as well as English. Eight results with snippets; `read` the ones that matter.",
              "input_schema": {"type": "object", "additionalProperties": False, "required": ["query"], "properties": {"query": {"type": "string"}}}, "strict": True}
ANTHROPIC_TOOL = {"type": "web_search_20260209", "name": "web_search", "max_uses": 40}


def tool_search(inp, chunk):
    q = inp["query"].strip()
    res = brave_search(q, count=8)
    RUN.add(searches=1, cost_usd=0.005)
    log("search", q, chunk)
    if not res:
        return "No results."
    return "\n".join(f"{i + 1}. {r['title'][:120]}\n   {r['url']}\n   {html.unescape(re.sub('<[^>]+>', '', r['snippet']))[:300]}" for i, r in enumerate(res))


TOOLS_RESEARCH = [
    {"name": "read", "description": "Fetch a web page or PDF and return its text. Pass `find` (terms separated by ' | ', e.g. 'Artigo 122 | reagrupamento familiar') to get the passages around those terms instead of the start of the document; consolidated codes are long, so always use `find` for article numbers. Blocked or script-only sites are retried in a real browser.",
     "input_schema": {"type": "object", "additionalProperties": False, "required": ["url", "find", "max_chars"],
                      "properties": {"url": {"type": "string"}, "find": {"type": ["string", "null"], "description": "terms separated by ' | '"}, "max_chars": {"type": ["integer", "null"], "description": "2000-30000, default 12000"}}}, "strict": True},
]


def submit_schema(qids):
    """One flat array (the API's strict mode caps the number of schema parameters, so no per-question
    objects); `answer` is a free string checked against the indicator's options in validate_submit."""
    impl_opts = [o["answer"] for o in CODEBOOK["implementation_options"]]
    return {"type": "object", "additionalProperties": False, "required": ["answers"], "properties": {"answers": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "answer", "citation", "sources", "international", "implementation", "evidence", "evidence_sources", "confidence", "notes"],
        "properties": {
            "question_id": {"type": "integer", "description": "the q-number of the indicator, e.g. 3 for q3"},
            "answer": {"type": "string", "enum": sorted({o["answer"] for q in qids for o in Q[str(q)]["options"]}), "description": "exactly one of the indicator's options, copied verbatim"},
            "citation": {"type": "string", "description": "the MRD-style citation paragraph (120-350 words)"},
            "sources": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["instrument", "article", "url", "quote"],
                        "properties": {"instrument": {"type": "string", "description": "official name and number in the original language, English in parentheses"},
                                       "article": {"type": "string"}, "url": {"type": ["string", "null"], "description": "where you read it"},
                                       "quote": {"type": ["string", "null"], "description": "the decisive words, translated to English, max 300 chars"}}}},
            "international": {"type": ["string", "null"], "description": "treaties ratified that bear on this right and how they apply domestically, one or two sentences; null if nothing to add"},
            "implementation": {"type": "string", "enum": impl_opts},
            "evidence": {"type": "string", "description": "why this implementation level: the documented practice, 2-5 sentences naming the sources"},
            "evidence_sources": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["title", "url", "year"],
                                 "properties": {"title": {"type": "string"}, "url": {"type": ["string", "null"]}, "year": {"type": ["integer", "null"]}}}},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"], "description": "high = read the provision and the practice evidence; medium = one of the two is second-hand; low = inferred"},
            "notes": {"type": ["string", "null"], "description": "anything a reviewer should know: ambiguity, pending reforms, where the MRD's options fit badly"}}}}}}


def validate_submit(inp, qids):
    """Returns (dict keyed q{id}, None) or (None, error text for the model)."""
    out, problems = {}, []
    for a in inp.get("answers", []):
        qid = a.get("question_id")
        if qid not in qids:
            problems.append(f"question_id {qid} is not in this chunk ({qids})"); continue
        opts = [o["answer"] for o in Q[str(qid)]["options"]]
        if a.get("answer") not in opts:
            # tolerate case/punctuation differences
            m = [o for o in opts if fold(o).rstrip(".") == fold(a.get("answer") or "").rstrip(".")]
            if m:
                a["answer"] = m[0]
            else:
                problems.append(f"q{qid}: answer {a.get('answer')!r} is not one of the options {opts}"); continue
        out[f"q{qid}"] = a
    missing = [q for q in qids if f"q{q}" not in out]
    if missing:
        problems.append(f"missing answers for q{', q'.join(map(str, missing))}")
    if problems:
        return None, "Not accepted:\n- " + "\n- ".join(problems) + "\nCall submit again with every indicator and the options copied verbatim."
    return out, None


MAP_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["overview", "instruments", "treaties", "portals"], "properties": {
    "overview": {"type": "string", "description": "5-10 sentences: the legal framework for migrants, who the migrants are, the permit system, recent reforms, what is distinctive"},
    "instruments": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name_official", "name_en", "number", "year", "kind", "url", "covers"],
        "properties": {"name_official": {"type": "string"}, "name_en": {"type": "string"}, "number": {"type": ["string", "null"]}, "year": {"type": ["integer", "null"]},
                       "kind": {"type": "string", "enum": ["constitution", "statute", "regulation", "decree", "court_decision", "administrative_guidance", "treaty", "other"]},
                       "url": {"type": ["string", "null"], "description": "the consolidated text on the official portal, verified by reading it"},
                       "covers": {"type": "string", "description": "which MRD indicators it bears on, in a few words"}}}},
    "treaties": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name", "status", "year", "domestic_effect"],
        "properties": {"name": {"type": "string"}, "status": {"type": "string", "enum": ["ratified", "acceded", "signed only", "not party"]}, "year": {"type": ["integer", "null"]},
                       "domestic_effect": {"type": "string", "description": "directly applicable / incorporated by statute / dualist, needs legislation"}}}},
    "portals": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name", "url", "how"],
        "properties": {"name": {"type": "string"}, "url": {"type": "string"}, "how": {"type": "string", "description": "how to reach a consolidated text there, in one line"}}}}}}


# ---------- the agent loop ----------
API = "https://api.anthropic.com/v1/messages"


def api_call(body):
    h = {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json",
         "anthropic-beta": "server-side-fallback-2026-07-01"}
    for attempt in range(6):
        try:
            return http("POST", API, body, h, timeout=900)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:600]
            if e.code in (429, 500, 502, 503, 504, 529):
                wait = 15 * (attempt + 1)
                print(f"  api {e.code}, retry in {wait}s: {msg[:200]}", flush=True); time.sleep(wait); continue
            raise RuntimeError(f"api {e.code}: {msg}")
        except Exception as e:
            msg = str(e); print(f"  api error, retry: {msg[:200]}", flush=True); time.sleep(15 * (attempt + 1))
    raise RuntimeError(f"api failed: {msg}")


def account(usage):
    i = usage.get("input_tokens", 0); o = usage.get("output_tokens", 0)
    cw = usage.get("cache_creation_input_tokens", 0) or 0; cr = usage.get("cache_read_input_tokens", 0) or 0
    cost = i / 1e6 * PRICE["in"] + o / 1e6 * PRICE["out"] + cw / 1e6 * PRICE["cache_write"] + cr / 1e6 * PRICE["cache_read"]
    RUN.add(calls=1, in_tokens=i + cw + cr, out_tokens=o, cost_usd=cost)
    return cost


def run_agent(system, user, submit_name, submit_schema_, submit_desc, chunk, max_tool_calls=45, max_tokens=24000, validate=None):
    tools = [BRAVE_TOOL if pick_search() == "brave" else ANTHROPIC_TOOL] + TOOLS_RESEARCH + \
            [{"name": submit_name, "description": submit_desc, "input_schema": submit_schema_, "strict": True}]
    tools[-1]["cache_control"] = {"type": "ephemeral"}
    messages = [{"role": "user", "content": user}]
    sys_blocks = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
    calls = 0; nudged = 0; chunk_meter = dict(calls=0, cost=0.0)
    while True:
        body = {"model": MODEL, "max_tokens": max_tokens, "system": sys_blocks, "tools": tools, "messages": messages,
                "output_config": {"effort": "high"}, "fallbacks": "default", "cache_control": {"type": "ephemeral"}}
        r = api_call(body)
        cost = account(r.get("usage", {})); chunk_meter["calls"] += 1; chunk_meter["cost"] += cost
        beat()
        stop = r.get("stop_reason"); content = r.get("content", [])
        if stop == "refusal":
            raise RuntimeError(f"refusal: {r.get('stop_details')}")
        messages.append({"role": "assistant", "content": content})
        for b in content:
            if b.get("type") == "server_tool_use" and b.get("name") == "web_search":
                calls += 1; RUN.add(searches=1, cost_usd=0.01); chunk_meter["cost"] += 0.01
                log("search", str((b.get("input") or {}).get("query", ""))[:200], chunk)
        uses = [b for b in content if b.get("type") == "tool_use"]
        if stop == "max_tokens":
            messages.append({"role": "user", "content": [{"type": "text", "text": "Your reply was cut off. Continue, and call " + submit_name + " with the complete answers."}]})
            nudged += 1
            if nudged > 2:
                raise RuntimeError("cut off three times")
            continue
        if not uses:
            if stop == "pause_turn":
                continue
            nudged += 1
            if nudged > 2:
                raise RuntimeError("no submit after two nudges")
            messages.append({"role": "user", "content": [{"type": "text", "text": f"Call {submit_name} now with your answers for every indicator (use what you have; mark confidence low where needed)."}]})
            continue
        results = []
        for u in uses:
            if u["name"] == submit_name:
                if validate:
                    ok, err = validate(u["input"])
                    if err:
                        log("note", "submit rejected: " + err[:160], chunk)
                        results.append({"type": "tool_result", "tool_use_id": u["id"], "content": err, "is_error": True})
                        continue
                    return ok, chunk_meter
                return u["input"], chunk_meter
            calls += 1
            try:
                if calls > max_tool_calls:
                    out = f"Tool budget exhausted ({max_tool_calls} calls). Call {submit_name} now with what you have."
                elif u["name"] == "web_search":
                    out = tool_search(u["input"], chunk)
                elif u["name"] == "read":
                    out = tool_read(u["input"], chunk)
                else:
                    out = f"unknown tool {u['name']}"
                results.append({"type": "tool_result", "tool_use_id": u["id"], "content": out})
            except Exception as e:
                results.append({"type": "tool_result", "tool_use_id": u["id"], "content": f"{type(e).__name__}: {str(e)[:400]}", "is_error": True})
        left = max_tool_calls - calls
        if left in (12, 6):
            results.append({"type": "text", "text": f"({left} tool calls left in the budget. Finish with {submit_name}.)"})
        messages.append({"role": "user", "content": results})


# ---------- prompts ----------
def method_text(c):
    return f"""You are coding {c['name']} for the Migrant Rights Database (MRD) of Cornell Law School's Migrant Rights Initiative, following its 2023 Coding Instrument. The MRD's own description: "{CODEBOOK['intro'].split('. For more information')[0]}."

How the MRD codes a country
- Each indicator asks what NATIONAL LAW provides for migrants: the constitution, statutes, regulations and decrees with force of law, binding court decisions. A ratified treaty counts only where it is directly applicable in the country's legal order or incorporated by statute; say so when you rely on one.
- Code the law as it stands today ({TODAY}), from consolidated texts. Read the provision before you cite it; quote the decisive words (translated). Never cite an article number you have not seen in the text.
- Answer each indicator with exactly one of its listed options. "No" means the law is silent or does not provide the protection; general principles (equality clauses, dignity) do not turn a missing specific protection into a "Yes" unless courts have applied them that way to migrants, which you then cite. Where the right exists only for some migrants or on conditions, pick the option that says so.
- Be exact about who is covered: migrants generally, regular (lawfully present) migrants, temporary workers, irregular migrants, asylum seekers and refugees, specific permit classes. Most indicators concern migrants generally; some name regular, temporary or irregular migrants.
- The citation is a paragraph in the MRD's house style, as in the examples: "National law in {c['name']} protects this right in [instrument, article(s)]. [What the provision says, with a short quote.] [Scope, limits, exceptions, which migrants.]" or, for a No, "No protection of this right in {c['name']}. [What the closest provisions do and why they fall short.]" 120-350 words. Name instruments in English with the official name and number in {c['lang']} the first time.
- Implementation asks to what extent the relevant authorities actually give effect to the protection: Effectively Never / Rarely / Sometimes / Usually / Effectively Always, or between two neighbouring levels. "Does Not Apply" only when the protection answer is the lowest option. Judge from documented practice of roughly the last five years: court and ombudsman findings, national human-rights institutions, parliamentary and audit reports, UN treaty bodies and the UPR, UNHCR, ILO, IOM, OECD, EU agencies, Amnesty, Human Rights Watch, national migrant-rights organisations, serious press. Name what you relied on. Where the law is honoured in the main with known gaps, "Usually" is the MRD's usual answer; reserve "Effectively Always" for rights with no documented pattern of breach and "Rarely"/"Effectively Never" for documented systematic failure.
- Confidence: high when you read both the provision and practice evidence; medium when one side is second-hand; low when inferred. Prefer admitting a low-confidence answer to inventing a source."""


def country_text(c, lawmap):
    s = f"""The country
{c['name']}. Legal language: {c['lang']}. Where to find the law: {c['portals']}"""
    if lawmap:
        s += "\n\nLaw map (from the first pass over this country; read the texts yourself before citing):\n" + lawmap.get("overview", "") + "\n"
        for i in lawmap.get("instruments", []):
            s += f"- {i['name_en']} ({i['name_official']}{', ' + i['number'] if i.get('number') else ''}{', ' + str(i['year']) if i.get('year') else ''}; {i['kind']}) — {i['covers']}{' — ' + i['url'] if i.get('url') else ''}\n"
        if lawmap.get("treaties"):
            s += "Treaties: " + "; ".join(f"{t['name']}: {t['status']}{' ' + str(t['year']) if t.get('year') else ''} ({t['domestic_effect']})" for t in lawmap["treaties"]) + "\n"
        if lawmap.get("portals"):
            s += "Portals: " + "; ".join(f"{p['name']} {p['url']} ({p['how']})" for p in lawmap["portals"]) + "\n"
    return s


def indicators_text(c, qids):
    out = ["The indicators in this chunk"]
    for qid in qids:
        q = Q[str(qid)]
        out.append(f"\n### q{qid} · {q['category_name']} · {q['text']}\nQuestion ({q['instrument_q']} of the instrument): {q['text_long']}\nOptions: " +
                   " / ".join(f"\"{o['answer']}\" ({o['score']:g})" for o in q["options"]) +
                   f"\nImplementation question: {q['implementation_text']}")
        ex = [e for e in q["examples"] if e["iso"] in c["examples"]]
        others = [e for e in q["examples"] if e["iso"] not in c["examples"]]
        picks = (ex + others)[:3]
        for e in picks:
            out.append(f"Example, {e['country']}: answer \"{e['answer']}\"; implementation {e['implementation'] or '—'}. Citation: {e['citation'][:900]}")
    return "\n".join(out)


def tools_text(c, n, submit_name):
    return f"""Tools and process
- web_search: query in {c['lang']} and in English; name the instrument, number and article, or the portal; results come with page excerpts, but cite only what you then `read`.
- read: a page or PDF; use `find` with ' | '-separated terms to pull the passages around the articles you need (consolidated codes are long); use it for court decisions, ombudsman and NGO reports too.
- {submit_name}: your final answers, once, for every indicator above.
Work from the official consolidated texts first (the law map names them), then research practice. Reuse what you read: one read of the right act with several `find` terms answers several indicators. Budget: at most {n} search/read calls, usually far fewer are needed. Do not call {submit_name} until you have read the provisions you cite."""


# ---------- phases ----------
def phase_map(c):
    system = method_text(c) + "\n\n" + country_text(c, None) + """

Your task now: build the law map for this country, the first pass before indicator coding. Identify every instrument that bears on migrants' rights across the MRD's 17 categories (vulnerable migrants; life; liberty and detention; legal personhood and documents; due process; victims of crime; expulsion, asylum and non-refoulement; nationality; family reunification; religion; opinion and expression; assembly and association; political participation; equal protection; labor; health and housing; education), verify where their consolidated texts live by reading them, list the human-rights treaties the country is party to and how treaties take effect domestically, and describe the legal framework and migration context in an overview. Prefer the official portal's consolidated version; record the exact URL you read.

Tools: web_search, read (page/PDF; `find` for terms), submit_map (once, at the end). Budget: at most 30 search/read calls."""
    user = f"Build the law map for {c['name']} and submit it with submit_map."
    log("step", "Mapping the law: the instruments, treaties and portals", "map")
    beat(status="mapping", note=f"Mapping {c['name']}'s law: which acts, which portals, which treaties.", force=True)
    out, meter = run_agent(system, user, "submit_map", MAP_SCHEMA, "Submit the law map (once).", "map", max_tool_calls=30)
    if not DRY:
        sb("POST", "dossier_maps", [{"country_id": c["id"], "map": out}], prefer="resolution=merge-duplicates")
    log("step", f"Law map done: {len(out.get('instruments', []))} instruments, {len(out.get('treaties', []))} treaties, ${meter['cost']:.2f}", "map")
    return out


def write_chunk(c, chunk, out):
    answers, cits = [], []
    for qid in chunk["questions"]:
        a = out.get(f"q{qid}")
        if not a:
            continue
        q = Q[str(qid)]
        score = next((o["score"] for o in q["options"] if o["answer"] == a["answer"]), None)
        impl = next((o for o in CODEBOOK["implementation_options"] if o["answer"] == a["implementation"]), None)
        # PostgREST bulk upserts want identical keys on every row
        answers.append({"country_id": c["id"], "year": YEAR, "question_id": qid, "answer": a["answer"], "subscore": score,
                        "confidence": a.get("confidence"), "notes": a.get("notes"), "evidence": None, "sources": None, "experimental": True})
        if q.get("implementation_id"):
            answers.append({"country_id": c["id"], "year": YEAR, "question_id": q["implementation_id"], "answer": a["implementation"],
                            "subscore": impl["score"] if impl else None, "evidence": a.get("evidence"), "sources": a.get("evidence_sources") or [],
                            "confidence": a.get("confidence"), "notes": None, "experimental": True})
        local = "\n".join(f"• {s['instrument']}, {s['article']}" + (f" — {s['url']}" if s.get("url") else "") + (f"\n  «{s['quote']}»" if s.get("quote") else "")
                          for s in a.get("sources") or [])
        cits.append({"id": c["id"] * 1000 + qid, "country_id": c["id"], "question_id": qid, "text_en": a["citation"],
                     "local_text_en": local or None, "international_text_en": a.get("international"), "experimental": True})
        log("answer", f"{q['text']} → {a['answer']} · implementation: {a['implementation']} · {a.get('confidence')}", chunk["key"])
    if DRY:
        print(json.dumps(out, ensure_ascii=False, indent=1)[:6000]); return len(cits)
    sb("POST", "answers?on_conflict=country_id,year,question_id", answers, prefer="resolution=merge-duplicates,return=minimal")
    sb("POST", "citations", cits, prefer="resolution=merge-duplicates,return=minimal")
    return len(cits)


def phase_chunk(c, chunk, lawmap, n_total):
    key = chunk["key"]; qids = chunk["questions"]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not DRY:
        sb("POST", "dossier_chunks", [{"country_id": c["id"], "key": key, "label": chunk["label"], "question_ids": qids, "status": "running",
                                       "started_at": started, "error": None}], prefer="resolution=merge-duplicates,return=minimal")
    log("step", f"Started: {chunk['label']} ({len(qids)} indicators)", key)
    system = "\n\n".join([method_text(c), country_text(c, lawmap), indicators_text(c, qids), tools_text(c, 45, "submit")])
    user = f"Code the {len(qids)} indicators listed for {c['name']} (q{', q'.join(map(str, qids))}) and submit them."
    before = RUN.snapshot()
    try:
        out, meter = run_agent(system, user, "submit", submit_schema(qids), "Submit the answers for every indicator in this chunk (once).", key,
                               validate=lambda inp: validate_submit(inp, qids))
        n = write_chunk(c, chunk, out)
        after = RUN.snapshot()
        if not DRY:
            sb("PATCH", f"dossier_chunks?country_id=eq.{c['id']}&key=eq.{key}",
               {"status": "done", "finished_at": "now()", "calls": meter["calls"], "cost_usd": round(meter["cost"], 4),
                "searches": after["searches"] - before["searches"], "reads": after["reads"] - before["reads"]}, prefer="return=minimal")
        log("step", f"Done: {chunk['label']} · {n} indicators · ${meter['cost']:.2f}", key)
        return n
    except Exception as e:
        log("error", f"{chunk['label']}: {type(e).__name__}: {str(e)[:300]}", key)
        if not DRY:
            sb("PATCH", f"dossier_chunks?country_id=eq.{c['id']}&key=eq.{key}", {"status": "error", "error": str(e)[:800], "finished_at": "now()"}, prefer="return=minimal")
        raise


# ---------- the Claude Code runner (cc/run.mjs) talks to this file through these ----------
def map_prompt(c):
    system = method_text(c) + "\n\n" + country_text(c, None) + """

Your task now: build the law map for this country, the first pass before indicator coding. Identify every instrument that bears on migrants' rights across the MRD's 17 categories (vulnerable migrants; life; liberty and detention; legal personhood and documents; due process; victims of crime; expulsion, asylum and non-refoulement; nationality; family reunification; religion; opinion and expression; assembly and association; political participation; equal protection; labor; health and housing; education), verify where their consolidated texts live by reading them, list the human-rights treaties the country is party to and how treaties take effect domestically, and describe the legal framework and migration context in an overview. Prefer the official portal's consolidated version; record the exact URL you read.

Tools: WebSearch, read (page/PDF; `find` for terms). Budget: at most 30 search/read calls. When done, answer with the law map as JSON (the schema is enforced)."""
    return {"system": system, "user": f"Build the law map for {c['name']}.", "schema": MAP_SCHEMA}


def chunk_prompt(c, chunk, lawmap):
    qids = chunk["questions"]
    tools = f"""Tools and process
- WebSearch: query in {c['lang']} and in English; name the instrument, number and article, or the portal; cite only what you then `read`.
- read: a page or PDF; use `find` with ' | '-separated terms to pull the passages around the articles you need (consolidated codes are long); use it for court decisions, ombudsman and NGO reports too.
Work from the official consolidated texts first (the law map names them), then research practice. Reuse what you read: one read of the right act with several `find` terms answers several indicators. Budget: at most 30 search/read calls, usually far fewer are needed; prefer one `read` with several `find` terms over many. When every indicator is answered, give your final answer as JSON (the schema is enforced): one entry per indicator, with the option copied verbatim. Do not answer until you have read the provisions you cite."""
    system = "\n\n".join([method_text(c), country_text(c, lawmap), indicators_text(c, qids), tools])
    user = f"Code the {len(qids)} indicators listed for {c['name']} (q{', q'.join(map(str, qids))}) and answer with the JSON."
    return {"key": chunk["key"], "label": chunk["label"], "qids": qids, "system": system, "user": user, "schema": submit_schema(qids)}


def emit_prompts(c, path, only=None, redo=False):
    maps = sb("GET", "dossier_maps", params={"country_id": f"eq.{c['id']}", "select": "map"})
    lawmap = maps[0]["map"] if maps else None
    done = {r["key"] for r in sb_all(f"dossier_chunks?select=key&country_id=eq.{c['id']}&status=eq.done")} if not redo else set()
    chunks = [ch for ch in CODEBOOK["chunks"] if (not only or ch["key"] in only) and ch["key"] not in done]
    out = {"country": {k: c[k] for k in ("id", "iso", "name", "lang")}, "slug": c_slug(c), "map": None if lawmap else map_prompt(c),
           "chunks": [chunk_prompt(c, ch, lawmap) for ch in chunks] if lawmap else [], "chunks_total": len(CODEBOOK["chunks"]), "done": sorted(done)}
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{c['name']}: {'map job' if out['map'] else str(len(out['chunks'])) + ' chunk jobs'} written to {path} ({len(done)} chunks done)")


def c_slug(c):
    return next(k for k, v in COUNTRIES.items() if v is c)


def ingest_map(c, path):
    d = json.load(open(path, encoding="utf-8"))
    out = d["output"]
    sb("POST", "dossier_maps", [{"country_id": c["id"], "map": out}], prefer="resolution=merge-duplicates")
    log("step", f"Law map done: {len(out.get('instruments', []))} instruments, {len(out.get('treaties', []))} treaties", "map")


def ingest_chunk(c, key, path):
    """The runner's result file: {output: <structured output>, meta: {cost_usd, calls, searches, reads, in_tokens, out_tokens, error}}."""
    d = json.load(open(path, encoding="utf-8"))
    chunk = next(ch for ch in CODEBOOK["chunks"] if ch["key"] == key)
    meta = d.get("meta", {})
    counters = {k: meta.get(k, 0) for k in ("calls", "searches", "reads", "in_tokens", "out_tokens")}
    counters["cost_usd"] = round(float(meta.get("cost_usd", 0)), 4)
    if d.get("output") is None:
        err = meta.get("error") or "no output"
        sb("PATCH", f"dossier_chunks?country_id=eq.{c['id']}&key=eq.{key}", {"status": "error", "error": err[:800], "finished_at": "now()", **counters}, prefer="return=minimal")
        log("error", f"{chunk['label']}: {err[:200]}", key); return 1
    ok, err = validate_submit(d["output"], chunk["questions"])
    if err:
        sb("PATCH", f"dossier_chunks?country_id=eq.{c['id']}&key=eq.{key}", {"status": "error", "error": err[:800], "finished_at": "now()", **counters}, prefer="return=minimal")
        log("error", f"{chunk['label']}: {err[:200]}", key); return 1
    n = write_chunk(c, chunk, ok)
    sb("PATCH", f"dossier_chunks?country_id=eq.{c['id']}&key=eq.{key}", {"status": "done", "finished_at": "now()", "error": None, **counters}, prefer="return=minimal")
    log("step", f"Done: {chunk['label']} · {n} indicators · ${counters['cost_usd']:.2f} API-equivalent", key)
    return 0


def main():
    global COUNTRY, RUN_BASE, DRY
    ap = argparse.ArgumentParser()
    ap.add_argument("slug"); ap.add_argument("--only"); ap.add_argument("--redo", action="store_true")
    ap.add_argument("--workers", type=int, default=3); ap.add_argument("--dry", action="store_true"); ap.add_argument("--map-only", action="store_true")
    ap.add_argument("--emit-prompts"); ap.add_argument("--ingest-map"); ap.add_argument("--ingest-chunk", nargs=2, metavar=("KEY", "FILE"))
    ap.add_argument("--read", metavar="URL"); ap.add_argument("--find"); ap.add_argument("--max-chars", type=int, default=12000)
    a = ap.parse_args()
    c = COUNTRIES[a.slug]; COUNTRY = c; DRY = a.dry
    if a.read:
        DRY = True
        print(tool_read({"url": a.read, "find": a.find, "max_chars": a.max_chars}, "read")); return
    if a.emit_prompts:
        emit_prompts(c, a.emit_prompts, only=a.only.split(",") if a.only else None, redo=a.redo); return
    if a.ingest_map:
        ingest_map(c, a.ingest_map); return
    if a.ingest_chunk:
        sys.exit(ingest_chunk(c, a.ingest_chunk[0], a.ingest_chunk[1]))
    chunks = CODEBOOK["chunks"]
    if a.only:
        chunks = [ch for ch in chunks if ch["key"] in a.only.split(",")]
    if not DRY:
        RUN_BASE = (sb("GET", "dossier_runs", params={"country_id": f"eq.{c['id']}", "select": "*"}) or [{}])[0]
        done_keys = {r["key"] for r in sb_all(f"dossier_chunks?select=key&country_id=eq.{c['id']}&status=eq.done")} if not a.redo else set()
        if RUN_BASE.get("status") in (None, "preparing", "queued") or not RUN_BASE.get("started_at"):
            sb("PATCH", f"dossier_runs?country_id=eq.{c['id']}", {"status": "mapping", "started_at": "now()", "chunks_total": len(CODEBOOK["chunks"]),
               "questions_total": len(Q), "note": None}, prefer="return=minimal")
            RUN_BASE = (sb("GET", "dossier_runs", params={"country_id": f"eq.{c['id']}", "select": "*"}) or [{}])[0]
        maps = sb("GET", "dossier_maps", params={"country_id": f"eq.{c['id']}", "select": "map"})
        lawmap = maps[0]["map"] if maps and not a.redo else None
    else:
        done_keys = set(); lawmap = None
    if lawmap is None:
        lawmap = phase_map(c)
    if a.map_only:
        print(json.dumps(lawmap, ensure_ascii=False, indent=1)); return
    todo = [ch for ch in chunks if ch["key"] not in done_keys]
    print(f"{c['name']}: {len(todo)} chunks to code ({len(done_keys)} already done)", flush=True)
    beat(status="coding", note=f"Coding {c['name']}: {len(todo)} chunks of indicators, {a.workers} at a time.", force=True,
         chunks_done=len(done_keys), questions_done=sum(len(ch["questions"]) for ch in CODEBOOK["chunks"] if ch["key"] in done_keys))
    done_n = len(done_keys); q_done = sum(len(ch["questions"]) for ch in CODEBOOK["chunks"] if ch["key"] in done_keys)
    errors = 0
    lock = threading.Lock()

    def work(ch):
        nonlocal done_n, q_done, errors
        try:
            n = phase_chunk(c, ch, lawmap, len(chunks))
            with lock:
                done_n += 1; q_done += n
            beat(chunks_done=done_n, questions_done=q_done, note=f"Coding {c['name']}: {done_n} of {len(CODEBOOK['chunks'])} chunks done.", force=True)
        except Exception:
            with lock:
                errors += 1
    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(work, todo))
    try:
        browser.stop()
    except Exception:
        pass
    z = RUN.snapshot()
    status = "coded" if errors == 0 else "error"
    beat(status=status if not DRY else None, force=True, chunks_done=done_n, questions_done=q_done,
         note=(f"All {len(CODEBOOK['chunks'])} chunks coded; scoring next." if errors == 0 else f"{errors} chunk(s) failed; rerun compile.py {a.slug} to retry them."))
    print(f"done: {done_n} chunks, {errors} errors, {z['calls']} calls, {z['searches']} searches, {z['reads']} reads, ${z['cost_usd']:.2f}", flush=True)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
