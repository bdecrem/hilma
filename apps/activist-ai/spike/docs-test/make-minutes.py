#!/usr/bin/env python3
"""make-minutes.py <out dir> [seed]: 40 sets of made-up city council minutes with planted housing votes.

Writes <out dir>/minutes/YYYY-MM-DD.txt and <out dir>/key.json (the answer key: every housing vote, who
voted how, the totals). Everything is invented: the city, the people, the projects. The same seed
writes the same files. The key never goes to the model; score.py reads it afterwards.
"""
import datetime, json, os, random, sys

out = sys.argv[1]
R = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 7)

COUNCIL = [  # (name, how often they vote yes on housing)
    ("Adaeze Okonkwo", .92), ("Bram Tollefsen", .18), ("Cora Whitlatch", .72), ("Dmitri Vasquez-Hale", .55),
    ("Esperanza Quill", .82), ("Farid Namdar", .45), ("Greta Lindqvist", .64)]
LAST = [n.split()[-1] for n, _ in COUNCIL]
LEAN = dict(zip(LAST, [p for _, p in COUNCIL]))
MAYOR = "Quill"

STREETS = ["Alder Street", "Juniper Avenue", "Mill Race Road", "Cannery Row East", "Tannery Lane", "Ostrander Boulevard", "Fifth Street", "Quarry Road"]
ORGS = ["Harbor Light Services", "the Marrow Creek Community Land Trust", "Open Door Collaborative", "St. Brendan's Outreach"]
MOTELS = ["Starlite", "Creekside", "Blue Heron", "Traveler's Rest"]

def housing_items():
    a = lambda: f"{R.randrange(100, 2900)} {R.choice(STREETS)}"
    money = lambda lo, hi: f"${R.randrange(lo, hi) * 1000:,}"
    return [
        lambda: (f"Rezoning of {a()} from general commercial to multifamily residential ({R.randrange(24, 180)} apartments)",
                 "Planning staff presented the application and the Planning Commission's recommendation. Neighbors spoke about parking and building height; the applicant's architect answered questions about the setback along the rear lot line."),
        lambda: (f"Tenant relocation assistance ordinance, {R.choice(['first', 'second'])} reading",
                 "The City Attorney summarized the ordinance, which requires owners to pay relocation assistance when tenants are displaced by demolition or substantial renovation. Two property owners and five tenants addressed the Council."),
        lambda: ("Fee waiver for accessory dwelling units under 750 square feet",
                 "Staff estimated the waiver would cost the General Fund about " + money(40, 160) + " a year in permit revenue and could add twenty to thirty small homes annually."),
        lambda: (f"Contract with {R.choice(ORGS)} to operate the winter shelter at the old armory",
                 "The contract covers November through March, sixty beds, with a not-to-exceed amount of " + money(180, 420) + ". The Police Chief reported on calls for service near last year's site."),
        lambda: (f"Affordable Housing Trust Fund: allocation of {money(300, 1500)} to the {R.choice(STREETS).split()[0]} Commons project",
                 "The project would provide homes for households earning up to sixty percent of area median income. The Finance Director confirmed the fund balance after the allocation."),
        lambda: (f"Just-cause eviction protections for rental buildings older than {R.choice([10, 15, 20])} years",
                 "Councilmembers discussed exemptions for owner-occupied duplexes. The item drew forty-one written comments, summarized by the City Clerk."),
        lambda: (f"Rent stabilization study: consultant contract not to exceed {money(60, 140)}",
                 "The study would examine rent increases since 2019 and options used by comparable cities. Staff recommended the lowest responsive proposal."),
        lambda: (f"Inclusionary housing requirement raised from {R.choice([10, 12])} to {R.choice([15, 18, 20])} percent for projects of ten or more homes",
                 "A feasibility memo from the City's economic consultant was entered into the record. Builders' representatives asked for a phase-in period."),
        lambda: (f"Conversion of the {R.choice(MOTELS)} Motel into {R.randrange(28, 64)} supportive housing units",
                 "The Housing Manager described the state grant, the on-site services and the operator's experience. Residents of the adjoining block spoke on both sides."),
        lambda: ("Housing Element annual progress report: adoption and transmittal to the state",
                 "Staff reported the number of homes permitted in each income category against the City's eight-year allocation."),
        lambda: (f"Cap on short-term rentals of whole homes in residential zones at {R.choice([120, 150, 200])} permits",
                 "Staff reported that an estimated three hundred homes are currently rented by the night. Hosts and neighbors addressed the Council."),
        lambda: ("Density bonus for residential projects within a half mile of the transit center",
                 "The Planning Director walked through the map of affected parcels and the height limits that would continue to apply."),
        lambda: (f"Extension of the emergency rental assistance program through {R.choice(['June', 'December'])}, {money(150, 600)}",
                 "The program has kept 212 households housed since it began, according to the nonprofit administrator's report."),
        lambda: ("Rules for appointments to the Mobile Home Park Rent Review Board",
                 "Park residents asked that at least two of the five seats be reserved for residents of the parks."),
    ]

OTHER_ITEMS = [
    ("Award of the 2025 street repaving contract", "Public Works described the list of streets and the low bid."),
    ("Library hours: Sunday opening at the main branch", "The Library Director presented usage figures and staffing costs."),
    ("Replacement playground equipment at Heron Park", "The Parks Commission recommended the second of three designs."),
    ("Five-year contract for police body-worn cameras", "The Police Chief reviewed the retention policy for recordings."),
    ("Stormwater fee adjustment", "The fee has not changed since 2014; staff presented the rate study."),
    ("Ban on the sale of fireworks within city limits", "The Fire Marshal reported on last July's calls."),
    ("Budget amendment for replacement of the permit software", "The IT Manager explained the end of vendor support for the current system."),
    ("Parking meter rates in the downtown core", "Merchants asked that the first thirty minutes remain free."),
    ("Restrictions on gas-powered leaf blowers", "Landscapers asked for a two-year transition."),
    ("Protected bicycle lane on Alder Street", "The Transportation Commission's recommendation and the parking study were presented."),
    ("Water rate increase of four percent", "The utility's reserve policy and capital plan were reviewed."),
    ("Cap on cannabis retail permits", "Staff reported on the three existing permits and two pending applications."),
    ("Replacement of the senior center roof", "Three bids were received; staff recommended the lowest."),
    ("Sister-city agreement with Port Ellery", "The delegation's visit in the fall was described."),
    ("Street tree planting program", "The urban forester presented the canopy survey."),
]
NO_VOTE = [
    "PRESENTATION. Staff presented the quarterly housing dashboard: permits issued, homes completed and the rental vacancy rate. The report was received and filed. No action was taken.",
    "STUDY SESSION ON HOMELESSNESS STRATEGY. Councilmembers discussed outreach, shelter capacity and a possible safe-parking site, and gave staff informal direction to return with options. No motion was made.",
    "DISCUSSION: STATE HOUSING LEGISLATION. The City Attorney summarized three pending bills affecting local zoning for apartments. Councilmembers asked questions. No action was taken.",
]
COMMENTS = [
    "{n} residents spoke about rising rents and asked the Council to act. No action was taken.",
    "{n} speakers addressed the Council on potholes on Quarry Road and on the proposed apartment building near the transit center.",
    "{n} members of the public spoke, on library hours, on a tenant's eviction from a building on Fifth Street, and on speeding near the middle school.",
    "{n} speakers addressed items not on the agenda.",
    "No members of the public wished to speak.",
]

def names(xs):
    return ", ".join(xs) if xs else "None"

def roll(present, lean_of):
    """yes / no / abstain among the members present"""
    yes, no, ab = [], [], []
    for m in present:
        r = R.random()
        if r < .04: ab.append(m)
        elif R.random() < lean_of(m): yes.append(m)
        else: no.append(m)
    return yes, no, ab

def vote_text(mid, yes, no, ab, absent, present, style):
    passed = len(yes) > len(no)
    count = f"{len(yes)}-{len(no)}"
    mover, second = R.sample(present, 2)
    if style == 'A':
        return passed, (f"Motion {mid} by {mover}, seconded by {second}, to approve. Ayes: {names(yes)}. Noes: {names(no)}. "
                        f"Abstain: {names(ab)}. Absent: {names(absent)}. Motion {'carried' if passed else 'failed'} {count}.")
    if style == 'B':
        calls = "; ".join(f"{m} {'yes' if m in yes else 'no' if m in no else 'abstained'}" for m in present)
        return passed, (f"{mover} moved approval and {second} seconded. On a roll call the vote was: {calls}. "
                        f"The motion ({mid}) {'carried' if passed else 'failed'}, {count}.")
    return passed, f"On motion of {mover}, seconded by {second}, the item was approved unanimously by the members present (Motion {mid})."

key, seq = [], {}
makers = housing_items()
start = datetime.date(2025, 1, 14)
plan = [1] * 16 + [2] * 3 + [0] * 21           # housing items per meeting: 22 items over 40 meetings
R.shuffle(plan)
amend_at = set(R.sample([i for i, n in enumerate(plan) if n], 2))
os.makedirs(os.path.join(out, "minutes"), exist_ok=True)

for i in range(40):
    d = start + datetime.timedelta(days=14 * i)
    yy = d.strftime("%y")
    def mid():
        seq[yy] = seq.get(yy, 0) + 1
        return f"{yy}-{seq[yy]:03d}"
    absent = R.sample(LAST, R.choice([0, 0, 0, 1, 1, 2]))
    present = [m for m in LAST if m not in absent]
    L = [f"CITY OF MARROW CREEK", "CITY COUNCIL: REGULAR MEETING MINUTES",
         d.strftime("%A, %B ") + str(d.day) + d.strftime(", %Y") + ", 6:30 p.m., Council Chamber, 200 Mill Race Road", "",
         "1. CALL TO ORDER AND ROLL CALL",
         f"Mayor {MAYOR} called the meeting to order at 6:3{R.randrange(1, 9)} p.m. Present: Councilmembers {names(present)}. Absent: {names(absent)}.", "",
         "2. PUBLIC COMMENT", R.choice(COMMENTS).format(n=R.choice(["Three", "Four", "Six", "Nine", "Eleven"])), "",
         "3. CONSENT CALENDAR",
         f"Approval of the minutes of the previous meeting, the warrant register and {R.choice(['a proclamation for Arbor Week', 'the monthly treasurer report', 'a street closure for the harvest fair', 'acceptance of a state library grant'])}. "
         + vote_text(mid(), present, [], [], absent, present, 'C')[1], ""]
    items = [("H", R.choice(makers)()) for _ in range(plan[i])] + [("O", o) for o in R.sample(OTHER_ITEMS, R.choice([2, 3, 3, 4]))]
    if R.random() < .3: items.append(("N", None))
    R.shuffle(items)
    n = 4
    for kind, it in items:
        if kind == "N":
            L += [f"{n}. " + R.choice(NO_VOTE), ""]; n += 1; continue
        title, body = it
        L += [f"{n}. {title.upper()}", body]
        if kind == "H":
            if i in amend_at:
                amend_at.discard(i)
                a_id = mid()
                ay, an, aa = roll(present, lambda m: 1 - LEAN[m])       # an amendment to weaken it: the usual sides swap
                ap = len(ay) > len(an)
                amover = R.choice(an or ay or present)
                L += [f"{R.choice(ay or present)} moved to amend the item to delay its effective date by one year (Motion {a_id}), seconded by {amover if amover in ay else R.choice(present)}. "
                      f"Ayes: {names(ay)}. Noes: {names(an)}. Abstain: {names(aa)}. Absent: {names(absent)}. The amendment {'carried' if ap else 'failed'} {len(ay)}-{len(an)}.",
                      "The Council then took up the main motion" + (" as amended." if ap else ".")]
                key.append(dict(motion=a_id, date=str(d), title="Amendment: " + title, result="passed" if ap else "failed", yes=ay, no=an, abstain=aa, absent=absent))
            m_id = mid()
            style = R.choice(['A', 'A', 'B', 'B', 'C'])
            if style == 'C': y, no_, ab = list(present), [], []
            else: y, no_, ab = roll(present, lambda m: LEAN[m])
            passed, text = vote_text(m_id, y, no_, ab, absent, present, style)
            L += [text]
            key.append(dict(motion=m_id, date=str(d), title=title, result="passed" if passed else "failed", yes=y, no=no_, abstain=ab, absent=absent))
        else:
            y, no_, ab = roll(present, lambda m: .8)
            L += [vote_text(mid(), y, no_, ab, absent, present, R.choice(['A', 'B', 'C']))[1]]
        L += [""]; n += 1
    L += [f"{n}. COUNCIL REPORTS", "Councilmembers reported on regional board meetings and upcoming neighborhood events.", "",
          f"{n + 1}. ADJOURNMENT", f"The meeting was adjourned at {R.randrange(8, 11)}:{R.randrange(10, 59)} p.m.", "",
          "Respectfully submitted, Imelda Farrow, City Clerk"]
    open(os.path.join(out, "minutes", f"{d}.txt"), "w").write("\n".join(L) + "\n")

nos = {m: sum(m in v["no"] for v in key) for m in LAST}
top = sorted(nos.items(), key=lambda kv: -kv[1])
assert top[0][1] > top[1][1], "two members tie for most no votes: pick another seed"
totals = dict(votes=len(key), passed=sum(v["result"] == "passed" for v in key), failed=sum(v["result"] == "failed" for v in key), most_no=top[0][0])
json.dump(dict(votes=key, totals=totals, no_counts=nos), open(os.path.join(out, "key.json"), "w"), indent=1)
print(json.dumps(totals), "no votes:", nos)
