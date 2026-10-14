# GAMI paper retrieval

Full texts of the 1,682 studies in `misc/GAMI_Database_FINAL.xlsx`, saved to `~/Desktop/GAMI/papers/<Article.ID>.pdf`.
`~/Desktop/GAMI/log.md` is the running log and `manifest.csv` tracks status.

**Since 2026-10-14 the data lives on the Mac mini** (`admin@171.66.240.175:~/GAMI/`: papers, manifest, catalog, debug). The iMac keeps only `~/Desktop/GAMI/.chrome-profile`. To fetch more from the iMac (the Stanford IP), `rsync -a admin@171.66.240.175:GAMI/ ~/Desktop/GAMI/` first and rsync back after.

1. `resolve.py --start N --count M` matches title + first author to a DOI (Crossref, then OpenAlex) and tries open-access copies.
2. `fetch.mjs --headed [--limit N | --ids a,b]` uses a visible Chrome with its own profile (`~/Desktop/GAMI/.chrome-profile`) and Stanford's proxy (`stanford.idm.oclc.org`, IP-authenticated from this iMac). It opens each PDF link as a page visit and catches the bytes. Works for Springer, Taylor & Francis, Sage and MDPI. Headless mode is blocked by Cloudflare.
3. ScienceDirect (Elsevier) puts a CAPTCHA in front of any automated browser, even after a person clicks it. Bart's own Chrome passes. Open the article via the proxy in the Claude-in-Chrome tab, set `location.href` to the `a[href*="pdfft"]` link, and once the tab is the PDF on pdf.sciencedirectassets.com, `fetch(location.href)` and POST the bytes to `receiver.mjs` (`http://127.0.0.1:4789/?id=<id>`), which writes the file. Publisher pages with a strict CSP (Taylor & Francis) block that POST, the bare PDF host does not.
4. Elsevier API (`ELSEVIER_API_KEY` in `.env.local`) works for search and abstracts only. Full-text Article Retrieval needs approval from Elsevier API Support, requested 2026-10-13.

Outputs: after any run, `catalog.py` rebuilds `papers.json` / `papers.csv` (one record per paper with title, authors, journal, DOI, publisher, PDF path, pages, region, country, sector, hazards, response, summary; the source for a summary web page) and `log.md` (one table row per paper). The fetch scripts write their step-by-step detail to `debug/attempts.md`.

Full run (2026-10-13): `nohup caffeinate -i bash scripts/gami/run-all.sh > ~/Desktop/GAMI/debug/run-all.out 2>&1 &`. Resumable; batches of 100, then a slow retry pass. Bot checks become `needs_human` and are listed in `~/Desktop/GAMI/needs-you.md`. Elsevier is skipped by the runner; `elsevier-queue.py` lists pending `id pii` pairs for the in-Chrome pass (pick the `pdfft` link whose href contains the page's own PII — the first one on the page can belong to a recommended article). Attempted Elsevier ids go in `debug/elsevier-tried.txt`.
