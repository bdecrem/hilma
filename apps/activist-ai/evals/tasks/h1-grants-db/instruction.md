We need our grant history in one database. Inputs: grants_2023.csv, grants_2024.tsv (different columns), orgs.csv (the registry), aliases.csv; README.md says how a grant matches an organization. Please:
1. grants_clean.csv: every matched grant of both years, columns org_id, year, amount_usd (a number).
2. unmatched.csv: every grant that matches no organization, with its year, name as written, and amount.
3. grants.db (SQLite) with table orgs (org_id, legal_name, ein, county: all 80 organizations) and table grants (org_id, year, amount_usd: the rows of grants_clean.csv).
4. top5.csv: the five organizations with the most money over both years, largest first, columns org_id, legal_name, total_usd.
5. report.md: the total awarded in 2023 and in 2024 (all grants, matched or not) and the growth from 2023 to 2024 in percent, to one decimal.
