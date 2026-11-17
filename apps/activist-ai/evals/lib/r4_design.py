"""Round four: design tasks for the designer and app-designer skills, run with and without them.

    u1-tenants-event   designer: a one-page site for a tenants' meeting, from event.md
    u2-results-page    designer: a research project's results page with a table and a chart
    u3-dashboard       designer: a board dashboard from twelve months of donations
    u4-report-site     designer: a one-page report site for council members, from report.md
    u5-signup-flow     designer: a volunteer sign-up flow in a few steps, then a thank-you
    u6-phone-screens   app-designer: three screens of a tool library's phone app, clickable, with pictures
    u7-app-unfinished  app-designer: a two-screen notes prototype that "feels unfinished", made a normal app

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
}

TASKS = {
    "u1-tenants-event": dict(skill="designer", level="medium", outputs=["index.html"], generate=u1_generate, check=u1_check, solve=lambda w, t: u1_solve(w, t), wrong=W(u1_solve)),
    "u2-results-page": dict(skill="designer", level="medium", outputs=["index.html"], generate=u2_generate, check=u2_check, solve=lambda w, t: u2_solve(w, t), wrong=W(u2_solve)),
    "u3-dashboard": dict(skill="designer", level="medium", outputs=["index.html"], generate=u3_generate, check=u3_check, solve=lambda w, t: u3_solve(w, t), wrong=W(u3_solve)),
    "u4-report-site": dict(skill="designer", level="medium", outputs=["index.html"], generate=u4_generate, check=u4_check, solve=lambda w, t: u4_solve(w, t), wrong=W(u4_solve)),
    "u5-signup-flow": dict(skill="designer", level="hard", outputs=["index.html"], generate=u5_generate, check=u5_check, solve=lambda w, t: u5_solve(w, t), wrong=W(u5_solve)),
    "u6-phone-screens": dict(skill="app-designer", level="hard", outputs=["prototype.html"], generate=u6_generate, check=u6_check, solve=lambda w, t: u6_solve(w, t), wrong=W(u6_solve)),
    "u7-app-unfinished": dict(skill="app-designer", level="medium", outputs=["prototype.html"], generate=u7_generate, check=u7_check, solve=lambda w, t: u7_solve(w, t), wrong=W(u7_solve)),
}
for k, v in TASKS.items():
    v["family"] = "skills"
    v["instruction"] = INSTR[k]
    v["wrong2"] = (lambda w, t: "I could not do it.")
