# Quick mode: one page, designed, in one pass

The default. Read this file only, build the page, look once, fix, hand off. Keep it short: no
directions, no extra rounds, no reading the other files unless something below sends you there.

## 1. Brief (two lines in your head, not a file)

Who opens it, and the one thing it must do. Open the person's files and copy the real facts:
names, dates, places, numbers. Never lorem ipsum, never invented numbers.

## 2. The idea (one sentence)

Pick the page's one picture from its subject: a date and a place (a poster), a sequence (a timeline
or agenda as a ruled list), many rows (a ledger table), one number (a large numeral with its source),
a comparison (a chart of the real numbers in SVG), a document (a reading column). That thing is the
largest and darkest on the first screen. Everything else is quiet.

## 3. System (copy, do not invent)

- Fonts: `python3 /opt/ola/skills/designer/scripts/fonts.py add "Public Sans" --to .` (dashboards,
  forms, results) or `fonts.py add "Bricolage Grotesque" "Literata" --to .` (events, community) or
  `fonts.py add "Source Serif 4" "Public Sans" --to .` (reports, research). Link `fonts/fonts.css`.
- Colors: `python3 /opt/ola/skills/designer/scripts/palette.py --hue 30 --css palette.css`
  (hue from the subject: 30 brick for housing, 250 blue for water and data, 150 green for food and
  parks, 270 for law). Use only its roles: --paper, --surface, --rule, --ink, --ink-2, --ink-3,
  --accent (links, the key figure, the one button), --on-accent.
- Sizes in px: notes 13, interface 15, reading 17 (line height 1.6), section 21, title
  `clamp(28px, 4vw + 12px, 44px)`, key number 56. No other sizes. Reading lines `max-width: 66ch`.
- Space: 8, 16, 24, 32, 48, 64. Sections 48 apart; a heading closer to its text than to the last section.
- Start from `/opt/ola/skills/designer/assets/base.css` (copy it beside the page; it has the focus
  style and reduced motion) and the recipes in `assets/components.html` (table, figures, chart, form).

## 4. Never

Gradients, glows or soft shadows, rounded cards for everything, pill chips, emoji, a colored or
italic phrase in the headline, small capital labels, more than one accent color, a slogan instead of
the fact, text under 13 px (12 at the least), em dashes. Wide tables go in `<div style="overflow-x:auto">`.
Every chart is `<svg role="img" aria-label="the finding">` with a caption that names the source.

## 5. Look once, fix, done

`python3 /opt/ola/skills/designer/scripts/look.py index.html --name check`
Fix every [broken], [readable], [order] and [decorated] line it prints, then run it once more only
if you changed the layout. Then tell the person in three sentences: the idea, where to look, what you
would do next.
