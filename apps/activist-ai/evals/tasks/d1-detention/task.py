import fam_laws
C3 = ["Arvania", "Belmora", "Elyria"]


def generate(work, seed, rng):
    return fam_laws.build(work, rng, C3, ["detention"])


def check(work, truth, session, C):
    fam_laws.check(work, truth, C, "detention.csv", "detention", "max_days", quotes=False)


def solve(work, truth):
    fam_laws.solve(work, truth, "detention.csv", "detention", "max_days", False)


def wrong(work, truth):
    fam_laws.solve(work, truth, "detention.csv", "detention", "max_days", False, damage="article")
