"""Round two, family `scale`: inputs larger than the model's context (131k tokens), so the agent must
write code, sample and verify instead of reading. Eight tasks, g1 to g8."""
import csv, io, json, re, statistics
from pathlib import Path
from evalkit import read_csv, write_csv, verbatim, num, read, has_number
import r2common as R

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MON3 = [m[:3] for m in MONTHS]
REGIONS = ["North Coast", "Central Valley", "Sierra", "Bay", "Inland Empire", "Desert"]


def wtext(p, t):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(t, encoding="utf-8")


def rows_of(p, delim=","):
    return list(csv.reader(io.StringIO(Path(p).read_text(encoding="utf-8")), delimiter=delim))


# ============================================================ g1: code 360 reports
G1_CODES = ["EARLY_WARNING", "MIGRATION", "FUNDING_GAP"]


def g1_generate(work, seed, rng):
    (work / "reports").mkdir(parents=True, exist_ok=True)
    (work / "scheme.md").write_text(R.scheme_md(G1_CODES))
    pairs, traps, texts = {}, [], {}
    for i in range(1, 361):
        doc = f"R{i:03d}"
        sents, pos = R.make_doc(rng, G1_CODES, n_filler=(14, 22), p_traps=0.7)
        for c, s in pos.items():
            pairs[f"{doc}|{c}"] = s
        for c in G1_CODES:
            for s in sents:
                if s in [R.fill(x, rng) for x in []]:
                    pass
        text = f"Field report {doc}\nCountry: {rng.choice(R.COUNTRIES)}\nYear: {rng.randint(2012, 2025)}\n\n" + R.paragraphs(sents, rng) + "\n"
        texts[doc] = text
        wtext(work / "reports" / f"{doc}.txt", text)
        for c in G1_CODES:
            if c not in pos:
                for s in sents:
                    if any(re.sub(r"\{[a-z]+\}", "", t)[:18] in s for t in R.BANK[c]["neg"]):
                        traps.append([doc, c, s]); break
    return {"pairs": pairs, "traps": traps, "texts": texts}


def g1_counts(work, truth, C, got):
    if not C.exists(work, "counts.csv"):
        C.skip(["counts_agree_with_codes", "counts_near_truth"], "stopped_early"); return
    cnt = {(r.get("code") or "").strip().upper(): num(r.get("documents")) for r in read_csv(work / "counts.csv")}
    own = {c: len([k for k in (got or {}) if k.endswith("|" + c)]) for c in G1_CODES}
    C.add("counts_agree_with_codes", all(cnt.get(c) == own[c] for c in G1_CODES), "numbers_wrong", f"{cnt} vs {own}")
    true = {c: len([k for k in truth["pairs"] if k.endswith("|" + c)]) for c in G1_CODES}
    C.add("counts_near_truth", all(cnt.get(c) is not None and abs(cnt[c] - true[c]) <= max(1, 0.03 * true[c]) for c in G1_CODES), "numbers_wrong", json.dumps(true))


def g1_check(work, truth, session, C):
    got = R.check_codes(C, work, truth, G1_CODES, lambda d: truth["texts"].get(d, ""), min_recall=0.9, extra_frac=0.03)
    g1_counts(work, truth, C, got)


def g1_write(work, truth, damage=None):
    R.write_codes(work, truth, damage=damage)
    rows = read_csv(work / "codes.csv")
    write_csv(work / "counts.csv", ["code", "documents"], [[c, len({r["doc"] for r in rows if r["code"] == c})] for c in G1_CODES])


G1 = dict(family="scale", level="hard", outputs=["codes.csv", "counts.csv"],
          instruction="reports/ holds 360 field reports from our partners (about 800 KB of text, more than you can read at once). Code every report against scheme.md. "
                      "Write codes.csv with one row per report and code that applies, columns doc (the report id, like R001), code, quote (the sentence from the report that shows it, copied exactly). "
                      "Then counts.csv with columns code and documents (how many reports have that code). Be careful with sentences that say something did NOT happen.",
          generate=g1_generate, check=g1_check, solve=lambda w, t: g1_write(w, t), wrong=lambda w, t: g1_write(w, t, "traps"), wrong2=lambda w, t: g1_write(w, t, "drop"))


# ============================================================ g2: 200,000 donations
def g2_generate(work, seed, rng):
    rows, true = [], {}
    uniq = {}
    for i in range(1, 200001):
        y, m, d = rng.choice([2024, 2025]), rng.randint(1, 12), rng.randint(1, 28)
        f = rng.random()
        date = f"{y}-{m:02d}-{d:02d}" if f < 0.6 else (f"{m:02d}/{d:02d}/{y}" if f < 0.85 else f"{d} {MON3[m - 1]} {y}")
        region = rng.choice(REGIONS)
        typ = "gift" if rng.random() < 0.95 else rng.choice(["refund", "refund", "test"])
        amt = round(rng.lognormvariate(4.2, 0.9), 2)
        eur = rng.random() < 0.08
        donor = "TEST" if typ == "test" else f"D{rng.randint(1, 60000):05d}"
        if typ == "refund":
            s = f"-{amt:.2f}" if rng.random() < 0.5 else f"({amt:.2f})"
            if eur:
                s = "EUR " + s
            val = -amt
        else:
            s = (f"EUR {amt:.2f}" if rng.random() < 0.5 else f"{amt:.2f} EUR") if eur else rng.choice([f"${amt:,.2f}", f"{amt:.2f}", f"{amt:,.2f}"])
            val = amt
        usd = val * 1.08 if eur else val
        tid = f"T{i:07d}"
        rows.append([tid, date, donor, region, typ, s])
        if typ != "test":
            true[f"{region}|{y}"] = true.get(f"{region}|{y}", 0) + usd
    for _ in range(1500):
        rows.insert(rng.randrange(len(rows)), list(rows[rng.randrange(len(rows))]))
    write_csv(work / "donations.csv", ["txn_id", "date", "donor_id", "region", "type", "amount"], rows)
    wtext(work / "README.md", "# donations.csv\n\nExported from our donor database, 2024 and 2025.\n\n"
          "- Dates come in three formats: 2025-03-04, 03/04/2025 (US style: month/day/year) and 4 Mar 2025.\n"
          "- Amounts are US dollars unless marked EUR. Convert EUR at 1.08 US dollars per euro.\n"
          "- Refunds are recorded as negative amounts, either with a minus sign or in parentheses; they count against the total.\n"
          "- Rows of type test (donor TEST) are not real and must be left out.\n"
          "- The export overlapped: a txn_id that appears more than once is the same transaction exported twice, and counts once.\n")
    return {"totals": {k: round(v, 2) for k, v in true.items()}, "y2025": round(sum(v for k, v in true.items() if k.endswith("2025")), 2)}


def g2_check(work, truth, session, C):
    names = ["totals_columns", "totals_cover_all_cells", "totals_correct", "answer_total_2025"]
    if not C.exists(work, "totals.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "totals.csv")
    if not C.add("totals_columns", rows and {"region", "year", "total_usd"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {f"{r['region'].strip()}|{int(num(r['year']) or 0)}": num(r["total_usd"]) for r in rows}
    C.add("totals_cover_all_cells", set(truth["totals"]) <= set(got), "missed_items", sorted(set(truth["totals"]) - set(got))[:3])
    bad = [k for k, v in truth["totals"].items() if got.get(k) is None or abs(got[k] - v) > max(1.0, 1e-4 * abs(v))]
    C.add("totals_correct", not bad, "numbers_wrong", f"{len(bad)} cells off, e.g. {bad[:2]}")
    text = read(work, "answer.md") + "\n" + R.all_text(session)
    C.add("answer_total_2025", any(abs(x - truth["y2025"]) <= 1.0 for x in R.numbers_in(text)), "numbers_wrong", truth["y2025"])


def g2_write(work, truth, scale=1.0, skip_eur=False):
    tot = dict(truth["totals"])
    if skip_eur:
        tot = {k: v * 0.993 for k, v in tot.items()}
    tot = {k: v * scale for k, v in tot.items()}
    write_csv(work / "totals.csv", ["region", "year", "total_usd"], [[k.split("|")[0], k.split("|")[1], f"{v:.2f}"] for k, v in sorted(tot.items())])
    wtext(work / "answer.md", f"Net total for 2025: ${sum(v for k, v in tot.items() if k.endswith('2025')):,.2f}\n")


G2 = dict(family="scale", level="hard", outputs=["totals.csv", "answer.md"],
          instruction="donations.csv is our full donation export for 2024 and 2025 (about 200,000 rows); README.md explains its quirks. "
                      "Make totals.csv with the net amount given per region per year, columns region, year, total_usd (rounded to cents), "
                      "and write the overall net total for 2025 in answer.md.",
          generate=g2_generate, check=g2_check, solve=lambda w, t: g2_write(w, t), wrong=lambda w, t: g2_write(w, t, 1.0075), wrong2=lambda w, t: g2_write(w, t, skip_eur=True))


# ============================================================ g3: 227,760 hourly readings
PROV = ["Aldmoor", "Bressa", "Cantor", "Dunvale", "Eskar"]


def g3_generate(work, seed, rng):
    stations = [(f"ST-{i:04d}", PROV[(i - 1) % 5]) for i in range(1, 27)]
    flagged = set(rng.sample([s for s, _ in stations], 4))
    write_csv(work / "stations.csv", ["station_id", "province", "elevation_m"], [[s, p, rng.randint(5, 1800)] for s, p in stations])
    sums, miss = {}, {}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["station", "timestamp", "temp_c"])
    import math
    for sid, prov in stations:
        n = int(sid[3:])
        forms = [sid, str(n), f"st{n}", f"ST{n}", f"{n:04d}"]
        rate = rng.uniform(0.22, 0.32) if sid in flagged else rng.uniform(0.02, 0.12)
        base = 8 + PROV.index(prov) * 2.5
        missing = 0
        hour = 0
        for mo in range(1, 13):
            dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
            for d in range(1, dim + 1):
                for h in range(24):
                    ts = f"2025-{mo:02d}-{d:02d}T{h:02d}:00:00Z"
                    hour += 1
                    if rng.random() < rate:
                        missing += 1
                        w.writerow([rng.choice(forms), ts, "-999" if rng.random() < 0.5 else ""])
                        continue
                    t = round(base + 9 * math.sin((mo - 4) / 12 * 2 * math.pi) + 4 * math.sin((h - 9) / 24 * 2 * math.pi) + rng.gauss(0, 2.0), 1)
                    w.writerow([rng.choice(forms), ts, f"{t}"])
                    k = f"{prov}|2025-{mo:02d}"
                    a = sums.setdefault(k, [0.0, 0])
                    a[0] += t; a[1] += 1
        miss[sid] = missing / hour
    wtext(work / "readings.csv", out.getvalue())
    wtext(work / "README.md", "readings.csv: hourly temperature from our 26 volunteer stations for 2025, entered by volunteers.\n")  # v2: quirks no longer spelled out
    return {"means": {k: round(v[0] / v[1], 2) for k, v in sums.items()}, "flagged": sorted(s for s, r in miss.items() if r > 0.2)}


def g3_check(work, truth, session, C):
    names = ["provinces_columns", "province_means_correct", "flagged_stations_found", "flagged_no_extras"]
    if not C.exists(work, "provinces.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "provinces.csv")
    if not C.add("provinces_columns", rows and {"province", "month", "mean_temp"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {f"{r['province'].strip()}|{r['month'].strip()[:7]}": num(r["mean_temp"]) for r in rows}
    bad = [k for k, v in truth["means"].items() if got.get(k) is None or abs(got[k] - v) > 0.06]
    C.add("province_means_correct", not bad, "numbers_wrong", f"{len(bad)} of {len(truth['means'])} off: {bad[:2]}")
    if not C.exists(work, "flagged.csv"):
        C.skip(names[2:], "stopped_early"); return
    fl = {re.sub(r"\s", "", (r.get("station_id") or "")).upper() for r in read_csv(work / "flagged.csv")}
    C.add("flagged_stations_found", set(truth["flagged"]) <= fl, "missed_items", truth["flagged"])
    C.add("flagged_no_extras", not (fl - set(truth["flagged"])), "extra_items", sorted(fl - set(truth["flagged"]))[:3])


def g3_write(work, truth, sentinel=False, no_blank=False):
    write_csv(work / "provinces.csv", ["province", "month", "mean_temp"],
              [[k.split("|")[0], k.split("|")[1], f"{v - 40 if sentinel else v:.2f}"] for k, v in sorted(truth["means"].items())])
    write_csv(work / "flagged.csv", ["station_id"], [[s] for s in ([] if no_blank else truth["flagged"])])


G3 = dict(family="scale", level="hard", outputs=["provinces.csv", "flagged.csv"],
          instruction="readings.csv has a year of hourly temperatures from our stations (about 228,000 rows); stations.csv says which province each station is in. "
                      "Make provinces.csv with columns province, month (like 2025-01), mean_temp: the mean of all valid hourly readings from that province's stations in that month, to two decimals. "
                      "Then flagged.csv with one column station_id (written like ST-0042) listing every station that is missing more than 20% of its hourly readings over the year.",
          generate=g3_generate, check=g3_check, solve=lambda w, t: g3_write(w, t), wrong=lambda w, t: g3_write(w, t, sentinel=True), wrong2=lambda w, t: g3_write(w, t, no_blank=True))


# ============================================================ g4: 210,000 members, dedupe
FIRST = ["ana", "li", "omar", "sara", "jon", "mira", "teo", "ines", "kofi", "yuki", "ravi", "elif", "noor", "pablo", "zane", "ada"]
LAST = ["lopez", "chen", "haddad", "okafor", "berg", "silva", "novak", "rossi", "kaur", "tanaka", "moreau", "diaz", "kim", "osei"]
DOM = ["mail.example", "post.example", "inbox.example", "union.example"]


def g4_variant(email, chapter, rng):
    local, dom = email.split("@")
    if rng.random() < 0.25:
        local = local + "+" + rng.choice([chapter, "union", "2025", "news"])
    e = local + "@" + dom
    r = rng.random()
    if r < 0.2:
        e = e.upper()
    elif r < 0.4:
        e = e[0].upper() + e[1:]
    if rng.random() < 0.15:
        e = " " + e + " "
    return e


def g4_generate(work, seed, rng):
    people = []
    seen = set()
    while len(people) < 120000:
        e = f"{rng.choice(FIRST)}.{rng.choice(LAST)}{rng.randint(1, 999)}@{rng.choice(DOM)}"
        if rng.random() < 0.1:
            e = e.replace(".", "", 1)
        if e not in seen:
            seen.add(e); people.append(e)
    chap = {"north": [], "south": [], "east": []}
    member = {}
    for e in people:
        r = rng.random()
        cs = ["north"] if r < 0.3 else ["south"] if r < 0.55 else ["east"] if r < 0.75 else rng.sample(["north", "south", "east"], 2) if r < 0.95 else ["north", "south", "east"]
        member[e] = set(cs)
        for c in cs:
            for _ in range(2 if rng.random() < 0.05 else 1):
                chap[c].append(e)
    for c, lst in chap.items():
        rng.shuffle(lst)
        write_csv(work / f"{c}.csv", ["name", "email", "joined"],
                  [[e.split("@")[0].split("+")[0].replace(".", " ").title(), g4_variant(e, c, rng), f"20{rng.randint(10, 25)}-{rng.randint(1, 12):02d}"] for e in lst])
    wtext(work / "README.md", "north.csv, south.csv and east.csv are the member lists of our three chapters. One person can be in several chapters, "
          "and can appear twice in one list. Two rows are the same person when their emails match after lowercasing, trimming spaces, "
          "and removing a +tag from the part before the @ (ana.lopez+north@mail.example is ana.lopez@mail.example). Dots are not ignored.\n")
    pair = lambda a, b: sum(1 for s in member.values() if a in s and b in s)
    return {"unique": len(member), "all3": sum(1 for s in member.values() if len(s) == 3),
            "pairs": {"north-south": pair("north", "south"), "north-east": pair("north", "east"), "south-east": pair("south", "east")}}


def g4_check(work, truth, session, C):
    names = ["unique_members_correct", "all_three_correct", "overlap_correct"]
    if not C.exists(work, "answer.md"):
        C.skip(names, "stopped_early"); return
    text = read(work, "answer.md")
    C.add("unique_members_correct", has_number(text, truth["unique"], 0), "numbers_wrong", truth["unique"])
    C.add("all_three_correct", has_number(text, truth["all3"], 0), "numbers_wrong", truth["all3"])
    if not C.exists(work, "overlap.csv"):
        C.skip(names[2:], "stopped_early"); return
    got = {"-".join(sorted(re.split(r"\s*[-/&,]\s*|\s+and\s+", (r.get("pair") or "").lower().strip()))): num(r.get("members")) for r in read_csv(work / "overlap.csv")}
    want = {"-".join(sorted(k.split("-"))): v for k, v in truth["pairs"].items()}
    C.add("overlap_correct", all(got.get(k) == v for k, v in want.items()), "numbers_wrong", f"{got} vs {want}")


def g4_write(work, truth, bump=0):
    wtext(work / "answer.md", f"Unique members: {truth['unique'] + bump}\nMembers of all three chapters: {truth['all3'] + (bump // 3)}\n")
    write_csv(work / "overlap.csv", ["pair", "members"], [[k, v + (bump // 2)] for k, v in truth["pairs"].items()])


G4 = dict(family="scale", level="medium", outputs=["answer.md", "overlap.csv"],
          instruction="We merged three chapters. north.csv, south.csv and east.csv are their member lists (about 210,000 rows in all); README.md says when two rows are the same person. "
                      "How many unique members do we have, and how many are members of all three chapters? Put both numbers in answer.md. "
                      "Also write overlap.csv with columns pair (north-south, north-east, south-east) and members (people in both chapters of the pair).",
          generate=g4_generate, check=g4_check, solve=lambda w, t: g4_write(w, t), wrong=lambda w, t: g4_write(w, t, 9000), wrong2=lambda w, t: g4_write(w, t, 3))


# ============================================================ g5: 360 sets of minutes, rent-freeze votes
G5_PASS = ["The motion to adopt a rent freeze passed {y}-{n}.", "Council voted {y} to {n} in favor of the rent freeze.",
           "The rent freeze ordinance was adopted (ayes {y}, noes {n}).", "By a vote of {y} to {n}, the council approved the rent freeze."]
G5_FAIL = ["The motion to adopt a rent freeze failed {y}-{n}.", "The rent freeze did not pass, {y} votes to {n}.",
           "Council rejected the rent freeze ({y} in favor, {n} against).", "The rent freeze fell short, with {y} ayes and {n} noes."]
G5_TABLE = ["A motion to table the rent freeze passed {y}-{n}.", "The rent freeze was postponed to the next meeting by a vote of {y} to {n}.",
            "Members voted {y}-{n} to send the rent freeze back to committee."]
G5_NOVOTE = ["The rent freeze was discussed; no vote was taken.", "Public comment on the rent freeze ran for an hour; the item was continued without a vote."]
G5_OTHER = ["The motion to adopt the parking plan passed {y}-{n}.", "Council voted {y} to {n} to approve the library budget.",
            "The motion to adopt a rent registry failed {y}-{n}.", "A motion to table the street-vending permit passed {y}-{n}."]
G5_FILL = ["Councilmember {nm} asked staff for a report on code enforcement.", "{k} members of the public spoke during open comment.",
           "Staff presented the quarterly housing report.", "The clerk read the consent calendar, which was approved without discussion.",
           "Councilmember {nm} noted that the tenants' association had submitted {k} letters.", "The meeting recessed for ten minutes.",
           "The city attorney summarized pending litigation in closed session.", "A resident described repairs that had not been made for {k} months."]
NAMES = ["Ortiz", "Huang", "Abara", "Lindqvist", "Moreno", "Patel", "Quinn", "Sato", "Varga"]


def g5_generate(work, seed, rng):
    import datetime
    d0 = datetime.date(2016, 1, 5)
    votes = {}
    for i in range(1, 361):
        d = d0 + datetime.timedelta(days=7 * i + rng.randint(0, 2))
        f = rng.random()
        head = (f"Minutes of the regular meeting held on {d.strftime('%A')}, {d.day} {MONTHS[d.month - 1]} {d.year}" if f < 0.4 else
                f"Meeting of {d.isoformat()}" if f < 0.7 else f"{MONTHS[d.month - 1]} {d.day}, {d.year} - Minutes")
        items = []
        for _ in range(rng.randint(3, 6)):
            y = rng.randint(5, 9); n = 9 - y
            items.append(rng.choice(G5_OTHER).format(y=y, n=n) if rng.random() < 0.4 else rng.choice(G5_FILL).format(nm=rng.choice(NAMES), k=rng.randint(2, 40)))
        r = rng.random()
        if r < 0.36:
            kind = rng.choice(["passed", "passed", "failed", "tabled"])
            if kind == "failed":
                y = rng.randint(2, 4)
            else:
                y = rng.randint(5, 8)
            n = 9 - y
            bank = {"passed": G5_PASS, "failed": G5_FAIL, "tabled": G5_TABLE}[kind]
            items.insert(rng.randrange(len(items) + 1), rng.choice(bank).format(y=y, n=n))
            votes[d.isoformat()] = [kind, y, n]
        elif r < 0.5:
            items.insert(rng.randrange(len(items) + 1), rng.choice(G5_NOVOTE))
        body = "\n\n".join(f"Item {j + 1}. " + it + " " + " ".join(rng.choice(G5_FILL).format(nm=rng.choice(NAMES), k=rng.randint(2, 40)) for _ in range(rng.randint(2, 4)))
                           for j, it in enumerate(items))
        wtext(work / "minutes" / f"m{i:04d}.md", f"# {head}\n\nPresent: nine members.\n\n{body}\n")
    return {"votes": votes}


def g5_check(work, truth, session, C):
    names = ["votes_columns", "votes_found", "votes_no_extras", "votes_outcomes_and_counts"]
    if not C.exists(work, "votes.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "votes.csv")
    if not C.add("votes_columns", rows and {"date", "outcome", "yes", "no"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {r["date"].strip()[:10]: [r["outcome"].strip().lower(), num(r["yes"]), num(r["no"])] for r in rows}
    want = truth["votes"]
    C.add("votes_found", len(set(want) & set(got)) >= 0.95 * len(want), "missed_items", f"{len(set(want) & set(got))}/{len(want)}")
    C.add("votes_no_extras", len(set(got) - set(want)) <= 1, "extra_items", sorted(set(got) - set(want))[:3])
    ok = [d for d in set(want) & set(got) if got[d][0] == want[d][0] and got[d][1] == want[d][1] and got[d][2] == want[d][2]]
    C.add("votes_outcomes_and_counts", len(ok) >= 0.95 * len(want), "numbers_wrong", f"{len(ok)}/{len(want)} right")


def g5_write(work, truth, tabled_as_passed=False, drop_phrasings=False):
    rows = []
    for d, (k, y, n) in sorted(truth["votes"].items()):
        if drop_phrasings and hash(d) % 3 == 0:
            continue
        rows.append([d, "passed" if (tabled_as_passed and k == "tabled") else k, y, n])
    write_csv(work / "votes.csv", ["date", "outcome", "yes", "no"], rows)


G5 = dict(family="scale", level="hard", outputs=["votes.csv"],
          instruction="minutes/ holds the minutes of 360 city council meetings (about 900 KB). I need every meeting where the council voted on the rent freeze itself. "
                      "Write votes.csv with columns date (YYYY-MM-DD, the meeting's date from the minutes' heading), outcome (passed, failed, or tabled: a vote to table, postpone or send it back to committee counts as tabled), yes, no (the vote counts). "
                      "Leave out meetings where it was only discussed, and votes on other items.",
          generate=g5_generate, check=g5_check, solve=lambda w, t: g5_write(w, t), wrong=lambda w, t: g5_write(w, t, tabled_as_passed=True), wrong2=lambda w, t: g5_write(w, t, drop_phrasings=True))


# ============================================================ g6: 2,400 law articles
WORDN = {2: "two", 6: "six", 12: "twelve", 18: "eighteen", 30: "thirty", 45: "forty-five", 48: "forty-eight", 60: "sixty", 90: "ninety"}
PERIODS = [("30 days", 30), ("forty-five days", 45), ("six months", 180), ("90 days", 90), ("48 hours", 2), ("twelve weeks", 84),
           ("180 days", 180), ("sixty days", 60), ("eighteen months", 540), ("two months", 60), ("six weeks", 42)]
G6_T = ["Administrative detention of a foreign national for the purpose of removal may not exceed {X}.",
        "A person held in an immigration detention centre shall be released no later than {X} after the detention order was issued.",
        "The detention order under this Chapter shall lapse after {X} and may not be renewed.",
        "Holding a migrant in administrative custody for more than {X} is prohibited."]
G6_TRAP = ["Police custody of a criminal suspect may not exceed {X}.", "An appeal against a detention order must be lodged within {X}.",
           "A detention order must be reviewed by a judge at least every {X}.", "[Repealed by Law 2021/3.] Former text: Administrative detention of a foreign national may not exceed {X}."]
G6_FILL = ["The Minister shall publish an annual report on the application of this Law.", "Applications shall be submitted in writing to the competent office.",
           "The competent authority shall keep a register of decisions taken under this Chapter.", "Interpretation shall be provided free of charge where needed.",
           "A residence permit may be renewed for periods of {k} years.", "Fees under this Article shall be set by regulation.",
           "Decisions shall state the reasons on which they are based.", "This Law enters into force on the first day of the month following its publication."]


def g6_generate(work, seed, rng):
    lines, truth = [], {}
    topics = ["Residence", "Asylum", "Borders", "Return", "Integration", "Labour Migration", "Nationality", "Reception"]
    for L in range(48):
        law = f"Law {rng.randint(1995, 2024)}/{L + 1} on {rng.choice(topics)}"
        target = rng.random() < 0.62
        tart = rng.randint(3, 48)
        traps = set(rng.sample(range(1, 51), rng.randint(0, 2)))
        for a in range(1, 51):
            if target and a == tart:
                ph, days = rng.choice(PERIODS)
                txt = rng.choice(G6_T).format(X=ph)
                truth[f"{law}|{a}"] = days
            elif a in traps:
                txt = rng.choice(G6_TRAP).format(X=rng.choice(PERIODS)[0])
            else:
                txt = " ".join(rng.choice(G6_FILL).format(k=rng.randint(1, 5)) for _ in range(rng.randint(2, 4)))
            lines.append(json.dumps({"law": law, "article": f"Article {a}", "text": txt}))
    wtext(work / "laws.jsonl", "\n".join(lines) + "\n")
    return {"detention": truth}


def g6_check(work, truth, session, C):
    names = ["detention_columns", "detention_found", "detention_no_extras", "detention_days_correct"]
    if not C.exists(work, "detention.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "detention.csv")
    if not C.add("detention_columns", rows and {"law", "article", "days"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {}
    for r in rows:
        m = re.search(r"\d+", r["article"] or "")
        if m:
            got[f"{' '.join(r['law'].split())}|{int(m.group())}"] = num(r["days"])
    want = truth["detention"]
    hit = set(want) & set(got)
    C.add("detention_found", len(hit) >= 0.95 * len(want), "missed_items", f"{len(hit)}/{len(want)}")
    C.add("detention_no_extras", len(set(got) - set(want)) <= 1, "extra_items", sorted(set(got) - set(want))[:3])
    C.add("detention_days_correct", sum(1 for k in hit if got[k] is not None and abs(got[k] - want[k]) < 0.01) >= 0.95 * len(want), "numbers_wrong")


def g6_write(work, truth, repealed=False, months31=False):
    rows = [[k.split("|")[0], f"Article {k.split('|')[1]}", (v * 31 / 30 if months31 and v >= 60 and v % 30 == 0 else v)] for k, v in sorted(truth["detention"].items())]
    if repealed:
        rows += [["Law 1999/7 on Return", "Article 12", 120], ["Law 2003/9 on Borders", "Article 4", 90]]
    write_csv(work / "detention.csv", ["law", "article", "days"], rows)


G6 = dict(family="scale", level="hard", outputs=["detention.csv"],
          instruction="laws.jsonl holds 2,400 articles from 48 laws, one JSON object per line (law, article, text). Find every article in force that sets a maximum period for the administrative detention of migrants. "
                      "Not criminal custody, not appeal deadlines or review intervals, and not repealed text. Write detention.csv with columns law (as written in the file), article (like Article 14), days "
                      "(the maximum in days; count a week as 7 days, a month as 30, and hours as fractions of a day).",
          generate=g6_generate, check=g6_check, solve=lambda w, t: g6_write(w, t), wrong=lambda w, t: g6_write(w, t, repealed=True), wrong2=lambda w, t: g6_write(w, t, months31=True))


# ============================================================ g7: reconcile 200,000 bank rows
def g7_ref(rng):
    kind = rng.choice(["INV", "PAY", "DON", "REF"])
    return kind, rng.randint(1, 99999)


def g7_generate(work, seed, rng):
    import datetime
    d0 = datetime.date(2025, 1, 1)
    bank, ledger, missing = [], [], []
    recurring = [g7_ref(rng) for _ in range(800)]
    for i in range(1, 200001):
        if rng.random() < 0.1:
            kind, n = rng.choice(recurring)
        else:
            kind, n = g7_ref(rng)
        d = d0 + datetime.timedelta(days=rng.randint(0, 360))
        amt = round(rng.lognormvariate(4, 1), 2)
        bid = f"B{i:06d}"
        bref = rng.choice([f"{kind}-{n:06d}", f"{kind}/{n}", f"{kind} {n}"])
        bank.append([bid, d.isoformat(), f"{amt:.2f}", bref])
        r = rng.random()
        lref = rng.choice([f"{kind.lower()} {n}", f"{kind}{n}", f"{kind.title()} {n:05d}", f"{kind.lower()}-{n}"])
        if r < 0.0008:
            missing.append(bid)  # simply not in the ledger
        elif r < 0.0012:
            missing.append(bid)  # a near miss: same reference, a different amount
            ledger.append([f"L{len(ledger) + 1:06d}", d.isoformat(), f"{amt + rng.choice([-1, 1]) * rng.randint(5, 500) / 100:.2f}", lref])
        elif r < 0.0015:
            missing.append(bid)  # a near miss: posted three or more days later
            ledger.append([f"L{len(ledger) + 1:06d}", (d + datetime.timedelta(days=rng.randint(3, 9))).isoformat(), f"{amt:.2f}", lref])
        else:
            ledger.append([f"L{len(ledger) + 1:06d}", (d + datetime.timedelta(days=rng.choice([0, 0, 1]))).isoformat(), f"{amt:.2f}", lref])
    rng.shuffle(ledger)
    write_csv(work / "bank.csv", ["bank_id", "date", "amount", "reference"], bank)
    write_csv(work / "ledger.csv", ["ledger_id", "posted", "amount", "memo"], ledger)
    wtext(work / "README.md", "bank.csv is the bank's export for 2025; ledger.csv is our bookkeeping. A bank transaction is in the ledger when there is a ledger entry with the same amount, "
          "posted on the same day or one day later, whose memo is the same reference: references match when their letters match ignoring case and their numbers match ignoring leading zeros "
          "(INV-004213, inv 4213 and Inv4213 are the same). Each ledger entry matches at most one bank transaction.\n")
    return {"missing": sorted(missing)}


def g7_check(work, truth, session, C):
    names = ["missing_found", "missing_no_extras"]
    if not C.exists(work, "missing.csv"):
        C.skip(names, "stopped_early"); return
    got = {(r.get("bank_id") or "").strip().upper() for r in read_csv(work / "missing.csv")}
    want = set(truth["missing"])
    C.add("missing_found", len(want & got) >= 0.97 * len(want), "missed_items", f"{len(want & got)}/{len(want)}")
    C.add("missing_no_extras", len(got - want) <= max(2, 0.02 * len(want)), "extra_items", f"{len(got - want)} extra")


def g7_write(work, truth, ref_only=False, same_day=False):
    m = list(truth["missing"])
    if ref_only:
        m = m[: len(m) // 2]
    if same_day:
        m = m + [f"B{i:06d}" for i in range(1, 2000, 7)]
    write_csv(work / "missing.csv", ["bank_id"], [[x] for x in m])


G7 = dict(family="scale", level="hard", outputs=["missing.csv"],
          instruction="Our auditor wants every bank transaction from 2025 that is not in our books. bank.csv has about 200,000 rows and ledger.csv about the same; README.md says how to match them. "
                      "Write missing.csv with one column, bank_id, listing every bank transaction that has no matching ledger entry.",
          generate=g7_generate, check=g7_check, solve=lambda w, t: g7_write(w, t), wrong=lambda w, t: g7_write(w, t, ref_only=True), wrong2=lambda w, t: g7_write(w, t, same_day=True))


# ============================================================ g8: ten yearly survey files
def g8_generate(work, seed, rng):
    med = {}
    for y in range(2016, 2026):
        vals, rows = [], []
        col = "hh_income" if y < 2019 else "income"
        for i in range(22000):
            inc = round(rng.lognormvariate(10.9 + (y - 2016) * 0.02, 0.6), -2)
            r = rng.random()
            if r < 0.04:
                cell = "-9"
            elif y >= 2021 and r < 0.07:
                cell = "999999"
            else:
                vals.append(inc)
                cell = f"{inc / 1000:.1f}" if y <= 2020 else (f"{inc:.0f}" if y != 2023 else f"{inc:.0f},00")
            rows.append([f"{y}{i:05d}", rng.choice(REGIONS), cell])
        med[str(y)] = statistics.median(vals)
        delim = ";" if y == 2023 else ","
        out = io.StringIO()
        w = csv.writer(out, delimiter=delim)
        w.writerow(["id", "region", col]); w.writerows(rows)
        wtext(work / "surveys" / f"survey_{y}.csv", out.getvalue())
    wtext(work / "codebook.md", "# Household survey, 2016 to 2025\n\n- The income column was called hh_income until 2018 and income from 2019.\n"
          "- Income is household income before tax. Until 2020 it is in thousands of dollars (54.3 means $54,300); from 2021 in dollars.\n"
          "- -9 means the household refused to answer. From 2021, 999999 means not reported.\n")  # v2: the 2023 format note is gone
    return {"medians": med}


def g8_check(work, truth, session, C):
    names = ["medians_columns", "medians_all_years", "medians_correct"]
    if not C.exists(work, "medians.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "medians.csv")
    if not C.add("medians_columns", rows and {"year", "median_income_usd"} <= set(rows[0]), "wrong_format"):
        C.skip(names[1:], "wrong_format"); return
    got = {str(int(num(r["year"]) or 0)): num(r["median_income_usd"]) for r in rows}
    C.add("medians_all_years", set(truth["medians"]) <= set(got), "missed_items", sorted(set(truth["medians"]) - set(got)))
    bad = [y for y, v in truth["medians"].items() if got.get(y) is None or abs(got[y] - v) > 1.01]
    C.add("medians_correct", not bad, "numbers_wrong", f"off in {bad}")


def g8_write(work, truth, units=False, codes=False):
    rows = []
    for y, v in sorted(truth["medians"].items()):
        if units and int(y) <= 2020:
            v = v / 1000
        if codes and int(y) >= 2021:
            v = v + 400
        rows.append([y, round(v)])
    write_csv(work / "medians.csv", ["year", "median_income_usd"], rows)


G8 = dict(family="scale", level="hard", outputs=["medians.csv"],
          instruction="surveys/ has our household survey for each year from 2016 to 2025 (220,000 rows in all), and codebook.md explains how the files changed over the years. "
                      "Write medians.csv with columns year and median_income_usd: the median household income in dollars among households that reported one, rounded to whole dollars.",
          generate=g8_generate, check=g8_check, solve=lambda w, t: g8_write(w, t), wrong=lambda w, t: g8_write(w, t, units=True), wrong2=lambda w, t: g8_write(w, t, codes=True))


TASKS = {"g1-code-360": G1, "g2-donations-200k": G2, "g3-stations-hourly": G3, "g4-members-dedupe": G4,
         "g5-council-votes": G5, "g6-law-corpus": G6, "g7-reconcile": G7, "g8-survey-years": G8}
