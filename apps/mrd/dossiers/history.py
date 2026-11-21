"""The answers through time (PLAN.md Parts 3 and 4), as jobs for cc/cost.mjs: the cost tests of COST-TEST.md.

    python3 history.py <slug> --emit forward|back|timeline|back2000 <path> --chunk <key> [--fixture file.json]
    python3 history.py <slug> --emit sources|verify|redo <path> --chunk <key> --fixture file.json   # audit.py's prompts over a fixture
    python3 history.py <slug> --check-schemas --chunk <key> [--fixture file.json]                 # strict-output sanity check

  forward    from the starting answer and its cited law: what changed between 1 January 2023 and 1 January 2026
  back       the full amendment history of each cited provision from enactment, and the answer on 1 January 2020
  timeline   both in one pass: one dated history per provision, then the answers on 1 January 2020, 2023 and 2026
  back2000   (the MRD's countries only) from the MRD's own answer as of 1 January 2020: the history of the cited provisions and of
             their predecessors, and the answers on 1 January 2000, 2005, 2010 and 2015

    python3 history.py <slug> --read <url> [--find terms] [--max-chars n]   # the `read` tool for a country outside compile.COUNTRIES

The countries are the six dossiers (compile.COUNTRIES) and the MRD's own countries in MRD_COUNTRIES below (Argentina and Chile,
cost tests of 2026-11-20). Those are kept out of compile.COUNTRIES on purpose: the pipeline scripts iterate it. For them the
starting answers are the MRD's human coding of a given year (2023 for forward / back / timeline, 2020 for back2000), its answer
text matched to the codebook's options, its citation (one per indicator, written for 1 January 2023) and no law map.

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

MODELS = {"forward": ("claude-opus-5-5", "high"), "back": ("claude-opus-5-5", "high"), "timeline": ("claude-opus-5-5", "high"),
          "back2000": ("claude-opus-5-5", "high")}
MAX_TURNS = {"forward": 150, "back": 200, "timeline": 250, "back2000": 250}
BACK2000_DATES = ["2000-01-01", "2005-01-01", "2010-01-01", "2015-01-01"]

# The MRD's own countries used by the history steps only (never added to compile.COUNTRIES). `history` is a pointer for
# back2000: where the regime changed between 2000 and 2020; the session dates every step itself.
MRD_COUNTRIES = {
    "argentina": dict(id=2, iso="ARG", name="Argentina", lang="Spanish", examples=["CHL", "BRA", "COL"], mrd=True,
        portals="infoleg.gob.ar (InfoLEG: every national norm with its 'texto actualizado', its 'texto original' and the list of norms that amend it, "
                "'normas que modifican'), saij.gob.ar (SAIJ: legislation, case law, doctrine), boletinoficial.gob.ar (Boletín Oficial), "
                "csjn.gov.ar and sj.csjn.gov.ar (Corte Suprema de Justicia de la Nación, its rulings), migraciones.gob.ar (Dirección Nacional de Migraciones). "
                "Key instruments: Constitución Nacional (1994 reform; arts. 14, 14 bis, 16, 20, 75 inc. 22 on treaties with constitutional rank), "
                "Ley 25.871 de Migraciones (2004) and its Decreto Reglamentario 616/2010, DNU 70/2017 (amended Ley 25.871; repealed by Decreto 138/2021), "
                "DNU 366/2025 (amended Ley 25.871 in 2025), the previous law Ley 22.439 (1981, the 'Ley Videla', in force until Ley 25.871), "
                "Ley 26.165 (refugees, 2006), Ley 346 (citizenship), Ley 26.364 and Ley 26.842 (trafficking), Ley 20.744 (Ley de Contrato de Trabajo).",
        history="Until Ley 25.871 took effect in January 2004 the regime was Ley 22.439 (1981, 'Ley General de Migraciones y de Fomento de la Inmigración', "
                "the 'Ley Videla') and its regulations; Ley 25.871 was regulated only by Decreto 616/2010 (May 2010); DNU 70/2017 amended it from "
                "February 2017 (expulsion, detention, the summary procedure) until Decreto 138/2021 repealed it in March 2021. Refugees: Ley 26.165 (2006); "
                "before it, decrees and CEPARE practice. Trafficking: Ley 26.364 (2008), amended by Ley 26.842 (2012)."),
    "chile": dict(id=10, iso="CHL", name="Chile", lang="Spanish", examples=["ARG", "PER", "COL"], mrd=True,
        portals="bcn.cl/leychile (LeyChile, Biblioteca del Congreso Nacional: every norm with its full version history, 'versiones' with their dates, "
                "and the norms that modified it), diariooficial.interior.gob.cl (Diario Oficial), pjud.cl (Poder Judicial: Corte Suprema and appeals courts, "
                "amparo and protección rulings), tribunalconstitucional.cl (Tribunal Constitucional), serviciomigraciones.cl (Servicio Nacional de Migraciones). "
                "Key instruments: Constitución Política, Ley 21.325 de Migración y Extranjería (published April 2021, in force February 2022) and its reglamento "
                "(Decreto 296/2022), the previous Decreto Ley 1.094 (1975) and its reglamento Decreto Supremo 597 (1984), Ley 20.430 (refugees, 2010), "
                "Ley 20.507 (trafficking and smuggling, 2011), Código del Trabajo, Ley 21.655 (2024: amends Ley 21.325 on reconducción and Ley 20.430), "
                "and any later amendment of Ley 21.325 (its 'versiones' on LeyChile).",
        history="Until Ley 21.325 took effect in February 2022 the regime was Decreto Ley 1.094 (1975, 'Ley de Extranjería') with its reglamento "
                "Decreto Supremo 597 (1984), both amended several times; refugees under Ley 20.430 from 2010 (regulation Decreto 837/2010), before it under "
                "DL 1.094's provisions on refugees; trafficking under Ley 20.507 (2011). Executive measures (regularisation processes of 2007-2008 and 2018, "
                "the 2018 visas) changed practice without changing the statute."),
}
START_YEAR = {"forward": 2023, "back": 2023, "timeline": 2023, "back2000": 2020}   # the MRD's year the starting answers come from
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


def _norm(t):
    t = C.fold(str(t or "")).replace("e.g.,", "").replace("e.g.", "")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


def to_option(qid, raw, subscore=None):
    """The MRD's answer text (often off the codebook's wording: 'Yes.', 'No.', 'forture') as one of the indicator's options, or None.
    By normalized text when it is an option, else by subscore, else the longest option the answer starts with. The text wins over the
    subscore: Chile's 2023 answer to q99 is "No" with subscore 100, and its citation says "No protection of this right"."""
    opts = Q[str(qid)]["options"]
    n = _norm(raw)
    for o in opts:
        if _norm(o["answer"]) == n:
            if subscore is not None and abs(o["score"] - float(subscore)) >= 1:
                print(f"  q{qid}: the MRD's answer {raw!r} has subscore {subscore:g}, which is another option's; taking the text", file=sys.stderr)
            return o["answer"]
    if subscore is not None:
        hit = [o["answer"] for o in opts if abs(o["score"] - float(subscore)) < 1]
        if len(hit) == 1:
            return hit[0]
    pre = [o["answer"] for o in opts if n.startswith(_norm(o["answer"]) + " ")]
    if pre:
        return max(pre, key=len)
    cut = [o["answer"] for o in opts if len(n.split()) >= 3 and _norm(o["answer"]).startswith(n + " ")]   # 'No, no migrants may obtain dual nationality.'
    if len(cut) == 1:
        return cut[0]
    words = set(n.split())                                         # 'Migrant worker have completely free choice of employment.'
    close = [o["answer"] for o in opts if len(words) >= 4 and len(words ^ set(_norm(o["answer"]).split())) <= 2]
    return close[0] if len(close) == 1 else None


IMPL_SCALE = ["Effectively Never", "Rarely", "Sometimes", "Usually", "Effectively Always"]


def to_impl(raw):
    """The MRD's implementation rating ('Effectively Always; Usually' and the like) as one of the codebook's options, or None."""
    raw = (raw or "").strip()
    if raw in IMPL_OPTS:
        return raw
    parts = [p.strip().rstrip(".") for p in raw.split(";") if p.strip()]
    if parts and all(p in IMPL_SCALE for p in parts):
        idx = sorted({IMPL_SCALE.index(p) for p in parts})
        if len(idx) == 1:
            return IMPL_SCALE[idx[0]]
        if len(idx) == 2 and idx[1] - idx[0] == 1:
            return f"{IMPL_SCALE[idx[0]]}; {IMPL_SCALE[idx[1]]}"
    return None


def extracted_sources(ci):
    """The laws our extraction pass read out of an MRD citation (citations.extracted), as cited sources: the MRD gives no URLs or quotes in the original."""
    ex = ci.get("extracted")
    if isinstance(ex, str):
        try:
            ex = json.loads(ex)
        except ValueError:
            ex = None
    out = []
    for l in (ex or {}).get("laws") or []:
        name = l.get("name_official") or l.get("name_en") or l.get("name_cited") or "?"
        if l.get("number") and l["number"] not in name:
            name += f" ({l['number']})"
        out.append({"instrument": name, "article": l.get("articles") or "", "url": None, "quote": l.get("quote")})
    return out


def starting_answers(c, qids, ans_rows, cit_rows, year=None):
    """The published answer per indicator, in the dict shape the coder's output has (audit.answer_block reads it).
    year=None: the latest year per indicator (the dossiers). year=2020|2023: the MRD's human coding of that year only."""
    by = {}
    for r in ans_rows:
        if int(r["country_id"]) == c["id"] and (year is None or int(r["year"]) == year):
            k = int(r["question_id"])
            if k not in by or int(r["year"]) > int(by[k]["year"]):
                by[k] = r                                            # the latest year (the MRD has 2020 and 2023)
    cits = {}
    for r in sorted((r for r in cit_rows if int(r["country_id"]) == c["id"]), key=lambda r: int(r.get("id") or 0)):
        k = int(r["question_id"])
        if k in cits:                                                # Argentina 117 holds a second, mis-filed citation (about child detention)
            print(f"  q{k}: {len(cits[k]) + 1} citations in the database; using id {cits[k][0].get('id')}, ignoring id {r.get('id')}", file=sys.stderr)
        cits.setdefault(k, []).append(r)
    cits = {k: v[0] for k, v in cits.items()}
    mrd = bool(c.get("mrd"))
    out, missing = [], []
    for q in qids:
        a = by.get(q)
        if not a:
            missing.append(q); continue
        iq = Q[str(q)].get("implementation_id")
        im = by.get(iq) or {}
        ci = cits.get(q) or {}
        row = {"question_id": q, "year": int(a["year"]), "answer": a["answer"], "citation": ci.get("text_en") or "—",
               "sources": parse_local(ci.get("local_text_en")), "international": ci.get("international_text_en"),
               "implementation": im.get("answer") or "Does Not Apply", "evidence": im.get("evidence"),
               "evidence_sources": im.get("sources") or [], "confidence": a.get("confidence"), "notes": a.get("notes")}
        if mrd:
            notes = []
            opt = to_option(q, a["answer"], a.get("subscore"))
            if opt is None:
                print(f"  q{q}: the MRD's answer {a['answer']!r} matches none of the options; shown as the MRD wrote it", file=sys.stderr)
            elif opt != a["answer"]:
                notes.append(f"the MRD's own wording of the answer: \"{a['answer']}\"")
            imp = to_impl(im.get("answer"))
            if im.get("answer") and imp != im["answer"]:
                notes.append(f"the MRD's own implementation rating: \"{im['answer']}\"" + ("" if imp else " (two ratings that are not neighbours: it rates two parts or two groups apart)"))
            if not row["sources"]:
                row["sources"] = extracted_sources(ci)
            row.update(answer=opt or a["answer"], implementation=imp or im.get("answer") or "Does Not Apply", mrd=True,
                       confidence="not recorded by the MRD", notes="; ".join(notes) or None)
        out.append(row)
    return out, missing


def mrd_reference(c, qids, ans_rows, year):
    """{qid: (answer, implementation)} of the MRD's coding in another year, for the prompt's context."""
    got, _ = starting_answers(c, qids, ans_rows, [], year)
    return {a["question_id"]: (a["answer"], a["implementation"]) for a in got}


def load_rows(c, qids, fixture):
    """(answers rows, citations rows, law map). Read only."""
    if fixture:
        d = json.load(open(fixture, encoding="utf-8"))
        return d["answers"], d["citations"], d.get("lawmap")
    want = sorted(set(qids) | {Q[str(q)]["implementation_id"] for q in qids if Q[str(q)].get("implementation_id")})
    ans = A.sb_all(f"answers?select=*&country_id=eq.{c['id']}&question_id=in.({','.join(map(str, want))})")
    cit = A.sb_all(f"citations?select=*&country_id=eq.{c['id']}&question_id=in.({','.join(map(str, qids))})")
    return ans, cit, (None if c.get("mrd") else A.lawmap_of(c))     # the MRD's countries have no law map


def start_label(year, mrd=False):
    if year == 2023:
        return "1 January 2023 (the MRD's human coding, as of that date)"
    if mrd and year == 2020:
        return ("1 January 2020 (the MRD's human coding, from the 2023 instrument's second pass, which answered each question again "
                "as of that date; the citation above is the one the MRD wrote for 1 January 2023, it has none of its own for 2020)")
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


def start_block(answers, ref=None):
    """ref: {qid: (answer, implementation)} of the MRD's 2023 coding, shown beside a 2020 starting answer."""
    out = []
    for a in answers:
        b = f"{A.answer_block(a, True)}\nStarting answer as of: {start_label(a['year'], a.get('mrd'))}"
        if a.get("mrd") and a["year"] == 2023:
            b += "\nThe citation is the MRD's own, for its coding as of 1 January 2023; the legal sources listed are the laws it names (it gives no URLs: find the texts yourself)."
        if ref and a["question_id"] in ref:
            r = ref[a["question_id"]]
            b += f"\nFor reference, the MRD's answer as of 1 January 2023: \"{r[0]}\"; implementation \"{r[1]}\"."
        out.append(b)
    return "\n\n".join(out)


def indicators_text(c, qids):
    """compile.indicators_text, without the country's own MRD answer among the worked examples (Argentina and Chile are in the MRD)."""
    if not c.get("mrd"):
        return C.indicators_text(c, qids)
    saved = {q: Q[str(q)]["examples"] for q in qids}
    try:
        for q in qids:
            Q[str(q)]["examples"] = [e for e in saved[q] if e["iso"] != c["iso"]]
        return C.indicators_text(c, qids)
    finally:
        for q in qids:
            Q[str(q)]["examples"] = saved[q]


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
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), indicators_text(c, qids), task])
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
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), indicators_text(c, qids), task])
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
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), indicators_text(c, qids), task])
    return job("timeline", key, qids, system, f"For q{', q'.join(map(str, qids))} in {c['name']}: one history per provision, and the answers on 1 January 2020, 2023 and 2026. Answer with the JSON.",
               timeline_schema(qids))


def back2000_prompt(c, key, answers, lawmap, ref=None):
    qids = [a["question_id"] for a in answers]
    task = f"""Your task: back in time, from 1 January 2020 to 1 January 2000

Each indicator below has a starting answer: the MRD's own answer as of 1 January 2020, shown with the citation the MRD wrote for its coding as of 1 January 2023 (it wrote none for 2020) and, for reference, its answer as of 1 January 2023. Do not code the indicator afresh. For each:
- Find the provisions the 2020 answer rests on. Where a cited provision entered into force after 1 January 2020, the 2020 answer rests on the provision it replaced: find that predecessor and read it.
- Trace the full amendment history, from 1 January 2000 to 1 January 2020, of every cited provision AND of its predecessors: each enactment, amendment, repeal, replacement and renumbering, dated by entry into force, with the amending instrument, and every new instrument or ruling in that period that bears on the indicator. Record each in `provisions` (with its role) and `events`.
- Where the regime changed: {c.get('history') or 'find out whether the country replaced its migration law or the other cited instruments between 2000 and 2020, and trace the old ones too.'}
- If the answer on 1 January 2020 is the lowest option ("No" or its equivalent), search for a protection that existed between 2000 and 2020 and was repealed or narrowed before 2020: earlier versions of the act, the predecessor law, a regulation or decree since replaced. Say what you searched and what you found.
- Date every ruling you rely on (it counts from its own date, not before) and look for later rulings that overturned, narrowed or extended it.
- Give the answer, in the indicator's own options, and the implementation on 1 January 2000, 2005, 2010 and 2015 in `answers_by_date` (one entry per date), and the change between 1 January 2000 and 1 January 2020 in the instrument's change scale (its own wording). The answer on 1 January 2020 is the starting answer and is not repeated; where a recorded event shows it was wrong on its own date, say so in `starting_answer_concern`.
- Implementation on each date is judged from practice documented around that date (reports, findings, data, cases of that period), not from today's. Where there is no practice evidence for a period, say so in that date's `basis`, rate from what there is, and lower the confidence. Sourcing for 2000 and 2005 is often thin: say where it is.

{RULES}

{tools_line(c)}

The starting answers
""" + start_block(answers, ref)
    system = "\n\n".join([C.method_text(c), C.country_text(c, lawmap), indicators_text(c, qids), task])
    return job("back2000", key, qids, system, f"For q{', q'.join(map(str, qids))} in {c['name']}: the history of the cited provisions and their predecessors from 2000, and the answers on 1 January 2000, 2005, 2010 and 2015. Answer with the JSON.",
               back2000_schema(qids))


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


PROVISION2000 = obj({
    "instrument": s("official name and number"), "article": s("the provision"),
    "role": enum(["cited", "predecessor", "other_in_force"], "cited = in the MRD's citation; predecessor = what a cited provision replaced; other_in_force = another provision the answer rested on in 2000-2020"),
    "in_force": s(f"from when to when it was in force ({DATE} to {DATE}, or 'today')"),
    "history_read": PROVISION["properties"]["history_read"],
})


def back2000_schema(qids):
    ans = answers_enum(qids)
    date_item = obj({
        "date": enum(BACK2000_DATES, "1 January of the year"),
        "answer": enum(ans, "the answer on that date, one of the indicator's options verbatim"),
        "implementation": enum(IMPL_OPTS, "implementation on that date, from practice documented around it"),
        "basis": s("1-3 sentences: the provisions in force on that date that give this answer, the events that make it differ from the next date, and the practice evidence of that period (or that there is none)"),
    })
    p = {"question_id": {"type": "integer", "description": "the q-number"},
         "answers_by_date": arr(date_item, "exactly four entries, one per date, 2000 first"),
         "change_2000_2020": enum(change_scale(2000, 2020), "the instrument's change scale, 1 January 2000 against the starting answer (1 January 2020)"),
         "provisions": arr(PROVISION2000, "the cited provisions, their predecessors and any other provision the answer rested on between 2000 and 2020"),
         "events": arr(EVENT, "the full amendment history of those provisions from 1 January 2000 to 1 January 2020, and any other dated event that bears on the indicator"),
         "repealed_search": s("for an answer that is the lowest option in 2020: what you searched for a protection that existed between 2000 and 2020 and was repealed, and what you found; otherwise 'not applicable'"),
         "rulings": arr(RULING, "every ruling the answers rest on or that bears on them, dated; empty if none"),
         "practice_sources": arr(practice_item(["around_2000", "around_2005", "around_2010", "around_2015", "around_2020", "several"]), "the practice evidence relied on"),
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
    if step == "back2000" and not c.get("mrd"):
        sys.exit("back2000 starts from the MRD's own answer as of 1 January 2020: only for the MRD's countries (MRD_COUNTRIES)")
    year = START_YEAR.get(step) if c.get("mrd") else None
    ans_rows, cit_rows, lawmap = load_rows(c, ch["questions"], fixture)
    answers, missing = starting_answers(c, ch["questions"], ans_rows, cit_rows, year)
    if missing and not fixture:
        print(f"  no {'MRD ' + str(year) if year else 'published'} answer for q{missing}; left out", file=sys.stderr)
    if not answers:
        sys.exit(f"{c['name']} · {key}: no starting answers")
    if step == "forward":
        j = forward_prompt(c, key, answers, lawmap)
    elif step == "back":
        j = back_prompt(c, key, answers, lawmap)
    elif step == "timeline":
        j = timeline_prompt(c, key, answers, lawmap)
    elif step == "back2000":
        j = back2000_prompt(c, key, answers, lawmap, mrd_reference(c, ch["questions"], ans_rows, 2023))
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
           "source": f"fixture {os.path.basename(fixture)}" if fixture else ("database, the MRD's " + str(year) + " coding" if year else "database"),
           # the `read` tool's script: compile.py knows only compile.COUNTRIES
           "reader": "history.py" if c.get("mrd") else "compile.py"}
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    probs, st = check_schema(j["schema"])
    print(f"{c['name']} · {step} · {key}: 1 job, {len(j['qids'])} indicators, schema {st}" + (f", PROBLEMS: {probs}" if probs else ""))
    return 1 if probs else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug"); ap.add_argument("--emit", nargs=2, metavar=("STEP", "PATH"))
    ap.add_argument("--chunk"); ap.add_argument("--fixture")
    ap.add_argument("--check-schemas", action="store_true")
    ap.add_argument("--read", metavar="URL"); ap.add_argument("--find"); ap.add_argument("--max-chars", type=int, default=12000)
    a = ap.parse_args()
    c = COUNTRIES.get(a.slug) or MRD_COUNTRIES.get(a.slug)
    if not c:
        sys.exit(f"unknown country {a.slug}; one of {', '.join(list(COUNTRIES) + list(MRD_COUNTRIES))}")
    C.COUNTRY = c
    if a.read:                                       # what compile.py --read does, for any country here; writes nothing
        C.DRY = True
        print(C.tool_read({"url": a.read, "find": a.find, "max_chars": a.max_chars}, "read")); return
    if a.chunk not in CHUNKS:
        sys.exit(f"unknown chunk {a.chunk}; one of {', '.join(CHUNKS)}")
    if a.check_schemas:
        qids = CHUNKS[a.chunk]["questions"]
        bad = 0
        for name, sch in [("forward", forward_schema(qids)), ("back", back_schema(qids, 2026)), ("timeline", timeline_schema(qids)),
                          ("back2000", back2000_schema(qids)),
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
