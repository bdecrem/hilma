# Design know-how for pages Ola builds

The people who read these pages are researchers, organizers, board members and the public. They
trust plain, well-set pages: a good report, a government statistics page, a newspaper's data
desk. Design from what they trust, not from habit.

## The two failures

The owner of this service has corrected both, many times. Avoid each without falling into the other.

- **Decorated ("AI slop").** Gradients, glows, glassy cards, a drop shadow on every box, rounded
  pill chips, emoji as icons, a colored italic phrase in the headline, tiny uppercase monospaced
  labels, "01 / 02 / 03" cards, abstract blobs or invented illustrations, three accent colors,
  a hero that says nothing. Each looks generated, and none of it says anything about the subject.
- **Bare ("too plain").** Default browser look, one size of text, no hierarchy, a wall of table,
  everything the same weight, white with one blue and nothing else. Stripping decoration is not
  design either.

What is wanted in between: **one idea that comes from the subject**, set with confidence. For a page
of country scores, the scores themselves as large numerals with the ranking as the structure. For
a report on floods, the timeline of the floods. Real numbers, real names, real documents as the
visual material. Then restraint: everything else gets out of its way.

## Type

- One family for everything is usually right (the system stack in `assets/base.css`); two at most
  (one for headings, one for reading). Never three.
- A scale of five or six sizes, each with a job: 13 (notes, captions), 16 to 18 (reading), 20
  (section), 28 (title on a phone) to 36 or 40 (title on a laptop), and one display size for key
  numbers (40 to 56). Do not invent sizes in between.
- Reading text 16 to 18 px, line height 1.5 to 1.65, lines of 55 to 75 characters (`max-width: 68ch`).
- Headings tight: line height 1.1 to 1.25, weight 650 to 750, slight negative tracking on large sizes.
- Numbers in tables use tabular figures (`font-variant-numeric: tabular-nums`) and are right-aligned.

## Space

- A 4 px grid: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else.
- Related things close, unrelated things far: the gap between sections is at least twice the gap
  inside one. Equal spacing everywhere reads as no structure.
- Side margins: 16 px on a phone, and a centered column (about 720 px for reading, up to 1120 px
  for a dashboard) on a laptop.

## Color and contrast

- A neutral page (white or a faint warm or cool tint) and near-black text (#1a1d24, not pure black
  on pure white for long reading). Secondary text dark gray that still passes 4.5 to 1.
- **One accent**, chosen from the subject (a river report can be a deep water blue; a page about
  land can be a soil brown), used for links, the key figure and the one thing that matters.
  A second color only to mean something (a warning, a negative value), never for decoration.
- Contrast at least 4.5 to 1 for text and 3 to 1 for large text and for lines that carry meaning.
  Light gray text on white is the most common failure: measure it.
- Charts: one color per series, the same colors everywhere on the page.

## Structure

- One h1. The first screen says what the page is and shows the most important thing (the answer,
  the key figure, the search box), not a slogan.
- Key numbers as designed objects: large numeral, a short label under it, its source.
- Tables: a header row, light rules between rows (not a full grid), no zebra stripes and no colored
  header blocks; wide tables scroll inside their own box on a phone.
- Every chart and table says where its data came from, in small text under it.
- Cards only when the items really are separate objects. A list of facts is a list.

## Restraint, checked

Before you hand over a page, ask of each element: does it explain the subject, or decorate it?
Remove what decorates. Then ask whether the page has a point of view: if it would look the same
for any subject, it is bare; give the one idea more room.
