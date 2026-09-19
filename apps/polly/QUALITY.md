# Polly — which model does what, and the Fast / Thorough setting

Audit of 2026-09-19 (Bart: "review all content/language-learning features,
determine the correct base model for each, whether it benefits from a higher
quality option, and then one setting toggles all of those").

One account-level preference — Profile → Learning → **Polly's care**: Fast /
Thorough (`polly_users.content_quality`, schema 008; every language profile of
the account carries a copy) — and one table in code, `TIERS` in
`src/lib/polly/quality.ts`: per feature, the **base** tier everyone gets and
the **deep** tier Thorough switches to. `qualityFor(userId)` is read where the
content is made, so background work (a deck built in `after()`, the next
lesson) honours it too.

The rule for a row: the base is the right model for the job at the speed the
moment allows; a deep tier exists only where a bake-off showed it buys
something. Where the best model costs no wait, it is simply the base.

## The table

| Feature | Learner waiting? | Base (Fast) | Thorough | Why |
|---|---|---|---|---|
| **Infinity clean-up** — curate ≤5 fixes, vocab, grammar + drills | yes, a spinner right after talking | Sonnet 5 · medium (~9 s) | **Opus 5 · high** (~10–13 s) | Opus caught what Sonnet missed (notte → sera and the place of *già*; *siamo andati* because the family went), left a correct *sono stato al ristorante* alone where Sonnet invented an andare/essere rule, and stated the participle rule truthfully. xhigh was no better and padded a non-error. Fable 5.1 medium was as good at 18–28 s. |
| **Guest-lesson plan** — the teacher's key words, expressions, story, question | no (built once, in the background) | **Opus 5 · high** (~23 s) | same | Sonnet (~16 s) attached example sentences that do not contain the word being taught (*eresia* ← a sentence about *libertino*; *libertino* ← "vita libertina"). Every card, chat and voice session on the topic hangs off this plan: nobody should get the weaker one. Raised for everyone; no deep tier. |
| **Lesson word cards** and **grammar drills**, and **topic cards** when the app names no model | no (deck lands in the background; a toast) | **Opus 5 · medium** (~10 s) | **Opus 5 · high** (~10 s) | Same wait as Sonnet (11 s). Sonnet's distractors gave the answer away or didn't fit the blank ("un'___" offered *amante*, which fits; a two-word distractor for a one-word gap; *amante* without its article). Opus: same shape and gender, articles kept, the coverage rule followed. Grammar drills were not benched separately (no Polly-written lesson on a test account) — same task family, same tiers. |
| **Topic cards from the app's card builder** | toast | the chat model picked in the app (Opus 5 default) | same | Already the learner's choice; untouched. |
| **Grading typed / spoken card answers** — one call per finished set | yes, at the end of a set | Haiku 4.5 (~2 s) **with the language rubric** | **Opus 5 · low** (~6 s) | The big win was the rubric, not the model: Dodo's "same idea, any wording" passed *già è sera* and failed *la sera* (15/20 on Haiku, and no model did better than 18). With a rubric that grades the language — wrong form, agreement, preposition, word order, other-language words fail; accents, apostrophes, pronoun, synonyms pass — Haiku scores 18/20, Sonnet 5 low 18/20 (8 s: worse value), Opus 5 low 20/20. |
| **Level check → placement, the path, each lesson's text** | yes ("Building your plan", ~25 s) | Opus 5 (default effort = high) | same | Already the strongest sensible choice; the wait is long as it is. |
| **Final Review / Second Chance / Refresher grading**, chat quiz grading | yes, once per exam | Opus 5 | same | Gates a mastery star; already top tier. |
| **Typed chat in a topic** | yes | the picked model (Opus 5 / Fable 5.1 / GLM 5.2) | same | The learner's own choice. |
| **Infinity chat title**, **topic naming** | no | Sonnet 5 / Haiku 4.5 | same | Two to four words; nothing to gain. |
| **Every voice conversation** | live | OpenAI `gpt-live-1` (+ `gpt-5.6-luna` for delegated facts) | — | Not Claude, not covered by this setting. It never judges the learner; it talks. |

Exact-match grading (fill-ins), multiple choice, the Infinity cards built from
an analysis, spaced repetition and Peck use no model.

## How it was measured

`scripts/polly/quality-bench.ts <cleanup|plan|cards|grammar|judge> …` runs a
feature at any `model:effort` list on real material (Bart's two Infinity
transcripts, the Lo Scandaloso Casanova episode) and a 20-item Italian answer
set with known verdicts (in the script). Nothing is written to the database.
Single runs, small samples: good enough to pick tiers, not a benchmark — re-run
before changing a row, and add cases to the judge set when grading surprises
someone.

## Open

- The voice model's own Italian/French/Korean and its corrections are the one
  content surface nothing here audits.
- The clean-up reads a transcript, never the audio: pronunciation is out of
  reach, and a speech-to-text error can look like a learner's error.
- No memory across conversations: a recurring error is fixed fresh each time.
