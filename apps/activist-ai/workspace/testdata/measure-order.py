#!/usr/bin/python3 -I
"""How many known sentences come out whole from each way of reading a PDF's text.

    python3 -I measure-order.py <dir made by mkdocs.py> [olatext folder]

Reads two-column.pdf and one-column.pdf with pdftotext -layout (Ola's way before 2026-11-17), the
default (reading order) and -raw, and counts the sentences of truth.json that find_quote finds
on their own page. The result decided ola-db's extraction (README, "Reading real documents").
"""
import json, os, subprocess, sys

sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else "/opt/ola/lib")
from olatext import find_quote

d = sys.argv[1]
t = json.load(open(os.path.join(d, "truth.json")))
out = {}
for name, key in (("two-column.pdf", "two_column"), ("one-column.pdf", "one_column")):
    want = t[key]["pages"]
    for mode in ("-layout", "default", "-raw"):
        args = [] if mode == "default" else [mode]
        pages = subprocess.run(["pdftotext", *args, "-enc", "UTF-8", os.path.join(d, name), "-"], capture_output=True).stdout.decode("utf-8", "replace").split("\f")
        found = sum(1 for i, ss in enumerate(want) for s in ss if i < len(pages) and find_quote(s, pages[i])[0])
        out["%s %s" % (name, mode)] = [found, sum(map(len, want))]
print(json.dumps(out))
