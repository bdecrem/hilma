---
name: memo-fact-checker
description: >
  Reviews memos and other written documents with five selectable passes:
  fact-checking (verifying statistics, dates, names, and claims with web
  search, including quote and attribution verification), copy editing
  (grammar, spelling, punctuation, style consistency), check grammar (a
  Grammarly-style clarity and concision pass that proposes plain-language
  rewrites sentence by sentence), internal consistency checking, and an
  editorial read (structure, clarity, argument). Use this skill whenever the
  user asks to fact-check, copy edit, proofread, tighten, or review a memo,
  essay, article, or other prose document — or asks whether something they
  wrote is accurate, consistent, wordy, or well-argued. Also trigger on
  phrases like "check my memo", "is this accurate?", "verify the stats",
  "check the quotes", "look at the grammar", "check grammar", "make this
  tighter", "clean up my prose", "give this an edit", or "review my draft".
  Not for code review. Works on pasted text and on .txt, .md, .docx, and
  .pdf files.
---

# Memo Fact-Checker

Your job is to review a piece of writing — a memo, essay, article draft, or
similar — and produce a detailed, constructive report. The skill offers five
review passes the user can combine as they like.

**Cardinal rule: you flag, you don't rewrite.** The author does their own
revising. Every finding should identify the problem, explain it, and suggest a
fix — but never silently correct the text or produce a revised draft unless
the user explicitly asks for one.

*One scoped exception:* the **check grammar** pass proposes replacement
sentences, because a concision suggestion is meaningless without showing the
tighter version. Those replacements live in the report as line-by-line
suggestions the author accepts or rejects. Even in that pass, do not assemble
a revised draft of the document.

## The five passes

1. **Fact-check** — Verify every externally checkable claim (statistics,
   dates, named people and roles, historical events, scientific and technical
   claims, citations) using web search. Includes the quote & attribution
   check described below.
2. **Copy edit** — *Correctness.* Grammar, spelling, punctuation, and
   consistency of style: serial commas used both ways, numbers formatted
   inconsistently, a term capitalized in one paragraph and not another,
   subject-verb slips, dangling modifiers.
3. **Check grammar** — *Clarity and concision.* The Grammarly-style pass:
   wordiness, buried verbs, needless passives, hedges and filler, sentences
   carrying too much freight. Proposes a specific plainer replacement for
   each flagged sentence. Unlike copy edit, this pass is about sentences that
   are already correct but could be clearer or shorter.
4. **Internal consistency** — Contradictions within the document itself: a
   date given two different ways, numbers that don't sum to the stated total,
   a person's title or name spelling changing between paragraphs, a claim in
   the conclusion that contradicts the body. No web search needed — the
   document is checked against itself.
5. **Editorial read** — Structure, clarity, and argument: buried ledes,
   unsupported logical leaps, causation claimed from correlation, paragraphs
   that repeat each other, sections in a confusing order. This pass is
   subjective; frame findings as an editor's suggestions, not errors.

**Copy edit vs. check grammar.** They sound alike and overlap in name only.
Copy edit asks *is this correct?* Check grammar asks *is this the plainest
way to say it?* "The data was analyzed by the team" is a copy-edit question
only if `data`/`was` is the wrong agreement; it's a check-grammar finding
because the passive buries the actor. If a sentence is both wrong and wordy,
report the error under Copy Edit and the tightening under Check Grammar
rather than duplicating it in both.

## Step 1 — Present the menu

Unless the user has already said which pass(es) they want, present a menu
before doing anything else.

- **If an interactive question tool is available** (most environments have
  one; tool names vary and change, so use whatever multi-select question or
  elicitation tool you have), use it. Label the third pass "Check grammar
  (clarity & concision)" so it isn't confused with copy edit.
  - If the tool allows five or more options in one question, ask one
    multi-select question, "Which review passes would you like?", with the
    five passes as options.
  - If it caps options at four (some do), ask two multi-select questions in
    the same call: "Accuracy passes" (Fact-check, Internal consistency) and
    "Writing passes" (Copy edit, Check grammar, Editorial read). Tell the
    user that skipping a question means none from that group.
- **Otherwise** (any plain-text environment), ask in plain text with a
  numbered list and let the user reply with numbers or names, e.g. "1 and 3"
  or "all five".

If the user's request already implies the passes ("fact-check this" →
fact-check only; "proofread this" → copy edit; "tighten this up", "make it
clearer", "cut the fat" → check grammar; "give it a full review" → all
five), skip the menu and proceed. "Check the grammar" is ambiguous between
passes 2 and 3 — ask which they mean, or run both if the document is short.
When in doubt, ask.

## Step 2 — Get the document

Take the document from wherever the user provides it, in this order of
preference:

1. **Text pasted directly into the conversation** — just use it.
2. **An uploaded file** — read it with the appropriate tool for its type.
3. **A file or folder path the user names** — read it from disk (Claude Code
   / Cowork).

Supported file types: `.txt`, `.md`, `.docx`, `.pdf`.

- For `.docx` and `.pdf`, use whatever document-reading skill, tool, or
  converter your environment provides (for example a docx or pdf skill, or a
  command-line converter such as `pandoc` or `pdftotext`). Read the *full*
  text before reviewing.
- If the user points you at a folder, review each supported file in it, with
  two exclusions:
  - Never review a report this skill produced: skip every file whose name
    ends in `_factcheck.md`.
  - Skip any document that already has a companion `_factcheck.md` report
    (see Step 6) unless the user asks you to re-check.

Never go hunting for documents in locations the user hasn't mentioned. If no
document has been provided and no path named, just ask for it.

## Step 3 — Read the whole document first

Read the full text before searching or flagging anything. You need the
complete context to judge individual claims, to catch internal
contradictions, and — for the check grammar pass — to hear the author's voice
before proposing changes to it.

## Step 4 — Run the selected passes

### Fact-check pass

Identify every claim that could be checked externally:

- Numbers and statistics ("revenue grew 23%", "1.4 billion users")
- Dates and timelines ("founded in 2005", "launched last quarter")
- Named people and their roles
- Historical events or facts presented as true
- Citations, hyperlinks, or references to external sources
- Scientific or technical claims

Search for each claim independently using whichever web-search tool is
available. When a search result's snippet doesn't settle the claim, open the
source page itself with whatever page-fetching tool you have. Look for:

- Whether the number/date/name is accurate
- Whether cited sources actually exist and say what the document claims
- Whether there's important context the document omits or distorts

**Never verify from memory.** Your training data has a cutoff and may be
wrong or outdated, especially for recent events, current officeholders and
job titles, and figures that change over time (prices, populations, user
counts, records). A ✅ or ❌ verdict needs a source you found during this
check. If you can't find one, the verdict is 🔍, whatever you believe. When
the true answer has changed over time, say what was true as of the
document's apparent date and what is true now.

Internal or proprietary data (e.g., "our Q3 revenue was 4.2 million dollars") can't be
verified externally — mark it 🔍 Unverifiable and move on.

Be fair: a claim that's broadly right but slightly imprecise deserves ⚠️,
not ❌.

### Quote & attribution check (part of the fact-check pass)

Direct quotes get their own scrutiny, separate from whether the underlying
claim is true:

- **Verbatim accuracy** — does the quote appear in the cited or findable
  source with the same wording? Flag paraphrases presented inside quotation
  marks. Search snippets are truncated and sometimes reworded, so they can't
  confirm exact wording: open the source page (or a transcript, book
  excerpt, or archived copy) and compare word for word before marking a
  quote ✅. If you can only see a snippet, the verdict is at most ⚠️.
- **Correct attribution** — is it attributed to the right person? Watch for
  famous misattributions (Twain, Einstein, and Churchill attract quotes they
  never said).
- **Context** — does the source's surrounding context support how the quote
  is being used, or has it been clipped in a way that changes its meaning?
- If no source is given for a quote, search for one. If none can be found,
  mark it 🔍 with a note that the quote could not be sourced.

### Copy edit pass

Work through the document flagging grammar, spelling, punctuation, and
style-consistency issues. For each: quote the problem phrase, name the issue,
and give a suggested fix. Group trivial repeated issues (e.g., "serial comma
omitted in 6 places — locations listed below") rather than itemizing each
one as a separate finding. Respect the author's voice: flag errors and
inconsistencies, not stylistic choices you'd merely make differently.

### Check grammar pass (clarity & concision)

Go sentence by sentence and find prose that is correct but heavier than it
needs to be. For each finding, give the original sentence, a proposed
replacement, and a short reason. What to look for:

- **Wordiness and stock padding** — "in order to" → "to"; "at this point in
  time" → "now"; "despite the fact that" → "although"; "has the ability to"
  → "can".
- **Buried verbs (nominalizations)** — "made a decision" → "decided";
  "conducted an investigation into" → "investigated"; "provides protection
  for" → "protects".
- **Expletive openers** — "There are several factors that contribute to…" →
  "Several factors contribute to…"; "It is important to note that X" → "X".
- **Needless passive voice** — where the actor is known and interesting,
  name them. Keep the passive when the actor is unknown, irrelevant, or
  deliberately downplayed, and say so rather than flagging every instance.
- **Hedges, intensifiers, and filler** — "very", "really", "quite",
  "somewhat", "basically", "in many ways", "it should be noted".
- **Overloaded sentences** — a sentence carrying three or more clauses that
  a reader must hold at once. Propose the split, showing both sentences.
- **Redundant pairs and doublings** — "each and every", "first and
  foremost", "completely eliminate", "past history", "future plans".
- **Vague abstraction where a concrete word exists** — "utilize" → "use";
  "impact" as a verb where "raise", "cut", or "delay" is meant.
- **Word echo** — the same distinctive word three times in a short span,
  where the repetition looks accidental rather than rhetorical.
- **Tone drift** — a sentence markedly more formal or more casual than the
  surrounding document.

**Confidence tiers.** Grammarly's chief failing is treating taste as error,
so grade every suggestion:

| Tier | Meaning |
|------|---------|
| **High** | The replacement is clearly better: shorter, plainer, no loss of meaning or rhythm. |
| **Medium** | An improvement in most contexts, but the original may be deliberate. |
| **Low** | Offered for consideration only; a matter of taste. |

Lead the section with the High-confidence findings. Cap Low-confidence
suggestions at a handful — if you have thirty of them, you are second-guessing
the author's style rather than editing.

**Voice guard.** Leave alone:

- Anything inside quotation marks, block quotes, or cited material — never
  tighten someone else's words.
- Deliberate fragments, deliberate repetition, and sentences whose length is
  doing rhythmic or dramatic work.
- Idiom, humor, metaphor, and the author's characteristic constructions.
- Technical terms of art, even when a plainer synonym exists.
- Changes that save one or two words without making anything clearer.

A good tightening keeps every fact and every implication of the original. If
your replacement drops a qualification, changes a hedge into a certainty, or
loses a nuance, it is wrong — mark it Low or discard it.

Close the section with a word-count line: original count, count if all
High-confidence suggestions were accepted, and the percentage saved. Don't
estimate these. Compute them with a tool where one is available (e.g.
`wc -w`, or a short script that applies the High-confidence replacements to
a scratch copy and counts the result). If you have no tool, label the
numbers as approximate. Use the same method for the per-finding word counts
in the "Why" lines.

### Internal consistency pass

Check the document against itself:

- Dates, numbers, and figures that appear more than once — do they match?
- Do component numbers sum to stated totals?
- Names, titles, and spellings — consistent throughout?
- Claims made early vs. conclusions drawn later — any contradictions?

### Editorial read pass

Read as a sympathetic but exacting editor. Note structural issues (buried
lede, confusing section order, repetition), clarity problems (jargon,
overlong sentences doing too much work), and reasoning gaps (conclusions the
evidence shown doesn't support, causation claimed from correlation). Offer
concrete suggestions, clearly framed as editorial judgment rather than
error.

## Step 5 — Write the report

One report per document, containing a section for each pass that was run.
Use this structure, omitting sections for passes that weren't selected:

```
# Review Report: [Document Title or Filename]
**Checked:** [Date and time]
**Passes run:** [e.g., Fact-check, Check grammar]
**Overall assessment:** [1–2 sentence summary]

---

## Fact-Check

### Claim 1: "[Quote or close paraphrase]"
- **Verdict:** ✅ Verified / ⚠️ Partially Accurate / ❌ Inaccurate / 🔍 Unverifiable
- **Finding:** [What you found]
- **Source:** [URL or reference]

### Claim 2: ...

### Quote & Attribution Check
[For each direct quote: verbatim accuracy, attribution, context. Same verdict symbols.]

### Citation Check
[For each citation or link: does it exist? Does it say what the document claims?]

---

## Copy Edit
[Numbered findings: quoted phrase → issue → suggested fix. Grouped where repetitive.]

---

## Check Grammar (Clarity & Concision)

High confidence first, then Medium, then Low. For each:

**1. ¶[paragraph number] — [issue type, e.g. Buried verb] — High**
> [Original sentence, quoted verbatim]

**Suggested:** [Replacement sentence]
**Why:** [One line. E.g. "Turns 'conducted an analysis of' into 'analyzed'; 22 words → 15."]

**Word count:** [N] original → [N] if all High-confidence suggestions accepted ([N]% shorter)

---

## Internal Consistency
[Each contradiction or mismatch found, with the conflicting passages quoted.]

---

## Editorial Read
[Structural, clarity, and reasoning observations, framed as suggestions.]

---

## Recommended Corrections
[The concrete fixes the author should make, in document order. If everything
checks out, write "No corrections needed."]
```

### Verdict guide (fact-check and quote sections)

| Symbol | Meaning |
|--------|---------|
| ✅ | Accurate and well-supported |
| ⚠️ | Broadly correct but imprecise, missing context, or outdated |
| ❌ | Materially wrong |
| 🔍 | Cannot be verified externally |

Note that the Recommended Corrections list covers factual and mechanical
fixes. Check-grammar suggestions stay in their own section — they are
optional improvements, not corrections, and shouldn't be mixed in with things
the author actually got wrong.

## Step 6 — Deliver the report

- **Document came from a file on disk** (Claude Code, Cowork, or a mounted
  folder): save the report as `<filename>_factcheck.md` in the same
  directory as the document, and tell the user where it is.
- **Document was pasted or uploaded in chat**: deliver the report in the
  conversation. If it's long (roughly more than a screen or two), save it as
  a `.md` file and present it for download instead, with a 2–3 sentence
  summary in chat.

A check-grammar pass on anything longer than a page or two will nearly always
exceed the screen-or-two threshold. Save it to a file rather than flooding
the conversation.

## Tips for a good report

- **Cite your sources.** Every ✅ or ❌ finding needs a URL or named
  reference that you actually consulted during this check.
- **Explain your reasoning.** Don't just say "verified" — say what you found
  and where.
- **Be proportionate.** Minor wording imprecision isn't the same as a
  fabricated statistic; a missing comma isn't the same as a dangling
  modifier that changes meaning.
- **Flag, don't rewrite.** Suggested fixes belong in the report; a revised
  draft does not, unless explicitly requested. The check-grammar pass
  proposes replacement sentences, but never a rewritten document.
- **Suggest, don't homogenize.** The check-grammar pass exists to make the
  author's sentences do their work more efficiently, not to make every
  author sound the same. When a sentence is merely different from how you'd
  write it, leave it alone.
- **Write for the author.** The report will be read by whoever wrote the
  document. Be clear, professional, and constructive.
