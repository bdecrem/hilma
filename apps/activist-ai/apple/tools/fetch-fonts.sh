#!/bin/bash
# Fetch the brand's fonts (OFL) from the google fonts repository.
D="$1"; mkdir -p "$D"; cd "$D" || exit 1
BASE="https://raw.githubusercontent.com/google/fonts/main"
get() { curl -sfL -o "$2" "$BASE/$1" && echo "ok $2 $(wc -c <"$2")" || echo "FAIL $1"; }
get "ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf" BricolageGrotesque.ttf
get "ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf" Literata.ttf
get "ofl/literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf" Literata-Italic.ttf
get "ofl/ibmplexmono/IBMPlexMono-Regular.ttf" IBMPlexMono-Regular.ttf
get "ofl/ibmplexmono/IBMPlexMono-Medium.ttf" IBMPlexMono-Medium.ttf
get "ofl/literata/OFL.txt" OFL-Literata.txt
get "ofl/bricolagegrotesque/OFL.txt" OFL-Bricolage.txt
get "ofl/ibmplexmono/OFL.txt" OFL-IBMPlexMono.txt
