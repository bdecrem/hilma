# Migrant Rights Database (snapshot)

Cornell's Migrant Rights Initiative scores countries 0-100 on 18 categories of migrants'
rights, for 2020 and 2023, three ways: Protection (the law on paper), Implementation, and
Adjusted. Pulled from its open API (`pull.py` shows the API and how it pages).

- `data/scores.csv`: one row per country, category, score type and year
- `data/scores_wide.csv`: the same, one row per country
- `data/categories.csv`, `data/questions.csv`: the instrument
- `data/countries.csv`: the countries with their summary paragraph
- `text/<country>.md`: for six countries, every 2023 question with the coder's answer,
  subscore and the legal citations they quoted
