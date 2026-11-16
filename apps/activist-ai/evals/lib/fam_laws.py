"""Made-up national laws on foreign nationals and asylum, for fictional countries, in English,
Spanish, French and German. Three provisions are planted (maximum detention, the wait before
an asylum applicant may work, the deadline to appeal), among filler articles that carry
look-alike numbers; some deadlines are written in weeks or in words, and in the hard task some
detention limits are changed by a later amending article."""
import re
from pathlib import Path
from evalkit import read_csv, num, verbatim, ws, write_csv

LANG = {"Arvania": "en", "Belmora": "en", "Corvenia": "es", "Dastria": "fr", "Elyria": "en", "Fennmark": "de", "Galvoria": "en"}
ART = {"en": "Article", "es": "Artículo", "fr": "Article", "de": "Artikel"}
TITLE = {"en": "Act No. {n}/{y} on Foreign Nationals and Asylum ({c})", "es": "Ley {n}/{y} sobre Extranjería y Asilo ({c})",
         "fr": "Loi n° {n}/{y} relative aux étrangers et à l'asile ({c})", "de": "Gesetz Nr. {n}/{y} über Ausländer und Asyl ({c})"}
WORDS = {"en": {7: "seven", 10: "ten", 14: "fourteen", 15: "fifteen", 30: "thirty"},
         "es": {7: "siete", 10: "diez", 14: "catorce", 15: "quince", 30: "treinta"},
         "fr": {7: "sept", 10: "dix", 14: "quatorze", 15: "quinze", 30: "trente"},
         "de": {7: "sieben", 10: "zehn", 14: "vierzehn", 15: "fünfzehn", 30: "dreißig"}}
DET = {"en": ("Detention", "A foreign national may be held in immigration detention only as a last resort.", "Detention under this Act shall not exceed {v} days."),
       "es": ("Internamiento", "La persona extranjera solo podrá ser internada como último recurso.", "El internamiento no podrá exceder de {v} días."),
       "fr": ("Rétention", "L'étranger ne peut être placé en rétention qu'en dernier recours.", "La durée de la rétention ne peut excéder {v} jours."),
       "de": ("Abschiebungshaft", "Ein Ausländer darf nur als letztes Mittel in Haft genommen werden.", "Die Haft darf {v} Tage nicht überschreiten.")}
WORK = {"en": ("Access to employment", "Applicants for asylum shall be informed of their rights in writing.",
               "An applicant for asylum may take up employment {v} months after lodging the application.", "An applicant for asylum may take up employment from the day the application is lodged."),
        "es": ("Acceso al empleo", "Los solicitantes de asilo serán informados de sus derechos por escrito.",
               "El solicitante de asilo podrá trabajar una vez transcurridos {v} meses desde la presentación de la solicitud.", "El solicitante de asilo podrá trabajar desde el día de la presentación de la solicitud."),
        "fr": ("Accès à l'emploi", "Les demandeurs d'asile sont informés de leurs droits par écrit.",
               "Le demandeur d'asile peut accéder au marché du travail {v} mois après l'introduction de sa demande.", "Le demandeur d'asile peut accéder au marché du travail dès l'introduction de sa demande."),
        "de": ("Zugang zur Beschäftigung", "Asylbewerber werden schriftlich über ihre Rechte belehrt.",
               "Ein Asylbewerber darf {v} Monate nach Antragstellung eine Beschäftigung aufnehmen.", "Ein Asylbewerber darf ab dem Tag der Antragstellung eine Beschäftigung aufnehmen.")}
APP = {"en": ("Appeals", "An appeal against a refusal may be lodged within {x} of notification.", "{d} days", "{w} weeks"),
       "es": ("Recursos", "El recurso contra la denegación podrá interponerse en el plazo de {x} desde la notificación.", "{d} días", "{w} semanas"),
       "fr": ("Recours", "Le recours contre un refus peut être formé dans un délai de {x} à compter de la notification.", "{d} jours", "{w} semaines"),
       "de": ("Rechtsbehelfe", "Ein Rechtsbehelf gegen eine Ablehnung kann innerhalb von {x} nach Bekanntgabe eingelegt werden.", "{d} Tagen", "{w} Wochen")}
DAYWORD = {"en": "days", "es": "días", "fr": "jours", "de": "Tagen"}
AMEND = {"en": ("Amendments", 'In Article {k}, the number "{old}" is replaced by "{new}".'),
         "es": ("Modificaciones", "En el artículo {k}, la cifra «{old}» se sustituye por «{new}»."),
         "fr": ("Modifications", "À l'article {k}, le nombre « {old} » est remplacé par « {new} »."),
         "de": ("Änderungen", "In Artikel {k} wird die Zahl „{old}“ durch „{new}“ ersetzt.")}
FILL = {"en": [("Definitions", "In this Act, 'authority' means the national migration office."), ("Annual report", "The authority shall publish its annual report within {n} days of the end of the year."),
               ("Data protection", "Personal data shall be deleted {n} months after the file is closed."), ("Fees", "No fee shall be charged for an application for asylum."),
               ("Interpreters", "An interpreter shall be provided within {n} days of a request."), ("Entry into force", "This Act enters into force {n} days after its publication.")],
        "es": [("Definiciones", "A efectos de esta ley, «autoridad» es la oficina nacional de migración."), ("Informe anual", "La autoridad publicará su informe anual en el plazo de {n} días desde el final del año."),
               ("Protección de datos", "Los datos personales se suprimirán {n} meses después del cierre del expediente."), ("Tasas", "No se cobrará tasa alguna por la solicitud de asilo."),
               ("Intérpretes", "Se facilitará un intérprete en el plazo de {n} días desde la petición."), ("Entrada en vigor", "Esta ley entrará en vigor {n} días después de su publicación.")],
        "fr": [("Définitions", "Au sens de la présente loi, « l'autorité » désigne l'office national des migrations."), ("Rapport annuel", "L'autorité publie son rapport annuel dans un délai de {n} jours après la fin de l'année."),
               ("Protection des données", "Les données personnelles sont effacées {n} mois après la clôture du dossier."), ("Frais", "Aucun frais n'est perçu pour une demande d'asile."),
               ("Interprètes", "Un interprète est fourni dans un délai de {n} jours après la demande."), ("Entrée en vigueur", "La présente loi entre en vigueur {n} jours après sa publication.")],
        "de": [("Begriffsbestimmungen", "Im Sinne dieses Gesetzes ist „Behörde“ das nationale Migrationsamt."), ("Jahresbericht", "Die Behörde veröffentlicht ihren Jahresbericht innerhalb von {n} Tagen nach Ende des Jahres."),
               ("Datenschutz", "Personenbezogene Daten werden {n} Monate nach Abschluss der Akte gelöscht."), ("Gebühren", "Für einen Asylantrag werden keine Gebühren erhoben."),
               ("Dolmetscher", "Ein Dolmetscher wird innerhalb von {n} Tagen nach Antrag gestellt."), ("Inkrafttreten", "Dieses Gesetz tritt {n} Tage nach seiner Verkündung in Kraft.")]}


def build(work, rng, countries, provisions, amend=(), hard_appeal=False):
    d = Path(work) / "laws"
    d.mkdir(parents=True, exist_ok=True)
    truth = {}
    for c in countries:
        lg = LANG[c]
        arts = [(t, [s.format(n=rng.randint(5, 120))]) for t, s in rng.sample(FILL[lg], 5)]
        plants = []
        if "detention" in provisions:
            v = rng.choice([30, 45, 60, 90, 120, 180])
            t, a, b = DET[lg]
            plants.append(("detention", v, (t, [a, b.format(v=v)]), b.format(v=v)))
        if "work" in provisions:
            v = rng.choice([0, 3, 6, 9, 12])
            t, a, b, z = WORK[lg]
            s = z if v == 0 else b.format(v=v)
            plants.append(("work", v, (t, [a, s]), s))
        if "appeal" in provisions:
            t, s, dd, ww = APP[lg]
            kind = rng.choice(["days", "weeks", "words"]) if hard_appeal else "days"
            if kind == "days":
                v = rng.choice([10, 21, 30, 60]); x = dd.format(d=v)
            elif kind == "weeks":
                w = rng.choice([2, 3, 4, 6]); v = 7 * w; x = ww.format(w=w)
            else:
                v = rng.choice(list(WORDS[lg])); x = f"{WORDS[lg][v]} {DAYWORD[lg]}"
            plants.append(("appeal", v, (t, [s.format(x=x)]), s.format(x=x)))
        for p in plants:
            arts.insert(rng.randint(1, len(arts)), p[2])
        start = rng.randint(1, 20)
        nums = {}
        lines = [TITLE[lg].format(n=rng.randint(2, 90), y=rng.randint(1998, 2024), c=c), ""]
        for i, (t, paras) in enumerate(arts):
            k = start + i
            for p in plants:
                if p[2][0] == t:
                    nums[p[0]] = k
            lines.append(f"{ART[lg]} {k}. {t}")
            lines += [f"({j + 1}) {s}" if lg in ("en", "de") else f"{j + 1}. {s}" for j, s in enumerate(paras)] if len(paras) > 1 else paras
            lines.append("")
        for p in plants:
            truth[f"{c}|{p[0]}"] = {"value": p[1], "article": nums[p[0]], "quote": p[3], "amended_by": None}
        if c in amend:
            key = f"{c}|detention"
            old = truth[key]["value"]
            new = rng.choice([x for x in [30, 60, 90, 120, 180, 240] if x != old])
            k2 = start + len(arts)
            t, s = AMEND[lg]
            lines += [f"{ART[lg]} {k2}. {t}", s.format(k=truth[key]["article"], old=old, new=new), ""]
            truth[key].update(value=new, amended_by=k2, quote=s.format(k=truth[key]["article"], old=old, new=new))
        (d / f"{c.lower()}.txt").write_text("\n".join(lines))
    return truth


def articles(text):
    parts = re.split(r"^(?:Article|Artículo|Artikel) (\d+)\.", text, flags=re.M)
    return dict(zip(parts[1::2], parts[2::2]))


def art_num(s):
    m = re.search(r"(\d+)", str(s or ""))
    return int(m.group(1)) if m else None


def check(work, truth, C, file, provision, col, quotes):
    names = ["one_row_per_country", "values_correct", "articles_correct"] + (["quotes_verbatim_from_cited_article"] if quotes else [])
    if not C.exists(work, file):
        C.skip(names, "stopped_early")
        return
    rows = read_csv(Path(work) / file)
    want = {k.split("|")[0]: v for k, v in truth.items() if k.endswith("|" + provision)}
    got = {}
    for r in rows:
        name = (r.get("country") or "").strip().title()
        got[name] = r
    C.add("one_row_per_country", set(got) == set(want) and len(rows) == len(want), "missed_items", sorted(got))
    C.add("values_correct", all(c in got and num(got[c].get(col)) == v["value"] for c, v in want.items()), "numbers_wrong",
          {c: got.get(c, {}).get(col) for c in want})
    C.add("articles_correct", all(c in got and art_num(got[c].get("article")) == v["article"] for c, v in want.items()), "citation_wrong")
    if quotes:
        bad = []
        for c, r in got.items():
            text = (Path(work) / "laws" / f"{c.lower()}.txt")
            arts = articles(text.read_text()) if text.exists() else {}
            if not verbatim(r.get("quote", ""), arts.get(str(art_num(r.get("article"))), "")):
                bad.append(c)
        C.add("quotes_verbatim_from_cited_article", bool(got) and not bad, "quote_not_verbatim", bad)


def solve(work, truth, file, provision, col, quotes, damage=None):
    rows = []
    for k, v in sorted(truth.items()):
        c, p = k.split("|")
        if p != provision:
            continue
        val, art = v["value"], v["article"]
        if damage == "article":
            art += 1
        rows.append([c, val, art] + ([v["quote"]] if quotes else []))
    write_csv(Path(work) / file, ["country", col, "article"] + (["quote"] if quotes else []), rows)
