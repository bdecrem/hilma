# Stage 4: directions

Before building the whole page, make two or three small, real versions of its first screen and
compare them as pictures. Designers choose by looking; so do you.

## How many

- **Two** for most new pages. **Three** when the person cares about the look ("make it beautiful",
  a landing page, a public site) or the subject could go several ways.
- **One** (skip this stage) for a quick request, or when the page must match a look that exists.

## Make them genuinely different

Each direction differs in the IDEA and the SYSTEM, not only the accent color. For example, for a
tenants' meeting:

- **A. The poster.** Scale C (Bricolage Grotesque and Literata), warm paper, brick accent. The date
  as the largest thing on the page, the address under it, the agenda as a ruled timetable.
- **B. The letter.** Scale B (Source Serif 4 and Public Sans), cool paper, ink-blue accent. A short
  letter from the tenants' committee in a reading column, the date and place in the margin.
- **C. The notice board.** Scale A (Public Sans), one dark band with the date in it, then plain
  ruled sections: what, when, where, bring.

## Steps

1. Put each in `design/a.html`, `design/b.html` (`design/c.html`): the first screen only, with the
   real headline, date, numbers and words, its own fonts (`fonts.py add ... --to design`) and its
   palette (`palette.py ... --css design/a.css`). About 60 lines of HTML and CSS each; no lorem.
2. Compare them:
   `python3 /opt/ola/skills/designer/scripts/sheet.py design/a.html design/b.html design/c.html --out design/sheet.png --ask`
   Then open `design/sheet.png` and look at it yourself.
3. Choose with these questions, in this order:
   - Which one has an idea you can name, taken from this subject?
   - In which is the first thing you see the right thing (the date, the finding, the button)?
   - Which would still look right with the next five pages of the site?
   - Which has the least that could be removed?
   `ola-see`'s answer is a second opinion. When it disagrees with these questions, follow the questions.
4. Write in `design/notes.md`, two sentences: which one, and why, naming what the others lacked.
   ("B: the letter makes the committee's voice the page, and the date in the margin is the first
   thing you see. A's poster shouted, and C's dark band competed with the date.")
5. Build the chosen one into the full page. It is fine to take one detail from a loser.
