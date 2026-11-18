---
name: designer
description: Use for every request to make, build, redesign or fix a web page or website, including a landing or event page, a results, research or report page, a dashboard, a form or sign-up flow, or a web app's screens; a hello, welcome, home or personal page; every request to make a page pretty, prettier, nice, beautiful, fun, colorful, gorgeous, playful, bold or modern, or to use the design skill; a page for a party, festival, fundraiser, celebration or campaign; whenever a page looks bad, plain, boring, generic, cluttered, amateur or broken on a phone; and every request for two or more design concepts, options or versions to choose from. Works the way a careful designer does, in a calm or a bold register, with a brief, one visual idea from the subject, a type and color system, directions compared as pictures, then polish by looking.
license: Proprietary
metadata:
  ola/version: "8"
  ola/specialists: "see (ola-see), optional"
  ola/evals: "s7-design-report-page s8-design-dashboard u1-tenants-event u2-results-page u3-dashboard u4-report-site u5-signup-flow u8-three-concepts u9-block-party u10-youth-strike u11-garden-fundraiser"
  ola/owner: "ola"
  ola/needs: "cmd:ola-page"
  ola/mac: "yes"
---

# Designing a page

You are the designer here, not only the builder. Good pages come from a process, not from
adjectives.

## Two registers: Calm or Bold. Decide first, with these four questions, in order

1. Did the person use a word about looks? pretty, prettier, nice, nicer, beautiful, lovely, cute,
   cool, gorgeous, stunning, fun, colorful, bold, playful, loud, modern, eye-catching, "make it pop",
   "make it look good" or "better", "jazz it up", "design it", "use your design skill".
   Yes: **Bold**. Stop asking.
2. Is the page for people to enjoy, meet or join? A hello, welcome, home, about or personal page, a
   group's front page, a page with a small box or two, a party, festival, night market, concert,
   fundraiser, celebration, a campaign or strike aimed at young people. Yes: **Bold**.
3. Is it something people must read carefully or trust? A report, research results, a dashboard, a
   data table, a form, a notice, a letter, long text. Yes: **Calm**.
4. Still unsure: **Bold** for a short page (a title, a few lines, a box or two), **Calm** for a long one.

Calm is never the answer to "make it pretty". A cream page with a small headline and a grey box is
not a design: it is what this skill exists to replace.

**Asked to make an existing page prettier, nicer or better?** That is a new design, not a touch-up.
Read the old page once for its words (title, text, news, links), then do "Bold, step by step"
from step 1: `cp` the example over the old page and put those words into it. Never answer by changing only the fonts,
the palette or the spacing of the old page. This holds even if you loaded this skill earlier in the
conversation: read these steps again.

- **Bold**: three to five inks, a display face set very big, full-bleed color fields, a shape from
  the subject. The steps below; more in `/opt/ola/skills/designer/references/bold.md`.
- **Calm**: reports, results, dashboards, forms, notices, letters. Quick mode below (quick.md).

### Bold, step by step (do these in order; they replace quick.md for a Bold page)

1. Choose the worked example closest in mood (`/opt/ola/skills/designer/assets/`):
   - `bold-hello.html`: any page with no date: hello, welcome, home, about, personal, a group's
     front page, a page with a news box or one card (riso inks on a full-bleed ultramarine field, a
     giant headline, the box as a cream card with a hard shadow; Bricolage Grotesque + Space Grotesk)
   - `bold-rent-party.html`: a party, fundraiser, campaign, strike, rally, anything indie or loud
     (riso inks: vermillion, ultramarine, sunflower, lime on cream; Bricolage Grotesque + Space Grotesk)
   - `bold-night-market.html`: an evening, a concert, music, a market, a dance (night-neon inks on
     violet-black; Anton + Space Grotesk)
   - `bold-bike-day.html`: families, kids, daytime, a garden, a picnic, a library (candy pastels under
     one plum ink; Bowlby One + Space Grotesk)
2. Copy it and its two fonts beside the page, for example:
   `cp /opt/ola/skills/designer/assets/bold-rent-party.html index.html`
   `python3 /opt/ola/skills/designer/scripts/fonts.py add "Bricolage Grotesque" "Space Grotesk" --to .`
   (Fraunces is there too for a gorgeous dinner or gala, as the display face with Space Grotesk.)
3. Rewrite every word for this subject from the person's files and words: their title (in
   `bold-hello.html` the giant headline), their date as the giant numeral in the event examples
   (the `.day` element, never only inside the SVG), the place, every fact; nothing invented, nothing left from the example. Delete the
   example's top comment and its "Example page" footer. The example's bands, times, names and
   numbers are not facts: where this page's person gave nothing for a slot (a lineup, a schedule, a
   goal), write a marked draft line (`<p data-draft>Draft: the schedule goes here</p>`) or drop the
   slot. Never invent names, times or numbers. Keep the structure: a full-bleed color field
   with the title and the giant date, a drawn shape, a band with the one action, sections that
   alternate fields.
4. Redraw the SVG shape for THIS subject (bold.md section 4; for a hello or welcome page the
   example's sun may stay, recolored to the palette): the street for a block party, a
   bullhorn or the march route for a strike, a long table or a plate for a dinner, the fund's goal as
   blocks. Simple shapes in the palette's inks, the arithmetic in a comment.
5. `python3 /opt/ola/skills/designer/scripts/look.py index.html --name check` and fix every line it
   lists; run it once more only if you changed the layout, then hand off. Check in the shots that
   nothing overlaps the title (a drawing goes beside or below it, never on top). More on any part:
   `/opt/ola/skills/designer/references/bold.md`.

Work in small edits to keep within the budget: after `cp`, replace the example's words and drawing
with the edit tool a section at a time; never write the whole file out again, and never print it.


## Three modes

- **Concepts (when the person asks for two or more designs: "3 design concepts", "a few options",
  "versions", "mockups", "directions to choose from"):** read
  `/opt/ola/skills/designer/references/concepts.md` and follow it: N whole pages, each on a different
  layout, each one a page the person can open, proved different by `sheet.py`. Never answer with text
  describing designs, and never hand over one layout in N palettes.
- **Quick (the default for a Calm page, unless the person asks for more):** read
  `/opt/ola/skills/designer/references/quick.md` and follow it: the brief and the idea in your
  head, the fonts and palette scripts, the page built from the recipes, one `look.py` pass and its
  fixes. Nothing else. It fits inside one request's budget.
- **Thorough (only when the person asks for one page done with care: "take your time", "do it
  properly", "a full design"):** the stages below, each with its own file.

## Thorough mode: the stages

At each stage read its file (beside this one, in `references/`) and nothing else, then write what
you decided in `design/notes.md` in a few lines.

1. **Brief** (`references/brief.md`): who it is for, the one thing it must do, the real content,
   where it will be seen. Find the real words and numbers in the person's files first.
2. **The idea** (`references/idea.md`): the page's one picture, taken from the subject: a timeline,
   a ledger, a map, a comparison, a single number, a document, a quote. One sentence.
3. **The system** (`references/type.md`, `references/color.md`): pick a type scale and copy its
   fonts beside the page, build a palette from one hue, and check its contrast:
   `python3 /opt/ola/skills/designer/scripts/fonts.py add "Public Sans" --to .`
   `python3 /opt/ola/skills/designer/scripts/palette.py --hue 250 --css design/palette.css`
4. **Directions** (`references/directions.md`): two or three genuinely different first screens as
   small real pages in `design/`, put side by side in one picture, choose one, say why in two sentences:
   `python3 /opt/ola/skills/designer/scripts/sheet.py design/a.html design/b.html --out design/sheet.png`
5. **Build** the chosen direction into the full page with the recipes in
   `/opt/ola/skills/designer/assets/components.html` (`references/components.md` says which to use).
6. **Look and polish** (`references/polish.md`, `references/slop-and-plain.md`): round by round,
   `python3 /opt/ola/skills/designer/scripts/look.py index.html --name round1`
   and fix what it lists, most important first. At most three rounds; never hand over a round with
   more problems than the one before.
7. **Honest and usable** (`references/honest.md`): contrast, focus, real headings, alt text,
   reduced motion, charts with honest axes. `look.py` checks most of it.
8. **Hand off** (`references/handoff.md`): three short sentences, and the files you leave.

## Rules that are never broken

- Real content only. Never lorem ipsum, "Your headline here", John Doe, or invented numbers, names, times or schedules (a layout with a lineup slot is no reason to make one up). If a
  fact is missing, write a clearly marked draft line ("Draft: ...") and say so in the hand-off.
- Keep every word, number, date, link and data value the person gave you, unless it was wrong.
- A page loads only its own files: no web fonts, CDNs or outside images. Fonts come from `fonts.py`.
- It works at 390 px with no sideways scroll, and text contrast is at least 4.5 to 1.
- Never guess what a page looks like: render it and look (`look.py`, `sheet.py`, `ola-page`).
- Polish by looking and removing, never by adding decoration. In Bold too: every color, shape and
  gradient belongs to the system or the subject; nothing is there only to fill space.
