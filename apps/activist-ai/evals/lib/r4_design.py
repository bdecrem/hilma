"""Round four: design tasks for the designer and app-designer skills, run with and without them.

    u1-tenants-event   designer: a one-page site for a tenants' meeting, from event.md
    u2-results-page    designer: a research project's results page with a table and a chart
    u3-dashboard       designer: a board dashboard from twelve months of donations
    u4-report-site     designer: a one-page report site for council members, from report.md
    u5-signup-flow     designer: a volunteer sign-up flow in a few steps, then a thank-you
    u6-phone-screens   app-designer: three screens of a tool library's phone app, clickable, with pictures
    u7-app-unfinished  app-designer: a two-screen notes prototype that "feels unfinished", made a normal app
    u9-block-party        designer, Bold: "a fun, colorful page" for a block party, from party.md
    u10-youth-strike       designer, Bold: "a bold, modern page" for a youth climate strike, from strike.md
    u11-garden-fundraiser designer, Bold: "a gorgeous page" for a garden's harvest dinner, from dinner.md
    u12-good-morning      designer, Bold: Bart's own request word for word, a rising sun and one line, no file (OLA-168)
    u13-bart-home         designer, Bold: Bart's own request word for word, a personal homepage, from bart.md (OLA-168)

The program checks hold every page to what a careful designer would never ship: broken on a phone,
unreadable, decorated (gradients, glows, emoji, pills, a colored phrase in the headline, placeholder
text, several accent colors), no clear first thing, inaccessible, or missing the real content. How
good the page looks beyond that is judged separately (evals/design-judge.mjs), blind, by comparing
the two arms' pages side by side. Made-up content only.
"""
import re
from pathlib import Path

from evalkit import page

HERE = Path(__file__).resolve().parent
STREETS = ["Grand Street", "Halsey Avenue", "Orchard Row", "Willow Lane", "Mercer Court", "Linden Place", "Dunmore Road", "Fairview Terrace"]
GROUPS = ["Tenants United", "Neighbors Association", "Tenant Council", "Residents' Committee"]
DAYS = [("Thursday", "March 12"), ("Tuesday", "April 7"), ("Saturday", "May 16"), ("Wednesday", "June 3"), ("Monday", "September 21")]
NAMES = ["Ana Ruiz", "Wei Chen", "Kofi Mensah", "Lena Varga", "Omar Haddad", "June Tanaka", "Raj Patel", "Sara Lopez"]
REGIONS = ["Northside", "Riverbend", "Old Town", "Eastgate", "Harbor", "Hillcrest", "Southfield", "Mill District"]
NEIGHBORHOODS = ["Northside", "Riverbend", "Old Town", "Eastgate", "Harbor View", "Hillcrest"]
TOOLS = ["Cordless drill", "Circular saw", "Ladder, 8 ft", "Pressure washer", "Tile cutter", "Hedge trimmer", "Stud finder", "Wet vacuum",
         "Orbital sander", "Pipe wrench set", "Post hole digger", "Paint sprayer"]
MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]

COMMON = ["page_loads", "no_sideways_scroll_on_a_phone", "no_sideways_scroll_on_a_laptop", "text_contrast_passes", "no_tiny_text",
          "one_or_two_fonts", "nothing_from_other_addresses", "no_clipped_text", "type_on_a_scale", "no_decoration", "one_accent",
          "no_placeholder_text", "clear_first_thing", "headings_and_alt_text", "focus_is_visible"]


def fams(a):
    return [f for f in (a.get("font_families") or {}) if f and not re.search(r"mono|courier|consolas|menlo", f, re.I)]


def design_checks(C, work, rel, min_px=12, laptop=True):
    """The program checks every design task shares, on one page at 390 and 1280 px. Returns what the phone showed."""
    phone = page(work, {"path": rel, "width": 390, "audit": True})
    lap = page(work, {"path": rel, "width": 1280, "audit": True}) if laptop else phone
    a, b = phone.get("audit") or {}, lap.get("audit") or {}
    ta, tb = a.get("taste") or {}, b.get("taste") or {}
    C.add("page_loads", phone.get("ok") and lap.get("ok") and not phone.get("errors"), "page_broken", (phone.get("error") or "") + str(phone.get("errors", ""))[:200])
    C.add("no_sideways_scroll_on_a_phone", phone.get("scroll", 1) <= 0 and a.get("past_right_edge_count", 1) == 0, "page_broken",
          f"scroll {phone.get('scroll')}, past edge {a.get('past_right_edge_count')} {str(a.get('past_right_edge', ''))[:120]}")
    C.add("no_sideways_scroll_on_a_laptop", lap.get("scroll", 1) <= 0, "page_broken", f"scroll {lap.get('scroll')}")
    C.add("text_contrast_passes", a.get("low_contrast_count", 1) == 0 and b.get("low_contrast_count", 1) == 0, "page_broken",
          f"{a.get('low_contrast_count')} at 390, {b.get('low_contrast_count')} at 1280: {str(a.get('low_contrast') or b.get('low_contrast') or '')[:160]}")
    C.add("no_tiny_text", (a.get("smallest_text_px") or 0) >= min_px and (b.get("smallest_text_px") or 0) >= min_px, "page_broken", f"smallest {a.get('smallest_text_px')} px")
    C.add("one_or_two_fonts", 0 < len(fams(b)) <= 2, "design_slop", f"{list((b.get('font_families') or {}).keys())}")
    C.add("nothing_from_other_addresses", not phone.get("external") and not lap.get("external"), "page_broken", f"{phone.get('external')} outside requests")
    C.add("no_clipped_text", a.get("clipped_count", 1) == 0 and b.get("clipped_count", 1) == 0, "page_broken", str(a.get("clipped") or b.get("clipped") or "")[:160])
    sizes = b.get("text_sizes") or {}
    body = (tb.get("reading_px") or b.get("body_text_px") or 0)
    C.add("type_on_a_scale", len(sizes) <= 8 and 14 <= body <= 19, "design_slop", f"{len(sizes)} sizes {sorted(sizes, key=float)}, reading {body} px")
    deco = {k: tb.get(k) for k in ("gradients", "glows", "glass", "emoji", "h1_accent") if tb.get(k)}
    if (tb.get("pills") or 0) > 3:
        deco["pills"] = tb["pills"]
    if (tb.get("round_boxes") or 0) > 4:
        deco["round_boxes"] = tb["round_boxes"]
    if (tb.get("tiny_caps_labels") or 0) > 2:
        deco["tiny_caps_labels"] = tb["tiny_caps_labels"]
    C.add("no_decoration", not deco, "design_slop", str(deco)[:200])
    C.add("one_accent", len(tb.get("accent_hues") or []) <= 2, "design_slop", str(tb.get("accent_hues")))
    C.add("no_placeholder_text", not (ta.get("placeholder") or tb.get("placeholder")), "design_slop", str(ta.get("placeholder") or tb.get("placeholder")))
    C.add("clear_first_thing", (tb.get("rivals") or 9) <= 2 and (tb.get("contrast_of_sizes") or 0) >= 1.6, "weak_hierarchy",
          f"rivals {tb.get('rivals')}, largest/reading {tb.get('contrast_of_sizes')}: {str(tb.get('first_screen'))[:160]}")
    C.add("headings_and_alt_text", b.get("h1_count") == 1 and not tb.get("heading_skips") and not tb.get("images_without_alt") and not tb.get("unlabeled_pictures"),
          "not_accessible", f"h1 {b.get('h1_count')}, skips {tb.get('heading_skips')}, no alt {tb.get('images_without_alt')}, unlabeled pictures {tb.get('unlabeled_pictures')}")
    C.add("focus_is_visible", not tb.get("interactive") or (tb.get("focus_rules") or 0) > 0, "not_accessible", f"{tb.get('interactive')} interactive, {tb.get('focus_rules')} focus rules")
    return phone, lap


def has_all(text, items):
    flat = re.sub(r"\s+", " ", text.replace(",", "").replace(" ", " ")).lower()
    return [i for i in items if re.sub(r"\s+", " ", str(i).replace(",", "")).lower() not in flat]


def start(C, work, rel, extra):
    C.exists(work, rel)
    if not (Path(work) / rel).exists():
        C.skip(COMMON + extra, "stopped_early")
        return False
    return True


# ------------------------------------------------------------------ u1: a tenants' meeting

def u1_generate(work, seed, rng):
    street, group = rng.choice(STREETS), rng.choice(GROUPS)
    num = rng.randint(120, 880)
    day, date = rng.choice(DAYS)
    hour = rng.choice([6, 7])
    phone = f"(555) 01{rng.randint(10, 99)}-{rng.randint(1000, 9999)}"
    agenda = rng.sample(["The heat outages since November", "The rent increase notice", "Repairs the landlord promised in writing",
                         "Electing two floor captains", "Our letter to the housing agency", "Mold in the basement laundry room"], 4)
    langs = rng.sample(["Spanish", "Cantonese", "Haitian Creole", "Russian", "Bengali"], 2)
    outages = rng.randint(9, 21)
    text = f"""# {street} {group}: building meeting

When: {day}, {date}, {hour}:00 pm to {hour + 1}:30 pm
Where: the community room, ground floor, {num} {street}
Who: every tenant of {num} and {num + 2} {street}, and anyone from the block

Why now: the heat has gone out {outages} times since November, and the landlord's rent increase notice arrived last week.

Agenda
1. {agenda[0]}
2. {agenda[1]}
3. {agenda[2]}
4. {agenda[3]}

Bring: your lease, and any letters or photos of repair problems.
Interpretation in {langs[0]} and {langs[1]}. Childcare in the room next door.
Questions: call or text {NAMES[seed % len(NAMES)]} at {phone}.
Please tell us you are coming, so we set up enough chairs (reply to the text message, or call).
"""
    (Path(work) / "event.md").write_text(text)
    return {"facts": [date, f"{num} {street}", phone, *agenda[:3], langs[0], str(outages)], "date": date, "time": f"{hour}"}


def u1_check(work, truth, session, C):
    extra = ["facts_kept", "date_and_time_on_the_first_screen"]
    if not start(C, work, "index.html", extra):
        return
    phone, lap = design_checks(C, work, "index.html")
    lost = has_all(phone.get("text") or "", truth["facts"])
    C.add("facts_kept", not lost, "missed_items", f"lost {lost[:4]}")
    first = " ".join(x.get("text", "") for x in ((lap.get("audit") or {}).get("taste") or {}).get("first_screen", []))
    C.add("date_and_time_on_the_first_screen", truth["date"].split()[0] in first or truth["date"] in first, "weak_hierarchy", first[:200])


# ------------------------------------------------------------------ u2: research results

def u2_generate(work, seed, rng):
    regions = rng.sample(REGIONS, 6)
    rows = []
    for r in regions:
        n = rng.randint(80, 420)
        share = rng.randint(18, 74)
        rows.append([r, n, share, rng.randint(-9, 12)])
    best = max(rows, key=lambda x: x[2])
    lines = "\n".join(f"{r},{n},{s},{c}" for r, n, s, c in rows)
    (Path(work) / "results.csv").write_text("region,households_surveyed,share_late_rent_pct,change_since_2024_pts\n" + lines + "\n")
    total = sum(r[1] for r in rows)
    (Path(work) / "project.md").write_text(f"""# Rent Burden Study 2025

A study by the City Housing Research Group. We asked {total:,} households in six neighborhoods whether they paid rent late at least once in the last twelve months.
Method: door-to-door survey, May to August 2025; the change is in percentage points since the same survey in 2024.
Lead researcher: {NAMES[seed % len(NAMES)]}.
The main finding: late rent is most common in {best[0]} ({best[2]}% of households).
Source line to use: Rent Burden Study 2025, City Housing Research Group (made-up data for a test).
""")
    return {"rows": rows, "total": total, "best": best[0]}


def u2_check(work, truth, session, C):
    extra = ["every_number_kept", "has_a_chart", "finding_first", "source_named"]
    if not start(C, work, "index.html", extra):
        return
    phone, lap = design_checks(C, work, "index.html")
    text = phone.get("text") or ""
    want = [x for r in truth["rows"] for x in (r[0], str(r[1]), str(r[2]))]
    lost = has_all(text, want)
    C.add("every_number_kept", not lost, "missed_items", f"lost {lost[:5]}")
    C.add("has_a_chart", (lap.get("charts") or 0) >= 1, "missed_items", f"{lap.get('charts')} charts")
    first = " ".join(x.get("text", "") for x in ((lap.get("audit") or {}).get("taste") or {}).get("first_screen", [])[:4])
    C.add("finding_first", truth["best"].lower() in first.lower() or str(max(r[2] for r in truth["rows"])) in first, "weak_hierarchy", first[:200])
    C.add("source_named", "rent burden study 2025" in text.lower() and "research group" in text.lower(), "missed_items")


# ------------------------------------------------------------------ u3: a dashboard

def u3_generate(work, seed, rng):
    rows = []
    for m in MONTHS:
        donors = rng.randint(40, 180)
        rows.append([m, donors, donors * rng.randint(28, 95), rng.randint(3, 40)])
    lines = "\n".join(f"{m} 2026,{d},{a},{n}" if m != "Dec" else f"Dec 2025,{d},{a},{n}" for m, d, a, n in rows)
    (Path(work) / "donations.csv").write_text("month,donors,amount_usd,new_members\n" + lines + "\n")
    return {"rows": rows, "last": rows[-1], "prev": rows[-2], "year_amount": sum(r[2] for r in rows)}


def u3_check(work, truth, session, C):
    extra = ["this_month_and_last", "the_year_shown", "data_date_said"]
    if not start(C, work, "index.html", extra):
        return
    phone, lap = design_checks(C, work, "index.html")
    text = phone.get("text") or ""
    lost = has_all(text, [str(truth["last"][2]), str(truth["prev"][2]), str(truth["last"][1])])
    C.add("this_month_and_last", not lost, "missed_items", f"lost {lost}")
    C.add("the_year_shown", (lap.get("charts") or 0) >= 1 or len(has_all(text, [str(r[2]) for r in truth["rows"]])) <= 2, "missed_items")
    C.add("data_date_said", re.search(r"nov\w*\.?\s+(\d{1,2},?\s+)?2026", text, re.I) is not None, "missed_items")


# ------------------------------------------------------------------ u4: a report site

FINDINGS = [("Evictions filed", "eviction filings rose {a}% between 2023 and 2025"), ("Repairs", "{b} of 10 tenants waited more than 30 days for a repair"),
            ("Heat", "{c} buildings had a heat complaint every winter month"), ("Code enforcement", "inspectors closed {d}% of complaints without a visit")]


def u4_generate(work, seed, rng):
    vals = {"a": rng.randint(12, 48), "b": rng.randint(3, 7), "c": rng.randint(14, 60), "d": rng.randint(20, 55)}
    sections = "\n\n".join(f"## {i + 1}. {h}\n\nIn the {rng.choice(['north', 'south', 'east', 'west'])} wards, {t.format(**vals)}. "
                           f"We counted this from the city's open records and our own door-knocking, and checked each case twice."
                           for i, (h, t) in enumerate(FINDINGS))
    (Path(work) / "report.md").write_text(f"""# Behind on Repairs: Housing Conditions in the City, 2023 to 2025

A report by the Tenant Research Collective, November 2026.

## Summary

Tenants in the city wait longer for repairs than they did two years ago, and the city closes more complaints without looking. This report brings together four findings and three recommendations for the council.

{sections}

## Recommendations

1. Require an inspection visit for every heat complaint.
2. Publish repair wait times by building each quarter.
3. Fund two more inspectors for the north wards.

## Sources

City open data, housing complaints 2023 to 2025; the Collective's door-knocking survey of 1,204 households (made-up data for a test).
""")
    return {"facts": [str(v) for v in vals.values()] + ["Behind on Repairs", "Recommendations", "Sources", "Tenant Research Collective"]}


def u4_check(work, truth, session, C):
    extra = ["facts_kept", "reading_column"]
    if not start(C, work, "index.html", extra):
        return
    phone, lap = design_checks(C, work, "index.html")
    lost = has_all(phone.get("text") or "", truth["facts"])
    C.add("facts_kept", not lost, "missed_items", f"lost {lost[:4]}")
    C.add("reading_column", ((lap.get("audit") or {}).get("long_lines") or 0) == 0, "design_slop", f"{(lap.get('audit') or {}).get('long_lines')} long lines")


# ------------------------------------------------------------------ u5: a sign-up flow

def u5_generate(work, seed, rng):
    org = rng.choice(["Eastside Food Bank", "Riverbend Mutual Aid", "Northside Literacy Project", "Harbor Cleanup Crew"])
    (Path(work) / "brief.md").write_text(f"""# Volunteer sign-up for {org}

New volunteers sign up on the web. Keep it short: a few small steps, not one long form.

We need: first and last name; email (required); phone (optional, for text reminders); which neighborhood they can help in
(one of: {', '.join(NEIGHBORHOODS)}); when they are free (weekday mornings, weekday evenings, weekends; any of them);
languages they speak besides English (optional); and a yes to our volunteer agreement (they must check it).

After the last step: a thank-you screen that says a coordinator will call or email within three days, and that the first
orientation is on the first Saturday of each month at 10 am at our hall.
""")
    return {"org": org, "neighborhoods": NEIGHBORHOODS}


def u5_check(work, truth, session, C):
    extra = ["every_field_asked", "fields_labeled", "email_field_is_email", "in_steps", "thank_you_screen"]
    if not start(C, work, "index.html", extra):
        return
    phone, lap = design_checks(C, work, "index.html")
    pages = sorted(Path(work).glob("*.html"))
    src = "\n".join(p.read_text(errors="replace") for p in pages)
    low = src.lower()
    missing = [n for n in truth["neighborhoods"] if n.lower() not in low]
    want = ["email", "phone", "weekend", "evening", "language", "agree"]
    C.add("every_field_asked", not missing and all(w in low for w in want), "missed_items", f"missing {missing} {[w for w in want if w not in low]}")
    unl = sum(((page(work, {"path": p.name, "width": 390, "audit": True}).get("audit") or {}).get("taste") or {}).get("unlabeled_inputs", 0) for p in pages[:6])
    C.add("fields_labeled", unl == 0, "not_accessible", f"{unl} fields without a label")
    C.add("email_field_is_email", re.search(r'type=["\']?email', low) is not None, "missed_items")
    steps = len(pages) >= 3 or len(re.findall(r"step\s*\d|\d\s*of\s*\d", low)) >= 2 or len(re.findall(r"<(section|fieldset)\b", low)) >= 3
    C.add("in_steps", steps, "missed_items")
    C.add("thank_you_screen", "thank" in low and ("three days" in low or "3 days" in low) and "saturday" in low, "missed_items")


# ------------------------------------------------------------------ u6: three phone screens

def u6_generate(work, seed, rng):
    tools = rng.sample(TOOLS, 8)
    lines = "\n".join(f"- {t}: {rng.choice(['available', 'available', 'out until ' + rng.choice(['Mar 14', 'Mar 18', 'Mar 21'])])}, deposit ${rng.choice([0, 10, 20, 40])}"
                      for t in tools)
    (Path(work) / "app.md").write_text(f"""# The Tool Library app

Our neighborhood tool library lends tools to members for up to a week. Members are on their phones.
The app lists the tools, shows a tool's page (what it is, whether it is in, the deposit, the pickup place),
and lets a member borrow one: pick the days, confirm, and see when and where to pick it up.
Pickup is at the library shed behind {rng.randint(10, 99)} Linden Place, Saturdays 9 am to noon.

Tools right now:
{lines}
""")
    return {"tools": tools}


def png_dims(p):
    head = Path(p).read_bytes()[:24]
    return (int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")) if head[:8] == b"\x89PNG\r\n\x1a\n" else (0, 0)


def u6_check(work, truth, session, C):
    C.exists(work, "prototype.html")
    names = ["page_loads", "no_sideways_scroll_on_a_phone", "text_contrast_passes", "no_tiny_text", "nothing_from_other_addresses", "no_decoration",
             "one_accent", "no_placeholder_text", "three_screen_pictures", "clickable", "tools_listed", "has_settings", "app_navigation"]
    p = Path(work) / "prototype.html"
    if not p.exists():
        C.skip(names, "stopped_early")
        return
    ph = page(work, {"path": "prototype.html", "width": 393, "audit": True})
    a = ph.get("audit") or {}
    t = a.get("taste") or {}
    C.add("page_loads", ph.get("ok") and not ph.get("errors"), "page_broken", str(ph.get("errors", ""))[:200])
    C.add("no_sideways_scroll_on_a_phone", ph.get("scroll", 1) <= 0, "page_broken", f"scroll {ph.get('scroll')}")
    C.add("text_contrast_passes", a.get("low_contrast_count", 1) == 0, "page_broken", str(a.get("low_contrast", ""))[:160])
    C.add("no_tiny_text", (a.get("smallest_text_px") or 0) >= 10, "page_broken", f"smallest {a.get('smallest_text_px')}")
    C.add("nothing_from_other_addresses", not ph.get("external"), "page_broken")
    deco = {k: t.get(k) for k in ("gradients", "glass", "emoji", "h1_accent") if t.get(k)}
    C.add("no_decoration", not deco, "design_slop", str(deco))
    C.add("one_accent", len(t.get("accent_hues") or []) <= 2, "design_slop", str(t.get("accent_hues")))
    C.add("no_placeholder_text", not t.get("placeholder"), "design_slop", str(t.get("placeholder")))
    pics = [q for q in Path(work).rglob("*.png") if ".ola" not in q.parts and "sheet" not in q.name]
    phoneish = [q for q in pics if (lambda d: d[0] and 1.7 <= d[1] / d[0] <= 2.4)(png_dims(q))]
    C.add("three_screen_pictures", len(phoneish) >= 3, "missed_items", f"{len(pics)} pictures, {len(phoneish)} phone-shaped")
    src = p.read_text(errors="replace")
    links = len(re.findall(r'data-go=|data-tab=|onclick=|href="#[a-z]', src, re.I))
    C.add("clickable", links >= 3, "missed_items", f"{links} links between screens")
    lost = has_all(ph.get("text") or src, truth["tools"])
    lost_src = has_all(src, truth["tools"])
    C.add("tools_listed", len(lost_src) <= 3, "missed_items", f"missing {lost_src}")
    C.add("has_settings", "settings" in src.lower(), "missed_items")
    C.add("app_navigation", bool(re.search(r"tab|back", src, re.I)), "missed_items")


# ------------------------------------------------------------------ u7: an app that feels unfinished

MEETINGS = ["Housing committee", "Rent strike planning", "Food bank shift leads", "Newsletter team", "Garden workday", "Board check-in"]


def u7_generate(work, seed, rng):
    items = rng.sample(MEETINGS, 4)
    dates = [f"Mar {d}" for d in sorted(rng.sample(range(2, 28), 4))]
    rows = "".join(f'<div onclick="show(\'detail\')" style="padding:6px;border-bottom:1px solid #eee">{m}<br><small style="color:#aaa">{d}</small></div>' for m, d in zip(items, dates))
    (Path(work) / "prototype.html").write_text(f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Notes</title>
<style>body{{font-family:Arial;margin:0}} .s{{display:none;padding:10px}} .s.on{{display:block}} h1{{font-size:20px}}</style></head><body>
<div class="s on" id="list"><h1>Meeting notes</h1>{rows}</div>
<div class="s" id="detail"><h1>{items[0]}</h1><p>Notes from {dates[0]}: we agreed to meet weekly until the vote.</p></div>
<script>function show(id){{document.querySelectorAll('.s').forEach(s=>s.classList.toggle('on', s.id===id))}}</script></body></html>""")
    return {"items": items, "dates": dates}


def u7_check(work, truth, session, C):
    C.exists(work, "prototype.html")
    names = ["page_loads", "no_sideways_scroll_on_a_phone", "text_contrast_passes", "no_tiny_text", "no_decoration", "no_placeholder_text",
             "content_kept", "has_settings", "settings_has_about_and_version", "way_back_from_detail", "app_navigation", "empty_state"]
    p = Path(work) / "prototype.html"
    if not p.exists():
        C.skip(names, "stopped_early")
        return
    ph = page(work, {"path": "prototype.html", "width": 393, "audit": True})
    a = ph.get("audit") or {}
    t = a.get("taste") or {}
    C.add("page_loads", ph.get("ok") and not ph.get("errors"), "page_broken", str(ph.get("errors", ""))[:200])
    C.add("no_sideways_scroll_on_a_phone", ph.get("scroll", 1) <= 0, "page_broken", f"scroll {ph.get('scroll')}")
    C.add("text_contrast_passes", a.get("low_contrast_count", 1) == 0, "page_broken", str(a.get("low_contrast", ""))[:160])
    C.add("no_tiny_text", (a.get("smallest_text_px") or 0) >= 10, "page_broken", f"smallest {a.get('smallest_text_px')}")
    deco = {k: t.get(k) for k in ("gradients", "glass", "emoji", "h1_accent") if t.get(k)}
    C.add("no_decoration", not deco, "design_slop", str(deco))
    C.add("no_placeholder_text", not t.get("placeholder"), "design_slop", str(t.get("placeholder")))
    src = p.read_text(errors="replace")
    low = src.lower()
    C.add("content_kept", not has_all(src, truth["items"] + truth["dates"]), "missed_items", str(has_all(src, truth["items"] + truth["dates"]))[:120])
    C.add("has_settings", "settings" in low, "missed_items")
    C.add("settings_has_about_and_version", "about" in low and re.search(r"version\s*\d", low) is not None, "missed_items")
    C.add("way_back_from_detail", re.search(r"data-back|history\.back|>\s*(&lt;|‹|<svg[^>]*>.*?)?\s*(back|meeting notes|notes)\s*<", src, re.I | re.S) is not None or "back" in low, "missed_items")
    C.add("app_navigation", re.search(r"tabbar|tab-bar|role=\"tablist\"|data-tab|<nav", low) is not None, "missed_items")
    C.add("empty_state", re.search(r"no (notes|meetings)|nothing here|empty", low) is not None, "missed_items")


# ------------------------------------------------------------------ u9 to u11: the Bold register (designer 5)
# The person asks for fun, colorful, bold, gorgeous. The checks hold the page to Bold's rules
# (skills/designer/references/bold.md): no sideways scroll, contrast, nothing from outside, no glows,
# glass, emoji or placeholder text, AND not timid: a color system of at least two hues, a first thing
# at least three times the reading size, a ground that is not plain white (or a drawn picture).

BOLD_COMMON = ["page_loads", "no_sideways_scroll_on_a_phone", "no_sideways_scroll_on_a_laptop", "text_contrast_passes", "no_tiny_text",
               "one_or_two_fonts", "nothing_from_other_addresses", "no_clipped_text", "type_on_a_scale", "no_empty_decoration", "a_color_system",
               "no_placeholder_text", "a_big_first_thing", "not_a_plain_white_page", "headings_and_alt_text", "focus_is_visible"]


def bold_checks(C, work, rel):
    phone = page(work, {"path": rel, "width": 390, "audit": True})
    lap = page(work, {"path": rel, "width": 1280, "audit": True})
    a, b = phone.get("audit") or {}, lap.get("audit") or {}
    ta, tb = a.get("taste") or {}, b.get("taste") or {}
    C.add("page_loads", phone.get("ok") and lap.get("ok") and not phone.get("errors"), "page_broken", (phone.get("error") or "") + str(phone.get("errors", ""))[:200])
    C.add("no_sideways_scroll_on_a_phone", phone.get("scroll", 1) <= 0 and a.get("past_right_edge_count", 1) == 0, "page_broken",
          f"scroll {phone.get('scroll')}, past edge {a.get('past_right_edge_count')} {str(a.get('past_right_edge', ''))[:120]}")
    C.add("no_sideways_scroll_on_a_laptop", lap.get("scroll", 1) <= 0, "page_broken", f"scroll {lap.get('scroll')}")
    C.add("text_contrast_passes", a.get("low_contrast_count", 1) == 0 and b.get("low_contrast_count", 1) == 0, "page_broken",
          f"{a.get('low_contrast_count')} at 390, {b.get('low_contrast_count')} at 1280: {str(a.get('low_contrast') or b.get('low_contrast') or '')[:160]}")
    C.add("no_tiny_text", (a.get("smallest_text_px") or 0) >= 12 and (b.get("smallest_text_px") or 0) >= 12, "page_broken", f"smallest {a.get('smallest_text_px')} px")
    C.add("one_or_two_fonts", 0 < len(fams(b)) <= 2, "design_slop", f"{list((b.get('font_families') or {}).keys())}")
    C.add("nothing_from_other_addresses", not phone.get("external") and not lap.get("external"), "page_broken", f"{phone.get('external')} outside requests")
    C.add("no_clipped_text", a.get("clipped_count", 1) == 0 and b.get("clipped_count", 1) == 0, "page_broken", str(a.get("clipped") or b.get("clipped") or "")[:160])
    small = [k for k in (b.get("text_sizes") or {}) if float(k) < 40]
    body = (tb.get("reading_px") or b.get("body_text_px") or 0)
    C.add("type_on_a_scale", len(small) <= 8 and 14 <= body <= 20, "design_slop", f"{len(small)} sizes under 40 px {sorted(small, key=float)}, reading {body} px")
    deco = {k: tb.get(k) for k in ("glows", "glass", "emoji") if tb.get(k)}
    C.add("no_empty_decoration", not deco, "design_slop", str(deco)[:200])
    hues = tb.get("accent_hues") or []
    C.add("a_color_system", 2 <= len(hues) <= 6, "weak_hierarchy" if len(hues) < 2 else "design_slop", str(hues))
    C.add("no_placeholder_text", not (ta.get("placeholder") or tb.get("placeholder")), "design_slop", str(ta.get("placeholder") or tb.get("placeholder")))
    C.add("a_big_first_thing", (tb.get("rivals") or 9) <= 2 and (tb.get("contrast_of_sizes") or 0) >= 3, "weak_hierarchy",
          f"rivals {tb.get('rivals')}, largest/reading {tb.get('contrast_of_sizes')}: {str(tb.get('first_screen'))[:160]}")
    C.add("not_a_plain_white_page", (tb.get("background") or "").lower() not in ("#ffffff", "#fff") or (tb.get("pictures") or 0) > 0, "weak_hierarchy", str(tb.get("background")))
    C.add("headings_and_alt_text", b.get("h1_count") == 1 and not tb.get("heading_skips") and not tb.get("images_without_alt") and not tb.get("unlabeled_pictures"),
          "not_accessible", f"h1 {b.get('h1_count')}, skips {tb.get('heading_skips')}, no alt {tb.get('images_without_alt')}, unlabeled pictures {tb.get('unlabeled_pictures')}")
    C.add("focus_is_visible", not tb.get("interactive") or (tb.get("focus_rules") or 0) > 0, "not_accessible", f"{tb.get('interactive')} interactive, {tb.get('focus_rules')} focus rules")
    return phone, lap


def bold_start(C, work, rel, extra):
    C.exists(work, rel)
    if not (Path(work) / rel).exists():
        C.skip(BOLD_COMMON + extra, "stopped_early")
        return False
    return True


TIME = re.compile(r"\b(\d{1,2})(?::(\d\d))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?![\d:])", re.I)


def times_in(text, need_ampm=True):
    """Clock times as (hour, minutes, am/pm or None); 'noon' and 'midnight' count. Bare numbers only with minutes (2:00)."""
    out = set()
    for h, m, ap in TIME.findall(text):
        if not ap and not m:
            continue
        if int(h) > 23 or (m and int(m) > 59):
            continue
        out.add((int(h) % 12 if ap else int(h), m or "00", (ap or "")[:1].lower() or None))
    low = text.lower()
    if "noon" in low:
        out.add((0, "00", "p"))
    if "midnight" in low:
        out.add((0, "00", "a"))
    return out


def invented_times(page_text, source_text):
    """Times on the page that are nowhere in the person's files (a made-up schedule)."""
    src = times_in(source_text)
    loose = {(h % 12, m) for h, m, _ in src}
    bad = []
    for h, m, ap in times_in(page_text):
        if ap is None:
            if (h % 12, m) not in loose:
                bad.append(f"{h}:{m}")
        elif (h, m, ap) not in src and not (ap and (h, m) in {(x, y) for x, y, z in src if z is None}):
            bad.append(f"{h or 12}:{m} {ap}m")
    return sorted(set(bad))


def bold_check(work, truth, session, C):
    extra = ["facts_kept", "date_on_the_first_screen", "no_invented_times"]
    if not bold_start(C, work, "index.html", extra):
        return
    phone, lap = bold_checks(C, work, "index.html")
    lost = has_all(phone.get("text") or "", truth["facts"])
    C.add("facts_kept", not lost, "missed_items", f"lost {lost[:4]}")
    first = " ".join(x.get("text", "") for x in ((lap.get("audit") or {}).get("taste") or {}).get("first_screen", []))
    day = truth["date"].split()[1]
    C.add("date_on_the_first_screen", re.search(rf"\b{day}\b", first) is not None and (truth["date"].split()[0][:3].lower() in first.lower() or truth["date"] in first),
          "weak_hierarchy", first[:200])
    # A layout with a schedule slot must not be filled with a made-up lineup (owner's live walk, 2026-11-17).
    source = " ".join(p.read_text(errors="replace") for p in Path(work).glob("*.md") if p.name in ("party.md", "strike.md", "dinner.md"))
    made_up = invented_times(phone.get("text") or "", source)
    C.add("no_invented_times", not made_up, "assumed_silently", f"times not in the files: {made_up[:6]}")


def party_generate(work, seed, rng):
    street = rng.choice(["Willow Lane", "Orchard Row", "Linden Place", "Mercer Court"])
    a, b = rng.sample(["2nd Street", "3rd Street", "Elm Street", "Park Avenue", "Bay Street"], 2)
    date = rng.choice(["June 14", "June 21", "July 12", "August 9"])
    bands = rng.sample(["The Porch Lights", "Banda del Barrio", "Second Line Kids", "DJ Lupe", "The Stoop Sisters"], 2)
    grills = rng.randint(6, 14)
    phone = f"(555) 01{rng.randint(10, 99)}-{rng.randint(1000, 9999)}"
    (Path(work) / "party.md").write_text(f"""# {street} Block Party

When: Saturday, {date}, noon to 8 pm
Where: {street}, between {a} and {b} (closed to cars all day)
Who: everyone on the block, their friends, their kids, their dogs

What's happening
- A potluck at 1 pm: {grills} grills going, bring a dish if you can
- Live music from 3 pm: {bands[0]}, then {bands[1]}
- Kids' games all afternoon: chalk drawing, a water balloon toss, face painting
- A table for the new tenants' association: come meet your neighbors

Bring: a chair, a dish to share, sunscreen.
Rain date: the next Saturday.
Questions: text Marta at {phone}.
""")
    return {"facts": [date, street, a, b, *bands, phone, str(grills)], "date": date}


def strike_generate(work, seed, rng):
    city = rng.choice(["Riverton", "Lakeview", "Millbrook", "Easton"])
    date = rng.choice(["September 25", "October 2", "March 20", "April 22"])
    day = rng.choice(["Friday", "Friday", "Wednesday"])
    schools = rng.randint(9, 23)
    demands = ["Solar panels on every public school roof by 2030", "Free bus passes for every student", "A youth seat on the city's climate commission"]
    rng.shuffle(demands)
    phone = f"(555) 01{rng.randint(10, 99)}-{rng.randint(1000, 9999)}"
    (Path(work) / "strike.md").write_text(f"""# {city} Youth Climate Strike

When: {day}, {date}. We walk out of class at 11 am.
Where: we meet on the steps of {city} City Hall at 11:30 am, then march down Main Street to the river park.
Who: high school students from {schools} schools so far. Middle schoolers welcome with an adult.

Our three demands to the city council
1. {demands[0]}
2. {demands[1]}
3. {demands[2]}

Bring: water, a sign (markers and cardboard at the steps), a friend.
Missing class: we have a letter for parents and teachers at the sign-up link.
Organizers: the {city} Student Climate Coalition. Text us at {phone}.
""")
    return {"facts": [date, f"{city} City Hall", "11 am", *[" ".join(d.split()[:3]) for d in demands], phone, str(schools)], "date": date}


def dinner_generate(work, seed, rng):
    garden = rng.choice(["Halsey Street Community Garden", "Riverbend Commons Garden", "Northside Growers' Garden"])
    date = rng.choice(["October 17", "September 19", "October 3"])
    goal = rng.choice([12000, 15000, 18000])
    raised = rng.randint(30, 70) * goal // 100
    price = rng.choice([35, 40, 45])
    dishes = rng.sample(["Roasted squash soup with sage", "Tomato and bean stew", "Garden greens with pickled onion", "Corn bread from the garden's own corn",
                         "Apple and pear crumble", "Collards with smoked chili"], 4)
    (Path(work) / "dinner.md").write_text(f"""# Harvest Dinner for the {garden}

A long-table dinner in the garden, cooked from what we grew this year.
When: Saturday, {date}, 6 pm to 9:30 pm
Where: in the garden, under the lights (indoors at the library hall if it rains)
Tickets: ${price}, or pay what you can. Kids under 12 eat free.

What the dinner pays for: a new tool shed and a rain-water tank, ${goal:,} in all. Raised so far: ${raised:,}.

The menu
- {dishes[0]}
- {dishes[1]}
- {dishes[2]}
- {dishes[3]}

Music by the garden's own string trio. Bring a warm layer.
""")
    return {"facts": [date, f"${price}", f"{goal:,}", f"{raised:,}", *dishes[:3]], "date": date}


BOLD_GOOD = """<style>
:root { --paper:#f7efdf; --ink:#16121c; --c1:#ff4b1f; --c2:#3d3bff; --c3:#ffc31f; }
* { box-sizing: border-box; } body { margin:0; background:var(--paper); color:var(--ink); font:400 18px/1.55 system-ui, sans-serif; }
.hero { background: var(--c1); padding: 32px 16px 48px; } .wrap { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
h1 { font-size: clamp(48px, 9vw, 96px); line-height: .92; margin: 0 0 16px; letter-spacing: -0.03em; }
.giant { font-size: clamp(110px, 30vw, 260px); line-height: .8; font-weight: 800; margin: 0; color: var(--ink); }
.band { background: var(--c2); color: var(--paper); padding: 32px 16px; } .band p { margin: 0; }
.stk { display:inline-block; background: var(--c3); padding: 16px 20px; border-radius: 24px; margin: 6px; transform: rotate(-2deg); }
h2 { font-size: 36px; line-height: 1; margin: 40px 0 16px; } p, li { max-width: 62ch; } a { color: var(--c2); } .band a { color: var(--paper); }
:focus-visible { outline: 3px solid var(--c2); outline-offset: 2px; }
</style>"""


def bold_shell(title, hero, body):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>{BOLD_GOOD}</head>'
            f'<body><header class="hero"><div class="wrap">{hero}</div></header><main class="wrap">{body}</main></body></html>')


def bold_solve(src):
    def solve(work, truth, wrong=False):
        md = (Path(work) / src).read_text()
        lines = [l.strip("- ") for l in md.splitlines() if l.strip() and not l.startswith("#")]
        title = md.splitlines()[0][2:]
        month, day = truth["date"].split()
        if wrong:  # timid: white, one blue, the title at reading size and no giant date
            html = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>'
                    f'<style>body{{font:17px/1.6 system-ui,sans-serif;margin:16px;background:#fff;color:#111}} h1{{font-size:20px}} a{{color:#0645ad}}</style></head><body>'
                    f'<h1>{title}</h1>' + "".join(f"<p>{l}</p>" for l in lines) + "</body></html>")
        else:
            hero = f'<h1>{title}</h1><p class="giant">{day}</p><p><b>{month} {day}</b></p>'
            body = '<div class="band"><p>' + lines[0] + '</p></div>' + "".join(f'<span class="stk">{l}</span>' if len(l) < 40 else f"<p>{l}</p>" for l in lines[1:])
            html = bold_shell(title, hero, body)
        (Path(work) / "index.html").write_text(html)
        return "Made index.html."
    return solve


def bold_slop(src):
    def solve(work, truth):
        md = (Path(work) / src).read_text()
        lines = [l for l in md.splitlines() if l.strip() and not l.startswith("#")]
        (Path(work) / "index.html").write_text(SLOP.replace("{body}", "".join(f"<div class=card><p>{l} 🎉</p></div>" for l in lines) + "<div class=card><p>Schedule: 2:00 Doors open, 3:30 The Elm Street Singers, 6:45 pm DJ Riverside</p></div>"))
        return "Made index.html."
    return solve


# ------------------------------------------------------------------ u12: Bart's own "gorgeous hello world" (OLA-168)
# The request word for word, with no file to work from: a gorgeous page with a rising sun and one line.

MORNING = "Good morning from Palo Alto!"


def morning_generate(work, seed, rng):
    return {"words": MORNING}


def morning_check(work, truth, session, C):
    extra = ["the_words_on_the_first_screen"]
    if not bold_start(C, work, "index.html", extra):
        return
    phone, lap = bold_checks(C, work, "index.html")
    first = " ".join(x.get("text", "") for x in ((lap.get("audit") or {}).get("taste") or {}).get("first_screen", []))
    flat = lambda s: re.sub(r"[^a-z]+", " ", s.lower()).strip()
    C.add("the_words_on_the_first_screen", flat(truth["words"]) in flat(first) or flat(truth["words"]) in flat(phone.get("text") or "")[:400],
          "missed_items", first[:200])


def morning_solve(work, truth, wrong=False):
    if wrong:
        html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hello</title>'
                '<style>body{font:17px/1.6 system-ui,sans-serif;margin:16px;background:#fff;color:#111}</style></head><body><p>Hello.</p></body></html>')
    else:
        sun = ('<svg viewBox="0 0 400 200" role="img" aria-label="The sun rising over the hills" style="width:100%;max-width:640px;height:auto">'
               '<circle cx="200" cy="200" r="90" fill="#ffc31f"/><rect x="0" y="170" width="400" height="30" fill="#3d3bff"/></svg>')
        html = bold_shell("Good morning", f'<h1>{truth["words"]}</h1>{sun}', '<div class="band"><p>The sun is up over the hills.</p></div>')
    (Path(work) / "index.html").write_text(html)
    return "Made index.html."


# ------------------------------------------------------------------ u13: Bart's own "personal homepage" (OLA-168)
# His request word for word (Nov 20), plus where the facts are: a workspace has no web, so the facts come
# in bart.md, written from his Wikipedia article and the present-day line of his own homepage.

BART_NAME = "Bart Decrem"
BART_MD = """# Bart Decrem

Silicon Valley entrepreneur. Born and raised in Belgium.

## Now
- This year: a fellow at CASBS (the Center for Advanced Study in the Behavioral Sciences at Stanford),
  working on AI and human flourishing.
- In his own words: "I like making tools that learn, toys that jam, and old things new again."
- Current projects: Dodo (dodo.foo), a learning app; Jambot (jambot.to), an AI
  groovebox; Macinclaude, new software for an old Macintosh Plus.
- Homepage: bartin16.xyz. Projects: decremental.com.

## Before
- At 13, started a weekly magazine for Belgium's leading underground radio station, where he was a DJ.
- Moved to the US to study law at Stanford University.
- Founded Plugged In, a non-profit in East Palo Alto that gave the community Internet access and
  classes: one of the first Digital Divide programs in the United States.
- 1999: co-founded Eazel, an open source Linux desktop start-up; its file manager Nautilus is still
  used on Linux. Coordinated the creation of the GNOME Foundation.
- After Eazel shut down in 2001: 18 months in Seoul, doing business development for local startups.
- 2003 to 2004: headed marketing and business affairs at the Mozilla Foundation: the Firefox brand,
  the Firefox 1.0 launch, Spread Firefox.
- After Mozilla: founded Flock, a social web browser; CEO until the summer of 2006.
- 2007: Entrepreneur in Residence at DCM.
- 2008: founder and CEO of Tapulous, one of the first iPhone startups, maker of Tap Tap Revenge.
  In April 2009 comScore called it the most popular App Store app of all time, installed on 32% of
  US iPhones.
- July 2010: Tapulous was acquired by The Walt Disney Company. Until 2013 he was SVP and General
  Manager of Disney Mobile Games (Where's My Water, Temple Run: Oz, Where's My Mickey).

## Recognition
- Fast Company, 2009: one of the fifty most creative people in business.
- Advertising Age, "Creativity 50", 2010.
"""
BART_FACTS = ["Belgium", "CASBS", "Plugged In", "Eazel", "Firefox", "Flock", "Tapulous", "Tap Tap Revenge", "Disney"]


def bart_generate(work, seed, rng):
    (Path(work) / "bart.md").write_text(BART_MD)
    return {"name": BART_NAME, "facts": BART_FACTS}


def bart_check(work, truth, session, C):
    extra = ["facts_kept", "the_name_on_the_first_screen"]
    if not bold_start(C, work, "index.html", extra):
        return
    phone, lap = bold_checks(C, work, "index.html")
    lost = has_all(phone.get("text") or "", truth["facts"])
    C.add("facts_kept", not lost, "missed_items", f"lost {lost[:4]}")
    first = " ".join(x.get("text", "") for x in ((lap.get("audit") or {}).get("taste") or {}).get("first_screen", []))
    flat = lambda s: re.sub(r"[^a-z]+", " ", s.lower()).strip()
    C.add("the_name_on_the_first_screen", "bart" in flat(first) or "bart" in flat(phone.get("text") or "")[:300], "weak_hierarchy", first[:200])


def bart_solve(work, truth, wrong=False):
    if wrong:
        html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hello</title>'
                '<style>body{font:17px/1.6 system-ui,sans-serif;margin:16px;background:#fff;color:#111}</style></head><body><p>Hello.</p></body></html>')
    else:
        items = "".join(f"<li>{f}</li>" for f in truth["facts"])
        html = bold_shell(BART_NAME, f'<h1>{BART_NAME}</h1><p>Tools that learn, toys that jam, old things new again.</p>', f'<div class="band"><ul>{items}</ul></div>')
    (Path(work) / "index.html").write_text(html)
    return "Made index.html."


# ------------------------------------------------------------------ reference solutions and wrong outputs

GOOD = """<style>
:root { --paper:#fbf9f6; --surface:#f2eee8; --rule:#dcd5cb; --ink:#211b14; --ink-2:#51493f; --ink-3:#6b645b; --accent:#1d5a8c; }
* { box-sizing: border-box; } body { margin:0; background:var(--paper); color:var(--ink); font:400 17px/1.6 system-ui, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; } h1 { font-size: clamp(30px, 4vw + 12px, 44px); line-height:1.1; margin:0 0 12px; }
h2 { font-size: 21px; margin: 48px 0 12px; } p, li { max-width: 66ch; } .note { font-size: 13px; color: var(--ink-3); }
.big { font-size: 56px; font-weight: 700; line-height: 1; } .wrap { overflow-x:auto; } table { border-collapse: collapse; width: 100%; font-size: 15px; }
th, td { text-align:left; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--rule); } td.r { text-align: right; } a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; } svg { max-width:100%; height:auto; }
label { display:block; font-weight:600; margin-top:16px; } input, select { font: 16px system-ui, sans-serif; min-height:44px; width:100%; max-width:420px; }
button { font: 600 15px system-ui, sans-serif; min-height:44px; padding: 0 20px; background: var(--accent); color:#fff; border:0; margin-top:24px; }
</style>"""


def shell(title, body):
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>{GOOD}</head><body><main>{body}</main></body></html>'


SLOP = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>x</title><style>
body{font-family:Georgia;background:#fdf6ec;margin:0} .hero{background:linear-gradient(135deg,#14b8a6,#ec4899);padding:48px}
h1{font-size:72px;color:#fff} h1 em{color:#fde047} .card{border-radius:24px;box-shadow:0 0 40px #ec489966;padding:24px;margin:16px;background:#fff}
</style></head><body><div class="hero"><h1>Together we <em>rise</em> ✨</h1></div>{body}</body></html>"""


def bars(rows, key, label):
    mx = max(r[key] for r in rows) or 1
    out = []
    for i, r in enumerate(rows):
        w = round(r[key] / mx * 300)  # bar length = value / max * 300
        out.append(f'<text x="0" y="{i * 30 + 18}" font-size="13" fill="#51493f">{r[0]}</text><rect x="110" y="{i * 30 + 4}" width="{w}" height="18" fill="#1d5a8c"/>'
                   f'<text x="{116 + w}" y="{i * 30 + 18}" font-size="13" fill="#211b14">{r[key]}</text>')
    return f'<svg viewBox="0 0 480 {len(rows) * 30}" role="img" aria-label="{label}">{"".join(out)}</svg>'


def u1_solve(work, truth, wrong=False):
    t = (Path(work) / "event.md").read_text()
    lines = [l for l in t.splitlines() if l.strip() and not l.startswith("#")]
    if wrong:
        (Path(work) / "index.html").write_text(SLOP.replace("{body}", "<div class=card><p>Lorem ipsum dolor sit amet.</p></div>" + "".join(f"<div class=card><p>{l}</p></div>" for l in lines)))
        return "Made index.html."
    when = truth["date"]
    body = f'<p class="note">Building meeting</p><h1>Come to the building meeting</h1><p class="big">{when}</p>' + "".join(f"<p>{l}</p>" for l in lines)
    (Path(work) / "index.html").write_text(shell("Building meeting", body))
    return "Made index.html."


def u2_solve(work, truth, wrong=False):
    rows = truth["rows"]
    best = max(rows, key=lambda r: r[2])
    table = "".join(f"<tr><td>{r[0]}</td><td class=r>{r[1]}</td><td class=r>{r[2]}%</td><td class=r>{r[3]:+d}</td></tr>" for r in rows)
    body = (f'<h1>Late rent is most common in {best[0]}: {best[2]}% of households</h1><p>We asked {truth["total"]:,} households in six neighborhoods.</p>'
            f'<h2>Share paying rent late, by neighborhood</h2>{bars(rows, 2, "Share paying rent late by neighborhood")}'
            f'<h2>All results</h2><div class=wrap><table><tr><th>Neighborhood</th><th>Households</th><th>Late rent</th><th>Change</th></tr>{table}</table></div>'
            f'<p class=note>Source: Rent Burden Study 2025, City Housing Research Group (made-up data for a test).</p>')
    if wrong:
        body = body.replace("<h1>", '<h1 style="font-size:17px">')  # the finding no bigger than the text: no first thing
    (Path(work) / "index.html").write_text(shell("Rent Burden Study 2025", body))
    return "Made index.html."


def u3_solve(work, truth, wrong=False):
    rows, last, prev = truth["rows"], truth["last"], truth["prev"]
    body = (f'<h1>Donations, November 2026</h1><p class=big>${last[2]:,}</p><p>from {last[1]} donors, against ${prev[2]:,} in October.</p>'
            f'<h2>The year, month by month</h2>{bars([[r[0], r[2]] for r in rows], 1, "Donations per month")}<p class=note>Data to November 30, 2026. Source: donations.csv.</p>')
    if wrong:
        body = body.replace("<h1>", '<h1 style="background:linear-gradient(90deg,#f0f,#0ff)">')
    (Path(work) / "index.html").write_text(shell("Donations", body))
    return "Made index.html."


def u4_solve(work, truth, wrong=False):
    md = (Path(work) / "report.md").read_text()
    html, first = [], True
    for l in md.splitlines():
        if l.startswith("# "):
            html.append(f"<h1>{l[2:]}</h1>")
        elif l.startswith("## "):
            html.append(f"<h2>{l[3:]}</h2>")
        elif l.strip():
            html.append(f"<p>{l}</p>")
    page_ = shell("Report", "".join(html))
    if wrong:
        page_ = page_.replace("max-width: 66ch", "max-width: none")
    (Path(work) / "index.html").write_text(page_)
    return "Made index.html."


def u5_solve(work, truth, wrong=False):
    opts = "".join(f"<option>{n}</option>" for n in truth["neighborhoods"])
    lab = (lambda f, t: f'<label for="{f}">{t}</label>') if not wrong else (lambda f, t: "")
    (Path(work) / "index.html").write_text(shell("Sign up", f'<p class=note>Step 1 of 3</p><h1>Volunteer with {truth["org"]}</h1><form action="step-2.html">'
        f'{lab("first", "First name")}<input id="first" name="first">{lab("last", "Last name")}<input id="last">{lab("email", "Email")}<input id="email" type="email">'
        f'{lab("phone", "Phone, for text reminders (optional)")}<input id="phone" type="tel"><button>Continue</button></form>'))
    (Path(work) / "step-2.html").write_text(shell("Sign up", f'<p class=note>Step 2 of 3</p><h1>Where and when</h1><form action="step-3.html">'
        f'{lab("hood", "Neighborhood")}<select id="hood">{opts}</select><fieldset><legend>When you are free</legend>'
        '<label><input type=checkbox> Weekday mornings</label><label><input type=checkbox> Weekday evenings</label><label><input type=checkbox> Weekends</label></fieldset>'
        f'{lab("lang", "Languages besides English (optional)")}<input id="lang"><label><input type=checkbox required> I agree to the volunteer agreement</label><button>Continue</button></form>'))
    (Path(work) / "step-3.html").write_text(shell("Thank you", '<p class=note>Step 3 of 3</p><h1>Thank you</h1><p>A coordinator will call or email you within three days. '
        'Orientation is on the first Saturday of each month at 10 am at our hall.</p>'))
    return "Made index.html, step-2.html, step-3.html."


def u6_solve(work, truth, wrong=False):
    import shutil, subprocess, sys
    skill = HERE.parent.parent / "skills" / "app-designer" / "assets"
    for f in ("app.css", "prototype.js"):
        shutil.copy(skill / f, Path(work) / f)
    rows = "".join(f'<li><a class="row" href="#" data-go="tool"><span class="text">{t}<span class="sub">Available</span></span></a></li>' for t in truth["tools"])
    screens = (f'<section class="screen" id="tools" data-tab-of="tools"><h1 class="large">Tools</h1><ul class="list">{rows}</ul></section>'
               f'<section class="screen" id="tool" data-tab-of="tools"><div class="bar"><a href="#" class="back" data-back>Tools</a><h2 class="title">{truth["tools"][0]}</h2><span></span></div>'
               f'<div class="body"><p>In the shed. Deposit $20.</p></div><a class="filled" href="#" data-go="borrow">Borrow</a></section>'
               '<section class="screen" id="borrow" data-tab-of="tools"><div class="bar"><a href="#" data-back>Cancel</a><h2 class="title">Borrow</h2><span></span></div>'
               '<div class="body"><p>Pick up Saturday, 9 am to noon, at the library shed.</p></div></section>'
               '<section class="screen grouped" id="settings" data-tab-of="settings"><h1 class="large">Settings</h1><ul class="list"><li class="row">About<span class="value">Version 1.0 (1)</span></li></ul></section>')
    tab = '<nav class="tabbar"><button data-tab="tools">Tools</button><button data-tab="settings">Settings</button></nav>'
    (Path(work) / "prototype.html").write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tool Library</title>'
                                               f'<link rel="stylesheet" href="app.css"></head><body><div class="device">{screens}{tab}</div><script src="prototype.js"></script></body></html>')
    out = Path(work) / "screens"
    out.mkdir(exist_ok=True)
    n = 2 if wrong else 3  # the wrong one saves only two pictures
    for i in range(n):  # a valid phone-shaped PNG (393 x 852), no renderer needed
        (out / f"screen-{i + 1}.png").write_bytes(_png(393, 852))
    return "Made prototype.html and screens/."


def u7_solve(work, truth, wrong=False):
    import shutil
    skill = HERE.parent.parent / "skills" / "app-designer" / "assets"
    for f in ("app.css", "prototype.js"):
        shutil.copy(skill / f, Path(work) / f)
    rows = "".join(f'<li><a class="row" href="#" data-go="detail"><span class="text">{m}<span class="sub">{d}</span></span></a></li>' for m, d in zip(truth["items"], truth["dates"]))
    settings = ('<section class="screen grouped" id="settings" data-tab-of="settings"><h1 class="large">Settings</h1><ul class="list">'
                '<li class="row">Notifications</li><li class="row">About<span class="value">Version 1.0 (3)</span></li></ul></section>') if not wrong else ""
    (Path(work) / "prototype.html").write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Notes</title>'
        '<link rel="stylesheet" href="app.css"></head><body><div class="device">'
        f'<section class="screen" id="list" data-tab-of="list"><h1 class="large">Meeting notes</h1><ul class="list">{rows}</ul></section>'
        f'<section class="screen" id="detail" data-tab-of="list"><div class="bar"><a href="#" class="back" data-back>Notes</a><h2 class="title">{truth["items"][0]}</h2><span></span></div>'
        f'<div class="body"><p>Notes from {truth["dates"][0]}: we agreed to meet weekly until the vote.</p></div></section>'
        '<section class="screen" id="archive" data-tab-of="archive"><h1 class="large">Archive</h1><div class="empty"><b>No notes archived</b>Archived notes appear here.</div></section>'
        f'{settings}<nav class="tabbar"><button data-tab="list">Notes</button><button data-tab="archive">Archive</button>'
        + ('<button data-tab="settings">Settings</button>' if not wrong else "") + '</nav></div><script src="prototype.js"></script></body></html>')
    return "Updated prototype.html."


# ------------------------------------------------------------------ u8: three design concepts (OLA-130)
# The owner asked for "3 design concepts" for a personal homepage and got one page laid out the same way
# in three palettes. Three real pages, each with the facts, on three different layouts.

FIELDS = [("syntax and semantics", ["Syntax I", "Semantics", "Research Methods"]), ("urban ecology", ["Field Ecology", "Cities and Water", "Statistics for Ecologists"]),
          ("labor history", ["The Working Day", "Unions and the State", "Reading the Archive"]), ("public health", ["Epidemiology I", "Health Policy", "Clinics and Communities"])]


def u8_generate(work, seed, rng):
    name = NAMES[(seed + 3) % len(NAMES)]
    field, courses = rng.choice(FIELDS)
    year = rng.randint(2004, 2016)
    email = name.split()[0].lower() + "@example.org"
    topics = rng.sample(["fieldwork with community groups", "a ten-year panel study", "open data for local councils", "a book in progress",
                         "teaching with primary sources", "a public lecture series"], 3)
    (Path(work) / "person.md").write_text(f"""# {name}

Associate Professor of {field.title()}, Riverbend University.
PhD {year}. Joined Riverbend in {year + 3}.
Research: {field}; current work on {topics[0]}, {topics[1]} and {topics[2]}.
Teaches: {', '.join(courses)}.
Email: {email}. Office hours on Tuesdays.
""")
    return {"name": name, "facts": [name, courses[0], email]}


def u8_pages(work):
    return sorted(str(p.relative_to(work)) for p in Path(work).rglob("*.htm*") if not any(s.startswith(".") for s in p.relative_to(work).parts))


def u8_check(work, truth, session, C):
    import importlib.util
    pages = u8_pages(work)
    C.add("three_pages", len(pages) >= 3, "missed_items", f"pages: {pages[:6]}")
    if len(pages) < 3:
        C.skip(["each_page_has_the_facts", "three_different_layouts"], "stopped_early")
        return
    shots, lost = [], {}
    for i, rel in enumerate(pages[:4]):
        shot = str(Path(work) / f".u8-{i}.png")
        r = page(work, {"path": rel, "width": 1280, "shot": shot})
        missing = has_all(r.get("text") or "", truth["facts"])
        if not r.get("ok") or missing:
            lost[rel] = missing or "did not load"
        if Path(shot).exists():
            shots.append((rel, shot))
    C.add("each_page_has_the_facts", not lost, "missed_items", str(lost)[:200])
    spec = importlib.util.spec_from_file_location("sheet", HERE.parent.parent / "skills/designer/scripts/sheet.py")
    sheet = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sheet)
    same = sheet.same_layouts(shots) if len(shots) >= 3 else [("?", "?", "no pictures")]
    C.add("three_different_layouts", not same, "design_slop", str(same)[:200])


def u8_solve(work, truth, wrong=False):
    facts = f"<h1>{truth['name']}</h1><p>Associate Professor. Teaches {truth['facts'][1]}.</p><h2>Research</h2><p>Fieldwork, a panel study and open data, over many years.</p><h2>Contact</h2><p>{truth['facts'][2]}</p>"
    looks = ["body{margin:0;background:#fdf9f4;color:#261e12;font:17px/1.6 serif} main{max-width:720px;margin:64px auto;padding:0 24px} h1{font-size:44px}",
             "body{margin:0;background:#16121c;color:#f7efdf;font:15px/1.5 sans-serif} h1{font-size:150px;line-height:.9;margin:0;padding:48px;background:#ff4b1f;color:#16121c} main>p,h2{margin:0 48px 8px auto;width:360px}",
             "body{margin:0;background:#eef2f7;color:#0f1d2b;font:16px/1.6 sans-serif} main{display:grid;grid-template-columns:420px 1fr;min-height:100vh} h1{grid-column:1;grid-row:1/9;margin:0;padding:64px 40px;font-size:40px;background:#0c60a3;color:#fff} main>*:not(h1){grid-column:2;padding:0 64px;margin:12px 0}"]
    if wrong:
        looks = [looks[0], looks[0].replace("#fdf9f4", "#f7f1ea").replace("serif", "sans-serif"), looks[0].replace("#261e12", "#0c2a4a")]
    (Path(work) / "design").mkdir(exist_ok=True)
    for i, css in enumerate(looks):
        (Path(work) / "design" / f"concept-{'abc'[i]}.html").write_text(f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Concept {'ABC'[i]}</title><style>{css}</style><main>{facts}</main>")
    return "Three concepts: design/concept-a.html, design/concept-b.html, design/concept-c.html."


def _png(w, h):
    import struct, zlib
    raw = b"".join(b"\x00" + b"\xff\xff\xff" * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def W(f):
    return lambda work, truth: f(work, truth, wrong=True)


INSTR = {
    "u1-tenants-event": "event.md has the details of our tenants' building meeting. Make a one-page website for it as index.html. Most people will open it on "
                        "their phones from a text message. It should look good and professional, not like a template.",
    "u2-results-page": "Make a results page for our research project as index.html, from project.md and results.csv: the main finding, a chart and a table "
                       "of the results by neighborhood. It will go on our website.",
    "u3-dashboard": "Build a dashboard for our board as index.html from donations.csv: how this month compares with last month, and how the year went.",
    "u4-report-site": "Turn report.md into a one-page website (index.html) for the report, something we can send to city council members.",
    "u5-signup-flow": "Design and build the volunteer sign-up described in brief.md as web pages, starting at index.html: a few short steps, then a thank-you screen.",
    "u6-phone-screens": "Design three screens of a phone app for our tool library, from app.md: the list of tools, a tool's page, and borrowing a tool. "
                        "Make it a clickable prototype I can open on my laptop (prototype.html), and save a picture of each screen.",
    "u7-app-unfinished": "prototype.html is the phone app for our meeting notes. People who tried it say it feels unfinished, like a web page, not a real app. "
                         "Fix the design so it feels like a normal, finished iPhone app. Keep our notes in it.",
    "u8-three-concepts": "person.md has what we found about this professor. Now make a nice new personal homepage for her and give me 3 design concepts.",
    "u9-block-party": "Make a fun, colorful page for our neighborhood block party, from party.md, as index.html. Most people will open it on their phones.",
    "u10-youth-strike": "Make a bold, modern page for our youth climate strike, from strike.md, as index.html. It's for high school students, "
                       "and most of them will open it on their phones from Instagram.",
    "u11-garden-fundraiser": "Make a gorgeous page for our community garden's harvest dinner fundraiser, from dinner.md, as index.html. "
                             "We want people to buy tickets.",
    "u12-good-morning": "make me a gorgeous page with a rising sun on it and it says 'Good morning from Palo Alto!'",
    "u13-bart-home": "make a gorgeous modern personal bio/homepage for Bart Decrem. Everything about him is in bart.md.",
}

TASKS = {
    "u1-tenants-event": dict(skill="designer", level="medium", outputs=["index.html"], generate=u1_generate, check=u1_check, solve=lambda w, t: u1_solve(w, t), wrong=W(u1_solve)),
    "u2-results-page": dict(skill="designer", level="medium", outputs=["index.html"], generate=u2_generate, check=u2_check, solve=lambda w, t: u2_solve(w, t), wrong=W(u2_solve)),
    "u3-dashboard": dict(skill="designer", level="medium", outputs=["index.html"], generate=u3_generate, check=u3_check, solve=lambda w, t: u3_solve(w, t), wrong=W(u3_solve)),
    "u4-report-site": dict(skill="designer", level="medium", outputs=["index.html"], generate=u4_generate, check=u4_check, solve=lambda w, t: u4_solve(w, t), wrong=W(u4_solve)),
    "u5-signup-flow": dict(skill="designer", level="hard", outputs=["index.html"], generate=u5_generate, check=u5_check, solve=lambda w, t: u5_solve(w, t), wrong=W(u5_solve)),
    "u6-phone-screens": dict(skill="app-designer", level="hard", outputs=["prototype.html"], generate=u6_generate, check=u6_check, solve=lambda w, t: u6_solve(w, t), wrong=W(u6_solve)),
    "u7-app-unfinished": dict(skill="app-designer", level="medium", outputs=["prototype.html"], generate=u7_generate, check=u7_check, solve=lambda w, t: u7_solve(w, t), wrong=W(u7_solve)),
    "u8-three-concepts": dict(skill="designer", level="medium", outputs=[], generate=u8_generate, check=u8_check, solve=lambda w, t: u8_solve(w, t), wrong=W(u8_solve)),
}
for tid, src, gen in (("u9-block-party", "party.md", party_generate), ("u10-youth-strike", "strike.md", strike_generate), ("u11-garden-fundraiser", "dinner.md", dinner_generate)):
    TASKS[tid] = dict(skill="designer", register="bold", level="medium", outputs=["index.html"], generate=gen, check=bold_check,
                      solve=(lambda s: lambda w, t: bold_solve(s)(w, t))(src), wrong=(lambda s: lambda w, t: bold_solve(s)(w, t, wrong=True))(src))
TASKS["u12-good-morning"] = dict(skill="designer", register="bold", level="easy", outputs=["index.html"], generate=morning_generate, check=morning_check,
                                 solve=lambda w, t: morning_solve(w, t), wrong=W(morning_solve))
TASKS["u13-bart-home"] = dict(skill="designer", register="bold", level="medium", outputs=["index.html"], generate=bart_generate, check=bart_check,
                              solve=lambda w, t: bart_solve(w, t), wrong=W(bart_solve))
for k, v in TASKS.items():
    v["family"] = "skills"
    v["instruction"] = INSTR[k]
    v["wrong2"] = bold_slop({"u9-block-party": "party.md", "u10-youth-strike": "strike.md", "u11-garden-fundraiser": "dinner.md"}[k]) if v.get("register") == "bold" and k not in ("u12-good-morning", "u13-bart-home") \
        else (lambda w, t: "I could not do it.")
