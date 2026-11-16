import json
from pathlib import Path
import fam_docs
from evalkit import read_csv, num, write_csv

CODES = ['FUNDING_GAP', 'EARLY_WARNING', 'WOMEN_LEAD', 'MIGRATION']
N, TRAPS, PAGES, WRAP, MIN_RECALL, MAX_EXTRA = 15, True, True, False, 0.9, 1


def generate(work, seed, rng):
    return fam_docs.generate(work, rng, N, CODES, TRAPS, pages=PAGES, wrap=WRAP, ext_mix=WRAP)


def check(work, truth, session, C):
    rows = fam_docs.check(work, truth, C, CODES, MIN_RECALL, MAX_EXTRA, pages=PAGES)
    if WRAP:
        _counts(work, truth, C, rows)


def _counts(work, truth, C, rows):
    if not C.exists(work, "code_counts.csv"):
        C.skip(["counts_cover_all_codes", "counts_agree_with_codes_csv", "counts_near_truth"], "stopped_early")
        return
    got = {(r.get("code") or "").strip().upper(): num(r.get("documents")) for r in read_csv(Path(work) / "code_counts.csv")}
    C.add("counts_cover_all_codes", set(got) == set(CODES), "wrong_format", sorted(got))
    own = {c: len({r["doc"] for r in (rows or []) if r["code"] == c}) for c in CODES}
    C.add("counts_agree_with_codes_csv", all(got.get(c) == own[c] for c in CODES), "numbers_wrong")
    true = {c: sum(1 for k in truth["pairs"] if k.endswith("|" + c)) for c in CODES}
    C.add("counts_near_truth", all(got.get(c) is not None and abs(got[c] - true[c]) <= 1 for c in CODES), "numbers_wrong", json.dumps(true))


def _write_counts(work, truth):
    true = {c: sum(1 for k in truth["pairs"] if k.endswith("|" + c)) for c in CODES}
    write_csv(Path(work) / "code_counts.csv", ["code", "documents"], [[c, true[c]] for c in CODES])


def solve(work, truth):
    fam_docs.solve(work, truth, pages=PAGES)
    if WRAP:
        _write_counts(work, truth)


def wrong(work, truth):
    fam_docs.solve(work, truth, pages=PAGES, damage=True)
    if WRAP:
        _write_counts(work, truth)
