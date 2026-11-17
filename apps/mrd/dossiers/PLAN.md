# Dossier due diligence, and 25 new countries

Agreed with Bart on 2026-11-17. Status: Part 1 started that afternoon (`nohup ./check-all.sh`, log
`logs/check-all.log`; `python3 audit.py <slug> --report` per country). Parts 2 to 4 follow in order.
How it is built: "The checks" in README.md.

**The rule:** no answer is published unless its sources were actually read and a second reader
agrees with it.

Why: a person reviewing one answer out of 384 (Costa Rica, indicator 55) found a Yes that rested on
a court ruling the agent had only seen as a press summary. Nothing in the pipeline would have caught
it, and the blind review of 2026-11-07 had scored the dossiers 48 out of 48. Fixing that one answer
does not fix the system; the checks below do.

## Part 1: correct the six test countries (384 answers)

1. **Check the sources.** For every answer, confirm the agent opened each source it cites during
   that session (the run log has every read) and that the quoted passage is really in the fetched
   text at the cited article. Most quotes are translations, so a model matches them against the
   original language. Also flag every answer whose own notes say "not read", "inferred",
   "borderline" or "from the press". Sonnet 5.5, low effort.
2. **Second opinion.** A fresh Opus 5.5 agent (high effort) takes each answer with the indicator and
   the citation, reads the laws itself, and tries to prove the answer wrong. It returns confirmed,
   wrong, or not supported by what it read. It judges the implementation rating separately, on two
   questions: is the evidence about practice (a regulation is not evidence that it is applied), and
   is it about the same people the answer covers. Costa Rica's adult-education rating (indicator
   127, "Sometimes") failed both: its one practice source is UNHCR's page for refugees and asylum
   seekers, the other is the regulation itself, and the answer is about migrants generally (Bart's
   review, 2026-11-17).
3. **Redo the shaky ones.** Any answer marked low confidence (25 of them), or that failed check 1 or
   2, is redone by Fable 5.2 at high effort, with no cap on reading (xhigh at first; the first
   answer cost $14, and Bart moved it to high the same afternoon). It reads every law and ruling
   in full, never a news story about it.
4. **People settle disagreements.** Where the first coder, the second opinion and the redo do not
   agree, the answer goes on a review page with the question, the competing answers and the exact
   passage. Bart and the MRD team decide.
5. **People spot-check what passed.** An expert checks about 40 randomly chosen answers that cleared
   everything, to measure how many errors still get through.
6. **Publish the corrections.** Each change is saved with before, after and reason. Scores are
   recalculated. The library marks every answer as verified, changed, or waiting for review.

Already done: Costa Rica's indicator 55 recoded to No from the full ruling (see README, "What the
data taught us"). Known to rest on court material nobody read: Costa Rica 123, Philippines 67.
Known to have an implementation rating its evidence does not support: Costa Rica 127.

## Part 2: the 25 new countries (1,600 answers)

- **Central America:** Belize, El Salvador, Guatemala, Honduras, Nicaragua, Panama
- **Caribbean:** Antigua and Barbuda, Bahamas, Barbados, Cuba, Dominica, Dominican Republic,
  Grenada, Haiti, Jamaica, Saint Kitts and Nevis, Saint Lucia, Saint Vincent and the Grenadines,
  Trinidad and Tobago
- **South America:** Bolivia, Guyana, Paraguay, Suriname, Uruguay, Venezuela

Opus 5.5 codes each country at high effort. Checks 1 to 4 then run automatically as part of the
pipeline, and nothing is published until they pass. The expert spot-check is done on a sample across
all 25.

## How the coding agent works

- **Search:** Haiku 5.5, as before (Bart's call; a paid raw-results search key and Sonnet were the
  alternatives).
- **Official sources first:** the agent goes to each country's own law and court websites before
  anything else.
- **Nothing counts from search alone:** an answer resting on something only seen in search results
  fails the source check.
- **Evidence labels:** for each piece of implementation evidence the agent states which group it
  covers (refugees and asylum seekers, regular migrants, irregular migrants, all) and whether it
  shows practice or only law. The source check verifies the labels against the source, and a rating
  whose evidence does not cover the people the answer covers, or is law only, fails automatically.
  For the six existing dossiers the source check assigns the labels.
- **Court rulings:** a ruling supports a Yes only if the agent read the ruling itself and it sets a
  general rule. In `compile.py` since 2026-11-17.

## Models

| Job | Model | Effort |
|---|---|---|
| Coding | Opus 5.5 | high |
| Search | Haiku 5.5 | |
| Source check | Sonnet 5.5 | low |
| Second opinion | Opus 5.5 | high |
| Redo of shaky answers | Fable 5.2 | high |

All of it through Claude Code on the Max login, like the first run.

## Part 3: the original 46, forward to January 2026

Bart, 2026-11-17: "do it". The MRD's human-coded answers stop at January 2023. For each of the 46
countries and each indicator, start from the MRD's 2023 answer and the law it cites, and establish
whether that law was amended, repealed or replaced between January 2023 and January 2026, and
whether practice shifted; most answers will not change. It is coded as "what changed since 2023",
never as a fresh coding: a fresh 2026 answer set beside human-coded 2023 answers would show coder
disagreement as if it were legal change (the blind review found 11 of 48 MRD answers partly correct
or wrong). Where the 2023 answer itself looks wrong, record that apart from the change. The same
checks apply. Not designed in detail yet: the 2023 instrument's own change scale (its "B.0"
question: no protection then and now / gained / lost / same / implementation changed / protection
changed) is the natural answer format.

## Part 4: back in time, all 77 countries

Bart, 2026-11-17: "do it". For each indicator, trace when the cited provisions were enacted and
amended, and answer the earlier dates from that history, in the instrument's change scale. The
2023 instrument already does this once ("as of January 1, 2020"). **Which dates is still open**: I
asked Bart whether January 2020 alone (matching the MRD's existing years) or further back; no answer
yet. Method, as relayed by the Venture session on 2026-11-17 from a voice call with Bart ("Decided.
Decided."; confirm with him when the work on this part starts): his concern was that enactment
dates miss later amendments, and that for answers that are No today they miss rights that existed
and were repealed. So:

1. Date every protection from its law's full amendment history, not only its enactment date.
2. For answers that are No today, search for protections that existed and were repealed.
3. Case-law answers get the same treatment: date each ruling, then check later rulings that
   overturned or narrowed it.

The same three rules apply to Part 3 (forward to January 1, 2026). Consolidated-law sites often keep past versions; where they do not, the older the date, the
weaker the sourcing, and the answer has to say so.

## Size (API-equivalent dollars, rough until the first batch is measured)

Last week's law catalog and six dossiers: about $600. Part 1 and 2: about $5,700 ($110 a country to
check, $200 to code and check a new one; measured on the first test chunk: source check $1.61,
second reader $4.22 a chunk, 18 chunks a country). Part 3: about $100 a country, $4,600. Part 4:
about $60 a country and date; two dates for all 77, about $9,000. All of it: about $19,000, five to
six weeks of the whole Max weekly limit (about $3,500 a week at the July calibration), two to three
months at half of it. Bart knows and said go. Check `scripts/usage-meter.py` before a long batch.

## Order of work

1. Build the checks and the review page. (Done 2026-11-17: `audit.py`, `cc/check.mjs`,
   `check-all.sh`, ola.cx/mrd/dossiers/checks.)
2. Run Part 1 on the six countries.
3. Review what it found with Bart and the MRD team.
4. Fold the checks into the coding pipeline (`run-all.sh`), add the 25 countries to `COUNTRIES`,
   and run three new countries as a first batch: Panama, Uruguay and Jamaica.
5. Run the other 22.
6. Part 3, then Part 4, each with a first batch of three before the rest.
