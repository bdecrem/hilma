import fam_laws
C5 = ["Arvania", "Belmora", "Corvenia", "Elyria", "Fennmark"]


def generate(work, seed, rng):
    t = fam_laws.build(work, rng, C5, ["detention", "appeal"], hard_appeal=True)
    return {k: v for k, v in t.items() if k.endswith("|appeal")}


def check(work, truth, session, C):
    fam_laws.check(work, truth, C, "appeal.csv", "appeal", "days", quotes=True)


def solve(work, truth):
    fam_laws.solve(work, truth, "appeal.csv", "appeal", "days", True)


def wrong(work, truth):
    for v in truth.values():
        if v["value"] % 7 == 0 and v["value"] != 7:
            v["value"] //= 7
        else:
            v["value"] += 1
    fam_laws.solve(work, truth, "appeal.csv", "appeal", "days", True)
