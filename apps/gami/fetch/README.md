# GAMI paper retrieval

Full texts of the 1,682 studies in `misc/GAMI_Database_FINAL.xlsx`, saved to `~/Desktop/GAMI/papers/<Article.ID>.pdf`.
`~/Desktop/GAMI/log.md` is the running log and `manifest.csv` tracks status.

**Since 2026-10-14 the data lives on the Mac mini** (`admin@171.66.240.175:~/GAMI/`: papers, manifest, catalog, debug). The iMac keeps only `~/Desktop/GAMI/.chrome-profile`. To fetch more from the iMac (the Stanford IP), `rsync -a admin@171.66.240.175:GAMI/ ~/Desktop/GAMI/` first and rsync back after.

1. `resolve.py --start N --count M` matches title + first author to a DOI (Crossref, then OpenAlex) and tries open-access copies.
2. `fetch.mjs --headed [--limit N | --ids a,b]` uses a visible Chrome with its own profile (`~/Desktop/GAMI/.chrome-profile`) and Stanford's proxy (`stanford.idm.oclc.org`, IP-authenticated from this iMac). It opens each PDF link as a page visit and catches the bytes. Works for Springer, Taylor & Francis, Sage and MDPI. Headless mode is blocked by Cloudflare.
3. ScienceDirect (Elsevier) puts a CAPTCHA in front of any automated browser, even after a person clicks it. Bart's own Chrome passes. Open the article via the proxy in the Claude-in-Chrome tab, set `location.href` to the `a[href*="pdfft"]` link, and once the tab is the PDF on pdf.sciencedirectassets.com, `fetch(location.href)` and POST the bytes to `receiver.mjs` (`http://127.0.0.1:4789/?id=<id>`), which writes the file. Publisher pages with a strict CSP (Taylor & Francis) block that POST, the bare PDF host does not.
4. Elsevier API (`ELSEVIER_API_KEY` in `.env.local`): Article Retrieval was enabled by Elsevier support on 2026-10-21. Call it from the iMac (Stanford IP): `GET https://api.elsevier.com/content/article/doi/<doi>` with `X-ELS-APIKey` and `Accept: application/pdf`. Some journals return only a one-page preview PDF (check `pdfinfo` pages); for those, `Accept: text/xml` with `?view=FULL` still carries the whole text, and `elsevier-xml-pdf.py <in.xml> <out.pdf>` turns it into a plain PDF (title, authors, abstract, sections, references) that `verify.py` and `build.py` read like any other. Manifest `source` is `elsevier-api/pdf` or `elsevier-api/xml-text`. Rangeland Ecology & Management answered neither.

Outputs: after any run, `catalog.py` rebuilds `papers.json` / `papers.csv` (one record per paper with title, authors, journal, DOI, publisher, PDF path, pages, region, country, sector, hazards, response, summary; the source for a summary web page) and `log.md` (one table row per paper). The fetch scripts write their step-by-step detail to `debug/attempts.md`.

Full run (2026-10-13): `nohup caffeinate -i bash apps/gami/fetch/run-all.sh > ~/Desktop/GAMI/debug/run-all.out 2>&1 &`. Resumable; batches of 100, then a slow retry pass. Bot checks become `needs_human` and are listed in `~/Desktop/GAMI/needs-you.md`. Elsevier is skipped by the runner; `elsevier-queue.py` lists pending `id pii` pairs for the in-Chrome pass (pick the `pdfft` link whose href contains the page's own PII — the first one on the page can belong to a recommended article). Attempted Elsevier ids go in `debug/elsevier-tried.txt`.

## Second sweep (2026-11-16): 177 more

1. `sweep.py` on the iMac (`GAMI_DIR=~/Desktop/GAMI`, the mini's folder rsynced without `papers/` and `gami.db`):
   for every row not downloaded, a DOI from the GAMI Zotero group's public item list (61 found) or a looser title
   match, then every open copy (Unpaywall, OpenAlex, Semantic Scholar, Europe PMC, CORE, the Zotero url). Plain
   requests get 403 from most publishers, so this step found 28; its real output is `debug/sweep-candidates.json`.
2. `sweep-browser.mjs` on the **mini** (`~/GAMI/code/browser/`, `npm i playwright-core`; the mini is a Stanford IP
   and nobody watches its screen): `GAMI_DIR=$HOME/GAMI nohup caffeinate -i node sweep-browser.mjs --workers 4 --search &`.
   Visits each candidate and the proxied DOI, reads the PDF links off the rendered page, fetches same-origin ones
   from inside the page, and with `--search` tries Bing / DuckDuckGo results for the exact title. Found 149.
   Every saved PDF passed the title check (pdftotext, first three pages). `SWEEP_DEBUG=1` logs each link tried.
3. Rebuild on the mini: `python3 years.py`, `build.py`, `catalog.py` (in `~/GAMI/code`, `.venv` has pypdf now).

Known limits: Emerald answers more than a few visits with a "Validate User" page (45 s between visits is still too
fast for some); IWA, Inderscience and some Taylor & Francis titles redirect the PDF link to the abstract (no
subscription). The run can hang on its last papers: kill it, the manifest is saved after every paper.
