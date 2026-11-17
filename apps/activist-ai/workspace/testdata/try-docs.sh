#!/bin/sh
# A quick look at the document tools inside a workspace image, on made-up files (for a developer;
# the proofs are in workspace/check.mjs). Run inside the VM, from /work:
#   container run --rm --network none --read-only --tmpfs /tmp -v <dir>:/work -v <this folder>:/t:ro \
#     --entrypoint /bin/sh ola-workspace:<tag> /t/try-docs.sh
set -u
cd /work
python3 -I /t/mkdocs.py d --beacon http://127.0.0.1:9 >/dev/null; ola-db init
echo "== reading order"; python3 -I /t/measure-order.py d
echo "== image"; tesseract --version 2>&1 | head -1; tesseract --list-langs 2>&1 | tr '\n' ' '; echo
echo "== add two-column"; ola-db add d/two-column.pdf
echo "== add scan"; t0=$(date +%s); ola-db add d/scan.pdf; echo "ocr seconds: $(( $(date +%s) - t0 ))"
ola-db search "dike repairs"
ola-db query "SELECT doc_id, page, method, confidence, lang FROM doc_pages"
echo "== check"; ola-db check d/right-paper.pdf --cite "$(python3 -c 'import json;print(json.load(open("d/truth.json"))["paper"]["cite"])')"; echo "exit $?"
ola-db check d/wrong-paper.pdf --title "Groundwater rights and drought relief in a fictional delta" --doi 10.5555/mhyd.2021.0042; echo "exit $?"
echo "== charsets"; for f in latin1.txt cp1252.html utf16.txt hebrew-1255.html hebrew-8859-8.txt; do ola-db add d/$f >/dev/null; done
ola-db query "SELECT d.path, substr(t.text, 1, 60) FROM doc_text t JOIN documents d ON d.id = t.doc_id WHERE d.path LIKE 'd/%.txt' OR d.path LIKE 'd/%.html'"
echo "== zips"; for z in bomb liar traversal absolute symlink many papers; do cp d/$z.zip $z.zip; ola-unzip $z.zip > /tmp/u.json; echo "exit $?"; head -c 300 /tmp/u.json; echo; done
ls -la papers 2>/dev/null; ls -la .ola/tmp 2>/dev/null
echo "== attach"; for b in library corrupt hostile not-a-db; do cp d/$b.db $b.db; ola-db attach $b.db; echo "exit $?"; done
ola-db query "SELECT count(*) FROM library.papers"; ola-db query "SELECT * FROM hostile.v"; ola-db query "DELETE FROM library.papers"
ola-db api tables | head -c 600; echo
echo "== view"; ola-view pdf-info d/scan.pdf | head -c 300; echo
ola-view pdf-page d/two-column.pdf 2 --width 1400 | head -1
ola-view doc d/remote-template.docx | tail -c +2 | head -c 1500; echo
ola-view doc d/notes.md | grep -o '<body>.*' | head -c 900; echo
ola-view table d/formulas.xlsx | head -c 900; echo
ola-view table d/formulas.xlsx --sheet Districts --sort Households --dir desc | head -c 400; echo
echo "== disk"; ola-db api disk
