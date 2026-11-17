"""Round two, family `followup`: a second request in the same session changes the requirement. The
checker reads the state after both turns: the change must be applied, and what the user said to keep
must still be right. Four tasks, i1 to i4."""
import json, re, sqlite3
from pathlib import Path
from evalkit import read_csv, write_csv, num, read, has_number, page
import r2common as R
from r2_scale import wtext, MONTHS

# ============================================================ i1: monthly, then fiscal quarters without in-kind
def i1_generate(work, seed, rng):
    rows, m_all, m_cash, q, fk = [], {}, {}, {}, {}
    for i in range(3200):
        y = rng.choice([2025, 2025, 2026]); mo = rng.randint(1, 12) if y == 2025 else rng.randint(1, 6)
        d = f"{y}-{mo:02d}-{rng.randint(1, 28):02d}"
        kind = rng.choice(["cash", "check", "card", "card", "in-kind"])
        amt = round(rng.lognormvariate(4, 1), 2)
        rows.append([d, f"{amt:.2f}", kind, f"D{rng.randint(1, 900):04d}"])
        if y == 2025:
            m_all[d[:7]] = m_all.get(d[:7], 0) + amt
            if kind != "in-kind":
                m_cash[d[:7]] = m_cash.get(d[:7], 0) + amt
        if kind != "in-kind" and (y + 1 if mo >= 7 else y) == 2026:
            fk[kind] = fk.get(kind, 0) + amt
        if kind != "in-kind":
            fy = y + 1 if mo >= 7 else y
            fq = ((mo - 7) % 12) // 3 + 1
            k = f"FY{fy}-Q{fq}"
            q[k] = q.get(k, 0) + amt
    rows.sort()
    write_csv(work / "donations.csv", ["date", "amount", "kind", "donor_id"], rows)
    r2 = lambda d: {k: round(v, 2) for k, v in d.items()}
    return {"m_all": r2(m_all), "m_cash": r2(m_cash), "q": r2(q), "fy26_kind": r2(fk)}


def i1_check(work, truth, session, C):
    names = ["monthly_has_12_months", "monthly_without_inkind", "quarterly_labels", "quarterly_totals"]
    if not C.exists(work, "monthly.csv"):
        C.skip(names, "stopped_early"); return
    got = {(r.get("month") or "").strip()[:7]: num(r.get("total")) for r in read_csv(work / "monthly.csv")}
    C.add("monthly_has_12_months", set(truth["m_cash"]) <= set(got), "missed_items")
    ok = all(got.get(k) is not None and abs(got[k] - v) <= 0.02 for k, v in truth["m_cash"].items())
    still_all = all(got.get(k) is not None and abs(got[k] - v) <= 0.02 for k, v in truth["m_all"].items())
    C.add("monthly_without_inkind", ok, "followup_ignored" if still_all else "numbers_wrong")
    if not C.exists(work, "quarterly.csv"):
        C.skip(names[2:], "stopped_early"); return
    qg = {(r.get("fiscal_quarter") or "").strip().upper().replace(" ", ""): num(r.get("total")) for r in read_csv(work / "quarterly.csv")}
    C.add("quarterly_labels", set(qg) == set(truth["q"]), "wrong_format", f"{sorted(qg)} vs {sorted(truth['q'])}")
    C.add("quarterly_totals", all(qg.get(k) is not None and abs(qg[k] - v) <= 0.05 for k, v in truth["q"].items()), "numbers_wrong")
    if not C.exists(work, "fy2026_by_kind.csv"):
        C.skip(["fy2026_kinds_without_inkind"], "stopped_early"); return
    kg = {(r.get("kind") or "").strip().lower(): num(r.get("total")) for r in read_csv(work / "fy2026_by_kind.csv")}
    ok = all(kg.get(k) is not None and abs(kg[k] - v) <= 0.05 for k, v in truth["fy26_kind"].items()) and not [k for k, v in kg.items() if k == "in-kind" and v]
    C.add("fy2026_kinds_without_inkind", ok, "followup_ignored" if kg.get("in-kind") else "numbers_wrong")


def i1_write(work, truth, keep_inkind=False, calendar=False):
    m = truth["m_all"] if keep_inkind else truth["m_cash"]
    write_csv(work / "monthly.csv", ["month", "total"], [[k, v] for k, v in sorted(m.items())])
    q = dict(truth["q"])
    if calendar:
        q = {k.replace("Q1", "QX").replace("Q3", "Q1").replace("QX", "Q3"): v for k, v in q.items()}
    write_csv(work / "quarterly.csv", ["fiscal_quarter", "total"], [[k, v] for k, v in sorted(q.items())])
    write_csv(work / "fy2026_by_kind.csv", ["kind", "total"], [[k, v] for k, v in sorted(truth["fy26_kind"].items())] + ([["in-kind", 1000]] if keep_inkind else []))


I1 = dict(family="followup", level="medium", outputs=["monthly.csv", "quarterly.csv"],
          instruction="donations.csv lists our donations from January 2025 to June 2026. Please make monthly.csv with the total donated in each month of 2025, columns month (like 2025-03) and total.",
          followups=["Thanks! Two changes from our finance person. In-kind gifts should not be counted anywhere, so take them out of monthly.csv too. "
                     "And she needs quarterly.csv by fiscal quarter, for every quarter the file covers: our fiscal year starts July 1 and is named for the year it ends in "
                     "(so July to September 2025 is FY2026-Q1). Columns fiscal_quarter (like FY2026-Q1) and total.",
                     "Last one: the board wants fiscal year 2026 broken down by kind of gift, as fy2026_by_kind.csv with columns kind and total, counted the same way as quarterly.csv."],
          generate=i1_generate, check=i1_check, solve=lambda w, t: i1_write(w, t), wrong=lambda w, t: i1_write(w, t, keep_inkind=True), wrong2=lambda w, t: i1_write(w, t, calendar=True))


# ============================================================ i2: a page, then a filter and a new rule
HOODS = ["Eastlake", "Fruitvale", "Dimond", "Glenview"]


def i2_generate(work, seed, rng):
    rows = []
    for _ in range(rng.randint(70, 90)):
        m = rng.randint(1, 12)
        rows.append([f"2025-{m:02d}-{rng.randint(1, 28):02d}", rng.choice(["Repair clinic", "Potluck", "Building meeting", "Know your rights night"]), rng.choice([rng.randint(2, 9), rng.randint(10, 80)]), rng.choice(HOODS)])
    rows.sort()
    write_csv(work / "events.csv", ["date", "event", "attendees", "neighborhood"], rows)

    def agg(rs):
        per = {}
        for r in rs:
            per[MONTHS[int(r[0][5:7]) - 1]] = per.get(MONTHS[int(r[0][5:7]) - 1], 0) + 1
        return {"events": len(rs), "attendees": sum(r[2] for r in rs), "months": per}
    big = [r for r in rows if r[2] >= 10]
    pick = rng.choice(HOODS)
    return {"all": agg(big), "all_small": agg(rows), "hood": pick, "one": agg([r for r in big if r[3] == pick])}


def i2_vals(r):
    v = r.get("values") or {}
    g = lambda s: (v.get(s) or [""])[0]
    return num(re.sub(r"[^\d.]", "", g("#total-events")) or None), num(re.sub(r"[^\d.]", "", g("#total-attendees")) or None), v.get("#months tr") or []


def i2_months_ok(trs, months):
    return all(any(m in t and R.numbers_in(t.replace("2025", ""))[-1:] == [float(n)] for t in trs) for m, n in months.items()) and \
        not any(R.numbers_in(t.replace("2025", "")) and R.numbers_in(t.replace("2025", ""))[-1] > 0 and not any(m in t for m in months) for t in trs if any(mm in t for mm in MONTHS))


def i2_check(work, truth, session, C):
    names = ["page_loads_offline", "totals_count_only_10_plus", "months_count_only_10_plus", "filter_updates_totals", "filter_updates_months"]
    if not C.exists(work, "index.html"):
        C.skip(names, "stopped_early"); return
    sel = ["#total-events", "#total-attendees", "#months tr", "#avg-attendees"]
    a = page(work, {"path": "index.html", "read": sel})
    C.add("page_loads_offline", a.get("ok") and not a.get("errors") and not a.get("external"), "page_broken", a.get("error") or a.get("errors"))
    e, at, trs = i2_vals(a)
    small = truth["all_small"]
    lab = "followup_ignored" if (e == small["events"]) else "numbers_wrong"
    C.add("totals_count_only_10_plus", e == truth["all"]["events"] and at == truth["all"]["attendees"], lab, f"{e}, {at}")
    C.add("months_count_only_10_plus", i2_months_ok(trs, truth["all"]["months"]), "numbers_wrong", trs[:3])
    b = page(work, {"path": "index.html", "read": sel, "select": [["#hood", truth["hood"]]]})
    e2, at2, trs2 = i2_vals(b)
    C.add("filter_updates_totals", not b.get("errors") and e2 == truth["one"]["events"] and at2 == truth["one"]["attendees"], "followup_ignored", f"{e2}, {at2}; {b.get('errors')}")
    C.add("filter_updates_months", i2_months_ok(trs2, truth["one"]["months"]), "followup_ignored", trs2[:3])
    av = num(re.sub(r"[^\d.]", "", ((b.get("values") or {}).get("#avg-attendees") or [""])[0]) or None)
    want = round(truth["one"]["attendees"] / max(1, truth["one"]["events"]), 1)
    C.add("average_follows_filter", av is not None and abs(av - want) <= 0.051, "followup_ignored", f"{av} vs {want}")


def i2_write(work, truth, min_att=10, static=False):
    rows = read_csv(work / "events.csv")
    data = json.dumps([[r["date"], int(r["attendees"]), r["neighborhood"]] for r in rows])
    opts = "".join(f"<option>{h}</option>" for h in ["All"] + HOODS)
    js = "" if static else "document.getElementById('hood').onchange=draw;"
    wtext(work / "index.html", f"""<!doctype html><meta charset=utf-8><title>Events</title><select id=hood>{opts}</select>
<p>Events: <span id=total-events></span></p><p>Average: <span id=avg-attendees></span></p><p>Attendees: <span id=total-attendees></span></p><table id=months></table>
<script>const D={data};const M={json.dumps(MONTHS)};
function draw(){{const h=document.getElementById('hood').value;const r=D.filter(x=>x[1]>={min_att}&&(h==='All'||x[2]===h));
document.getElementById('total-events').textContent=r.length;document.getElementById('avg-attendees').textContent=(r.reduce((a,x)=>a+x[1],0)/Math.max(1,r.length)).toFixed(1);document.getElementById('total-attendees').textContent=r.reduce((a,x)=>a+x[1],0);
const c={{}};r.forEach(x=>{{const m=M[+x[0].slice(5,7)-1];c[m]=(c[m]||0)+1}});
document.getElementById('months').innerHTML=M.filter(m=>c[m]).map(m=>'<tr><td>'+m+'</td><td>'+c[m]+'</td></tr>').join('')}}
{js}draw();</script>""")


I2 = dict(family="followup", level="medium", outputs=["index.html"],
          instruction="events.csv lists our association's events this year. Make index.html, a static page that works with no internet connection, showing the number of events in an element with id total-events, "
                      "the total number of attendees in an element with id total-attendees, and a table with id months with one row per month (month name written out, like March, and the number of events that month).",
          followups=["Two changes, please. Add a dropdown with id hood to filter by neighborhood: its first option is All, then one option per neighborhood, and the totals and the month table should follow it. "
                     "Also, from now on count only events that had at least 10 attendees, everywhere on the page.",
                     "One more: show the average number of attendees per event, to one decimal, in an element with id avg-attendees. It should follow the dropdown and the 10-attendee rule like everything else."],
          generate=i2_generate, check=i2_check, solve=lambda w, t: i2_write(w, t), wrong=lambda w, t: i2_write(w, t, min_att=0), wrong2=lambda w, t: i2_write(w, t, static=True))


# ============================================================ i3: clean contacts, then keep the ones without email
def i3_phone(d, rng):
    return rng.choice([f"({d[:3]}) {d[3:6]}-{d[6:]}", f"{d[:3]}.{d[3:6]}.{d[6:]}", f"+1 {d[:3]} {d[3:6]} {d[6:]}", d, f"1-{d[:3]}-{d[3:6]}-{d[6:]}"])


def i3_generate(work, seed, rng):
    people, rows = [], []
    used = set()
    for i in range(320):
        name = f"{rng.choice(['ana', 'kofi', 'li', 'mira', 'omar', 'zoe', 'raj', 'ines', 'teo', 'yuki'])} {rng.choice(['lopez', 'osei', 'chen', 'haddad', 'berg', 'silva', 'novak'])}-{rng.choice(['ray', 'moss', 'vale', 'ford'])}"
        while True:
            d = f"510{rng.randint(2000000, 9999999)}"
            if d not in used:
                used.add(d); break
        email = "" if rng.random() < 0.25 else f"{name.split()[0]}{i}@mail.example"
        people.append({"name": name, "email": email, "phone": d})
        for _ in range(rng.choice([1, 1, 1, 2])):
            nm = rng.choice([name, name.upper(), name.title(), name.lower()])
            em = rng.choice([email, email.upper(), email.title()]) if email else ""
            rows.append([nm, em, i3_phone(d, rng)])
    rng.shuffle(rows)
    write_csv(work / "contacts.csv", ["name", "email", "phone"], rows)
    out = rng.sample([p for p in people if p["email"]], 6) + rng.sample([p for p in people if not p["email"]], 4)
    write_csv(work / "optout.csv", ["contact"], [[(p["email"].upper() if i % 2 else p["email"]) if p["email"] else i3_phone(p["phone"], rng)] for i, p in enumerate(out)])
    gone = {id(p) for p in out}
    return {"people": [p for p in people if id(p) not in gone], "optout": [p["email"] or p["phone"] for p in out]}


def i3_check(work, truth, session, C):
    names = ["one_row_per_person", "people_without_email_kept", "phones_e164", "names_title_case", "optouts_removed"]
    if not C.exists(work, "contacts_clean.csv"):
        C.skip(names, "stopped_early"); return
    rows = read_csv(work / "contacts_clean.csv")
    ppl = truth["people"]
    no_email = [p for p in ppl if not p["email"]]
    C.add("one_row_per_person", len(rows) == len(ppl), "numbers_wrong" if len(rows) != len(ppl) - len(no_email) else "followup_ignored", f"{len(rows)} vs {len(ppl)}")
    digits = {re.sub(r"\D", "", r.get("phone") or "")[-10:] for r in rows if not (r.get("email") or "").strip()}
    C.add("people_without_email_kept", all(p["phone"] in digits for p in no_email), "followup_ignored", f"{len(digits)} of {len(no_email)}")
    C.add("phones_e164", rows and all(re.fullmatch(r"\+1\d{10}", (r.get("phone") or "").strip()) for r in rows), "followup_ignored")
    want = {p["name"].title() for p in ppl}
    C.add("names_title_case", rows and all((r.get("name") or "").strip() in want for r in rows), "wrong_format", [r.get("name") for r in rows[:2]])
    left = {(r.get("email") or "").strip().lower() for r in rows} | {re.sub(r"\D", "", r.get("phone") or "")[-10:] for r in rows}
    C.add("optouts_removed", not (set(x.lower() for x in truth["optout"]) & left), "followup_ignored")


def i3_write(work, truth, drop_no_email=False, raw_phone=False):
    rows = []
    for p in truth["people"]:
        if drop_no_email and not p["email"]:
            continue
        rows.append([p["name"].title(), p["email"], f"({p['phone'][:3]}) {p['phone'][3:6]}-{p['phone'][6:]}" if raw_phone else "+1" + p["phone"]])
    write_csv(work / "contacts_clean.csv", ["name", "email", "phone"], rows)


I3 = dict(family="followup", level="medium", outputs=["contacts_clean.csv"],
          instruction="contacts.csv is our phone-bank list. Please write contacts_clean.csv with columns name, email, phone: one row per person (the same email, ignoring case, is the same person), "
                      "names in Title Case, and drop the rows that have no email.",
          followups=["Sorry, change of plan: keep the people who have no email after all, we will phone them. Among those, the same phone number means the same person. "
                     "And write every phone number as +1 followed by the ten digits, like +15105550134. Same file, please.",
                     "Last thing: some people asked not to be called. Remove everyone whose email or phone number appears in optout.csv (it is in the folder), and keep everything else as it is."],
          generate=i3_generate, check=i3_check, solve=lambda w, t: i3_write(w, t), wrong=lambda w, t: i3_write(w, t, drop_no_email=True), wrong2=lambda w, t: i3_write(w, t, raw_phone=True))


# ============================================================ i4: a count, then a breakdown, keep the first answer
def i4_generate(work, seed, rng):
    con = sqlite3.connect(work / "studies.db")
    con.execute("CREATE TABLE studies (id INTEGER PRIMARY KEY, title TEXT, year INTEGER, hazard TEXT, region TEXT)")
    regs = ["Africa", "Asia", "Europe", "Latin America", "North America", "Oceania"]
    hz = ["flood", "Flood", "riverine flood", "coastal flooding", "Flash Flood", "drought", "heat", "cyclone", "sea-level rise", "wildfire", "inundation", "Inundation"]
    allc, by, fo = 0, {}, 0
    for i in range(1, 641):
        y, h, r = rng.randint(2001, 2025), rng.choice(hz), rng.choice(regs)
        con.execute("INSERT INTO studies VALUES (?,?,?,?,?)", (i, f"Study {i} of {h} in {r}", y, h, r))
        fo += "flood" in h.lower()
        if "flood" in h.lower() or "inundation" in h.lower():
            allc += 1
            if y >= 2016:
                by[r] = by.get(r, 0) + 1
    con.commit(); con.close()
    from r2_honest import file_hash
    return {"all": allc, "by": by, "since": sum(by.values()), "flood_only": fo, "hash": file_hash(work / "studies.db")}


def i4_check(work, truth, session, C):
    names = ["answer_all_years_with_inundation", "by_region_correct", "db_untouched"]
    if not C.exists(work, "answer.md"):
        C.skip(names, "stopped_early"); return
    text = read(work, "answer.md")
    ok = has_number(text, truth["all"], 0)
    C.add("answer_all_years_with_inundation", ok, "broke_earlier_work" if has_number(text, truth["since"], 0) else "followup_ignored" if has_number(text, truth["flood_only"], 0) else "numbers_wrong", truth["all"])
    if not C.exists(work, "by_region.csv"):
        C.skip(names[1:], "stopped_early"); return
    got = {(r.get("region") or "").strip(): num(r.get("studies")) for r in read_csv(work / "by_region.csv")}
    C.add("by_region_correct", all(got.get(k) == v for k, v in truth["by"].items()) and not [k for k, v in got.items() if v and k not in truth["by"]], "numbers_wrong")
    from r2_honest import file_hash
    C.add("db_untouched", file_hash(work / "studies.db") == truth["hash"], "touched_inputs")


def i4_write(work, truth, overwrite=False, no_year=False):
    wtext(work / "answer.md", f"There are {truth['since'] if overwrite else truth['flood_only'] if no_year else truth['all']} studies about flooding.\n")
    wtext(work / "query.sql", "SELECT COUNT(*) FROM studies WHERE lower(hazard) LIKE '%flood%';\n")
    by = dict(truth["by"])
    if no_year:
        by = {k: v + 3 for k, v in by.items()}
    write_csv(work / "by_region.csv", ["region", "studies"], [[k, v] for k, v in sorted(by.items())])


I4 = dict(family="followup", level="easy", outputs=["answer.md", "by_region.csv"],
          instruction="How many studies in studies.db are about flooding? Count any study whose hazard contains the word flood, in any case. Write the number in answer.md and the query you used in query.sql.",
          followups=["Thanks. Now the same count but only for studies published in 2016 or later, broken down by region: by_region.csv with columns region and studies. Keep answer.md as it is.",
                     "Our data manager says studies whose hazard is inundation are floods too. Please update both answer.md and by_region.csv to include them."],
          generate=i4_generate, check=i4_check, solve=lambda w, t: i4_write(w, t), wrong=lambda w, t: i4_write(w, t, overwrite=True), wrong2=lambda w, t: i4_write(w, t, no_year=True))


TASKS = {"i1-fiscal-quarters": I1, "i2-events-filter": I2, "i3-contacts-change": I3, "i4-keep-answer": I4}
