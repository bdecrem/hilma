# Book Summary prompt

Copy of `misc/book-summary.txt` — the study-context book summary prompt. The
runtime version lives in `src/lib/f2/book-summary.ts` (Generate Book Summary
in the Topics menu for book-type topics); keep the two in sync.

Search the web and write a ~2-page (1,100–1,300 word) study-context summary
of [BOOK] by [AUTHOR], as a markdown file. I'll give it to my study agent as
context before discussing the book.

Structure: (1) what the book is — full title, pub date, one line on
reception; (2) the core argument in the author's framing; (3) the
supporting theory/diagnosis; (4) 4–6 case studies and anecdotes, each told
with enough specifics — names, numbers, the punchline — to carry a
conversation; (5) the book's prescriptive framework, if any; (6) a
quick-reference section.

Curation rules (this is where AIs go wrong):
- Every fact must attach to a theme. Before including a detail, ask what
  claim it serves. If it illustrates or proves nothing, cut it.
- Prefer facts with a name, number, or date over vague generalities.
- Skip blurbs, ISBN-level trivia, marketing copy, and podcast promo.
- Attribute contested claims to the author ("X argues...") rather than
  stating them as fact.
- Direct quotes: rare, under 15 words, only if they're the memorable line.

Quick reference: ~10 core terms and ~8 numbers/dates, each with a one-line
gloss. Never a bare word-cloud — every item gets its few-word explainer.
These are the things worth memorizing.

Sourcing: if the book is recent and you're working from reviews and
interviews rather than the text, say so at the top of the doc and flag
anything secondhand or unverifiable.

Stories or data I already know are in the book — include these:
[optional list]