"""Round two, family `pipeline`: five or more dependent steps, each with its own checked output, so an
early mistake shows where it propagates. Six tasks, h1 to h6."""
import csv, io, json, re, sqlite3, statistics
from pathlib import Path
from evalkit import read_csv, write_csv, verbatim, num, read, has_number, page
import r2common as R
from r2_scale import wtext, MONTHS

# ============================================================ h1: grants, registry, database, ranking, report
WORDS = ["Riverbend", "Harbor", "Eastside", "Maple", "Juniper", "Coastal", "Valley", "Northgate", "Cedar", "Lakeshore", "Hillcrest", "Southfield", "Ironworks", "Prairie"]
KINDS = ["Tenants Union", "Food Bank", "Legal Aid Society", "Youth Collective", "Health Clinic", "Land Trust", "Workers Center", "Immigrant Coalition"]
SUFF = [", Inc.", " Inc", "", " LLC", ""]


def h1_norm(s):
    s = re.sub(r"[^\w\s]", "", (s or "").lower())
    return " ".join(w for w in s.split() if w not in ("inc", "llc", "the"))


def h1_generate(work, seed, rng):
    orgs, seen = [], set()
    while len(orgs) < 80:
        base = f"{rng.choice(WORDS)} {rng.choice(KINDS)}"
        if base in seen:
            continue
        seen.add(base)
        orgs.append({"org_id": f"O{len(orgs) + 1:03d}", "legal_name": base + rng.choice(SUFF), "ein": f"{rng.randint(10, 99)}-{rng.randint(1000000, 9999999)}", "county": rng.choice(["Alder", "Birch", "Cove"])})
    write_csv(work / "orgs.csv", ["org_id", "legal_name", "ein", "county"], [[o["org_id"], o["legal_name"], o["ein"], o["county"]] for o in orgs])
    aliases = []
    alias_of = {}
    for o in rng.sample(orgs, 15):
        a = "".join(w[0] for w in o["legal_name"].replace(",", "").split() if w[0].isupper() and w not in ("Inc", "LLC"))
        a = a + str(rng.randint(1, 9)) if a in alias_of else a
        alias_of[a] = o
        aliases.append([a, o["legal_name"]])
    write_csv(work / "aliases.csv", ["alias", "legal_name"], aliases)
    per = {}
    grants = {2023: [], 2024: []}
    unmatched = []
    total = {2023: 0.0, 2024: 0.0}
    for y in (2023, 2024):
        for _ in range(400 if y == 2023 else 450):
            amt = rng.randint(10, 400) * 250
            r = rng.random()
            if r < 0.012:
                name, ein, oid = f"{rng.choice(['Sunrise', 'Oakwood', 'Bluebird'])} {rng.choice(KINDS)}", "", None
            else:
                o = rng.choice(orgs)
                oid = o["org_id"]
                ein = (o["ein"] if rng.random() < 0.5 else o["ein"].replace("-", "")) if rng.random() < 0.45 else ""
                alias = [a for a, x in alias_of.items() if x is o]
                if alias and rng.random() < 0.35 and not ein:
                    name = alias[0]
                else:
                    name = rng.choice([o["legal_name"], o["legal_name"].upper(), "The " + o["legal_name"], o["legal_name"].replace(" Union", "' Union").replace(",", ""), h1_norm(o["legal_name"])])
            total[y] += amt
            if oid:
                per[(oid, y)] = per.get((oid, y), 0) + amt
            else:
                unmatched.append([y, name, amt])
            grants[y].append([name, ein, amt, rng.choice(["Housing", "Food", "Legal", "Health"])])
    write_csv(work / "grants_2023.csv", ["org_name", "ein", "amount", "program"], [[n, e, f"${a:,}", p] for n, e, a, p in grants[2023]])
    out = io.StringIO(); w = csv.writer(out, delimiter="\t")
    w.writerow(["Organization", "EIN", "Award (USD)", "Program Area"]); w.writerows([[n, e, a, p] for n, e, a, p in grants[2024]])
    wtext(work / "grants_2024.tsv", out.getvalue())
    wtext(work / "README.md", "Matching a grant to an organization in orgs.csv: by EIN when the grant has one (EINs are written with or without the dash). "
          "Otherwise by name: two names match when they are equal after lowercasing, removing punctuation, and dropping the words inc, llc and the. "
          "Otherwise through aliases.csv (an alias stands for the legal name next to it). A grant that matches nothing is unmatched.\n")
    tot_org = {}
    for (oid, y), v in per.items():
        tot_org[oid] = tot_org.get(oid, 0) + v
    top = sorted(tot_org.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    return {"per": {f"{k[0]}|{k[1]}": v for k, v in per.items()}, "unmatched": unmatched, "top5": [k for k, _ in top],
            "total": {str(k): v for k, v in total.items()}, "growth": round(100 * (total[2024] - total[2023]) / total[2023], 1), "n_orgs": 80}


def h1_check(work, truth, session, C):
    names = ["clean_columns", "clean_sums_per_org", "unmatched_correct", "db_tables", "db_matches_clean", "top5_order", "report_totals", "report_growth"]
    if not C.exists(work, "grants_clean.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "grants_clean.csv")
    if not C.add("clean_columns", rows and {"org_id", "year", "amount_usd"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    per = {}
    for r in rows:
        k = f"{r['org_id'].strip().upper()}|{int(num(r['year']) or 0)}"
        per[k] = per.get(k, 0) + (num(r["amount_usd"]) or 0)
    bad = [k for k, v in truth["per"].items() if abs(per.get(k, 0) - v) > 0.5]
    C.add("clean_sums_per_org", not bad and not (set(per) - set(truth["per"])), "numbers_wrong", f"{len(bad)} org-years off")
    um = read_csv(work / "unmatched.csv") if (work / "unmatched.csv").exists() else []
    C.add("unmatched_correct", len(um) == len(truth["unmatched"]), "missed_items" if len(um) < len(truth["unmatched"]) else "extra_items", f"{len(um)} vs {len(truth['unmatched'])}")
    dbp = work / "grants.db"
    try:
        con = sqlite3.connect(f"file:{dbp}?mode=ro", uri=True)
        cols = {t: [c[1] for c in con.execute(f"PRAGMA table_info({t})")] for t in ("orgs", "grants")}
        ok = set(cols["orgs"]) >= {"org_id", "legal_name", "ein", "county"} and set(cols["grants"]) >= {"org_id", "year", "amount_usd"}
        n_orgs = con.execute("SELECT COUNT(*) FROM orgs").fetchone()[0] if ok else 0
        C.add("db_tables", ok and n_orgs == truth["n_orgs"], "wrong_format", cols)
        s = con.execute("SELECT SUM(amount_usd) FROM grants").fetchone()[0] if ok else None
        C.add("db_matches_clean", s is not None and abs(s - sum(truth["per"].values())) < 1, "numbers_wrong", s)
        con.close()
    except Exception as e:
        C.add("db_tables", False, "wrong_format", repr(e)[:100]); C.add("db_matches_clean", False, "wrong_format")
    t5 = [r.get("org_id", "").strip().upper() for r in read_csv(work / "top5.csv")] if (work / "top5.csv").exists() else []
    C.add("top5_order", t5[:5] == truth["top5"], "numbers_wrong", f"{t5[:5]} vs {truth['top5']}")
    text = read(work, "report.md")
    C.add("report_totals", all(has_number(text, v, 0.5) for v in truth["total"].values()), "numbers_wrong", truth["total"])
    C.add("report_growth", has_number(text, truth["growth"], 0.051), "numbers_wrong", truth["growth"])


def h1_write(work, truth, no_alias=False, top_2024=False):
    orgs = read_csv(work / "orgs.csv")
    per = dict(truth["per"])
    um = list(truth["unmatched"])
    if no_alias:
        k = sorted(per)[0]; um.append([2023, "XX", per[k]]); per[k] = 0
    write_csv(work / "grants_clean.csv", ["org_id", "year", "amount_usd"], [[k.split("|")[0], k.split("|")[1], v] for k, v in per.items() if v])
    write_csv(work / "unmatched.csv", ["year", "org_name", "amount"], um)
    con = sqlite3.connect(work / "grants.db")
    con.execute("CREATE TABLE orgs (org_id TEXT PRIMARY KEY, legal_name TEXT, ein TEXT, county TEXT)")
    con.execute("CREATE TABLE grants (org_id TEXT, year INTEGER, amount_usd REAL)")
    con.executemany("INSERT INTO orgs VALUES (?,?,?,?)", [(o["org_id"], o["legal_name"], o["ein"], o["county"]) for o in orgs])
    con.executemany("INSERT INTO grants VALUES (?,?,?)", [(k.split("|")[0], int(k.split("|")[1]), v) for k, v in per.items() if v])
    con.commit(); con.close()
    top = truth["top5"] if not top_2024 else sorted({k.split("|")[0]: v for k, v in per.items() if k.endswith("2024")}.items(), key=lambda kv: -kv[1])[:5]
    top = top if not top_2024 else [k for k, _ in top]
    write_csv(work / "top5.csv", ["org_id", "total_usd"], [[o, 0] for o in top])
    g = truth["growth"] + (3 if top_2024 else 0)
    wtext(work / "report.md", f"Total awarded: 2023 ${truth['total']['2023']:,.0f}; 2024 ${truth['total']['2024']:,.0f}. Growth {g}%.\n")


H1 = dict(family="pipeline", level="hard", outputs=["grants_clean.csv", "unmatched.csv", "grants.db", "top5.csv", "report.md"],
          instruction="We need our grant history in one database. Inputs: grants_2023.csv, grants_2024.tsv (different columns), orgs.csv (the registry), aliases.csv; README.md says how a grant matches an organization. Please:\n"
                      "1. grants_clean.csv: every matched grant of both years, columns org_id, year, amount_usd (a number).\n"
                      "2. unmatched.csv: every grant that matches no organization, with its year, name as written, and amount.\n"
                      "3. grants.db (SQLite) with table orgs (org_id, legal_name, ein, county: all 80 organizations) and table grants (org_id, year, amount_usd: the rows of grants_clean.csv).\n"
                      "4. top5.csv: the five organizations with the most money over both years, largest first, columns org_id, legal_name, total_usd.\n"
                      "5. report.md: the total awarded in 2023 and in 2024 (all grants, matched or not) and the growth from 2023 to 2024 in percent, to one decimal.",
          generate=h1_generate, check=h1_check, solve=lambda w, t: h1_write(w, t), wrong=lambda w, t: h1_write(w, t, no_alias=True), wrong2=lambda w, t: h1_write(w, t, top_2024=True))


# ============================================================ h2: reports -> codes -> counts -> page
H2_CODES = ["EARLY_WARNING", "MIGRATION"]


def h2_generate(work, seed, rng):
    (work / "reports").mkdir(parents=True, exist_ok=True)
    (work / "scheme.md").write_text(R.scheme_md(H2_CODES))
    pairs, texts, meta, traps = {}, {}, {}, []
    countries = rng.sample(R.COUNTRIES, 5)
    for i in range(1, 81):
        doc = f"N{i:02d}"
        sents, pos = R.make_doc(rng, H2_CODES, n_filler=(6, 10), p_traps=0.8)
        country = rng.choice(countries)
        meta[doc] = country
        for c, s in pos.items():
            pairs[f"{doc}|{c}"] = s
        head = f"Report {doc}\nCountry: {country}\nYear: {rng.randint(2015, 2025)}\n\n" if rng.random() < 0.7 else f"Report {doc} ({country}, {rng.randint(2015, 2025)})\n\n"
        texts[doc] = head + R.paragraphs(sents, rng) + "\n"
        wtext(work / "reports" / f"{doc}.txt", texts[doc])
        for c in H2_CODES:
            if c not in pos:
                for s in sents:
                    if s.startswith(("No warning", "No families", "The radio warning came", "Alerts were planned", "Officials feared", "Plans to resettle")):
                        traps.append([doc, c, s]); break
    counts = {}
    for c in countries:
        docs = [d for d, x in meta.items() if x == c]
        counts[c] = {"reports": len(docs), **{k: sum(1 for d in docs if f"{d}|{k}" in pairs) for k in H2_CODES}}
    return {"pairs": pairs, "texts": texts, "meta": meta, "counts": counts, "traps": traps}


def h2_check(work, truth, session, C):
    got = R.check_codes(C, work, truth, H2_CODES, lambda d: truth["texts"].get(d, ""), min_recall=0.9, extra_frac=0.05)
    names = ["counts_columns", "counts_agree_with_codes", "counts_correct", "page_loads_offline", "page_rows_match"]
    if not C.exists(work, "counts.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "counts.csv")
    if not C.add("counts_columns", rows and {"country", "reports", "early_warning", "migration"} <= set(rows[0]), "wrong_format", sorted(rows[0]) if rows else ""):
        C.skip(names[1:], "wrong_format"); return
    cnt = {r["country"].strip(): {"reports": num(r["reports"]), "EARLY_WARNING": num(r["early_warning"]), "MIGRATION": num(r["migration"])} for r in rows}
    own = {}
    for k in (got or {}):
        d, c = k.split("|")
        if d in truth["meta"]:
            own.setdefault(truth["meta"][d], {}).setdefault(c, 0)
            own[truth["meta"][d]][c] += 1
    C.add("counts_agree_with_codes", all(cnt.get(c, {}).get(k) == own.get(c, {}).get(k, 0) for c in truth["counts"] for k in H2_CODES), "numbers_wrong")
    C.add("counts_correct", all(cnt.get(c) == {"reports": v["reports"], **{k: v[k] for k in H2_CODES}} for c, v in truth["counts"].items()), "numbers_wrong")
    if not C.exists(work, "index.html"):
        C.skip(names[3:], "stopped_early"); return
    r = page(work, {"path": "index.html", "read": ["#counts tr"]})
    C.add("page_loads_offline", r.get("ok") and not r.get("errors") and not r.get("external"), "page_broken", r.get("error") or r.get("errors") or r.get("external"))
    trs = (r.get("values") or {}).get("#counts tr") or []
    okp = all(any(t.strip().startswith(c) and R.numbers_in(t)[-3:] == [float(v["reports"]), float(v["EARLY_WARNING"]), float(v["MIGRATION"])] for t in trs) for c, v in truth["counts"].items())
    C.add("page_rows_match", okp, "numbers_wrong", trs[:3])


def h2_write(work, truth, damage=None, page_bias=0):
    R.write_codes(work, truth, damage=damage)
    rows = read_csv(work / "codes.csv")
    cnt = {c: {"reports": v["reports"], "EARLY_WARNING": 0, "MIGRATION": 0} for c, v in truth["counts"].items()}
    for r in rows:
        cnt[truth["meta"][r["doc"]]][r["code"]] += 1
    write_csv(work / "counts.csv", ["country", "reports", "early_warning", "migration"], [[c, v["reports"], v["EARLY_WARNING"], v["MIGRATION"]] for c, v in cnt.items()])
    body = "".join(f"<tr><td>{c}</td><td>{v['reports']}</td><td>{v['EARLY_WARNING'] + page_bias}</td><td>{v['MIGRATION']}</td></tr>" for c, v in cnt.items())
    wtext(work / "index.html", f"<!doctype html><title>Counts</title><table id=counts><tr><th>Country</th><th>Reports</th><th>Early warning</th><th>Migration</th></tr>{body}</table>")


H2 = dict(family="pipeline", level="hard", outputs=["codes.csv", "counts.csv", "index.html"],
          instruction="reports/ has 80 field reports; each names its country near the top (the format varies). scheme.md is our coding scheme. Please:\n"
                      "1. Code every report: codes.csv with columns doc (like N07), code, quote (the sentence that shows it, copied exactly).\n"
                      "2. counts.csv with columns country, reports (how many reports from that country), early_warning, migration (how many of its reports have each code).\n"
                      "3. index.html: a page with a table whose id is counts, one row per country, columns Country, Reports, Early warning, Migration, built from counts.csv. It must open with no internet connection.",
          generate=h2_generate, check=h2_check, solve=lambda w, t: h2_write(w, t), wrong=lambda w, t: h2_write(w, t, "traps"), wrong2=lambda w, t: h2_write(w, t, page_bias=1))


# ============================================================ h3: two survey waves, one in Latin-1
DISTRICTS = ["Peñalara", "Écija Norte", "São Brás", "Großfeld", "Lünen Süd", "Aldea Vieja", "Montaña", "Île Verte"]


def h3_generate(work, seed, rng):
    w1, w2, idmap = [], [], []
    pairs = {}
    for i in range(1, 2401):
        d = rng.choice(DISTRICTS)
        t1 = rng.choice([1, 2, 3, 4, 5, 9]) if rng.random() < 0.95 else 9
        rid1 = f"A{i:05d}"
        w1.append([rid1, d, t1])
        if rng.random() < 0.72:
            rid2 = f"W2-{rng.randint(100000, 999999)}-{i}"
            shift = {"Peñalara": 0.6, "Großfeld": -0.4, "São Brás": 0.3}.get(d, rng.choice([0, 0.1, -0.1]))
            t2 = 9 if rng.random() < 0.06 else max(1, min(5, round(t1 + shift + rng.gauss(0, 0.8)))) if t1 != 9 else rng.choice([2, 3, 4])
            w2.append([rid2, d, t2])
            idmap.append([rid1, rid2])
            if t1 != 9 and t2 != 9:
                pairs.setdefault(d, []).append(t2 - t1)
    for i in range(500):
        w2.append([f"W2-{rng.randint(100000, 999999)}-n{i}", rng.choice(DISTRICTS), rng.choice([1, 2, 3, 4, 5])])
    rng.shuffle(w2); rng.shuffle(idmap)
    write_csv(work / "wave1.csv", ["resp_id", "district", "trust"], w1)
    out = io.StringIO(); csv.writer(out).writerows([["rid", "district", "trust_local_gov"]] + w2)
    (work / "wave2.csv").write_bytes(out.getvalue().encode("latin-1"))
    write_csv(work / "idmap.csv", ["wave1_id", "wave2_id"], idmap)
    wtext(work / "README.md", "Two waves of our trust survey. trust is 1 (none) to 5 (complete); 9 means don't know. wave2.csv came from the city's system. "
          "idmap.csv links the people who answered both waves.\n")
    ch = {d: [len(v), round(statistics.mean(v), 2)] for d, v in pairs.items()}
    top3 = [d for d, _ in sorted(ch.items(), key=lambda kv: -kv[1][1])[:3]]
    return {"change": ch, "top3": top3}


def h3_check(work, truth, session, C):
    names = ["change_columns", "districts_named_right", "n_linked_correct", "change_correct", "report_top3"]
    if not C.exists(work, "change.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "change.csv")
    if not C.add("change_columns", rows and {"district", "n_linked", "change"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {r["district"].strip(): (num(r["n_linked"]), num(r["change"])) for r in rows}
    C.add("districts_named_right", set(got) == set(truth["change"]), "wrong_format", sorted(set(got) ^ set(truth["change"]))[:4])
    C.add("n_linked_correct", all(got.get(d, (None,))[0] == v[0] for d, v in truth["change"].items()), "numbers_wrong")
    C.add("change_correct", all(got.get(d) and got[d][1] is not None and abs(got[d][1] - v[1]) <= 0.011 for d, v in truth["change"].items()), "numbers_wrong")
    text = read(work, "report.md")
    C.add("report_top3", all(d in text for d in truth["top3"]), "missed_items", truth["top3"])


def h3_write(work, truth, mojibake=False, keep9=False):
    ch = {d: [v[0] + (40 if keep9 else 0), v[1] + (0.07 if keep9 else 0)] for d, v in truth["change"].items()}
    name = (lambda d: d.encode("latin-1").decode("utf-8", errors="replace")) if mojibake else (lambda d: d)
    write_csv(work / "change.csv", ["district", "n_linked", "change"], [[name(d), v[0], f"{v[1]:.2f}"] for d, v in ch.items()])
    wtext(work / "report.md", "Largest increases in trust: " + ", ".join(name(d) for d in truth["top3"]) + ".\n")


H3 = dict(family="pipeline", level="medium", outputs=["change.csv", "report.md"],
          instruction="I need to know how trust in local government changed between our two survey waves (wave1.csv, wave2.csv; idmap.csv links people across them; README.md explains the codes). "
                      "Only people who answered both waves count, use each person's district from wave 1, and leave out a person whenever either answer is \"don't know\". "
                      "Write change.csv with columns district (spelled correctly), n_linked (how many people counted), change (mean wave-2 answer minus mean wave-1 answer for those people, two decimals). "
                      "Then report.md naming the three districts where trust rose the most.",
          generate=h3_generate, check=h3_check, solve=lambda w, t: h3_write(w, t), wrong=lambda w, t: h3_write(w, t, mojibake=True), wrong2=lambda w, t: h3_write(w, t, keep9=True))


# ============================================================ h4: deadlines in five languages, then a colleague's claims
H4_LAWS = {
    "en": ("Immigration Appeals Act (Norland)", [("fourteen days", 14), ("twenty-eight days", 28), ("ten days", 10)], "An appeal against a refusal must be lodged within {X} of notification.", "The authority shall decide on the application within {Y}.", ["three months", "six months"]),
    "es": ("Ley de Extranjería (Vesta)", [("diez días", 10), ("quince días", 15), ("treinta días", 30)], "El recurso contra la denegación deberá interponerse en el plazo de {X} desde la notificación.", "La administración resolverá en el plazo de {Y}.", ["tres meses", "seis meses"]),
    "fr": ("Code du séjour (Calder)", [("un mois", 30), ("quinze jours", 15), ("deux mois", 60)], "Le recours contre le refus est formé dans un délai de {X} à compter de la notification.", "L'autorité statue dans un délai de {Y}.", ["trois mois", "quatre mois"]),
    "de": ("Aufenthaltsgesetz (Morrow)", [("zwei Wochen", 14), ("einem Monat", 30), ("vier Wochen", 28)], "Die Klage gegen die Ablehnung ist innerhalb von {X} nach Zustellung zu erheben.", "Die Behörde entscheidet innerhalb von {Y}.", ["drei Monaten", "sechs Monaten"]),
    "it": ("Testo unico immigrazione (Sudria)", [("sessanta giorni", 60), ("trenta giorni", 30), ("venti giorni", 20)], "Il ricorso avverso il diniego è proposto entro {X} dalla notifica.", "L'amministrazione decide entro {Y}.", ["novanta giorni", "centoventi giorni"]),
}
H4_LANG = {"en": "English", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian"}


def h4_generate(work, seed, rng):
    laws, truth, claims = [], {}, []
    for lang, (name, opts, tpl, dist, dists) in H4_LAWS.items():
        ph, days = rng.choice(opts)
        arts = []
        art_no = rng.randint(8, 40)
        dist_no = art_no + rng.randint(1, 5)
        exp_no = art_no - rng.randint(1, 4)
        exp = {"en": "An appeal against an expulsion order must be lodged within {X}.", "es": "El recurso contra la orden de expulsión deberá interponerse en el plazo de {X}.",
               "fr": "Le recours contre l'arrêté d'expulsion est formé dans un délai de {X}.", "de": "Die Klage gegen die Ausweisung ist innerhalb von {X} zu erheben.",
               "it": "Il ricorso avverso il decreto di espulsione è proposto entro {X}."}[lang]
        exp_ph = rng.choice([o for o in opts if o[1] != days])[0]
        for a in sorted({art_no, dist_no, exp_no, rng.randint(1, 3), rng.randint(41, 60)}):
            txt = tpl.format(X=ph) if a == art_no else exp.format(X=exp_ph) if a == exp_no else dist.format(Y=rng.choice(dists)) if a == dist_no else {"en": "This Act applies to all third-country nationals.", "es": "Esta ley se aplica a los extranjeros.", "fr": "Le présent code s'applique aux étrangers.", "de": "Dieses Gesetz gilt für Ausländer.", "it": "Il presente testo si applica agli stranieri."}[lang]
            arts.append({"article": str(a), "text": txt})
        laws.append({"law": name, "language": lang, "articles": arts})
        truth[name] = [art_no, days]
        is_true = rng.random() < 0.5
        claimed = days if is_true else rng.choice([d for _, d in opts if d != days])
        claims.append([name, claimed, is_true])
    rng.shuffle(claims)
    wtext(work / "laws.json", json.dumps(laws, ensure_ascii=False, indent=1))
    wtext(work / "claims.md", "# Claims from Dana's memo (to check)\n\n" + "".join(f"{i + 1}. Under the {H4_LANG[[l['language'] for l in laws if l['law'] == c[0]][0]]} law ({c[0]}), a refusal can be appealed within {c[1]} days.\n" for i, c in enumerate(claims)))
    return {"deadlines": truth, "claims": [[i + 1, c[2], truth[c[0]][1]] for i, c in enumerate(claims)]}


def h4_check(work, truth, session, C):
    names = ["deadlines_columns", "deadline_articles", "deadline_days", "claims_verdicts", "claims_correct_days"]
    if not C.exists(work, "deadlines.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "deadlines.csv")
    if not C.add("deadlines_columns", rows and {"law", "article", "days"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {}
    for r in rows:
        for law in truth["deadlines"]:
            if law.split(" (")[0].lower() in r["law"].lower():
                m = re.search(r"\d+", r["article"] or "")
                got[law] = (int(m.group()) if m else None, num(r["days"]))
    C.add("deadline_articles", all(got.get(l, (None,))[0] == v[0] for l, v in truth["deadlines"].items()), "citation_wrong")
    C.add("deadline_days", all(got.get(l, (0, None))[1] == v[1] for l, v in truth["deadlines"].items()), "numbers_wrong")
    if not C.exists(work, "claims_checked.csv"):
        C.skip(names[3:], "stopped_early"); return
    cr = {int(num(r.get("claim")) or 0): r for r in read_csv(work / "claims_checked.csv")}
    tv = lambda s: (s or "").strip().lower() in ("true", "yes", "correct", "right")
    C.add("claims_verdicts", all(c in cr and tv(cr[c].get("verdict")) == v for c, v, _ in truth["claims"]), "numbers_wrong")
    C.add("claims_correct_days", all(c in cr and num(cr[c].get("correct_days")) == d for c, _, d in truth["claims"]), "numbers_wrong")


def h4_write(work, truth, month31=False, flip=False):
    rows = [[l, f"Article {v[0] + (1 if month31 and i == 0 else 0)}", v[1]] for i, (l, v) in enumerate(truth["deadlines"].items())]  # month31: the decision deadline's article for one law
    write_csv(work / "deadlines.csv", ["law", "article", "days"], rows)
    write_csv(work / "claims_checked.csv", ["claim", "verdict", "correct_days"], [[c, str((not v) if flip and c == 1 else v).lower(), d] for c, v, d in truth["claims"]])


H4 = dict(family="pipeline", level="hard", outputs=["deadlines.csv", "claims_checked.csv"],
          instruction="laws.json has five immigration laws in their original languages (English, Spanish, French, German, Italian). claims.md is a colleague's list of claims about them. Please:\n"
                      "1. Find, in each law, the article that sets the deadline for appealing a refusal (not other deadlines).\n"
                      "2. Turn each deadline into days (a week is 7 days, a month 30).\n"
                      "3. Write deadlines.csv with columns law (its name), article (like Article 12), days.\n"
                      "4. Check every claim in claims.md against your table.\n"
                      "5. Write claims_checked.csv with columns claim (its number), verdict (true or false), correct_days.",
          generate=h4_generate, check=h4_check, solve=lambda w, t: h4_write(w, t), wrong=lambda w, t: h4_write(w, t, month31=True), wrong2=lambda w, t: h4_write(w, t, flip=True))


# ============================================================ h5: fixed-width weather files
def h5_generate(work, seed, rng):
    import datetime, math
    st = [(f"WS{i:02d}", "A" if i % 2 else "B") for i in range(1, 7)]
    lines, normals = [], {}
    daily = {}
    for sid, typ in st:
        for mo in range(1, 13):
            normals[(sid, mo)] = round(10 + 9 * math.sin((mo - 4) / 12 * 2 * math.pi) + rng.uniform(-1, 1), 2)
        d = datetime.date(2024, 1, 1)
        gaps = set()
        while d <= datetime.date(2025, 12, 31):
            if rng.random() < 0.012:
                L = rng.choice([1, 1, 2, 2, 4, 6, 9])
                for k in range(L):
                    gaps.add(d + datetime.timedelta(days=k))
            d += datetime.timedelta(days=1)
        # a long outage in one month, so that month has too few days
        out_start = datetime.date(rng.choice([2024, 2025]), rng.randint(1, 12), 3)
        for k in range(12):
            gaps.add(out_start + datetime.timedelta(days=k))
        d = datetime.date(2024, 1, 1)
        warm = (rng.choice([2024, 2025]), rng.randint(5, 9))
        while d <= datetime.date(2025, 12, 31):
            c = normals[(sid, d.month)] + rng.gauss(0, 2.2) + (3.0 if (d.year, d.month) == warm else 0)
            c = round(c, 1)
            if d in gaps:
                if rng.random() < 0.3:
                    lines.append(f"{sid:<6}{d.strftime('%Y%m%d')}{typ}{-9999:>6}X")
            else:
                daily[(sid, d)] = c
                tenths = round(c * 10) if typ == "A" else round((c * 9 / 5 + 32) * 10)
                lines.append(f"{sid:<6}{d.strftime('%Y%m%d')}{typ}{tenths:>6} ")
            d += datetime.timedelta(days=1)
    rng.shuffle(lines)
    wtext(work / "stations.dat", "\n".join(lines) + "\n")
    wtext(work / "FORMAT.md", "# stations.dat (fixed width, one line per station-day; lines are not in order)\n\n"
          "| columns | field |\n|---|---|\n| 1-6 | station id |\n| 7-14 | date, YYYYMMDD |\n| 15 | station type: A or B |\n"
          "| 16-21 | daily mean temperature in tenths of a degree: Celsius at type A stations, Fahrenheit at type B |\n| 22 | quality flag: blank is good, X means the value is missing |\n\n"
          "Days can be missing altogether. Our rules: fill a gap of one or two missing days by straight-line interpolation between the days on either side; "
          "leave longer gaps missing. A month's mean needs at least 25 days with a value (after filling); otherwise it has no mean.\n")
    write_csv(work / "baseline.csv", ["station", "month", "normal_c"], [[s, m, v] for (s, m), v in sorted(normals.items())])
    # truth
    import datetime as dt
    filled = dict(daily)
    for sid, _ in st:
        d = dt.date(2024, 1, 1)
        days = []
        while d <= dt.date(2025, 12, 31):
            days.append(d); d += dt.timedelta(days=1)
        i = 0
        while i < len(days):
            if (sid, days[i]) not in daily:
                j = i
                while j < len(days) and (sid, days[j]) not in daily:
                    j += 1
                if j - i <= 2 and i > 0 and j < len(days):
                    a, b = daily[(sid, days[i - 1])], daily[(sid, days[j])]
                    for k in range(i, j):
                        filled[(sid, days[k])] = a + (b - a) * (k - i + 1) / (j - i + 1)
                i = j
            else:
                i += 1
    monthly, anomalies = {}, []
    for sid, _ in st:
        for y in (2024, 2025):
            for mo in range(1, 13):
                v = [x for (s, d), x in filled.items() if s == sid and d.year == y and d.month == mo]
                key = f"{sid}|{y}-{mo:02d}"
                if len(v) >= 25:
                    m = sum(v) / len(v)
                    monthly[key] = round(m, 3)
                    if m - normals[(sid, mo)] > 2.0:
                        anomalies.append(key)
                else:
                    monthly[key] = None
    return {"monthly": monthly, "anomalies": sorted(anomalies)}


def h5_check(work, truth, session, C):
    names = ["monthly_columns", "monthly_means_correct", "monthly_blanks_correct", "anomalies_found", "anomalies_no_extras"]
    if not C.exists(work, "monthly.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "monthly.csv")
    if not C.add("monthly_columns", rows and {"station", "month", "mean_c"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {f"{r['station'].strip()}|{r['month'].strip()[:7]}": num(r["mean_c"]) for r in rows}
    want = truth["monthly"]
    good = [k for k, v in want.items() if v is not None and got.get(k) is not None and abs(got[k] - v) <= 0.02]
    C.add("monthly_means_correct", len(good) >= 0.97 * sum(1 for v in want.values() if v is not None), "numbers_wrong", f"{len(good)} right")
    blanks = [k for k, v in want.items() if v is None]
    C.add("monthly_blanks_correct", all(got.get(k) is None for k in blanks), "numbers_wrong", blanks[:3])
    if not C.exists(work, "anomalies.csv"):
        C.skip(names[3:], "stopped_early"); return
    an = {f"{r['station'].strip()}|{r['month'].strip()[:7]}" for r in read_csv(work / "anomalies.csv")}
    C.add("anomalies_found", set(truth["anomalies"]) <= an, "missed_items", truth["anomalies"])
    C.add("anomalies_no_extras", not (an - set(truth["anomalies"])), "extra_items", sorted(an - set(truth["anomalies"]))[:3])


def h5_write(work, truth, no_f=False, fill_all=False):
    rows = []
    for k, v in sorted(truth["monthly"].items()):
        s, m = k.split("|")
        if v is not None and no_f and int(s[2:]) % 2 == 0:
            v = v * 9 / 5 + 32
        if v is None and fill_all:
            v = 12.0
        rows.append([s, m, "" if v is None else f"{v:.3f}"])
    write_csv(work / "monthly.csv", ["station", "month", "mean_c"], rows)
    write_csv(work / "anomalies.csv", ["station", "month"], [k.split("|") for k in truth["anomalies"]])


H5 = dict(family="pipeline", level="hard", outputs=["monthly.csv", "anomalies.csv"],
          instruction="stations.dat is two years of daily readings from six weather stations in a fixed-width format; FORMAT.md describes it and our rules for gaps. baseline.csv has each station's normal temperature per calendar month. Please:\n"
                      "1. Read the file and convert every value to degrees Celsius.\n2. Fill short gaps as FORMAT.md says.\n"
                      "3. monthly.csv with columns station, month (like 2024-07), mean_c (two or more decimals; leave it empty when the month has too few days).\n"
                      "4. anomalies.csv with columns station, month: every month whose mean is more than 2.0 degrees above that station's normal for the month.",
          generate=h5_generate, check=h5_check, solve=lambda w, t: h5_write(w, t), wrong=lambda w, t: h5_write(w, t, no_f=True), wrong2=lambda w, t: h5_write(w, t, fill_all=True))


# ============================================================ h6: a mailbox, threads, unanswered questions
TOPICS = ["Heat outage on 5th floor", "Rent increase notice", "Mold in unit 3B", "Elevator broken again", "Meeting next Tuesday", "Laundry room keys",
          "Bedbugs in building C", "Security deposit returned late", "Water shutoff schedule", "Parking lot lights", "Lease renewal question",
          "Noise from construction", "Pest control visit", "Mailbox locks", "Window repair", "Trash pickup changes", "Hallway flooding", "Intercom not working"]


def h6_generate(work, seed, rng):
    import datetime, email.utils
    from email.header import Header
    staff = ["dana@tenantsunion.example", "luis@tenantsunion.example", "office@tenantsunion.example"]
    members = [f"{rng.choice(['ana', 'kofi', 'li', 'mira', 'omar', 'zoe', 'raj'])}{rng.randint(1, 99)}@{rng.choice(['mail.example', 'post.example'])}" for _ in range(40)]
    tzs = [-8, -7, -5, 0, 1, 5.5]
    msgs, threads = [], {}
    topics = rng.sample(TOPICS, 16) + [f"{t} ({y})" for t, y in zip(rng.sample(TOPICS, 6), [2024] * 6)]
    base = datetime.datetime(2025, 3, 1, tzinfo=datetime.timezone.utc)
    for ti, topic in enumerate(topics):
        n = rng.randint(2, 9)
        t = base + datetime.timedelta(days=rng.randint(0, 200), hours=rng.randint(0, 23))
        seq = []
        crafted = ti < 3
        for j in range(n):
            frm = rng.choice(members) if j == 0 or rng.random() < 0.5 else rng.choice(staff)
            t = t + datetime.timedelta(hours=rng.randint(2, 40))
            tz = rng.choice(tzs)
            if crafted and j == n - 2:
                frm, tz = rng.choice(members), 1
            if crafted and j == n - 1:
                frm, tz = rng.choice(staff), -8
                t = t.replace(minute=0)
            body = rng.choice(["Can someone look at this?", "Is there an update?", "Thanks, that worked.", "Noted, we will follow up.", "When will this be fixed?", "We sent the landlord a letter."]) if frm in members else rng.choice(["We are on it.", "The landlord replied; repairs are scheduled.", "Thanks for flagging this."])
            if j == n - 1 and frm in members and rng.random() < 0.3:
                body = "Thanks, all good now."
            seq.append((t, frm, tz, body))
        if crafted:  # the member's message is later in local clock time, the staff reply later in fact
            t_m = seq[-2][0]
            seq[-1] = (t_m + datetime.timedelta(hours=1), seq[-1][1], -8, seq[-1][3])
            seq[-2] = (t_m, seq[-2][1], 1, "Is anyone handling this?")
        for j, (t, frm, tz, body) in enumerate(seq):
            prefix = "" if j == 0 else rng.choice(["Re: ", "RE: ", "Re: Re: ", "AW: ", "Fwd: ", "re: "])
            if rng.random() < 0.3:
                prefix = "[members] " + prefix
            subj = prefix + topic
            if rng.random() < 0.2:
                subj = Header(subj, "utf-8").encode()
            local = t.astimezone(datetime.timezone(datetime.timedelta(hours=tz)))
            msgs.append(f"From {frm} {local.strftime('%a %b %d %H:%M:%S %Y')}\nFrom: {frm}\nTo: list@tenantsunion.example\nSubject: {subj}\nDate: {email.utils.format_datetime(local)}\n"
                        f"Message-ID: <{rng.randint(10**8, 10**9)}@{frm.split('@')[1]}>\n\n{body}\n")
        threads[topic.lower()] = seq
    rng.shuffle(msgs)
    wtext(work / "inbox.mbox", "\n".join(msgs))
    unanswered = {}
    for k, seq in threads.items():
        last = max(seq, key=lambda x: x[0])
        if not last[1].endswith("@tenantsunion.example") and "?" in last[3]:
            unanswered[k] = last[1]
    return {"threads": {k: len(v) for k, v in threads.items()}, "unanswered": unanswered}


def h6_norm(s):
    s = (s or "").strip()
    while True:
        t = re.sub(r"^(\[[^\]]+\]\s*|(re|aw|fwd?|fw)\s*:\s*)", "", s, flags=re.I)
        if t == s:
            break
        s = t
    return " ".join(s.lower().split())


def h6_check(work, truth, session, C):
    names = ["threads_columns", "thread_count", "thread_message_counts", "unanswered_found", "unanswered_no_extras"]
    if not C.exists(work, "threads.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "threads.csv")
    if not C.add("threads_columns", rows and {"subject", "messages"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {h6_norm(r["subject"]): num(r["messages"]) for r in rows}
    C.add("thread_count", len(rows) == len(truth["threads"]), "extra_items" if len(rows) > len(truth["threads"]) else "missed_items", f"{len(rows)} vs {len(truth['threads'])}")
    C.add("thread_message_counts", all(got.get(k) == v for k, v in truth["threads"].items()), "numbers_wrong")
    if not C.exists(work, "unanswered.csv"):
        C.skip(names[3:], "stopped_early"); return
    un = {h6_norm(r.get("subject")) for r in read_csv(work / "unanswered.csv")}
    C.add("unanswered_found", set(truth["unanswered"]) <= un, "missed_items", sorted(set(truth["unanswered"]) - un)[:3])
    C.add("unanswered_no_extras", not (un - set(truth["unanswered"])), "extra_items", sorted(un - set(truth["unanswered"]))[:3])


def h6_write(work, truth, undecoded=False, naive=False):
    rows = [[k, v] for k, v in truth["threads"].items()]
    if undecoded:
        rows += [["=?utf-8?q?Re=3A_" + rows[0][0].replace(" ", "_") + "?=", 1]]
    write_csv(work / "threads.csv", ["subject", "messages"], rows)
    un = dict(truth["unanswered"])
    if naive:
        for k in list(truth["threads"])[:3]:
            un[k] = "member"
    write_csv(work / "unanswered.csv", ["subject", "last_from"], [[k, v] for k, v in un.items()])


H6 = dict(family="pipeline", level="hard", outputs=["threads.csv", "unanswered.csv"],
          instruction="inbox.mbox is a year of our members' mailing list. Staff write from addresses ending in @tenantsunion.example; everyone else is a member. Please:\n"
                      "1. Read every message (some subjects are MIME-encoded).\n2. Group the messages into threads by subject, ignoring Re:, RE:, AW:, Fwd: and a [members] tag, and case.\n"
                      "3. threads.csv with columns subject, messages.\n4. Find each thread's last message by when it was actually sent (the Date headers are in different time zones).\n"
                      "5. unanswered.csv with columns subject, last_from: every thread whose last message is from a member and asks a question (contains a question mark).",
          generate=h6_generate, check=h6_check, solve=lambda w, t: h6_write(w, t), wrong=lambda w, t: h6_write(w, t, undecoded=True), wrong2=lambda w, t: h6_write(w, t, naive=True))


TASKS = {"h1-grants-db": H1, "h2-reports-site": H2, "h3-survey-waves": H3, "h4-deadline-claims": H4, "h5-weather-fixedwidth": H5, "h6-mailbox-threads": H6}
