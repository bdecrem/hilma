"""Restore accented letters that Cornell's source data replaced with "?" in citation texts ("libert? de r?union").

The MRD API itself returns them broken (data/citations.csv keeps the raw text), so they can't be re-downloaded.
Haiku restores each "?" that stands for a letter; a result is accepted only if every other character is unchanged
and every replaced "?" became a single letter or non-ASCII mark (’ « »). Updates citations.text_en (and its fts) in place.
  python3 fix_qmarks.py [--dry]
"""
import re, sys
from concurrent.futures import ThreadPoolExecutor
from lib import load_env, sb, sb_all, claude, USAGE

load_env()
DRY = "--dry" in sys.argv
BROKEN = re.compile(r"\w\?\w")


def valid(src, out):
    if len(src) != len(out):
        return False
    for a, b in zip(src, out):
        if a != b and not (a == "?" and (b.isalpha() or b == "-" or ord(b) > 127)):
            return False
    return True


def fix(row):
    src = row["text_en"]
    user = (f"<text>\n{src}\n</text>\n\nThis text lost its accented and special letters: each was replaced by \"?\" "
            "(\"libert? de r?union\" was \"liberté de réunion\", \"Bekendtg?relse\" was \"Bekendtgørelse\"). "
            "Return the text with every such \"?\" replaced by the letter it stood for, one letter per \"?\". "
            "Keep real question marks. Change nothing else at all. Output only the text.")
    for _ in range(2):
        out = claude(None, user, max_tokens=8000).strip("\n")
        if valid(src, out):
            return row["id"], out
    return row["id"], None


rows = [r for r in sb_all("citations?select=id,text_en&order=id") if BROKEN.search(r["text_en"] or "")]
print(f"{len(rows)} citations with letters lost to '?'")
ok = bad = 0
with ThreadPoolExecutor(8) as ex:
    for cid, out in ex.map(fix, rows):
        if out is None:
            bad += 1; print("  could not restore", cid); continue
        ok += 1
        if DRY:
            src = next(r["text_en"] for r in rows if r["id"] == cid)
            m = BROKEN.search(src)
            if ok <= 5: print("  ", src[max(0, m.start() - 30):m.end() + 40].replace("\n", " "), "→", out[max(0, m.start() - 30):m.end() + 40].replace("\n", " "))
            continue
        sb("PATCH", f"citations?id=eq.{cid}", {"text_en": out})
print(f"done: {ok} restored, {bad} not, ${USAGE['cost']:.2f}")
