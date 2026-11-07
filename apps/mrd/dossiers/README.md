# Six experimental dossiers

Portugal, Norway, the Philippines, Costa Rica, Qatar and China are not in the Migrant Rights Database.
This folder compiles an MRD-style dossier for each: the 64 indicators of the MRD's 2023 coding
instrument answered in its own options, a citation for each, implementation rated from documented
practice, the category scores computed the way the database computes them, an overview in English,
Spanish and French, then the law crawl (`../laws/`) over the citations. Everything it writes carries
`experimental = true` (countries, citations, answers, scores, laws, the trigger `mark_experimental`
sets it from the country), ids 1001-1006, and the library shows it apart with a red badge.
Progress: https://ola.cx/mrd/dossiers. Started 2026-11-06.

## How it runs

Through Claude Code on the Max login (the Agent SDK, like the Almanac), not the API key: Bart's call
on 2026-11-06 after the API route came to $250-330 for six countries on Opus. `cc/run.mjs` drives it;
`compile.py` holds the prompts, schemas, validation and database writes and is also the page reader.

```bash
cd apps/mrd/dossiers
python3 codebook.py                      # codebook.json from ../data and instrument/ (rerun after editing)
python3 seed_answers.py                  # once: the MRD's answers + scores for the 46, citations re-pointed
(cd cc && npm install)                   # the Agent SDK
nohup ./run-all.sh > logs/run-all.log 2>&1 &     # the six in sequence; restartable
node cc/run.mjs portugal --workers 3 [--only labor_a,labor_b] [--redo]   # one country / some chunks
python3 score.py portugal                # scores + overview
```

Per country: a **law map** (one Opus session: the instruments, treaties and portals, each URL read),
then **18 chunks** of related indicators, three sessions at a time. A session gets the MRD's coding
rules, the country, the law map, the chunk's indicators with the instrument's full wording, options and
scores, three worked examples per indicator from the coded countries (similar legal families first),
and two tools: Claude Code's `WebSearch` and our `read` (an MCP tool that shells out to
`compile.py --read`: cached fetch, PDF via pdftotext, headless Chrome for sites that block scripts,
`find` returns the passages around article numbers instead of a 480k-character code). The answer is
structured output on a flat schema (the strict mode caps parameters; the answer enum is the union of
the chunk's options, `validate_submit` checks each per indicator). `--ingest-chunk` writes `answers`
(the protection answer and the implementation rating, with evidence, sources, confidence, notes) and
`citations` (id = country id × 1000 + question id; the sources go in `local_text_en`, treaties in
`international_text_en`), marks the chunk, logs. Costs on the dashboard are API-equivalent
(`total_cost_usd` from the SDK); the run itself counts against the Max plan.

`score.py`: Protection = mean of the category's protection subscores (No = 0); Implementation = mean
of the implementation subscores, Does Not Apply excluded; Adjusted = P × I / 100; the Average is the
mean over the 17 categories (that reproduces the MRD's published Protection and Adjusted averages;
its Implementation average runs 2-3 points higher than a category mean, method unknown). The overview
is one Opus call on the API key (cents) in the style of the MRD's own write-ups.

## What the data taught us

- **The MRD's answers and citations point at the wrong question ids from id 73 on.** Its `questions`
  table was renumbered after coding: the citation stored under 93 is about voting (91), the one under
  107 about loss of employment (101), and so on. `SHIFT` in `codebook.py` maps them back by content
  (checked against the 2023 instrument's order); `seed_answers.py` re-pointed 1,306 citations in our
  database, so the library's indicator pages are right where the MRD's own site is not.
- **Four questions on the site were never coded** (105 unions, 107 redress before deportation, 121
  health care regardless of status, 129 adult education regardless of status): they are not in the
  2023 instrument. A dossier has 64 indicators.
- **The instrument is the codebook**: `instrument/MRD_2023_Survey_Instrument.pdf` (from the MRD site),
  parsed to `instrument/instrument.json`. Options are scored by position (2 options 0/100, 3 options
  0/50/100, 4 options 0/50/75/100), which matches the MRD's subscores.
- Brave's search plan returned 402 on 2026-11-06; the API-key path in `compile.py` (`main()` with the
  manual tool loop) picks Brave when the key works and Anthropic's web search otherwise. It is kept
  for the record; the Claude Code runner is the live path.
