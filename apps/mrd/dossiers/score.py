"""Score a compiled dossier the way the MRD does, and write the country overview.

    python3 score.py <slug>

Protection = mean of the category's protection subscores (a No counts 0); Implementation = mean of
the implementation subscores, Does Not Apply excluded; Adjusted = Protection x Implementation / 100;
the Average row is the mean across the categories. Then Opus writes the overview paragraph in
English, Spanish and French from the scores and the citations, and the run moves on to the laws.
"""
import json, os, statistics, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "laws"))
from lib import sb, sb_all, http   # noqa: E402
from compile import COUNTRIES, CODEBOOK, Q, YEAR, MODEL, api_call, account, RUN, log, beat  # noqa: E402
import compile as C                 # noqa: E402


def category_scores(country_id, year):
    cats = {c["slug"]: c for c in sb_all("categories?select=id,slug,name_en,macrogroup")}
    rows = sb_all(f"answers?select=question_id,subscore&country_id=eq.{country_id}&year=eq.{year}")
    sub = {r["question_id"]: r["subscore"] for r in rows}
    by_cat = {}
    for qid, q in Q.items():
        if int(qid) not in sub:
            continue
        p = sub[int(qid)]; p = float(p) if p is not None else 0.0
        i = sub.get(q["implementation_id"]); i = float(i) if i is not None else None
        d = by_cat.setdefault(q["category"], {"P": [], "I": []})
        d["P"].append(p)
        if i is not None:
            d["I"].append(i)
    out = []
    for slug, d in by_cat.items():
        P = statistics.mean(d["P"]) if d["P"] else None
        I = statistics.mean(d["I"]) if d["I"] else None
        A = (P * I / 100) if (P is not None and I is not None) else None
        out.append({"category_id": cats[slug]["id"], "slug": slug, "name": cats[slug]["name_en"], "Protection": P, "Implementation": I, "Adjusted": A, "n": len(d["P"])})
    avg = {}
    for t in ("Protection", "Implementation", "Adjusted"):
        vals = [c[t] for c in out if c[t] is not None]
        avg[t] = statistics.mean(vals) if vals else None
    total = next(c for c in cats.values() if c["macrogroup"] == "TOTAL SCORE")
    out.append({"category_id": total["id"], "slug": total["slug"], "name": total["name_en"], **avg, "n": len(out)})
    return out


OVERVIEW_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["en", "es", "fr"],
                   "properties": {"en": {"type": "string"}, "es": {"type": "string"}, "fr": {"type": "string"}}}


def overview(c, scores, year):
    cits = sb_all(f"citations?select=question_id,text_en&country_id=eq.{c['id']}&order=question_id")
    ans = {r["question_id"]: r for r in sb_all(f"answers?select=question_id,answer,subscore&country_id=eq.{c['id']}&year=eq.{year}")}
    lines = []
    for ci in cits:
        q = Q.get(str(ci["question_id"]))
        if not q:
            continue
        a = ans.get(ci["question_id"], {}); i = ans.get(q["implementation_id"], {})
        lines.append(f"- [{q['category_name']}] {q['text']} → {a.get('answer')} ({a.get('subscore')}); implementation: {i.get('answer')}. {ci['text_en'][:500]}")
    table = "\n".join(f"- {s['name']}: Protection {s['Protection']:.0f}, Implementation {s['Implementation']:.0f}, Adjusted {s['Adjusted']:.0f}" if s["Implementation"] is not None
                      else f"- {s['name']}: Protection {s['Protection']:.0f}" for s in scores)
    examples = "\n\n".join(f"{co['name_en']}: {co['description_en']}" for co in sb("GET", "countries", params={"iso": "in.(" + ",".join(c["examples"]) + ")", "select": "name_en,description_en"}) if co.get("description_en"))
    system = f"""You write the country overview for the Migrant Rights Database (Cornell's Migrant Rights Initiative), in its house style: one paragraph of 110-180 words that says where the country stands overall (how complete its legal protections are, how well they are implemented, how it compares with the database's sample), names the categories where it protects migrants most and least completely, and points to one or two distinctive features of its law. Measured, factual, third person, no bullet points, no headings. Then the same paragraph in Spanish and in French, as the database publishes all three. Examples of the style, from the database's own write-ups:

{examples}"""
    user = f"Country: {c['name']} (coded {YEAR}, experimental dossier compiled by Claude).\n\nScores (0-100):\n{table}\n\nIndicator answers and citations:\n" + "\n".join(lines)
    body = {"model": MODEL, "max_tokens": 4000, "system": system, "messages": [{"role": "user", "content": user}],
            "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": OVERVIEW_SCHEMA}}, "fallbacks": "default"}
    r = api_call(body); account(r.get("usage", {}))
    if r.get("stop_reason") != "end_turn":
        raise RuntimeError(f"overview stop_reason {r.get('stop_reason')}")
    text = "".join(b.get("text", "") for b in r["content"] if b.get("type") == "text")
    return json.loads(text)


def main():
    slug = sys.argv[1]; c = COUNTRIES[slug]
    C.COUNTRY = c
    C.RUN_BASE = (sb("GET", "dossier_runs", params={"country_id": f"eq.{c['id']}", "select": "*"}) or [{}])[0]
    beat(status="scoring", note=f"Scoring {c['name']} and writing the overview.", force=True)
    log("step", "Scoring: Protection, Implementation and Adjusted per category", "score")
    scores = category_scores(c["id"], YEAR)
    rows = []
    for s in scores:
        for t in ("Protection", "Implementation", "Adjusted"):
            if s[t] is not None:
                rows.append({"country_id": c["id"], "year": YEAR, "category_id": s["category_id"], "score_type": t, "score": round(s[t], 1), "experimental": True})
    sb("POST", "scores?on_conflict=country_id,year,category_id,score_type", rows, prefer="resolution=merge-duplicates,return=minimal")
    avg = scores[-1]
    log("answer", f"Average: Protection {avg['Protection']:.0f} · Implementation {avg['Implementation']:.0f} · Adjusted {avg['Adjusted']:.0f}", "score")
    for s in scores[:-1]:
        print(f"  {s['name']:45} P {s['Protection']:5.1f}  I {s['Implementation'] if s['Implementation'] is None else round(s['Implementation'],1)!s:>5}  A {s['Adjusted'] if s['Adjusted'] is None else round(s['Adjusted'],1)!s:>5}  ({s['n']})")
    ov = overview(c, scores, YEAR)
    sb("PATCH", f"countries?id=eq.{c['id']}", {"description_en": ov["en"], "description_es": ov["es"], "description_fr": ov["fr"],
                                               "coded_at": "now()", "coded_by": MODEL}, prefer="return=minimal")
    log("step", "Overview written (en, es, fr)", "score")
    print(ov["en"])
    beat(status="laws", note=f"Scored. Now tracing the laws {c['name']}'s citations name (the crawl).", force=True)


if __name__ == "__main__":
    main()
