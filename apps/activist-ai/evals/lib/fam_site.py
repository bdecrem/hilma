"""Shared bits for the page tasks."""
import re
from evalkit import page, numbers_in, has_number

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def loaded(C, name, r):
    return C.add(name, r.get("ok") and not r.get("errors"), "page_broken", (r.get("error") or "") + " " + "; ".join(r.get("errors", [])[:2]))


def vals(r, sel):
    v = (r.get("values") or {}).get(sel) or []
    return v[0] if v else ""


def line_with(text, word):
    return [l for l in (text or "").splitlines() if word.lower() in l.lower()]
