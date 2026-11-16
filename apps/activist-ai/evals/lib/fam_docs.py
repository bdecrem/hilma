"""Short made-up field reports with planted, codable sentences, for the coding tasks. The
generator knows which sentence carries which code, so recall, precision and every quote are
checked without a judge. Negated look-alikes ("no warning reached ...") are planted as traps:
the scheme says to code only what happened."""
import re
from pathlib import Path
from evalkit import read_csv, verbatim, ws, write_csv

PLACES = ["Ostra", "Velin", "Marrowfield", "Tessaly", "Grunwick", "Paloma Bend", "Kittering", "Orlo", "Sandvik", "Bramwell", "Quellen", "Yarrow Flats"]
PROGRAMS = ["cistern program", "seed bank", "cash-transfer scheme", "mangrove project", "crop insurance pilot", "cooling-centre network"]
HAZ = ["flood", "drought", "cyclone", "heatwave"]
SCHEME = {
    "FUNDING_GAP": ("Funding shortfall", "The report says a program ran short of money or was underfunded.",
                    ["Staff said the {prog} ran out of money after {n} months.", "The district budget covered only {p} percent of what the {prog} needed."],
                    "Staff did not report any shortage of money for the {prog}."),
    "EARLY_WARNING": ("Early warning reached people", "A warning about the hazard reached people before it struck.",
                      ["Text alerts reached {n} households before the {haz}.", "Warnings were broadcast on local radio {n} hours ahead of the {haz}."],
                      "No warning reached {place} before the {haz}."),
    "LOCAL_KNOWLEDGE": ("Local or traditional knowledge used", "The program used local or traditional knowledge.",
                        ["Elders' readings of the {sign} were used to time the planting.", "The {prog} relied on fishers' own knowledge of the {sign}."],
                        "Local knowledge of the {sign} was not consulted."),
    "MALADAPTATION": ("Adaptation made things worse", "An adaptation measure made some people worse off.",
                      ["The new {struct} pushed floodwater into {place}.", "After the {struct} was built, herders in {place} lost access to the river."],
                      "The new {struct} caused no harm downstream in {place}."),
    "WOMEN_LEAD": ("Women led the work", "Women led or co-led the program or a part of it.",
                   ["A women's committee ran the {prog} in {place}.", "Half of the {prog} leaders in {place} were women."],
                   "No women held leadership roles in the {prog}."),
    "MIGRATION": ("People moved because of the hazard", "People moved, for a season or for good, because of the hazard.",
                  ["{n} families moved to {place} after the {haz}.", "Young men left {place} for seasonal work during the {haz}."],
                  "No families left {place} after the {haz}."),
}
FILLER = ["The report was compiled in {year} by a field team of {n2} people.", "Interviews took place in {n2} villages around {place}.",
          "The {haz} season lasted about {n2} weeks that year.", "Researchers used household surveys and group discussions.",
          "The {prog} began in {year} with support from a regional office.", "Most households in {place} farm maize and beans.",
          "The team visited {place} twice, in the dry and in the wet season.", "Rainfall records came from the gauge at {place}."]


def fill(t, rng):
    return t.format(prog=rng.choice(PROGRAMS), n=rng.randint(3, 400), p=rng.randint(15, 70), haz=rng.choice(HAZ), place=rng.choice(PLACES),
                    sign=rng.choice(["wind", "ant nests", "moon", "bird calls", "tides"]), struct=rng.choice(["embankment", "sea wall", "dam", "drainage canal"]),
                    year=rng.randint(2009, 2024), n2=rng.randint(2, 30))


def scheme_md(codes):
    return "# Coding scheme\n\nCode a document with a code only when the document says the thing happened (not when it says it did not).\nA document can have several codes, or none.\n\n" + \
        "".join(f"- **{c}** ({SCHEME[c][0]}): {SCHEME[c][1]}\n" for c in codes)


def generate(work, rng, n_docs, codes, traps, pages=False, wrap=False, ext_mix=False):
    docs_dir = Path(work) / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    (Path(work) / "scheme.md").write_text(scheme_md(codes))
    truth = {"pairs": {}, "docs": {}}
    for i in range(1, n_docs + 1):
        doc = f"D{i:02d}"
        chosen = rng.sample(codes, rng.choice([0, 1, 1, 2, 2, 3]))
        sents = [(fill(rng.choice(FILLER), rng), None) for _ in range(rng.randint(4, 8))]
        for c in chosen:
            sents.append((fill(rng.choice(SCHEME[c][2]), rng), c))
        if traps:
            for c in rng.sample([c for c in codes if c not in chosen] or codes, 1 if rng.random() < 0.6 else 0):
                if c not in chosen:
                    sents.append((fill(SCHEME[c][3], rng), None))
        rng.shuffle(sents)
        npages = rng.choice([2, 3]) if pages else 1
        cut = sorted(rng.sample(range(1, len(sents)), npages - 1)) if npages > 1 else []
        bounds = [0] + cut + [len(sents)]
        body, page_of = [], {}
        for pg in range(npages):
            chunk = sents[bounds[pg]:bounds[pg + 1]]
            text = " ".join(s for s, _ in chunk)
            if wrap:
                text = re.sub(r"(.{1,76})(?:\s|$)", r"\1\n", text).strip()
            body.append((f"=== Page {pg + 1} ===\n" if pages else "") + text)
            for s, c in chunk:
                if c:
                    page_of.setdefault(c, []).append((s, pg + 1))
        ext = ".md" if ext_mix and i % 3 == 0 else ".txt"
        head = (f"# Field report {doc}: {rng.choice(PLACES)}" if ext == ".md" else f"Field report {doc} ({rng.choice(PLACES)})") + "\n\n"
        (docs_dir / f"{doc}{ext}").write_text(head + "\n\n".join(body) + "\n")
        truth["docs"][doc] = f"{doc}{ext}"
        for c, lst in page_of.items():
            truth["pairs"][f"{doc}|{c}"] = [[s, p] for s, p in lst]
    return truth


def doc_text(work, truth, doc):
    f = truth["docs"].get(doc)
    return (Path(work) / "docs" / f).read_text() if f else ""


def page_text(text, page):
    parts = re.split(r"=== Page (\d+) ===", text)
    return dict(zip(parts[1::2], parts[2::2])).get(str(page), "")


def norm_doc(s):
    m = re.search(r"D\s*0*(\d+)", str(s), re.I)
    return f"D{int(m.group(1)):02d}" if m else str(s).strip()


def check(work, truth, C, codes, min_recall, max_extra, pages=False):
    names = ["codes_from_scheme", "quotes_verbatim", "quotes_are_the_evidence", "recall", "precision"] + (["quote_on_cited_page"] if pages else [])
    if not C.exists(work, "codes.csv"):
        C.skip(names, "stopped_early")
        return None
    rows = read_csv(Path(work) / "codes.csv")
    for r in rows:
        r["doc"] = norm_doc(r.get("doc") or r.get("document") or r.get("doc_id") or "")
        r["code"] = (r.get("code") or "").strip().upper()
    C.add("codes_from_scheme", bool(rows) and all(r["code"] in codes for r in rows), "wrong_format")
    bad = [r for r in rows if not verbatim(r.get("quote", ""), doc_text(work, truth, r["doc"]))]
    C.add("quotes_verbatim", bool(rows) and not bad, "quote_not_verbatim", f"{len(bad)} of {len(rows)} not verbatim")
    got = {f"{r['doc']}|{r['code']}" for r in rows}
    truep = set(truth["pairs"])
    hits = got & truep
    evid = 0
    for r in rows:
        k = f"{r['doc']}|{r['code']}"
        if k in truep and any(ws(r.get("quote", "")).strip("\"' ") in ws(s) or ws(s) in ws(r.get("quote", "")) for s, _ in truth["pairs"][k]):
            evid += 1
    tp_rows = sum(1 for r in rows if f"{r['doc']}|{r['code']}" in truep)
    C.add("quotes_are_the_evidence", tp_rows > 0 and evid == tp_rows, "quote_not_verbatim", f"{evid} of {tp_rows}")
    C.add("recall", len(hits) >= min_recall * len(truep), "missed_items", f"{len(hits)} of {len(truep)}")
    C.add("precision", len(got - truep) <= max_extra, "extra_items", f"{len(got - truep)} extra")
    if pages:
        wrongp = 0
        for r in rows:
            try:
                pg = int(float(r.get("page", "")))
            except ValueError:
                wrongp += 1
                continue
            if not verbatim(r.get("quote", ""), page_text(doc_text(work, truth, r["doc"]), pg)):
                wrongp += 1
        C.add("quote_on_cited_page", bool(rows) and wrongp == 0, "citation_wrong", f"{wrongp} wrong")
    return rows


def solve(work, truth, pages=False, damage=False):
    rows = []
    for k, lst in sorted(truth["pairs"].items()):
        doc, code = k.split("|")
        s, p = lst[0]
        if damage:
            s = s.replace(" the ", " a ", 1).replace(" in ", " at ", 1)
        rows.append([doc, code, s] + ([p] if pages else []))
    write_csv(Path(work) / "codes.csv", ["doc", "code", "quote"] + (["page"] if pages else []), rows)
    return rows
