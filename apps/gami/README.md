# GAMI — the adaptation literature corpus

The Global Adaptation Mapping Initiative database (`GAMI_Database_FINAL.xlsx`, 1,682 coded studies of human
adaptation to climate change: region, sector, hazards, response type, summaries) plus the full text of as many
of those studies as we could get. Started 2026-10-13. Next: one SQLite database (`gami.db`) with the coded fields,
the extracted full text, full-text search and embedded chunks, so the corpus can be searched, summarized and
queried, and a summary web page built from it.

## Where the data lives

**On the Mac mini**, `admin@171.66.240.175:~/GAMI/` (not in git; ~1.6 GB):

| Path | What |
|---|---|
| `papers/<Article.ID>.pdf` | the PDFs, named by the database's Article.ID; every one passed a title check |
| `manifest.csv` | one row per paper: n, article_id, doi, status, source, file, note, title |
| `papers.json`, `papers.csv` | the catalog: database fields + DOI, publisher, status, PDF path, pages — for the web page |
| `log.md` | one readable line per paper, with totals at the top |
| `needs-you.md` | what is still missing and why |
| `debug/` | attempt logs, screenshots, candidates.json (open-access URLs and PIIs per paper) |

Status on 2026-10-14: 1,340 of 1,682 downloaded; 158 have no DOI anywhere, 123 no PDF found, 33 Elsevier
waiting on API access, 28 outside Stanford's subscription (Inderscience, IWA, a few others).

Reach it from the iMac with `ssh admin@171.66.240.175` (key auth). The mini has `python3` but no `uv`.

## How the PDFs were fetched

`fetch/` holds the pipeline; its README has the details. Every script reads `GAMI_DIR` (default `~/Desktop/GAMI`).
Fetching runs on the **iMac**, because Stanford's library access is by its IP (171.66.240.144): pull the data
down (`rsync -a admin@171.66.240.175:GAMI/ ~/Desktop/GAMI/`), fetch, `verify.py`, `catalog.py`, rsync it back,
delete the local copy (keep `~/Desktop/GAMI/.chrome-profile`). The iMac's disk is nearly full.

Saving from Bart's own Chrome (needed for Elsevier and for sites that challenge the automated browser) needs
the `mcp__claude-in-chrome__javascript_tool` allow rule (added 2026-10-14) and a receiver the page can reach
over HTTPS: run `fetch/receiver.mjs` with `GAMI_TOKEN` and `GAMI_DIR`, expose it with
`node ../tunn3l/cli/bore.js http 4789 --subdomain gami-recv`, POST to `https://gami-recv.tunn3l.sh/?id=<id>&k=<token>`.
Chrome blocks posts from publisher pages to `127.0.0.1`. Bodies over ~1.2 MB fail at the tunnel; send them in chunks.
Stop the tunnel when done.
