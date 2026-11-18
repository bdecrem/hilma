# Concepts: when the person asks for two or more designs

For "give me 3 design concepts", "a few options", "three versions", "some directions", "mockups to
choose from". The person will open each one and choose. So each concept is a real page they can open,
and each one looks different at a glance. Three copies of one page in other fonts and colors are one
concept, and the person sees "just text, three versions".

Keep it to one pass, so it fits one request: read only this file (not the other references), write
the pages, run `sheet.py` once and fix only what it names. Every `.html` you leave in the project is
listed as a page the person can open, so leave no swatch or test pages (no `palette.py --html`).

## 1. Brief and facts (in your head, a few lines in design/notes.md)

Who it is for, the one thing it must do, and the real facts from the person's files or what you looked
up. The same facts go in every concept.

## 2. Pick N different layouts

Pick one layout per concept from this list, each a different one. The layout is the concept: what is
biggest, where things sit, how the eye moves. Fonts and colors follow from it.

- **Poster.** One huge thing fills the first screen (the name, the date, the number) at 80 to 160 px,
  everything else small beneath it. Often one full-bleed color band.
- **Split.** Two columns on a laptop: a fixed side column (name, photo or mark, contact) and a
  scrolling main column. On a phone the side column becomes the top.
- **Letter.** A narrow reading column in a serif, a first paragraph in the person's own voice, facts in
  the margin or at the end. No hero.
- **Ledger.** The facts as a ruled table or definition list from the top: label left, value right.
- **Timeline.** A vertical line of dated entries is the page (career, history, events).
- **Index.** A grid of large tiles or numbered sections, each a short title and one line, on one screen.
- **Front page.** A newspaper or journal front: a masthead, a lead story wide, two or three short
  columns beside it.

Write down which layout each concept uses and its one idea, one line each, before building.

## 3. Build each one as a whole page

- One file per concept: `design/concept-a.html`, `design/concept-b.html`, `design/concept-c.html`, each
  with its own CSS and fonts (`fonts.py add ... --to design`, `palette.py ... --css design/a.css`).
  Start from `/opt/ola/skills/designer/assets/base.css` and write each layout's own CSS: its grid, its
  sizes, where things sit. Do not share one layout stylesheet between concepts.
- The `<title>` names the concept, so the person can tell them apart in the list of pages:
  `<title>Concept A, the poster: Lawrence Cheung</title>`.
- The whole page, with every real fact, not only a first screen.

## 4. Look, and prove they differ

    python3 /opt/ola/skills/designer/scripts/sheet.py design/concept-a.html design/concept-b.html design/concept-c.html --out design/concepts.png

If it prints `SAME LAYOUT` (exit 3), the two pages it names are one layout in two palettes: rewrite the
second one's CSS from another layout in the list and run it again. Do not hand over until it passes.
Write each page in one go (one write per page), not in many small edits.

## 5. Hand off

One line per concept: its file, its layout and idea in plain words, and who it suits. Describe only
what the page really does: if you say "a huge name", the name is huge on the page. Then say all of
them are in the project's pages, ready to open, and which one you would choose and why in one sentence.
