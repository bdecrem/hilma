"""The answers through time (PLAN.md Parts 3 and 4), as jobs for cc/cost.mjs: the cost tests of COST-TEST.md.

    python3 history.py <slug> --emit forward|back|timeline <path> --chunk <key> [--fixture file.json]
    python3 history.py <slug> --emit sources|verify|redo <path> --chunk <key> --fixture file.json   # audit.py's prompts over a fixture
    python3 history.py <slug> --check-schemas --chunk <key> [--fixture file.json]                 # strict-output sanity check

  forward    from the starting answer and its cited law: what changed between 1 January 2023 and 1 January 2026
  back       the full amendment history of each cited provision from enactment, and the answer on 1 January 2020
  timeline   both in one pass: one dated history per provision, then the answers on 1 January 2020, 2023 and 2026

The jobs have the shape `audit.py --emit` gives cc/check.mjs (system, user/prompt, schema, model, effort, key, label, qids,
web/tools, max_turns, tag). The starting answers come from the database (`answers` + `citations`, the published answer
of the country) or from a fixture file in the same row shape (`--fixture`, no database needed). This file only reads:
it never writes to any table.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE_MODE = "--fixture" in sys.argv
if FIXTURE_MODE:
    # ../laws/lib.py reads these at import; a fixture run never touches the database, and sb() is disabled below
    os.environ.setdefault("MRD_SUPABASE_URL", "http://fixture.invalid")
    os.environ.setdefault("MRD_SUPABASE_SERVICE_KEY", "fixture")

import audit as A                                    # noqa: E402
import compile as C                                  # noqa: E402
from compile import COUNTRIES, CODEBOOK, Q           # noqa: E402

if FIXTURE_MODE:
    def _no_db(*a, **k):
        raise RuntimeError("fixture mode: the database is not used")
    A.sb = A.sb_all = C.sb = C.sb_all = _no_db

MODELS = {"forward": ("claude-opus-5-5", "high"), "back": ("claude-opus-5-5", "high"), "timeline": ("claude-opus-5-5", "high")}
MAX_TURNS = {"forward": 150, "back": 200, "timeline": 250}
IMPL_OPTS = [o["answer"] for o in CODEBOOK["implementation_options"]]
GROUPS = A.GROUPS
CHUNKS = {ch["key"]: ch for ch in CODEBOOK["chunks"]}


# ---------- the instrument's change scale (its "B.0" question, "as of January 1, 2020" against 2023) ----------
def _b0_template():
    inst = json.load(open(os.path.join(HERE, "instrument", "instrument.json"), encoding="utf-8"))
    b0 = next(x for x in inst if x["q"].endswith("B.0"))
    return [o.replace("2020", "{a}").replace("2023", "{b}") for o in b0["options"]]


B0 = _b0_template()


def change_scale(a, b):
    """The six options of the instrument's change question, for 1 January <a> against 1 January <b>, in its own wording."""
    return [o.format(a=a, b=b) for o in B0]


# ---------- the starting answers ----------
def parse_local(text):
    """citations.local_text_en ("• instrument, article — url\\n  «quote»" per source, as compile.write_chunk writes it) back to sources."""
    out = []
    for block in re.split(r"\n(?=• )", (text or "").strip()):
        block = block.strip()
        if not block.startswith("•"):
            continue
        head, _, rest = block[1:].strip().partition("\n")
        quote = re.search(r"«(.*)»", rest, re.S)
        head, _, url = head.partition(" — ")
        inst, _, art = head.rpartition(", ")
        out.append({"instrument": inst or head, "article": art if inst else "", "url": url.strip() or None,
                    "quote": quote.group(1).strip() if quote else None})
    return out


def starting_answers(c, qids, ans_rows, cit_rows):
    """The published answer per indicator, in the dict shape the coder's output has (audit.answer_block reads it)."""
    by = {}
    for r in ans_rows:
        if r["country_id"] == c["id"]:
            k = r["question_id"]
            if k not in by or r["year"] > by[k]["year"]:
                by[k] = r                                            # the latest year (the MRD has 2020 and 2023)
    cits = {r["question_id"]: r for r in cit_rows if r["country_id"] == c["id"]}
    out, missing = [], []
    for q in qids:
        a = by.get(q)
        if not a:
            missing.append(q); continue
        iq = Q[str(q)].get("implementation_id")
        im = by.get(iq) or {}
        ci = cits.get(q) or {}
        out.append({"question_id": q, "year": a["year"], "answer": a["answer"], "citation": ci.get("text_en") or "—",
                    "sources": parse_local(ci.get("local_text_en")), "international": ci.get("international_text_en"),
                    "implementation": im.get("answer") or "Does Not Apply", "evidence": im.get("evidence"),
                    "evidence_sources": im.get("sources") or [], "confidence": a.get("confidence"), "notes": a.get("notes")})
    return out, missing


def load_rows(c, qids, fixture):
    """(answers rows, citations rows, law map). Read only."""
    if fixture:
        d = json.load(open(fixture, encoding="utf-8"))
        return d["answers"], d["citations"], d.get("lawmap")
    want = sorted(set(qids) | {Q[str(q)]["implementation_id"] for q in qids if Q[str(q)].get("implementation_id")})
    ans = A.sb_all(f"answers?select=*&country_id=eq.{c['id']}&question_id=in.({','.join(map(str, want))})")
    cit = A.sb_all(f"citations?select=*&country_id=eq.{c['id']}&question_id=in.({','.join(map(str, qids))})")
    return ans, cit, A.lawmap_of(c)


def start_label(year):
    if year == 2023:
        return "1 January 2023 (the MRD's human coding, as of that date)"
    return f"{year} (our dossier coding of November {year}, which describes the law as it then stood, after 1 January {year})"


# ---------- prompts ----------
RULES = """How to establish a provision's history
- The method above says to code the law as it stands today; here the same rules apply to the text in force on each date this task names.
- The answer "on 1 January of a year" is what the text in force on that day provided: the consolidated text as it then stood, with every amendment that had entered into force by that day (an act published in December and in force in February does not count for 1 January). Note dates of entry into force, not only of publication.
- Official sources first: the country's consolidated-law portal, its version history and its list of amending and repealing acts ("afectaciones", "versiones", "redacción anterior", "texto original" and the like), the official gazette, the legislature's record, the courts' own databases. A provision's history is its full list of amendments from enactment to today, not its enactment date.
- Nothing counts from search results alone. Every event you record must be in a text you opened with `read` in this session: give the URL you opened and copy the decisive passage in the original language from that text. A law firm's note or a news story can tell you where to look; it is not the event.
- Court rulings count only when read in full and stating a general rule that reaches the indicator's situation; a finding on one group's facts is practice evidence. Date each ruling you rely on, and look for later rulings that overturned, narrowed or extended it.
- Implementation on a past date is judged from practice documented around that date (reports, findings, data, cases covering that period). For each practice source say whether it shows practice or only law, which people it is about, and which period it covers. A rating whose evidence is law only, or about other people than the answer covers, does not hold; if that is all there is, say so and mark confidence low.
- Where the version of the law in force on a past date is not available, reconstruct it from the amending acts and say so; where neither the version nor the amending acts can be read, say that the sourcing is weaker, and lower the confidence. The older the date, the more this matters.
- The starting answer is the answer on its own date. Keep it, even where you think it is wrong: the answers on the other dates differ from it only where a dated event you recorded (an amendment, a repeal, a new instrument, a ruling) or a documented shift in practice explains the difference. Where the starting answer itself looks wrong, say so in `starting_answer_concern`, apart from the change; a disagreement with the first coder is never a change in the law. A starting answer dated after one of the task's dates (our dossiers describe the law of November 2026) is the answer on that date only if nothing changed in between; an event in between counts like any other.
- Most answers will not change. "No change" with the provisions you checked and the version history you read is a complete answer.
- Report every page you opened for an indicator in `sources_opened`."""


def tools_line(c):
    return (f"Tools: WebSearch (in {c['lang']} and in English), and `read` for pages and PDFs (`find` with ' | '-separated terms for "
            "article numbers; version histories and amending acts are long, so use `find`). One read of the right act with several `find` "
            "terms covers several indicators. When every indicator is answered, give your final answer as JSON (the schema is enforced), "
            "one entry per indicator, options copied verbatim.")


def start_block(answers):
    return "\n\n".join(f"{A.answer_block(a, True)}\nStarting answer as of: {start_label(a['year'])}" for a in answers)


def forward_prompt(c, key, answers, lawmap):
    qids = [a["question_id"] for a in answers]
    task = f"""Your task: what changed between 1 January 2023 and 1 January 2026

Each indicator below has a starting answer with the law it cites. Do not code the indicator afresh. Start from that answer and its cited provisions, and establish:
- whether each cited provision was amended, repealed or replaced between 1 January 2023 and 1 January 2026 (read its version history and the amending acts), and whether a new instrument or a ruling in that window bears on the indicator;
- whether practice shifted in that window: implementation on 1 January 2023 and on 1 January 2026, each from practice evidence of its own period;
- the answer on 1 January 2023 and on 1 January 2026, each in the indicator's own options, and the change between them in the instrument's change scale (its own wording, for 2023 against 2026).

{RULES}

{tools_line(c)}

The starting answers
""" + start_block(answers)
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), C.indicators_text(c, qids), task])
    return job("forward", key, qids, system, f"For q{', q'.join(map(str, qids))} in {c['name']}: what changed between 1 January 2023 and 1 January 2026? Answer with the JSON.",
               forward_schema(qids))


def back_prompt(c, key, answers, lawmap):
    qids = [a["question_id"] for a in answers]
    y = max(a["year"] for a in answers)
    task = f"""Your task: back in time, to 1 January 2020

Each indicator below has a starting answer with the law it cites. Do not code the indicator afresh. For each:
- Trace the full amendment history of every cited provision from its enactment to today: each amendment, repeal, replacement and renumbering, dated, with the amending instrument. Not only the enactment date: an article enacted in 2009 may have read differently in 2020.
- If the answer today is the lowest option ("No" or its equivalent), search for a protection that existed and was repealed or narrowed: earlier versions of the act, a repealed predecessor law, a regulation since replaced. Say what you searched and what you found.
- If the answer rests on case law, date each ruling and check for later rulings that overturned or narrowed it.
- Give the answer on 1 January 2020 in the indicator's own options, the implementation on 1 January 2020 from practice evidence of that period, and the change between 1 January 2020 and the starting answer's date ({y}) in the instrument's change scale (its own wording).

{RULES}

{tools_line(c)}

The starting answers
""" + start_block(answers)
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), C.indicators_text(c, qids), task])
    return job("back", key, qids, system, f"For q{', q'.join(map(str, qids))} in {c['name']}: the history of the cited provisions and the answers on 1 January 2020. Answer with the JSON.",
               back_schema(qids, y))


def timeline_prompt(c, key, answers, lawmap):
    qids = [a["question_id"] for a in answers]
    task = f"""Your task: one dated history per provision, and the answers on three dates read off it

Each indicator below has a starting answer with the law it cites. Do not code the indicator afresh. For each:
- Build one dated history of every cited provision from its enactment to today: each amendment, repeal, replacement and renumbering, with the amending instrument, and every new instrument or ruling that bears on the indicator.
- If the answer today is the lowest option ("No" or its equivalent), search for a protection that existed and was repealed or narrowed, and say what you searched and found.
- If the answer rests on case law, date each ruling and check for later rulings that overturned or narrowed it.
- Then read the answers off that history: the answer and the implementation on 1 January 2020, on 1 January 2023 and on 1 January 2026, each in the indicator's own options, implementation from practice evidence of each period; and the changes 2020 to 2023 and 2023 to 2026 in the instrument's change scale (its own wording).

{RULES}

{tools_line(c)}

The starting answers
""" + start_block(answers)
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), C.indicators_text(c, qids), task])
    return job("timeline", key, qids, system, f"For q{', q'.join(map(str, qids))} in {c['name']}: one history per provision, and the answers on 1 January 2020, 2023 and 2026. Answer with the JSON.",
               timeline_schema(qids))


def job(step, key, qids, system, user, schema):
    m, e = MODELS[step]
    return {"key": key, "label": f"{step.capitalize()}: {key}", "qids": qids, "system": system, "user": user, "prompt": user,
            "schema": schema, "model": m, "effort": e, "web": True, "tools": ["WebSearch", "mcp__reader__read"],
            "max_turns": MAX_TURNS[step], "tag": f"cost:{step}:{key}"}


# ---------- schemas (flat, every property required, nullable only where nothing may exist) ----------
def obj(props, desc=None):
    o = {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}
    if desc:
        o["description"] = desc
    return o


def s(desc, null=False):
    return {"type": ["string", "null"] if null else "string", "description": desc}


def enum(vals, desc):
    return {"type": "string", "enum": list(vals), "description": desc}


def arr(item, desc):
    return {"type": "array", "items": item, "description": desc}


DATE = "YYYY-MM-DD; YYYY-MM or YYYY when the day is not known"
EVENT = obj({
    "date": s(f"entry into force ({DATE})"),
    "instrument": s("the instrument that made the change: official name and number in the original language"),
    "article": s("the provision affected"),
    "kind": enum(["enacted", "amended", "repealed", "replaced", "renumbered", "new_instrument", "ruling", "practice"], "what happened"),
    "what_changed": s("one or two sentences in English: what the provision said before and after, and whether it touches the indicator"),
    "url": s("the page you opened with `read` that shows it; null only if you could not open one (then the event does not count)", null=True),
    "passage": s("the decisive passage in the original language, copied from that page, max 400 characters; null if not read", null=True),
})
PROVISION = obj({
    "instrument": s("as cited"), "article": s("as cited"),
    "enacted": s(f"date the provision was first enacted ({DATE}), or 'unknown'"),
    "history_read": enum(["version_history", "amending_acts", "current_text_only", "not_found"],
                         "what you could read: the portal's version history, the amending acts themselves, only today's text, or nothing"),
    "status": enum(["unchanged", "amended", "repealed", "replaced", "could_not_establish"], "over the period this task asks about"),
})
RULING = obj({
    "court": s("court"), "reference": s("case or ruling number"), "date": s(DATE),
    "read_in_full": {"type": "boolean", "description": "you read the ruling itself, not a report of it"},
    "general_rule": {"type": "boolean", "description": "it states a general rule that reaches the indicator's situation"},
    "later": s("later rulings that overturned, narrowed or extended it, with dates; 'none found' if you looked and found none"),
    "url": s("where you read it", null=True),
})


def practice_item(periods):
    return obj({
        "title": s("title of the report, decision or dataset"), "url": s("the URL you opened"),
        "year": {"type": ["integer", "null"], "description": "publication year"},
        "shows": enum(["practice", "law_only"], "practice = what authorities actually do; law_only = what the rules say"),
        "groups": arr({"type": "string", "enum": GROUPS}, "the people this source is about"),
        "period": enum(periods, "the period of practice it documents"),
    })


OPENED = arr(obj({"title": s("title"), "url": s("URL opened with `read`")}), "every page you opened for this indicator")
COMMON_TAIL = {
    "past_versions": enum(["read_the_version_in_force", "reconstructed_from_amending_acts", "not_available"],
                          "for the past date(s): did you read the text as it stood, rebuild it from the amending acts, or neither"),
    "sourcing_note": s("one or two sentences on how strong the dating is, and what could not be read"),
    "sources_opened": OPENED,
    "starting_answer_concern": s("where the starting answer itself looks wrong (protection or implementation), why, apart from any change; null if it holds", null=True),
    "confidence": enum(["high", "medium", "low"], "high = the version history and the practice evidence were read; medium = one of them second-hand or reconstructed; low = inferred"),
    "notes": s("anything a reviewer should know", null=True),
}


def answers_enum(qids):
    return sorted({o["answer"] for q in qids for o in Q[str(q)]["options"]})


def wrap(item):
    return {"type": "object", "additionalProperties": False, "required": ["answers"], "properties": {"answers": arr(item, "one entry per indicator")}}


def forward_schema(qids):
    ans = answers_enum(qids)
    p = {"question_id": {"type": "integer", "description": "the q-number"},
         "answer_2023": enum(ans, "the answer on 1 January 2023, one of the indicator's options verbatim"),
         "implementation_2023": enum(IMPL_OPTS, "implementation on 1 January 2023"),
         "answer_2026": enum(ans, "the answer on 1 January 2026, one of the indicator's options verbatim"),
         "implementation_2026": enum(IMPL_OPTS, "implementation on 1 January 2026"),
         "change_2023_2026": enum(change_scale(2023, 2026), "the instrument's change scale, 2023 against 2026"),
         "provisions": arr(PROVISION, "each cited provision, and what happened to it between 1 January 2023 and 1 January 2026"),
         "events": arr(EVENT, "every dated event in the window (amendment, repeal, new instrument, ruling, documented shift in practice); empty if none"),
         "implementation_then_now": s("2-5 sentences: implementation in 2023 and in 2026, the practice evidence for each, and whether it shifted"),
         "practice_sources": arr(practice_item(["before_2023", "2023_2026", "both"]), "the practice evidence relied on"),
         **COMMON_TAIL}
    return wrap(obj(p))


def back_schema(qids, y):
    ans = answers_enum(qids)
    p = {"question_id": {"type": "integer", "description": "the q-number"},
         "answer_2020": enum(ans, "the answer on 1 January 2020, one of the indicator's options verbatim"),
         "implementation_2020": enum(IMPL_OPTS, "implementation on 1 January 2020"),
         f"change_2020_{y}": enum(change_scale(2020, y), f"the instrument's change scale, 2020 against the starting answer ({y})"),
         "provisions": arr(PROVISION, "each cited provision, with what you could read of its history"),
         "events": arr(EVENT, "the full amendment history of the cited provisions from enactment, and any other dated event that bears on the indicator"),
         "repealed_search": s("for an answer that is the lowest option today: what you searched for a protection that existed and was repealed, and what you found; otherwise 'not applicable'"),
         "rulings": arr(RULING, "every ruling the answer rests on or that bears on it, dated; empty if none"),
         "implementation_2020_evidence": s("2-4 sentences: the practice evidence for implementation around 2020"),
         "practice_sources": arr(practice_item(["before_2020", "2020_2023", "after_2023"]), "the practice evidence relied on"),
         **COMMON_TAIL}
    return wrap(obj(p))


def timeline_schema(qids):
    ans = answers_enum(qids)
    p = {"question_id": {"type": "integer", "description": "the q-number"},
         "provisions": arr(PROVISION, "each cited provision, with what you could read of its history"),
         "events": arr(EVENT, "one dated history from enactment to today: every amendment, repeal, replacement, new instrument and ruling that bears on the indicator"),
         "repealed_search": s("for an answer that is the lowest option today: what you searched for a protection that existed and was repealed, and what you found; otherwise 'not applicable'"),
         "rulings": arr(RULING, "every ruling the answer rests on or that bears on it, dated; empty if none"),
         "answer_2020": enum(ans, "the answer on 1 January 2020"), "implementation_2020": enum(IMPL_OPTS, "implementation on 1 January 2020"),
         "answer_2023": enum(ans, "the answer on 1 January 2023"), "implementation_2023": enum(IMPL_OPTS, "implementation on 1 January 2023"),
         "answer_2026": enum(ans, "the answer on 1 January 2026"), "implementation_2026": enum(IMPL_OPTS, "implementation on 1 January 2026"),
         "change_2020_2023": enum(change_scale(2020, 2023), "the instrument's change scale, 2020 against 2023"),
         "change_2023_2026": enum(change_scale(2023, 2026), "the instrument's change scale, 2023 against 2026"),
         "implementation_history": s("2-5 sentences: implementation on each of the three dates and the practice evidence for each"),
         "practice_sources": arr(practice_item(["before_2020", "2020_2023", "2023_2026"]), "the practice evidence relied on"),
         **COMMON_TAIL}
    return wrap(obj(p))


# ---------- strict-output check ----------
BANNED = {"minLength", "maxLength", "pattern", "format", "minimum", "maximum", "minItems", "maxItems", "oneOf", "allOf", "$ref", "default"}


def check_schema(sch):
    """Same discipline as the existing schemas: objects closed, every property required, no unsupported keywords.
    Returns (problems, stats). Strict mode counts union-typed (nullable) parameters, so they are kept few."""
    probs, st = [], {"objects": 0, "properties": 0, "nullable": 0, "enums": 0, "depth": 0}

    def walk(n, path, depth):
        st["depth"] = max(st["depth"], depth)
        for k in BANNED & set(n):
            probs.append(f"{path}: unsupported keyword {k}")
        t = n.get("type")
        if isinstance(t, list):
            st["nullable"] += 1
        if "enum" in n:
            st["enums"] += 1
            if not n["enum"] or len(set(n["enum"])) != len(n["enum"]):
                probs.append(f"{path}: empty or duplicate enum")
        if t == "object":
            st["objects"] += 1
            props = n.get("properties", {})
            st["properties"] += len(props)
            if n.get("additionalProperties") is not False:
                probs.append(f"{path}: additionalProperties is not false")
            if sorted(n.get("required", [])) != sorted(props):
                probs.append(f"{path}: required does not list every property")
            for k, v in props.items():
                walk(v, f"{path}.{k}", depth + 1)
        elif t == "array":
            walk(n["items"], f"{path}[]", depth + 1)
    walk(sch, "$", 0)
    return probs, st


# ---------- emit ----------
def emit(c, slug, step, path, key, fixture):
    ch = CHUNKS[key]
    ans_rows, cit_rows, lawmap = load_rows(c, ch["questions"], fixture)
    answers, missing = starting_answers(c, ch["questions"], ans_rows, cit_rows)
    if missing and not fixture:
        print(f"  no published answer for q{missing}; left out", file=sys.stderr)
    if not answers:
        sys.exit(f"{c['name']} · {key}: no starting answers")
    if step == "forward":
        j = forward_prompt(c, key, answers, lawmap)
    elif step == "back":
        j = back_prompt(c, key, answers, lawmap)
    elif step == "timeline":
        j = timeline_prompt(c, key, answers, lawmap)
    elif step in ("sources", "verify", "redo"):
        # audit.py's own prompts, over the fixture's answers (from the database, cc/cost.mjs uses audit.py --emit --readonly)
        if not fixture:
            sys.exit("sources / verify / redo from the database: use audit.py --emit <phase> <path> --only <chunk> --readonly")
        if step == "sources":
            j = A.sources_prompt(c, key, answers, False)
        elif step == "verify":
            j = A.verify_prompt(c, key, answers, lawmap)
        else:
            j = A.redo_prompt(c, key, [{"question_id": a["question_id"], "original": a, "failed": ["cost test: coded again to measure what a redo costs; nothing is published"]}
                                       for a in answers], lawmap)
        j["model"], j["effort"] = A.MODELS[step]
        j["tag"] = f"cost:{step}:{key}"; j["prompt"] = j["user"]
        j["tools"] = ["WebSearch", "mcp__reader__read"] if j["web"] else ["mcp__reader__read"]
    else:
        sys.exit(f"unknown step {step}")
    out = {"country": {k: c[k] for k in ("id", "iso", "name", "lang")}, "slug": slug, "phase": step, "jobs": [j],
           "source": f"fixture {os.path.basename(fixture)}" if fixture else "database"}
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    probs, st = check_schema(j["schema"])
    print(f"{c['name']} · {step} · {key}: 1 job, {len(j['qids'])} indicators, schema {st}" + (f", PROBLEMS: {probs}" if probs else ""))
    return 1 if probs else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug"); ap.add_argument("--emit", nargs=2, metavar=("STEP", "PATH"))
    ap.add_argument("--chunk", required=True); ap.add_argument("--fixture")
    ap.add_argument("--check-schemas", action="store_true")
    a = ap.parse_args()
    c = COUNTRIES[a.slug]; C.COUNTRY = c
    if a.chunk not in CHUNKS:
        sys.exit(f"unknown chunk {a.chunk}; one of {', '.join(CHUNKS)}")
    if a.check_schemas:
        qids = CHUNKS[a.chunk]["questions"]
        bad = 0
        for name, sch in [("forward", forward_schema(qids)), ("back", back_schema(qids, 2026)), ("timeline", timeline_schema(qids)),
                          ("sources (audit)", A.SOURCES_SCHEMA), ("verify (audit)", A.verify_schema(qids)), ("redo (audit)", A.redo_schema(qids))]:
            probs, st = check_schema(sch)
            bad += len(probs)
            print(f"{name:16} {st}" + (f"  PROBLEMS {probs}" if probs else "  ok"))
        sys.exit(1 if bad else 0)
    if a.emit:
        sys.exit(emit(c, a.slug, a.emit[0], a.emit[1], a.chunk, a.fixture))
    ap.print_help()


if __name__ == "__main__":
    main()
