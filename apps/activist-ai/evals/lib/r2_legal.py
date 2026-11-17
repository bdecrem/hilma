"""Round two, legal tasks d5 to d8, in the laws' own languages: false cognates (actual / eventual /
eventuell / attuale), cross-references to another article's paragraph, amendments with a future entry
into force, and negations with exceptions. Every law is made up."""
import json, re
from pathlib import Path
from evalkit import read_csv, write_csv, num, read, verbatim, ws
import r2common as R
from r2_scale import wtext


def law_rows(work, file="laws.json"):
    return json.loads(Path(work, file).read_text(encoding="utf-8"))


def article_text(laws, law, art):
    for l in laws:
        if l["law"] == law:
            for a in l["articles"]:
                if str(a["article"]) == str(art):
                    return a["text"]
    return ""


def match_law(name, laws):
    n = " ".join((name or "").lower().split())
    for l in laws:
        if l["law"].lower() in n or n in l["law"].lower() or l.get("short", "@").lower() in n:
            return l["law"]
    return None


def art_no(s):
    m = re.search(r"\d+", s or "")
    return int(m.group()) if m else None


FILL = {"es": "Las solicitudes se presentarán por escrito ante la oficina competente.", "fr": "Les demandes sont déposées par écrit auprès du service compétent.",
        "it": "Le domande sono presentate per iscritto all'ufficio competente.", "pt": "Os pedidos são apresentados por escrito junto do serviço competente.",
        "de": "Anträge sind schriftlich bei der zuständigen Behörde zu stellen.", "en": "Applications shall be made in writing to the competent office."}


def build(rng, specs, extra=4):
    """specs: list of (law name, short, language, {article no: text}). Adds filler articles."""
    laws = []
    for name, short, lang, arts in specs:
        nums = set(arts)
        while len(nums) < len(arts) + extra:
            nums.add(rng.randint(1, 40))
        laws.append({"law": name, "short": short, "language": lang, "articles": [{"article": str(a), "text": arts.get(a, FILL[lang])} for a in sorted(nums)]})
    return laws


# ============================================================ d5: does the new deadline reach applications already pending?
D5_YES = {"es": "Lo dispuesto en el artículo {a} se aplicará también a las solicitudes actuales.",
          "fr": "Les dispositions de l'article {a} s'appliquent aux demandes actuellement en cours d'instruction.",
          "it": "Le disposizioni dell'articolo {a} si applicano alle domande attualmente pendenti.",
          "pt": "O disposto no artigo {a} aplica-se aos pedidos atuais.",
          "de": "§ {a} gilt auch für eventuell bereits gestellte Anträge."}
D5_NO = {"es": "Lo dispuesto en el artículo {a} se aplicará únicamente a las solicitudes eventuales que se presenten tras su entrada en vigor.",
         "fr": "Les dispositions de l'article {a} ne s'appliquent qu'aux demandes éventuelles déposées après leur entrée en vigueur.",
         "it": "Le disposizioni dell'articolo {a} si applicano alle eventuali domande presentate dopo l'entrata in vigore.",
         "pt": "O disposto no artigo {a} aplica-se apenas a eventuais pedidos apresentados após a sua entrada em vigor.",
         "de": "§ {a} gilt erst für Anträge, die nach seinem Inkrafttreten eventuell gestellt werden."}
D5_RULE = {"es": "El plazo para resolver la solicitud de residencia será de quince días.", "fr": "Le délai pour statuer sur la demande de séjour est de quinze jours.",
           "it": "Il termine per decidere sulla domanda di soggiorno è di quindici giorni.", "pt": "O prazo para decidir o pedido de residência é de quinze dias.",
           "de": "Über den Aufenthaltsantrag ist innerhalb von fünfzehn Tagen zu entscheiden."}
D5_FEE = {"es": "La tasa por la tramitación de la solicitud será de sesenta euros.", "fr": "La taxe due pour l'instruction de la demande est de soixante euros.",
          "it": "Il contributo per l'esame della domanda è di sessanta euro.", "pt": "A taxa devida pela apreciação do pedido é de sessenta euros.",
          "de": "Für die Bearbeitung des Antrags wird eine Gebühr von sechzig Euro erhoben."}
D5_NAMES = [("Ley 4/2025 de residencia (Vesta)", "es"), ("Ley 9/2025 de extranjería (Pelag)", "es"), ("Loi n° 2025-31 relative au séjour (Calder)", "fr"),
            ("Legge 12/2025 sul soggiorno (Sudria)", "it"), ("Lei n.º 7/2025 de residência (Ostland)", "pt"), ("Aufenthaltsgesetz 2025 (Morrow)", "de")]


def d5_generate(work, seed, rng):
    specs, truth = [], {}
    for name, lang in D5_NAMES:
        rule_a, fee_a, trans_a, trans_b = rng.sample(range(3, 15), 2) + rng.sample(range(30, 45), 2)
        yes = rng.random() < 0.5
        # v2: the fee article has its own transitional rule, of the opposite polarity, in a nearby article
        specs.append((name, name.split("(")[-1].rstrip(")"), lang, {rule_a: D5_RULE[lang], fee_a: D5_FEE[lang], trans_a: (D5_YES if yes else D5_NO)[lang].format(a=rule_a),
                                                                     trans_b: (D5_NO if yes else D5_YES)[lang].format(a=fee_a)}))
        truth[name] = [yes, trans_a]
    laws = build(rng, specs, extra=12)
    wtext(work / "laws.json", json.dumps(laws, ensure_ascii=False, indent=1))
    return {"laws": truth, "all": laws}


def d5_check(work, truth, session, C):
    names = ["transitional_columns", "verdicts_correct", "articles_correct", "quotes_verbatim_original"]
    if not C.exists(work, "transitional.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "transitional.csv")
    if not C.add("transitional_columns", rows and {"law", "applies_to_pending", "article", "quote"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {}
    for r in rows:
        l = match_law(r["law"], truth["all"])
        if l:
            got[l] = r
    yes = lambda s: (s or "").strip().lower() in ("yes", "true", "y")
    C.add("verdicts_correct", all(l in got and yes(got[l]["applies_to_pending"]) == v[0] for l, v in truth["laws"].items()), "numbers_wrong",
          [l for l, v in truth["laws"].items() if l in got and yes(got[l]["applies_to_pending"]) != v[0]][:3])
    C.add("articles_correct", all(l in got and art_no(got[l]["article"]) == v[1] for l, v in truth["laws"].items()), "citation_wrong")
    C.add("quotes_verbatim_original", all(l in got and verbatim(got[l]["quote"], article_text(truth["all"], l, v[1])) for l, v in truth["laws"].items()), "quote_not_verbatim")


def d5_write(work, truth, cognate=False, english=False):
    rows = []
    for l, (yes, a) in truth["laws"].items():
        t = article_text(truth["all"], l, a)
        v = yes
        if cognate and re.search(r"eventu|actual", t, re.I):
            v = not yes if re.search(r"eventuell|actuales|atuais", t) else yes
        rows.append([l, "yes" if v else "no", f"Article {a}", "The provision applies to pending applications." if english else t])
    write_csv(work / "transitional.csv", ["law", "applies_to_pending", "article", "quote"], rows)


D5 = dict(family="legal", level="hard", outputs=["transitional.csv"],
          instruction="laws.json has six new residence laws, each in its own language (Spanish, French, Italian, Portuguese, German). Each sets a new deadline for deciding residence applications. "
                      "For each law, does the new deadline also apply to applications that were already pending when the law came in? Write transitional.csv with columns law (its name), "
                      "applies_to_pending (yes or no), article (the article that says so), quote (the decisive words, copied exactly in the original language).",
          generate=d5_generate, check=d5_check, solve=lambda w, t: d5_write(w, t), wrong=lambda w, t: d5_write(w, t, cognate=True), wrong2=lambda w, t: d5_write(w, t, english=True))


# ============================================================ d6: maximum detention through cross-references
def d6_generate(work, seed, rng):
    specs, truth = [], {}
    # French: "that of Article A, paragraph 2, extended by half"
    a1, a2 = rng.randint(5, 12), rng.randint(15, 25)
    base = rng.choice([(60, "soixante jours"), (40, "quarante jours"), (30, "trente jours")])
    specs.append(("Code de la rétention (Calder)", "Calder", "fr", {a1: f"1. La rétention est décidée par le préfet pour une durée initiale de quarante-huit heures. 2. Elle peut être prolongée pour une durée de {base[1]}.",
                                                                    a2: f"La durée maximale de la rétention est celle prévue à l'article {a1}, paragraphe 2, prolongée de moitié."}))
    truth["Code de la rétention (Calder)"] = [base[0] * 1.5, sorted([a1, a2])]
    # German: "the period in § B (3)"
    b1, b2 = rng.randint(5, 12), rng.randint(15, 25)
    w = rng.choice([(42, "sechs Wochen"), (28, "vier Wochen"), (56, "acht Wochen")])
    specs.append(("Abschiebungshaftgesetz (Morrow)", "Morrow", "de", {b1: f"(1) Die Haft wird vom Gericht angeordnet. (2) Sie ist alle zwei Wochen zu überprüfen. (3) Die Haft darf {w[1]} nicht überschreiten.",
                                                                       b2: f"Die Höchstdauer der Abschiebungshaft entspricht der in § {b1} Absatz 3 genannten Frist."}))
    truth["Abschiebungshaftgesetz (Morrow)"] = [w[0], sorted([b1, b2])]
    # Spanish: double the period of article C.1
    c1, c2 = rng.randint(5, 12), rng.randint(15, 25)
    s = rng.choice([(20, "veinte días"), (30, "treinta días"), (15, "quince días")])
    specs.append(("Ley de internamiento (Vesta)", "Vesta", "es", {c1: f"1. El internamiento inicial no podrá exceder de {s[1]}. 2. El juez revisará la medida cada diez días.",
                                                                 c2: f"El internamiento no podrá prolongarse más allá del doble del plazo previsto en el artículo {c1}.1."}))
    truth["Ley de internamiento (Vesta)"] = [s[0] * 2, sorted([c1, c2])]
    # Italian: direct, with a review interval as a distractor
    d1 = rng.randint(5, 25)
    it = rng.choice([(90, "novanta giorni"), (120, "centoventi giorni"), (180, "centottanta giorni")])
    specs.append(("Legge sul trattenimento (Sudria)", "Sudria", "it", {d1: f"Il trattenimento non può superare {it[1]}. Il giudice verifica la misura ogni trenta giorni."}))
    truth["Legge sul trattenimento (Sudria)"] = [it[0], [d1]]
    # English: by reference to section 5(2)
    e1, e2 = rng.randint(3, 8), rng.randint(15, 25)
    en = rng.choice([(28, "twenty-eight days"), (14, "fourteen days"), (21, "twenty-one days")])
    specs.append(("Immigration Detention Act (Norland)", "Norland", "en", {e1: f"(1) A detention order lasts seventy-two hours unless renewed. (2) A renewed order may not run for more than {en[1]} in all.",
                                                                           e2: f"No person may be detained under this Act for longer than the period in section {e1}(2)."}))
    truth["Immigration Detention Act (Norland)"] = [en[0], sorted([e1, e2])]
    # Portuguese: direct
    f1 = rng.randint(5, 25)
    pt = rng.choice([(60, "sessenta dias"), (45, "quarenta e cinco dias")])
    specs.append(("Lei da detenção (Ostland)", "Ostland", "pt", {f1: f"A detenção não pode exceder {pt[1]}, salvo decisão judicial fundamentada que a prorrogue por igual período."}))
    truth["Lei da detenção (Ostland)"] = [pt[0] * 2, [f1]]
    other = {"fr": "L'assignation à résidence ne peut excéder quarante-cinq jours.", "de": "Der Ausreisegewahrsam darf zehn Tage nicht überschreiten.",
             "es": "La obligación de presentarse periódicamente no podrá exceder de seis meses.", "it": "L'obbligo di dimora non può superare sei mesi.",
             "en": "A reporting condition may not be imposed for longer than six months.", "pt": "A obrigação de apresentação periódica não pode exceder seis meses."}
    for sp in specs:  # v2: a maximum for a different measure, in an article of its own
        free = [a for a in range(26, 40) if a not in sp[3]]
        sp[3][rng.choice(free)] = other[sp[2]]
    laws = build(rng, specs, extra=10)
    wtext(work / "laws.json", json.dumps(laws, ensure_ascii=False, indent=1))
    return {"laws": truth, "all": laws}


def d6_check(work, truth, session, C):
    names = ["detention_columns", "max_days_correct", "articles_include_references"]
    if not C.exists(work, "detention.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "detention.csv")
    if not C.add("detention_columns", rows and {"law", "max_days", "articles"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {}
    for r in rows:
        l = match_law(r["law"], truth["all"])
        if l:
            got[l] = r
    bad = [l for l, v in truth["laws"].items() if l not in got or num(got[l]["max_days"]) is None or abs(num(got[l]["max_days"]) - v[0]) > 0.01]
    C.add("max_days_correct", not bad, "numbers_wrong", bad[:3])
    C.add("articles_include_references", all(l in got and set(v[1]) <= {int(x) for x in re.findall(r"\d+", got[l]["articles"])} for l, v in truth["laws"].items()), "citation_wrong")


def d6_write(work, truth, no_ref=False, no_extension=False):
    rows = []
    for l, (d, arts) in truth["laws"].items():
        if no_ref and len(arts) == 2:
            d = d / 1.5 if "Calder" in l else d / 2 if "Vesta" in l else d
        if no_extension and "Ostland" in l:
            d = d / 2
        rows.append([l, d, "; ".join(f"Art. {a}" for a in arts)])
    write_csv(work / "detention.csv", ["law", "max_days", "articles"], rows)


D6 = dict(family="legal", level="hard", outputs=["detention.csv"],
          instruction="laws.json has six detention laws in their original languages. For each, what is the longest a person can be held in total, counting any extension the law allows? "
                      "Some laws define it by referring to another article. Write detention.csv with columns law, max_days (a week is 7 days), articles (every article you relied on, like \"Art. 9; Art. 14\").",
          generate=d6_generate, check=d6_check, solve=lambda w, t: d6_write(w, t), wrong=lambda w, t: d6_write(w, t, no_ref=True), wrong2=lambda w, t: d6_write(w, t, no_extension=True))


# ============================================================ d7: amendments, one not yet in force
def d7_generate(work, seed, rng):
    w1 = rng.choice([("quinze jours", 15), ("vingt jours", 20)])
    w2 = rng.choice([("vingt et un jours", 21), ("dix jours", 10)])
    w3 = rng.choice([("diez días", 10), ("veinte días", 20)])
    future = rng.choice([("1 de enero de 2027", True), ("1 de enero de 2026", False)])
    a14, a20, b8, b11 = rng.randint(12, 16), rng.randint(18, 24), rng.randint(5, 9), rng.randint(10, 14)
    docs = [
        {"law": "Loi n° 2018-12 sur l'asile (Calder)", "language": "fr", "date": "2018-03-01", "articles": [
            {"article": str(a14), "text": "Le recours contre une décision de refus est formé dans un délai de trente jours."},
            {"article": str(a20), "text": "La demande de réexamen est présentée dans un délai de deux mois."}]},
        {"law": "Loi n° 2021-4 modifiant la loi n° 2018-12 (Calder)", "language": "fr", "date": "2021-06-15", "in_force": "2021-07-01", "articles": [
            {"article": "1", "text": f"À l'article {a14} de la loi n° 2018-12, les mots « trente jours » sont remplacés par les mots « {w1[0]} »."},
            {"article": "2", "text": f"À l'article {a20} de la loi n° 2018-12, le délai de deux mois est maintenu."}]},
        {"law": "Loi n° 2024-9 modifiant la loi n° 2018-12 (Calder)", "language": "fr", "date": "2024-02-10", "in_force": "2024-03-01", "articles": [
            {"article": "1", "text": f"À l'article {a14} de la loi n° 2018-12, les mots « {w1[0]} » sont remplacés par les mots « {w2[0]} »."}]},
        {"law": "Loi n° 2025-2 modifiant la loi n° 2018-21 sur les visas (Calder)", "language": "fr", "date": "2025-01-20", "in_force": "2025-02-01", "articles": [
            {"article": "1", "text": f"À l'article {a14} de la loi n° 2018-21, les mots « {w2[0]} » sont remplacés par les mots « cinq jours »."}]},
        {"law": "Ley 3/2019 de protección internacional (Vesta)", "language": "es", "date": "2019-05-02", "articles": [
            {"article": str(b8), "text": "El recurso contra la denegación se interpondrá en el plazo de un mes."},
            {"article": str(b11), "text": "La solicitud de reexamen se presentará en el plazo de quince días."}]},
        {"law": "Ley 6/2025 por la que se modifica la Ley 3/2019 (Vesta)", "language": "es", "date": "2025-11-20", "in_force": future[0], "articles": [
            {"article": "único", "text": f"En el artículo {b8} de la Ley 3/2019, las palabras «un mes» se sustituyen por «{w3[0]}». Esta ley entrará en vigor el {future[0]}."}]},
    ]
    wtext(work / "laws.json", json.dumps(docs, ensure_ascii=False, indent=1))
    truth = {f"Calder|{a14}": w2[1], f"Calder|{a20}": 60, f"Vesta|{b8}": (30 if future[1] else w3[1]), f"Vesta|{b11}": 15}
    return {"current": truth, "naive": {**truth, f"Vesta|{b8}": w3[1], f"Calder|{a14}": w1[1]}}


def d7_check(work, truth, session, C):
    names = ["current_columns", "current_deadlines_correct"]
    if not C.exists(work, "current.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "current.csv")
    if not C.add("current_columns", rows and {"law", "article", "days"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {}
    for r in rows:
        k = ("Calder" if re.search(r"calder|2018|asile", r["law"], re.I) else "Vesta" if re.search(r"vesta|3/2019|protecci", r["law"], re.I) else "?") + f"|{art_no(r['article'])}"
        got[k] = num(r["days"])
    bad = [k for k, v in truth["current"].items() if got.get(k) != v]
    C.add("current_deadlines_correct", not bad, "numbers_wrong", bad)


def d7_write(work, truth, which="current"):
    write_csv(work / "current.csv", ["law", "article", "days"], [[k.split("|")[0], f"Article {k.split('|')[1]}", v] for k, v in truth[which].items()])


def d7_wrong2(work, truth):
    t = dict(truth["current"])
    k = [x for x in t if x.startswith("Calder")][0]
    t[k] = truth["naive"][k]
    write_csv(work / "current.csv", ["law", "article", "days"], [[x.split("|")[0], f"Article {x.split('|')[1]}", v] for x, v in t.items()])


D7 = dict(family="legal", level="hard", outputs=["current.csv"],
          instruction="laws.json has two base laws (a French asylum law of 2018 and a Spanish international-protection law of 2019) and the laws that amended them. Today is November 16, 2026. "
                      "What is each deadline in the two base laws today? Write current.csv with columns law (the base law), article (the base law's article), days (a month is 30 days), one row per deadline article of the base laws.",
          generate=d7_generate, check=d7_check, solve=lambda w, t: d7_write(w, t), wrong=lambda w, t: d7_write(w, t, "naive"), wrong2=d7_wrong2)


# ============================================================ d8: does an appeal suspend removal?
D8 = {"de": [("Die Klage gegen die Abschiebungsanordnung hat aufschiebende Wirkung.", True), ("Die Klage gegen die Abschiebungsanordnung hat keine aufschiebende Wirkung.", False)],
      "es": [("El recurso contra la orden de expulsión tendrá efecto suspensivo, salvo en los supuestos del artículo 30.", True), ("El recurso contra la orden de expulsión no tendrá efecto suspensivo, salvo que el juez acuerde otra cosa.", False)],
      "fr": [("Le recours contre l'obligation de quitter le territoire est suspensif.", True), ("Le recours contre l'obligation de quitter le territoire n'est pas suspensif, sauf si le juge en décide autrement.", False)],
      "it": [("Il ricorso avverso il decreto di espulsione sospende l'esecuzione del provvedimento.", True), ("L'eventuale ricorso avverso il decreto di espulsione non sospende l'esecuzione del provvedimento.", False)],
      "pt": [("O recurso da decisão de afastamento tem efeito suspensivo.", True), ("O recurso da decisão de afastamento não tem efeito suspensivo, exceto se o tribunal decidir o contrário.", False)],
      "en": [("An appeal against a removal decision suspends removal unless the Secretary certifies the claim as clearly unfounded.", True), ("An appeal against a removal decision does not suspend removal unless the tribunal orders otherwise.", False)]}
D8_NAMES = {"de": "Aufenthaltsgesetz (Morrow)", "es": "Ley de extranjería (Vesta)", "fr": "Code de l'entrée et du séjour (Calder)", "it": "Testo unico (Sudria)", "pt": "Lei de estrangeiros (Ostland)", "en": "Immigration Act (Norland)"}


def d8_generate(work, seed, rng):
    specs, truth = [], {}
    for lang, name in D8_NAMES.items():
        a, b = rng.sample(range(10, 40), 2)
        txt, yes = rng.choice(D8[lang])
        fine = {"de": ("Die Klage gegen einen Bußgeldbescheid hat keine aufschiebende Wirkung.", "Die Klage gegen einen Bußgeldbescheid hat aufschiebende Wirkung."),
                "es": ("El recurso contra la sanción de multa no tendrá efecto suspensivo.", "El recurso contra la sanción de multa tendrá efecto suspensivo."),
                "fr": ("Le recours contre une amende administrative n'est pas suspensif.", "Le recours contre une amende administrative est suspensif."),
                "it": ("Il ricorso avverso la sanzione pecuniaria non sospende il pagamento.", "Il ricorso avverso la sanzione pecuniaria sospende il pagamento."),
                "pt": ("O recurso da coima não tem efeito suspensivo.", "O recurso da coima tem efeito suspensivo."),
                "en": ("An appeal against a civil penalty does not suspend payment.", "An appeal against a civil penalty suspends payment.")}[lang]
        specs.append((name, name.split("(")[-1].rstrip(")"), lang, {a: txt, b: fine[0] if yes else fine[1]}))  # v2: a fines article, opposite polarity
        truth[name] = [yes, a]
    if all(v[0] for v in truth.values()) or not any(v[0] for v in truth.values()):  # keep both answers in every seed
        name = D8_NAMES["de"]; a = truth[name][1]; yes = not truth[name][0]
        arts0 = dict(specs[0][3]); arts0[a] = D8["de"][0 if yes else 1][0]
        specs[0] = (name, "Morrow", "de", arts0); truth[name][0] = yes
    laws = build(rng, specs, extra=10)
    wtext(work / "laws.json", json.dumps(laws, ensure_ascii=False, indent=1))
    return {"laws": truth, "all": laws}


def d8_check(work, truth, session, C):
    names = ["suspensive_columns", "suspensive_verdicts", "suspensive_articles", "suspensive_quotes"]
    if not C.exists(work, "suspensive.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "suspensive.csv")
    if not C.add("suspensive_columns", rows and {"law", "suspends", "article", "quote"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {}
    for r in rows:
        l = match_law(r["law"], truth["all"])
        if l:
            got[l] = r
    yes = lambda s: (s or "").strip().lower() in ("yes", "true", "y")
    C.add("suspensive_verdicts", all(l in got and yes(got[l]["suspends"]) == v[0] for l, v in truth["laws"].items()), "numbers_wrong")
    C.add("suspensive_articles", all(l in got and art_no(got[l]["article"]) == v[1] for l, v in truth["laws"].items()), "citation_wrong")
    C.add("suspensive_quotes", all(l in got and verbatim(got[l]["quote"], article_text(truth["all"], l, v[1])) for l, v in truth["laws"].items()), "quote_not_verbatim")


def d8_write(work, truth, exception_flips=False, english=False):
    rows = []
    for l, (y, a) in truth["laws"].items():
        t = article_text(truth["all"], l, a)
        v = (not y) if exception_flips and re.search(r"salvo|sauf|exceto|unless", t) else y
        rows.append([l, "yes" if v else "no", f"Article {a}", "An appeal suspends removal." if english else t])
    write_csv(work / "suspensive.csv", ["law", "suspends", "article", "quote"], rows)


D8T = dict(family="legal", level="medium", outputs=["suspensive.csv"],
           instruction="laws.json has six immigration laws in their original languages. Under each, does an appeal against a removal order stop the removal while the appeal is heard, as the general rule? "
                       "Write suspensive.csv with columns law, suspends (yes or no), article, quote (the decisive sentence, copied exactly in the original language).",
           generate=d8_generate, check=d8_check, solve=lambda w, t: d8_write(w, t), wrong=lambda w, t: d8_write(w, t, exception_flips=True), wrong2=lambda w, t: d8_write(w, t, english=True))


TASKS = {"d5-actual-eventual": D5, "d6-cross-reference": D6, "d7-amendment-in-force": D7, "d8-suspensive-appeal": D8T}
