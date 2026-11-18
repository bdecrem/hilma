"""Due diligence over a compiled dossier (PLAN.md): the source check, the second reader, the redo of
the shaky answers, and the decision. The sessions run through Claude Code (cc/check.mjs); this file
builds their prompts, takes their results, decides, and writes.

    python3 audit.py <slug> --seed                          # one dossier_checks row per indicator, from work/
    python3 audit.py <slug> --emit sources|verify|redo|sources2 <path> [--only key,key] [--again]
    python3 audit.py <slug> --ingest <phase> <key> <file>
    python3 audit.py <slug> --decide [--dry]                # verified / changed / review; writes changes, rescores
    python3 audit.py <slug> --resolve <qid> original|redo "<reason>" --by <name>    # a person's decision
    python3 audit.py <slug> --report

The rule: no answer is published unless its sources were actually read and a second reader agrees.
"""
import argparse, copy, json, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "laws"))
from lib import sb, sb_all                     # noqa: E402
import compile as C                            # noqa: E402
from compile import COUNTRIES, CODEBOOK, Q, YEAR   # noqa: E402

WORK = os.path.join(HERE, "work")
MODELS = {"sources": ("claude-sonnet-5-5", "low"), "sources2": ("claude-sonnet-5-5", "low"),
          "verify": ("claude-opus-5-5", "high"), "redo": ("claude-fable-5-2", "high")}
GROUPS = ["all_migrants", "regular_migrants", "irregular_migrants", "refugees_asylum_seekers"]
IMPL = {o["answer"]: o["score"] for o in CODEBOOK["implementation_options"]}
CHUNK_OF = {q: ch["key"] for ch in CODEBOOK["chunks"] for q in ch["questions"]}
FLAG_RE = re.compile(r"(not read|was not read|did not read|not re-read|inferred|borderline|press (summary|report|release)|second-hand|secondary source|"
                     r"could not (be )?(read|open|verif)|not verified|as reported|blocked|captcha)", re.I)


# ---------- state ----------
def rows(c):
    return {r["question_id"]: r for r in sb_all(f"dossier_checks?select=*&country_id=eq.{c['id']}")}


def patch(c, qid, **fields):
    fields["updated_at"] = "now()"
    sb("PATCH", f"dossier_checks?country_id=eq.{c['id']}&question_id=eq.{qid}", fields, prefer="return=minimal")


def seed(c, slug):
    have = rows(c)
    new = []
    for ch in CODEBOOK["chunks"]:
        f = os.path.join(WORK, f"{slug}-{ch['key']}.json")
        if not os.path.exists(f):
            print(f"  missing {f}"); continue
        for a in json.load(open(f, encoding="utf-8"))["output"]["answers"]:
            if a["question_id"] not in have:
                new.append({"country_id": c["id"], "question_id": a["question_id"], "status": "pending", "original": a})
    if new:
        sb("POST", "dossier_checks", new, prefer="resolution=ignore-duplicates,return=minimal")
    print(f"{c['name']}: {len(new)} rows seeded, {len(have)} already there")


def read_log(c):
    """url -> set of session tags that opened it (the coder's chunk key, or 'redo:<key>')."""
    out = {}
    for r in sb_all(f"dossier_log?select=chunk,url&country_id=eq.{c['id']}&kind=eq.read&url=not.is.null"):
        out.setdefault(norm_url(r["url"]), set()).add(r["chunk"])
    return out


def norm_url(u):
    try:
        s = urllib.parse.urlsplit(u.strip())
        path = urllib.parse.unquote(s.path).rstrip("/")
        return f"{s.netloc.lower().removeprefix('www.')}{path}?{s.query}" if s.query else f"{s.netloc.lower().removeprefix('www.')}{path}"
    except Exception:
        return u.strip()


# ---------- the answer as text ----------
def answer_block(a, with_notes):
    q = Q[str(a["question_id"])]
    s = [f"### q{a['question_id']} · {q['category_name']} · {q['text']}",
         f"Question: {q['text_long']}",
         f"Answer given: \"{a['answer']}\"",
         f"Citation: {a['citation']}", "Legal sources cited:"]
    for i, x in enumerate(a.get("sources") or [], 1):
        s.append(f"  L{i}. {x['instrument']}, {x['article']} — {x.get('url') or 'NO URL'}\n      quoted (English translation): {x.get('quote') or '—'}")
    if a.get("international"):
        s.append(f"International: {a['international']}")
    s.append(f"Implementation rating given: \"{a['implementation']}\"")
    s.append(f"Evidence: {a.get('evidence') or '—'}")
    s.append("Evidence sources:")
    for i, x in enumerate(a.get("evidence_sources") or [], 1):
        s.append(f"  E{i}. {x['title']}{' (' + str(x['year']) + ')' if x.get('year') else ''} — {x.get('url') or 'NO URL'}")
    if with_notes:
        s.append(f"Coder's confidence: {a.get('confidence')}. Coder's notes: {a.get('notes') or '—'}")
    return "\n".join(s)


# ---------- phase 1: the source check ----------
SOURCES_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["checks"], "properties": {"checks": {"type": "array", "items": {
    "type": "object", "additionalProperties": False, "required": ["question_id", "answer_covers", "legal", "evidence", "evidence_fits", "evidence_gap"], "properties": {
        "evidence_fits": {"type": "string", "enum": ["yes", "partly", "no", "not_applicable"],
                          "description": "taking the practice sources together: are they about the people this right matters for in practice? yes = they are (detention evidence about detained irregular migrants and asylum seekers fits a detention indicator); partly = they cover some of those people and leave a group out; no = they are about a different or much narrower group than the rating speaks for, or none shows practice; not_applicable = the rating is Does Not Apply"},
        "evidence_gap": {"type": ["string", "null"], "description": "one line: which people the rating speaks for that no practice source covers; null if none"},
        "question_id": {"type": "integer"},
        "answer_covers": {"type": "array", "items": {"type": "string", "enum": GROUPS},
                          "description": "which people the protection answer is about, from the indicator's wording and the answer: all_migrants unless it names a narrower group"},
        "legal": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["n", "opened", "page_is", "quote_found", "passage", "note"], "properties": {
            "n": {"type": "integer", "description": "the L-number"},
            "opened": {"type": "boolean", "description": "the URL returned readable text"},
            "page_is": {"type": "string", "enum": ["the_text_itself", "official_summary", "secondary_account", "unrelated", "unreadable", "no_url"],
                        "description": "the_text_itself = the full text of the law, regulation or court decision cited, on any site, official or a reproduction (vLex, Justia, a law firm's library); official_summary = the issuing body's own summary or press release; secondary_account = an article, commentary, guide or description by someone else, even one that quotes passages"},
            "quote_found": {"type": "string", "enum": ["yes", "partly", "no", "not_checked"],
                            "description": "the quoted words (a translation) are in the text at the cited article: yes = same meaning, partly = the article is there but says less or something different, no = not there"},
            "passage": {"type": ["string", "null"], "description": "the passage in the original language that corresponds to the quote, max 400 characters; null if not found"},
            "note": {"type": ["string", "null"], "description": "one line if something is off (wrong article number, repealed, different instrument); else null"}}}},
        "evidence": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["n", "opened", "shows", "groups", "supports_claim", "note"], "properties": {
            "n": {"type": "integer", "description": "the E-number"},
            "opened": {"type": "boolean"},
            "shows": {"type": "string", "enum": ["practice", "law_only", "neither", "unreadable", "no_url"],
                      "description": "practice = it reports what authorities actually do (findings, data, cases, monitoring); law_only = it is a law, regulation, or a description of what the rules say"},
            "groups": {"type": "array", "items": {"type": "string", "enum": GROUPS}, "description": "the people this source is about; empty if none"},
            "supports_claim": {"type": "string", "enum": ["yes", "partly", "no", "not_checked"], "description": "what the Evidence paragraph attributes to this source is in it"},
            "note": {"type": ["string", "null"]}}}}}}}}}


def sources_prompt(c, key, answers, redo):
    system = f"""You are checking the sources of a legal dossier on migrants' rights in {c['name']} (legal language: {c['lang']}). Another agent coded each indicator below and cited its sources. Your job is narrow: open every cited URL and report what is actually there. You do not judge whether the answers are right.

For each legal source (L1, L2, ...):
- Open the URL with the `read` tool. The quote you are given is an English translation, so search with `find` for the article number in {c['lang']} ("Artículo 31", "Art. 31", "§ 31" and the like) or for distinctive original-language words, several terms at once separated by ' | '. Try a second `find` before reporting "no".
- Say what the page is: the text itself (the law, regulation or court decision that is cited), the issuing body's own summary, or somebody else's account of it (press, NGO, law firm). What matters is what is on the page, not whose site it is: the full text of the act or the judgment reproduced on a legal database, a law firm's library, a UN site or a university is the text itself. A news article, a commentary, a guide or a summary is a secondary account even when it quotes passages.
- Say whether the quoted words are in the text at the cited article, and copy the matching passage in the original language.
For each evidence source (E1, E2, ...):
- Open it and say whether it reports practice (what authorities actually do) or only what the law says, which people it is about, and whether it contains what the Evidence paragraph attributes to it.
Also say, per indicator, which people the protection answer covers, and whether the practice sources taken together are about the people the right matters for in practice (evidence_fits). Judge that by the indicator: evidence about detained irregular migrants and asylum seekers fits an indicator on detention; evidence only about recognised refugees does not fit an indicator on migrant workers' pay or on access for migrants generally.

One `read` with several `find` terms covers several articles of the same act; the same URL cited under several indicators needs opening once. Report every L and E number of every indicator. When done, answer with the JSON (the schema is enforced).

The dossier's answers
""" + "\n\n".join(answer_block(a, False) for a in answers)
    qids = [a["question_id"] for a in answers]
    return {"key": key, "label": f"Source check: {key}", "qids": qids, "system": system, "web": False, "max_turns": 150,
            "user": f"Check the sources of q{', q'.join(map(str, qids))} and answer with the JSON.", "schema": SOURCES_SCHEMA}


def judge_sources(a, chk, log, tags):
    """The mechanical verdict. Returns (pass, failures, annotated)."""
    fails, warns = [], []
    legal = {x["n"]: x for x in chk.get("legal", [])}
    srcs = a.get("sources") or []
    if not srcs:
        fails.append("no legal source cited")
    for i, s in enumerate(srcs, 1):
        r = legal.get(i)
        name = f"L{i} {s['instrument'][:60]}"
        if not s.get("url"):
            fails.append(f"{name}: cited without a URL"); continue
        opened_by = log.get(norm_url(s["url"]), set())
        if not r:
            fails.append(f"{name}: not checked"); continue
        r["in_read_log"] = bool(opened_by & tags)
        if not r["in_read_log"] and not (r["page_is"] == "the_text_itself" and r["quote_found"] == "yes"):
            fails.append(f"{name}: the coder never opened this page, and the check could not confirm the quote in the text itself")
        elif not r["in_read_log"]:
            warns.append(f"{name}: cited without being opened in that session; the check found the quoted words in the text itself")
        if r["page_is"] in ("secondary_account", "unrelated"):
            fails.append(f"{name}: read as a {r['page_is'].replace('_', ' ')}, not the text itself")
        elif r["page_is"] in ("unreadable", "no_url") or not r["opened"]:
            fails.append(f"{name}: the page could not be read")
        elif r["quote_found"] == "no":
            fails.append(f"{name}: the quoted words are not at the cited article")
    if IMPL.get(a["implementation"]) is not None:
        ev = {x["n"]: x for x in chk.get("evidence", [])}
        practice_groups = set(); n_practice = 0
        for i, s in enumerate(a.get("evidence_sources") or [], 1):
            r = ev.get(i)
            if not r:
                continue
            r["in_read_log"] = bool(log.get(norm_url(s["url"]), set()) & tags) if s.get("url") else False
            if r["shows"] == "practice" and r["opened"] and r["in_read_log"] and r["supports_claim"] in ("yes", "partly"):
                practice_groups |= set(r["groups"]); n_practice += 1
        if not n_practice:
            fails.append("implementation: no source that was read shows practice")
        elif chk.get("evidence_fits") == "no":
            fails.append("implementation: the practice evidence is about other people than the rating speaks for" + (f" ({chk['evidence_gap']})" if chk.get("evidence_gap") else ""))
        elif chk.get("evidence_fits") == "partly":
            warns.append("implementation: the practice evidence leaves a group out" + (f" ({chk['evidence_gap']})" if chk.get("evidence_gap") else ""))
    flags = sorted({m.group(0).lower() for m in FLAG_RE.finditer(a.get("notes") or "")})
    return (not fails), fails, {**chk, "pass": not fails, "failures": fails, "warnings": warns, "note_flags": flags}


# ---------- phase 2: the second reader ----------
def verify_schema(qids):
    return {"type": "object", "additionalProperties": False, "required": ["reviews"], "properties": {"reviews": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "protection_verdict", "protection_answer", "protection_reason", "implementation_verdict", "implementation_answer",
                     "evidence_is_practice", "evidence_covers_same_people", "implementation_reason", "read"],
        "properties": {
            "question_id": {"type": "integer"},
            "protection_verdict": {"type": "string", "enum": ["confirmed", "wrong", "not_supported"],
                                   "description": "confirmed = you read the law and the answer is right; wrong = the law gives a different option; not_supported = the sources cited do not establish it and you could not establish it either"},
            "protection_answer": {"type": "string", "enum": sorted({o["answer"] for q in qids for o in Q[str(q)]["options"]}), "description": "the option you would give, copied verbatim"},
            "protection_reason": {"type": "string", "description": "2-5 sentences: what you read (instrument, article) and why the answer stands or falls"},
            "implementation_verdict": {"type": "string", "enum": ["confirmed", "wrong", "not_supported", "not_applicable"]},
            "implementation_answer": {"type": "string", "enum": list(IMPL), "description": "the level you would give"},
            "evidence_is_practice": {"type": "boolean", "description": "the evidence relied on reports what authorities do, not only what the rules say"},
            "evidence_covers_same_people": {"type": "boolean", "description": "the evidence is about the same people the protection answer covers"},
            "implementation_reason": {"type": "string", "description": "2-4 sentences"},
            "read": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["title", "url"],
                     "properties": {"title": {"type": "string"}, "url": {"type": "string"}}}, "description": "what you opened for this indicator"}}}}}}


def verify_prompt(c, key, answers, lawmap):
    qids = [a["question_id"] for a in answers]
    task = f"""Your task: you are the second reader

Another coder has already answered these indicators for {c['name']}; the answers follow. Nothing here is published unless a second reader agrees with it, and you are that reader. Assume nothing is right.

For each indicator:
- Read the primary sources yourself with `read`: the article of the law, the regulation, the decision itself. Do not take the citation's word for what a provision says. Then look for what would overturn the answer: a later amendment or repeal, an exception elsewhere in the act, a provision in another instrument, a court decision that reads it differently. Search the official portals for it.
- Protection: is the option right under the MRD's rules above? "confirmed" only if you read the law and would give the same option. "wrong" if you would give a different one. "not_supported" if the sources do not establish it and your own search did not either.
- A court decision carries a Yes only if the decision itself was read and states a general rule; check that it was the decision and not a report of it.
- Implementation, judged separately, on two questions first: is the evidence about practice (a regulation is not evidence that it is applied), and is it about the same people the answer covers (a source on refugees says nothing about labour migrants)? If either fails and you find nothing better, "not_supported". If you find evidence that points to a different level, "wrong" with your level. "not_applicable" when the protection answer is the lowest option.
- Give your own answer for both in every case, and say in the reasons exactly what you read.

Tools: WebSearch (in {c['lang']} and in English), and `read` for pages and PDFs (`find` with ' | '-separated terms for article numbers). One read of the right act with several `find` terms covers several indicators. When every indicator is reviewed, answer with the JSON (the schema is enforced).

The first coder's answers
""" + "\n\n".join(answer_block(a, False) for a in answers)
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), C.indicators_text(c, qids), task])
    return {"key": key, "label": f"Second reader: {key}", "qids": qids, "system": system, "web": True, "max_turns": 120,
            "user": f"Review q{', q'.join(map(str, qids))} for {c['name']} and answer with the JSON.", "schema": verify_schema(qids)}


def verifier_ok(v):
    return v["protection_verdict"] == "confirmed" and v["implementation_verdict"] in ("confirmed", "not_applicable")


# ---------- phase 3: the redo ----------
def redo_schema(qids):
    s = copy.deepcopy(C.submit_schema(qids))
    item = s["properties"]["answers"]["items"]
    ev = item["properties"]["evidence_sources"]["items"]
    ev["properties"]["shows"] = {"type": "string", "enum": ["practice", "law_only"], "description": "practice = it reports what authorities actually do; law_only = it says what the rules are"}
    ev["properties"]["groups"] = {"type": "array", "items": {"type": "string", "enum": GROUPS}, "description": "the people this source is about"}
    ev["required"] = ["title", "url", "year", "shows", "groups"]
    item["properties"]["answer_covers"] = {"type": "array", "items": {"type": "string", "enum": GROUPS}, "description": "the people the protection answer covers"}
    item["properties"]["what_changed"] = {"type": "string", "description": "one or two plain sentences for the record: what you kept or changed against the first coding and why"}
    item["required"] = item["required"] + ["answer_covers", "what_changed"]
    return s


def needs_redo(row):
    why = []
    o = row["original"]
    if o.get("confidence") == "low":
        why.append("the coder marked it low confidence")
    sc = row.get("source_check")
    if sc and not sc.get("pass"):
        why += [f"source check: {f}" for f in sc.get("failures", [])]
    v = row.get("verifier")
    if v and not verifier_ok(v):
        if v["protection_verdict"] != "confirmed":
            why.append(f"second reader: protection {v['protection_verdict'].replace('_', ' ')} (would answer \"{v['protection_answer']}\")")
        if v["implementation_verdict"] not in ("confirmed", "not_applicable"):
            why.append(f"second reader: implementation {v['implementation_verdict'].replace('_', ' ')} (would answer \"{v['implementation_answer']}\")")
    return why


def redo_prompt(c, key, items, lawmap):
    qids = [r["question_id"] for r in items]
    first = []
    for r in items:
        o = r["original"]; b = [answer_block(o, True), "Why it is being coded again:"] + [f"  - {w}" for w in r["failed"]]
        sc = r.get("source_check") or {}
        for x in sc.get("legal", []):
            if x.get("note") or x.get("page_is") not in ("the_text_itself",) or x.get("quote_found") != "yes":
                b.append(f"  Source check on L{x['n']}: page is {x['page_is'].replace('_', ' ')}; quote found: {x['quote_found']}" + (f"; {x['note']}" if x.get("note") else ""))
        for x in sc.get("evidence", []):
            b.append(f"  Source check on E{x['n']}: shows {x['shows'].replace('_', ' ')}; about {', '.join(x['groups']).replace('_', ' ') or 'no group'}; supports the claim: {x['supports_claim']}" + (f"; {x['note']}" if x.get("note") else ""))
        v = r.get("verifier")
        if v:
            b.append(f"  Second reader on protection ({v['protection_verdict'].replace('_', ' ')}; would answer \"{v['protection_answer']}\"): {v['protection_reason']}")
            b.append(f"  Second reader on implementation ({v['implementation_verdict'].replace('_', ' ')}; would answer \"{v['implementation_answer']}\"): {v['implementation_reason']}")
        first.append("\n".join(b))
    task = f"""Your task: code these indicators again

They were coded once and did not hold up: the coder was unsure, or a cited source turned out not to be what it was cited as, or a second reader disagreed. The first coding, the source check's findings and the second reader's reasons are below. Reach your own conclusion from the primary sources; you may keep the answer or change it.

- Read every instrument you rely on in the text itself, in full where it matters: the article and the articles around it, the regulation, the court decision and not a report of it. There is no limit on how much you read. Official portals first ({c['portals'].split('. Key instruments')[0]}).
- A court decision carries a Yes only if you read the decision itself and it states a general rule that reaches the indicator's situation.
- Implementation: find evidence of practice (findings, data, monitoring, cases) about the same people the answer covers. For each evidence source say what it shows (practice or law_only) and which people it is about. A rating whose evidence is law only, or about a different group, will be rejected; if that is all that exists, rate from it, say so, and mark confidence low.
- Cite only pages you opened with `read` in this session, with the URL you opened. Every source is checked again afterwards against what you opened.
- Where the second reader objected, deal with the objection in the notes.

Tools: WebSearch (in {c['lang']} and in English), `read` (`find` with ' | '-separated terms for article numbers). Answer with the JSON (the schema is enforced), one entry per indicator, options copied verbatim.

The first coding and what was found
""" + "\n\n".join(first)
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), C.indicators_text(c, qids), task])
    return {"key": key, "label": f"Redo: {key}", "qids": qids, "system": system, "web": True, "max_turns": 200,
            "user": f"Code q{', q'.join(map(str, qids))} for {c['name']} again and answer with the JSON.", "schema": redo_schema(qids)}


# ---------- emit / ingest ----------
def lawmap_of(c):
    m = sb("GET", "dossier_maps", params={"country_id": f"eq.{c['id']}", "select": "map"})
    return m[0]["map"] if m else None


def emit(c, slug, phase, path, only=None, again=False):
    R = rows(c)
    if not R:
        sys.exit("no rows: run --seed first")
    done = set() if again else {r["key"] for r in sb_all(f"dossier_check_runs?select=key&country_id=eq.{c['id']}&phase=eq.{phase}&status=eq.done")}
    lawmap = lawmap_of(c) if phase in ("verify", "redo") else None
    jobs = []
    for ch in CODEBOOK["chunks"]:
        key = ch["key"]
        if (only and key not in only) or key in done:
            continue
        rs = [R[q] for q in ch["questions"] if q in R]
        if phase == "sources":
            job = sources_prompt(c, key, [r["original"] for r in rs], False) if rs else None
        elif phase == "verify":
            job = verify_prompt(c, key, [r["original"] for r in rs], lawmap) if rs else None
        elif phase == "redo":
            items = []
            for r in rs:
                if r["status"] != "pending" or r.get("redo"):
                    continue
                if not (r.get("source_check") and r.get("verifier")):
                    continue                      # both checks first
                why = needs_redo(r)
                if why:
                    r["failed"] = why; patch(c, r["question_id"], failed=why); items.append(r)
            job = redo_prompt(c, key, items, lawmap) if items else None
        elif phase == "sources2":
            rs2 = [r for r in rs if r.get("redo") and not r.get("redo_source_check")]
            job = sources_prompt(c, key, [r["redo"] for r in rs2], True) if rs2 else None
        else:
            sys.exit(f"unknown phase {phase}")
        if job:
            job["model"], job["effort"] = MODELS[phase]
            job["tag"] = f"{phase}:{key}"
            jobs.append(job)
    out = {"country": {k: c[k] for k in ("id", "iso", "name", "lang")}, "slug": slug, "phase": phase, "jobs": jobs}
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{c['name']} · {phase}: {len(jobs)} jobs, {sum(len(j['qids']) for j in jobs)} indicators ({len(done)} chunks already done)")


def ingest(c, slug, phase, key, path):
    d = json.load(open(path, encoding="utf-8"))
    out = d.get("output")
    if out is None:
        print(f"{phase}:{key} no output: {(d.get('meta') or {}).get('error')}"); return 1
    R = rows(c)
    qids = next(ch["questions"] for ch in CODEBOOK["chunks"] if ch["key"] == key)
    if phase in ("sources", "sources2"):
        log = read_log(c)
        tags = {key} if phase == "sources" else {f"redo:{key}"}
        got = {x["question_id"]: x for x in out.get("checks", [])}
        n = 0
        for q in qids:
            r = R.get(q)
            a = r and (r["original"] if phase == "sources" else r.get("redo"))
            if not a or q not in got:
                continue
            ok, fails, ann = judge_sources(a, got[q], log, tags)
            patch(c, q, **({"source_check": ann} if phase == "sources" else {"redo_source_check": ann})); n += 1
            print(f"  q{q} {'pass' if ok else 'FAIL'}" + ("" if ok else " · " + "; ".join(fails)[:300]))
        missing = [q for q in qids if q in R and (R[q]["original"] if phase == "sources" else R[q].get("redo")) and q not in got]
        if missing:
            print(f"  missing q{missing}"); return 1
    elif phase == "verify":
        got = {x["question_id"]: x for x in out.get("reviews", [])}
        for q in qids:
            if q in got and q in R:
                v = got[q]
                opts = [o["answer"] for o in Q[str(q)]["options"]]
                if v["protection_answer"] not in opts:
                    print(f"  q{q}: answer {v['protection_answer']!r} is not an option of this indicator"); return 1
                patch(c, q, verifier=v)
                print(f"  q{q} protection {v['protection_verdict']} · implementation {v['implementation_verdict']}")
        missing = [q for q in qids if q in R and q not in got]
        if missing:
            print(f"  missing q{missing}"); return 1
    elif phase == "redo":
        want = [q for q in qids if q in R and R[q].get("failed") and not R[q].get("redo")]
        ok, err = C.validate_submit(out, want)
        if err:
            print(err); return 1
        for q in want:
            a = ok[f"q{q}"]
            if Q[str(q)]["options"][-1]["answer"] == a["answer"] and IMPL.get(a["implementation"]) is not None:
                a["implementation"] = "Does Not Apply"       # lowest option: nothing to implement
            patch(c, q, redo=a)
            print(f"  q{q} redo: \"{a['answer']}\" · {a['implementation']} · {a['confidence']}")
    return 0


# ---------- the decision ----------
def impl_same(a, b):
    x, y = IMPL.get(a), IMPL.get(b)
    if x is None or y is None:
        return x is None and y is None
    return abs(x - y) <= 12.5


def decide_one(r):
    """-> (status, reason, publish) where publish is the answer to write, or None to leave what is there."""
    o, sc, v, redo, sc2 = r["original"], r.get("source_check"), r.get("verifier"), r.get("redo"), r.get("redo_source_check")
    if not (sc and v):
        return "pending", None, None
    why = needs_redo(r)
    if not why:
        return "verified", "Every cited source was opened and says what is quoted; the second reader read the law and agrees.", None
    if not redo or not sc2:
        return "pending", None, None
    if not sc2.get("pass"):
        return "review", "Coded again, and the new sources still do not check out: " + "; ".join(sc2.get("failures", []))[:400], None
    same_p = redo["answer"] == o["answer"]
    same_i = impl_same(redo["implementation"], o["implementation"])
    p_obj, i_obj = v["protection_verdict"] != "confirmed", v["implementation_verdict"] not in ("confirmed", "not_applicable")
    issues = []
    if same_p and v["protection_verdict"] == "wrong":
        issues.append(f"the redo keeps \"{o['answer']}\" and the second reader would answer \"{v['protection_answer']}\"")
    if not same_p and not (p_obj and (v["protection_answer"] == redo["answer"] or v["protection_verdict"] == "not_supported")):
        issues.append(f"the redo answers \"{redo['answer']}\", the first coder \"{o['answer']}\", the second reader \"{v['protection_answer']}\" ({v['protection_verdict'].replace('_', ' ')})")
    if IMPL.get(redo["implementation"]) is not None or IMPL.get(o["implementation"]) is not None:
        if same_i and v["implementation_verdict"] == "wrong" and not impl_same(v["implementation_answer"], redo["implementation"]):
            issues.append(f"the redo keeps implementation at \"{redo['implementation']}\" and the second reader would rate it \"{v['implementation_answer']}\"")
        if not same_i and same_p and not (i_obj and (impl_same(v["implementation_answer"], redo["implementation"]) or v["implementation_verdict"] == "not_supported")):
            issues.append(f"implementation: the redo rates \"{redo['implementation']}\", the first coder \"{o['implementation']}\", the second reader \"{v['implementation_answer']}\" ({v['implementation_verdict'].replace('_', ' ')})")
    if issues:
        return "review", "The readers do not agree: " + "; ".join(issues) + ".", None
    if same_p and redo["implementation"] == o["implementation"]:
        return "verified", "Coded again from the primary sources with the same result; the new sources were checked. " + (redo.get("what_changed") or ""), redo
    return "changed", (redo.get("what_changed") or "Changed after the redo."), redo


def publish(c, qid, a):
    """Write one answer the way compile.write_chunk does."""
    q = Q[str(qid)]
    score = next((o["score"] for o in q["options"] if o["answer"] == a["answer"]), None)
    answers = [{"country_id": c["id"], "year": YEAR, "question_id": qid, "answer": a["answer"], "subscore": score,
                "confidence": a.get("confidence"), "notes": a.get("notes"), "evidence": None, "sources": None, "experimental": True}]
    if q.get("implementation_id"):
        answers.append({"country_id": c["id"], "year": YEAR, "question_id": q["implementation_id"], "answer": a["implementation"],
                        "subscore": IMPL.get(a["implementation"]), "evidence": a.get("evidence"), "sources": a.get("evidence_sources") or [],
                        "confidence": a.get("confidence"), "notes": None, "experimental": True})
    local = "\n".join(f"• {s['instrument']}, {s['article']}" + (f" — {s['url']}" if s.get("url") else "") + (f"\n  «{s['quote']}»" if s.get("quote") else "")
                      for s in a.get("sources") or [])
    sb("POST", "answers?on_conflict=country_id,year,question_id", answers, prefer="resolution=merge-duplicates,return=minimal")
    sb("POST", "citations", [{"id": c["id"] * 1000 + qid, "country_id": c["id"], "question_id": qid, "text_en": a["citation"],
                              "local_text_en": local or None, "international_text_en": a.get("international"), "experimental": True}],
       prefer="resolution=merge-duplicates,return=minimal")


def brief(a):
    return {"answer": a["answer"], "implementation": a["implementation"], "confidence": a.get("confidence")}


def decide(c, slug, dry=False):
    R = rows(c); tally = {}; wrote = 0
    for q, r in sorted(R.items()):
        if r["status"] in ("verified", "changed", "review") and r.get("decided_by"):
            tally[r["status"]] = tally.get(r["status"], 0) + 1; continue
        status, reason, pub = decide_one(r)
        tally[status] = tally.get(status, 0) + 1
        if status == "pending":
            continue
        print(f"  q{q} {status}" + (f" · {reason[:200]}" if status != "verified" or pub else ""))
        if dry:
            continue
        fields = {"status": status, "reason": reason, "decided_by": "pipeline"}
        if pub:
            fields["before"] = brief(r["original"]); fields["after"] = brief(pub)
            publish(c, q, pub); wrote += 1
        patch(c, q, **fields)
    print(f"{c['name']}: " + ", ".join(f"{v} {k}" for k, v in sorted(tally.items())) + f"; {wrote} answers rewritten")
    return wrote


def resolve(c, qid, which, reason, by):
    r = rows(c)[qid]
    if which == "redo":
        if not r.get("redo"):
            sys.exit("no redo to publish")
        publish(c, qid, r["redo"])
        same = r["redo"]["answer"] == r["original"]["answer"] and impl_same(r["redo"]["implementation"], r["original"]["implementation"])
        patch(c, qid, status="verified" if same else "changed", reason=reason, decided_by=by, before=brief(r["original"]), after=brief(r["redo"]))
    elif which == "original":
        patch(c, qid, status="verified", reason=reason, decided_by=by)
    else:
        sys.exit("original or redo")
    print(f"q{qid}: {which} stands, decided by {by}")


def report(c):
    R = rows(c)
    t = {}
    for r in R.values():
        t[r["status"]] = t.get(r["status"], 0) + 1
    sc = sum(1 for r in R.values() if r.get("source_check")); scf = sum(1 for r in R.values() if r.get("source_check") and not r["source_check"]["pass"])
    v = sum(1 for r in R.values() if r.get("verifier")); vf = sum(1 for r in R.values() if r.get("verifier") and not verifier_ok(r["verifier"]))
    low = sum(1 for r in R.values() if r["original"].get("confidence") == "low")
    cost = sum(float(x["cost_usd"]) for x in sb_all(f"dossier_check_runs?select=cost_usd&country_id=eq.{c['id']}"))
    print(f"{c['name']}: {len(R)} indicators · source check {sc} done, {scf} failed · second reader {v} done, {vf} objected · {low} low confidence · "
          + ", ".join(f"{n} {k}" for k, n in sorted(t.items())) + f" · ${cost:.2f} API-equivalent")
    for q, r in sorted(R.items()):
        if r["status"] in ("changed", "review"):
            print(f"  q{q} {r['status']}: {Q[str(q)]['text']} — {(r.get('reason') or '')[:260]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug"); ap.add_argument("--seed", action="store_true")
    ap.add_argument("--emit", nargs=2, metavar=("PHASE", "PATH")); ap.add_argument("--only"); ap.add_argument("--again", action="store_true")
    ap.add_argument("--ingest", nargs=3, metavar=("PHASE", "KEY", "FILE"))
    ap.add_argument("--decide", action="store_true"); ap.add_argument("--dry", action="store_true")
    ap.add_argument("--resolve", nargs=3, metavar=("QID", "WHICH", "REASON")); ap.add_argument("--by")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    c = COUNTRIES[a.slug]; C.COUNTRY = c
    if a.seed:
        seed(c, a.slug)
    if a.emit:
        emit(c, a.slug, a.emit[0], a.emit[1], only=set(a.only.split(",")) if a.only else None, again=a.again)
    if a.ingest:
        sys.exit(ingest(c, a.slug, *a.ingest))
    if a.decide:
        decide(c, a.slug, dry=a.dry)
    if a.resolve:
        if not a.by:
            sys.exit("--by <name> is required")
        resolve(c, int(a.resolve[0]), a.resolve[1], a.resolve[2], a.by)
    if a.report:
        report(c)


if __name__ == "__main__":
    main()
