"""A made-up corpus of adaptation studies in one SQLite file, shaped like a research database
of coded studies (studies, the hazards each addresses, coded findings). Every title, place
and number is invented; the same seed makes the same file."""
import random, sqlite3
from pathlib import Path

REGIONS = ["Sahel", "South Asia", "Pacific", "Andes", "East Africa", "Mekong"]
SECTORS = ["agriculture", "water", "health", "housing", "fisheries", "livelihoods"]
DESIGNS = ["RCT", "quasi-experimental", "case study", "survey", "qualitative"]
HAZARDS = ["drought", "flood", "heat", "cyclone", "sea level rise"]
COUNTRY = {"Sahel": ["Arvania", "Belmora"], "South Asia": ["Corvenia", "Dastria"], "Pacific": ["Elyria", "Fennmark"],
           "Andes": ["Galvoria", "Hesper"], "East Africa": ["Istrava", "Jorlund"], "Mekong": ["Kaltra", "Lumen"]}
WORDS = ["community", "irrigation", "insurance", "early warning", "migration", "seed banks", "cooling", "mangroves", "credit", "cisterns"]

CODEBOOK = """# The studies database (studies.db)

A database of research studies on climate adaptation, coded by a team of readers.

## studies
One row per study.
- id: study id
- title, year (publication year), country, region
- sector: the main sector the study is about (agriculture, water, health, housing, fisheries, livelihoods)
- design: RCT, quasi-experimental, case study, survey, qualitative
- n_participants: number of participants or households. -1 means "not reported".
- included: 1 if the study passed screening, 0 if it was screened out. Screened-out studies are
  not part of the corpus: leave them out of every count and average unless asked otherwise.

## hazards
Which hazards each study addresses (a study can address several). study_id, hazard.

## findings
Coded findings: study_id, hazard, outcome (what was measured), direction (positive, negative, mixed, none).
A study can have several findings.
"""


def build(path, seed):
    rng = random.Random(f"studies:{seed}")
    path = Path(path)
    if path.exists():
        path.unlink()
    db = sqlite3.connect(path)
    db.executescript("""
      CREATE TABLE studies (id INTEGER PRIMARY KEY, title TEXT, year INTEGER, country TEXT, region TEXT,
                            sector TEXT, design TEXT, n_participants INTEGER, included INTEGER);
      CREATE TABLE hazards (study_id INTEGER, hazard TEXT);
      CREATE TABLE findings (id INTEGER PRIMARY KEY, study_id INTEGER, hazard TEXT, outcome TEXT, direction TEXT);
    """)
    fid = 0
    for i in range(1, rng.randint(380, 460)):
        region = rng.choice(REGIONS)
        design = rng.choices(DESIGNS, [2, 2, 3, 3, 2])[0]
        n = rng.randint(40, 4000) if design in ("RCT", "quasi-experimental", "survey") else rng.randint(5, 90)
        if rng.random() < 0.15:
            n = -1
        db.execute("INSERT INTO studies VALUES (?,?,?,?,?,?,?,?,?)",
                   (i, f"{rng.choice(WORDS).title()} and {rng.choice(WORDS)} in {rng.choice(COUNTRY[region])}", rng.randint(2003, 2025),
                    rng.choice(COUNTRY[region]), region, rng.choice(SECTORS), design, n, 0 if rng.random() < 0.13 else 1))
        hz = rng.sample(HAZARDS, rng.choice([1, 1, 2, 3]))
        for h in hz:
            db.execute("INSERT INTO hazards VALUES (?,?)", (i, h))
        for _ in range(rng.choice([0, 1, 2, 3, 4])):
            fid += 1
            db.execute("INSERT INTO findings VALUES (?,?,?,?,?)", (fid, i, rng.choice(hz), rng.choice(["yields", "income", "health", "displacement", "water access"]),
                                                                   rng.choices(["positive", "negative", "mixed", "none"], [4, 3, 2, 1])[0]))
    db.commit()
    return db


def write(work, seed):
    db = build(Path(work) / "studies.db", seed)
    (Path(work) / "codebook.md").write_text(CODEBOOK)
    return db
