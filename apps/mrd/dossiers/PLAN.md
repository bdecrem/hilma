# Dossier due diligence, and 25 new countries

Agreed with Bart on 2026-11-17. Status: not started. He asked for it to run right after two short
deep dives in the same session; if that session ended first, start here.

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
   2, is redone by Fable 5.2 at xhigh effort, with no cap on reading. It reads every law and ruling
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
| Redo of shaky answers | Fable 5.2 | xhigh |

All of it through Claude Code on the Max login, like the first run.

## Order of work

1. Build the checks and the review page.
2. Run Part 1 on the six countries.
3. Review what it found with Bart and the MRD team.
4. Run three new countries as a first batch: Panama, Uruguay and Jamaica.
5. Run the other 22.

Steps 1 and 2 take about a day of machine time.
