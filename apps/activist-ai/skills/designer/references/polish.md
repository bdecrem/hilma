# Stage 6: polish by looking

Polish removes and aligns; it never adds decoration.

## The loop

1. `python3 /opt/ola/skills/designer/scripts/look.py index.html --name round1`
   (`--dark` too when the page has a dark mode). It saves shots at 390 and 1280 px in `shots/`, lists
   what a program finds in six groups, prints the first screen in order of visual weight, and, when
   `ola-see` is here, asks a model to look at the laptop, the phone and a blurred laptop view.
2. Open the two shots yourself and look. Then read `slop-and-plain.md` once more.
3. Fix in this order: [broken], [readable], [order], [decorated], [bare], [usable], then the details below.
4. `look.py index.html --name round2`, then `round3`. The count should fall each round. Stop when
   nothing is listed and the shots read well at both widths, or after three rounds. Never hand over
   a round with more problems than the one before.

## The squint test

Blur your eyes (the blurred panel `look.py` shows the model) and ask: what is the first thing I see?
It must be the one idea (the date, the finding, the number). If two or three things are equally
strong, the page has no order: make the idea larger or darker and quiet the rivals (smaller, lighter
ink, less bold). `look.py` measures the same thing as the "first screen, in order of weight" line:
size times weight of every text in the first screen. One item should lead clearly.

## Details a designer fixes

- **Alignment:** one left edge for headings, text, tables and charts. Numbers align on the right.
  Optical alignment: large headings and quotes may hang 1 to 2 px left to look aligned.
- **Rhythm:** spacing only from the scale (4, 8, 12, 16, 24, 32, 48, 64, 96). Space above a heading
  at least twice the space below it. Sections separated by 48 to 64 px on a laptop, 32 to 48 on a phone.
- **Hierarchy at a glance:** from far away the page reads as three or four blocks, not twenty.
- **Widths:** reading text at most 66ch; the page column 720 px for reading, up to 1120 px for a dashboard.
- **Phone:** side margins 16 px (20 at most); stacked, never squeezed; tables scroll in their box.
- **Rag and widows:** no single word alone on the last line of a heading (`text-wrap: balance` on
  headings, `text-wrap: pretty` on paragraphs).
- **Consistency:** one radius, one rule weight, one button style.
