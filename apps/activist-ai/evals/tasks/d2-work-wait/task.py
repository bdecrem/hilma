import fam_laws
C4 = ["Arvania", "Belmora", "Corvenia", "Dastria"]


def generate(work, seed, rng):
    while True:
        t = fam_laws.build(work, rng, C4, ["detention", "work", "appeal"])
        if any(v["value"] == 0 for k, v in t.items() if k.endswith("|work")) and not all(v["value"] == 0 for k, v in t.items() if k.endswith("|work")):
            return {k: v for k, v in t.items() if k.endswith("|work")}


def check(work, truth, session, C):
    fam_laws.check(work, truth, C, "work.csv", "work", "months", quotes=True)


def solve(work, truth):
    fam_laws.solve(work, truth, "work.csv", "work", "months", True)


def wrong(work, truth):
    for v in truth.values():
        v["quote"] = v["quote"].replace("e", "é", 1)
    fam_laws.solve(work, truth, "work.csv", "work", "months", True)
