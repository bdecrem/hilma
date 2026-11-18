# The two failures, as checklists

The owner of this service corrected both many times. Avoid each without falling into the other.
`look.py` finds the ones marked (program); look at the shots for the rest.

These tables are the **Calm** register's. In the **Bold** register (`bold.md`; a page with
`<meta name="ola-register" content="bold">`) three to five colors, gradients behind shapes (with a
reason), big rounded shapes, stickers, a colored word in the title and very large display type are
part of the system, and `look.py` does not count them. What stays banned in both registers:
decoration that says nothing (blobs, waves, sparkles, glows, glassy panels), a slogan instead of the
facts, placeholder or invented content, emoji as icons, low contrast, sideways scroll at 390 px. And
Bold has its own "bare": **timid** (one color, type barely bigger than the text, no shape from the
subject), and its own slop: rainbow everything, teal with hot pink, a default purple-to-pink gradient.

## Decorated ("ai slop"): remove, and do this instead

| Remove | Do instead |
|---|---|
| Gradients on backgrounds, buttons or text (program) | A flat paper, a flat surface band, one flat accent |
| Glows, colored or soft wide shadows (program) | Space, a 1 px hairline in `--rule`, or a change of surface tone |
| Rounded cards for everything; boxes in boxes (program) | Rows with hairlines, a list, a table; a radius of 2 to 6 px if a box must exist |
| Pill-shaped chips and badges everywhere (program) | Plain words, or a small label with no fill |
| Emoji as icons; sparkles, rockets (program) | Words. A small drawn icon only when it carries meaning |
| A colored or italic phrase in the headline (program) | The headline in one ink; the emphasis is the size |
| Cream page + serif headline + colored italic + rounded cards | That combination is the generated look; change at least the idea and the system |
| Tiny capital letter-spaced labels, monospaced eyebrows (program) | Sentence case, 13 px or more, in `--ink-3` |
| Three or more accent colors; teal with pink; purple (program) | One accent from the subject (`palette.py`) |
| An abstract blob, wave or "illustration" that says nothing | The one picture made from the content: the real data, the date, the map |
| A slogan hero ("Empowering communities") with a vague button | The fact: what, when, where, the number, the finding; a button that says what happens |
| "01 / 02 / 03" step cards, feature grids of three icons | A numbered list or a short paragraph |
| Placeholder text or invented numbers (program) | The real content; a marked draft line if something is missing |
| Everything a little big: 20 px reading text, 80 px titles (program) | The scale in `type.md`: 16 or 17 px reading, 40 to 48 px titles |

## Bare ("too plain"): add a decision, not decoration

| The symptom | Do instead |
|---|---|
| Pure white page, default blue links, a table, nothing else (program) | A paper with temperature, a deep accent (`palette.py`), and the page's one idea |
| One size of text; headings barely larger than the text (program) | Your scale: the idea at display size, sections at the heading size |
| No first thing to look at; everything the same weight (program) | One element clearly the largest and darkest on the first screen |
| A wall of table with no summary | The finding as a sentence with its number, then the table |
| Default browser look: Times or Arial, blue underlined links, no margins | A bundled family, a column with real margins, styled links |
| Equal spacing everywhere | More space between sections than inside them (twice at least) |

## The test

Ask of each element: does it explain the subject, or decorate it? Remove what decorates. Then ask
whether the page has a point of view: if it would look the same for any subject, it is bare; give
the one idea more room.
