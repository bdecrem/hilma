# gami.db — the corpus as one SQLite file

Lives on the Mac mini at `~/GAMI/gami.db` (~360 MB), next to the PDFs it is built from; the scripts run there from
`~/GAMI/code/` (a copy of this folder: `rsync -a apps/gami/db/ apps/gami/GAMI_Database_FINAL.xlsx admin@171.66.240.175:GAMI/code/`).
The PDFs stay the source: `build.py` rebuilds everything except classification runs in about a minute.

| Script | What |
|---|---|
| `years.py` | publication year per DOI from Crossref → `~/GAMI/years.json` (incremental; 1,495 of 1,522 found) |
| `build.py` | spreadsheet + manifest + PDFs (PyMuPDF) → `gami.db`. Needs `~/GAMI/.venv` (pymupdf, openpyxl, ftfy); run with `GAMI_XLSX=~/GAMI/code/GAMI_Database_FINAL.xlsx ../.venv/bin/python build.py` |
| `search.py` | keyword search (FTS5 syntax: phrases, AND/OR/NOT, `prefix*`, `NEAR()`) with page + snippet, `--where` filters, `--sql`, `--csv` |
| `classify.py` | sort papers into buckets with Claude (one call per paper, Sonnet 5.5, full text by default), results in `labels` |

## Tables

- `papers` — one row per study (1,682): `id` (Article.ID), `year`, `doi`, `status`, `pdf`, `pages`, `words`, `body`
  (full text, 1,340 papers), and every spreadsheet column under a snake_case name (`summary`, `title`, `authors`,
  `journal`, `sector`, `hazards`, `responsetype`, `depth_score`, `methods`, … — `pragma table_info(papers)`).
  Multi-value cells are joined with ` | `, "n/a" dropped. Booleans are 0/1.
- `tags (paper_id, field, value)` — the multi-value coded fields split out for exact filtering: region, country,
  sector, cross_cutting, actors, equity_planning, equity_targeting, response_type, hazard, exposure. Country is the
  coders' free text (815 distinct values), so match it with `like`.
- `papers_fts (id, title, summary, body)` — full-text index per paper (porter stemming: "adapt" finds "adaptation").
- `pages_fts (paper_id, page, text)` — the same text per page, for snippets and page numbers.
- `runs`, `labels (run, paper_id, label, confidence, reason)` — classification runs; kept across rebuilds.

## Examples

```sql
-- papers in Africa about drought that mention pastoralists, by year
select p.year, count(*) from papers_fts f join papers p using(id)
where papers_fts match 'pastoral*' and p.id in (select paper_id from tags where field='region' and value='Africa')
  and p.id in (select paper_id from tags where field='hazard' and value like '%drought%') group by 1;
-- a bucket run crossed with the coded response type
select l.label, t.value, count(*) from labels l join tags t on t.paper_id=l.paper_id and t.field='response_type'
where l.run='adaptation-type' group by 1, 2;
```

A full-text bucket run over all 1,340 papers is ~17M input tokens (about $50 on Sonnet 5.5); `--source summary`
uses only the title and the GAMI summary (~$1). Embeddings for meaning-based search are not built yet.
