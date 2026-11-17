#!/usr/bin/env python3
"""Made-up studies for the batch-job checks, with the right answers kept apart.

  python3 make-corpus.py <folder> <truth.json> [--n 60]

Each file, study-NNN.txt, is a short invented field study (no real place, person or paper) of
about 5,000 characters, so the project database splits it into two parts ("pages"). Each says who
makes the adaptation decision and (most of them) the year the planning horizon runs to, on page 1
or page 2. Some are written the way PDFs come out: a line-break hyphen inside "adap-tation", a
"ﬁ" ligature in "ﬁsheries". Some never state the horizon ("not stated" is the right answer). The
answers go to truth.json, which never goes into a project.
"""
import json, os, random, sys

DECIDERS = ["households", "local government", "national government", "firms", "other"]
FILLER = [
    "Field teams visited the villages in the dry months and again after the rains.",
    "Interviews were recorded by hand and typed up the same week.",
    "The survey asked about crops, water, income and the costs of repairs.",
    "Most respondents had lived in the area for more than twenty years.",
    "Several households kept goats, and a few had small shops by the road.",
    "The authors thank the people who gave their time to answer questions.",
    "Prices for seed and fuel rose over the period of the study.",
    "The coastal road floods often, and the market moves inland when it does.",
    "Women's groups ran savings circles that met every second week.",
    "The report uses the words of respondents where they were clear.",
]


def study(n, rng):
    decider = DECIDERS[n % len(DECIDERS)]
    year = None if n % 15 == 7 else 2030 + (n * 7) % 41
    hyphen = n % 9 == 4
    who = ("The adap-\ntation decision is made by the %s." if hyphen else "The adaptation decision is made by the %s.") % decider
    when = None
    if year is not None:
        when = ("The planning horizon of the ﬁsheries measures runs to %d." if n % 9 == 4 else "The planning horizon of the measures runs to %d.") % year
    paras = []
    for _ in range(20):
        paras.append(" ".join(rng.sample(FILLER, 4)))
    # The decider on page 1 for even studies and page 2 for odd ones; the horizon the other way.
    first, second = (who, when) if n % 2 == 0 else (when, who)
    if first:
        paras[2] += " " + first
    if second:
        paras[17] += " " + second
    title = "Study %03d: a made-up field study" % n
    text = title + "\n\n" + "\n\n".join(paras) + "\n"
    return text, {"decider": decider, "horizon": year if year is not None else "not stated", "decider_part": 1 if n % 2 == 0 else 2,
                  "horizon_part": None if year is None else (2 if n % 2 == 0 else 1), "hyphen": hyphen, "ligature": n % 9 == 4 and year is not None}


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    out, truth_path = argv[0], argv[1]
    count = int(argv[argv.index("--n") + 1]) if "--n" in argv else 60
    os.makedirs(out, exist_ok=True)
    rng = random.Random(1234)
    truth = {}
    for n in range(1, count + 1):
        text, t = study(n, rng)
        name = "study-%03d.txt" % n
        with open(os.path.join(out, name), "w", encoding="utf-8") as f:
            f.write(text)
        truth[name] = dict(t, n=n)
    with open(truth_path, "w") as f:
        json.dump(truth, f, indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])
