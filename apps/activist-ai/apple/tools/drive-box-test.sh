#!/bin/bash
# tools/drive-box-test.sh [<out>]: the iPhone drive can type into the conversation's box and read it
# back when the box holds two lines (OLA-402). On the mini, from a copy of apple/ (README "Using the
# apps as a checker"): drive.sh phone --type-only signs in as the made-up appdriver, opens a Cloud
# session, types each sentence, reads the box back and wipes it; nothing is sent, so no model and no
# card. The box is a text field on one line and a text view on two (PhoneDrive.boxText); the
# driver of release e22f2b7a lost it there ("No matches found ... TextField", PhoneDrive.swift:191).
# Passes when the run passes and each sentence was read back whole from a box two lines tall (one
# line is 21 pt, two 41 pt; XCUITest calls the box a text field either way).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HOME/ola-drive/checks/box-$(date +%m%d-%H%M%S)}"
# 1. The checker's sentence of Nov 22, which wraps to two lines on the phone; 2. a line break typed.
S1='make a page that says Bart and publish it on ola'
S2=$'Café d\'Été, the page\nand a second line under it'
"$HERE/drive.sh" phone --where cloud --type-only --card any --wait 60 --say "$S1" --say "$S2" --out "$OUT"
CODE=$?
python3 - "$OUT/transcript.json" "$CODE" "$S1" "$S2" <<'PY'
import json, sys
t, code, *says = sys.argv[1:]
try: j = json.load(open(t))
except Exception as e: print(f"FAIL no transcript.json ({e}); drive.sh exit {code}"); sys.exit(1)
said = {s["sentence"]: s for s in j.get("said", [])}
ok = 0
for n, s in enumerate(says, 1):
    d = said.get(s, {})
    norm = lambda x: x.replace("\r\n", "\n").replace("\r", "\n").strip()
    good = d.get("status") == "in the box" and norm(d.get("inBox") or "") == norm(s) and (d.get("boxHeight") or 0) >= 35
    ok += good
    print(f"{'ok  ' if good else 'FAIL'} sentence {n}: {d.get('status', 'not reached')}, read back from a box {int(d.get('boxHeight') or 0)} pt tall: {(d.get('inBox') or '')!r}")
if code != "0": print(f"FAIL drive.sh exit {code}: {j.get('verdict', '')}")
print(f"{ok if code == '0' else 0} of {len(says)}")
sys.exit(0 if ok == len(says) and code == "0" else 1)
PY
