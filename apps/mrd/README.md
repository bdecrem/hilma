# MRD — the Migrant Rights Database

A local copy of the [Migrant Rights Database](https://www.migrantrightsinitiative.org/en)
(Cornell Law School's Migrant Rights Initiative): how completely 46 countries
protect migrants' rights in law, and how well those laws are implemented, scored
per category of rights for the 2020 and 2023 editions.

The site is a Next.js front end over a Strapi backend at
`migration-rights-backend.herokuapp.com/api`. Every collection is readable
without a key, so the whole database can be pulled in a couple of minutes.
First pull 2026-11-05.

## What's in the data

| Table | Rows | What it is |
|-------|------|------------|
| `countries` | 46 | ISO code, slug, name and the site's write-up per country (en / es / fr) |
| `categories` | 19 | 18 categories of rights (Liberty, Labor, Health, Family, Asylum, …) grouped in six macro groups, plus the overall Average (`total_score`) |
| `questions` | 138 | the indicators. Each is a Protection question (what the law says) or an Implementation question hanging under a parent Protection question |
| `scores` | 6,924 | one row per country × category × score type × year. Score types: **Protection** (how complete the law is), **Implementation** (how well it is applied), **Adjusted** (the two combined). 0–100 |
| `scores_wide` | 93 | one row per country-year, one column per category / score type, Average first. The quickest way to look at the data |
| `answers` | 10,000 | the country-level answers behind the scores: country, year, question, answer text, subscore. 4,560 for 2020, 5,440 for 2023 |
| `citations` | 2,970 | the legal sources behind the answers: statute text, local and international references |

Quirks in the source: Japan is coded `JAP` and Hungary `HNG` (not the ISO
`JPN` / `HUN`); one score row carries no year; the 2020 edition has more score
rows than 2023 (4,442 vs 2,481) because 2023 published fewer per-type rows.

`data/Migrant Rights Database.xlsx` holds all seven tables as sheets with a
README sheet; the same tables are in `data/*.csv`. The raw API JSON lands in
`raw/` (gitignored, rebuilt by the pull).

## Commands

```bash
cd apps/mrd
python3 pull.py                      # every collection → raw/*.json (~3 min; Heroku dyno may need a retry to wake)
python3 -m venv .venv && .venv/bin/pip install openpyxl   # once, for the workbook
.venv/bin/python build.py            # raw/ → data/*.csv + data/Migrant Rights Database.xlsx
```

`build.py` without openpyxl still writes the CSVs and skips the workbook.
Spot check after a rebuild: Argentina 2023 Average should read 77 / 75 / 59
(Protection / Implementation / Adjusted), which is what the site shows.

## Useful API shapes

Strapi v4 REST. `?populate=*` pulls whole related records (slow, huge);
`populate[id_country][fields][0]=slug` keeps a relation to its id plus one
field. Filters: `filters[id_year][year][$eq]=2023`,
`filters[id_country][slug][$eq]=argentina`. Pages are capped at 100 rows.
Collections not pulled: `projects` (site content), `publications` (404).
