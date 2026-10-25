#!/bin/bash
# Download the source sample sets Takt's sounds are cut from (see Takt/Licenses/README.md).
#
#   apps/takt/scripts/sounds-fetch.sh <dir>        # ~700 MB download, then:
#   python3 apps/takt/scripts/sounds.py <dir>      # (numpy + soundfile) -> Takt/Sounds
#
# VCSL (CC0): the Knight upright piano (Ivy Audio), the tenor sax, the hi-hat foot chick.
# FreePats (CC0): Finger Bass YR. FreePats (CC-BY 4.0, Lars Muldjord): MuldjordKit.
set -euo pipefail
OUT=${1:?usage: sounds-fetch.sh <dir>}
mkdir -p "$OUT"/{piano,sax,hh}
cd "$OUT"

VCSL=https://raw.githubusercontent.com/sgossner/VCSL/master
curl -s 'https://api.github.com/repos/sgossner/VCSL/git/trees/master?recursive=1' -o vcsl.json
python3 - <<'EOF' > curl.cfg
import json, re, urllib.parse
VCSL = "https://raw.githubusercontent.com/sgossner/VCSL/master/"
for e in json.load(open("vcsl.json"))["tree"]:
    p = e["path"]
    if e["type"] != "blob" or not p.endswith(".wav"):
        continue
    if "Upright Piano, Knight/Sustains" in p:
        d = "piano"
    elif "Tenor Saxophone/" in p and ("Staccato" in p or "Non-Vibrato" in p):
        d = "sax"
    elif "Hi-Hat Cymbal/" in p:
        d = "hh"
    else:
        continue
    print(f'url="{VCSL}{urllib.parse.quote(p)}"\noutput="{d}/{p.split("/")[-1]}"')
EOF
curl -s --parallel --parallel-max 16 -K curl.cfg

FP=https://github.com/freepats
curl -sL -O "$FP/electric-bass-YR/releases/download/2019-09-30/FingerBassYR-SFZ+WAV-20190930.7z"
curl -sL -O "$FP/muldjordkit/releases/download/2020-10-18/MuldjordKit-SFZ+WAV-20201018.7z"
7zz x -y -obass FingerBassYR-SFZ+WAV-20190930.7z >/dev/null
7zz x -y -odrums MuldjordKit-SFZ+WAV-20201018.7z >/dev/null
echo "piano $(ls piano | wc -l), sax $(ls sax | wc -l), hh $(ls hh | wc -l), bass + drums extracted in $OUT"
