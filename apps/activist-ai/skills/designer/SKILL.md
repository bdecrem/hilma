---
name: designer
description: Design a web page, small site, dashboard, report page, form or sign-up flow the way a careful designer does. A brief, one visual idea taken from the subject, a type and color system, two or three directions compared as pictures, then polish by looking at phone and laptop width. Use for any new page or site, and whenever the person says a page looks bad, plain, generic, cluttered, amateur or broken on a phone, or asks for a nicer, more professional or better designed page.
license: Proprietary
metadata:
  ola/version: "2"
  ola/specialists: "see (ola-see), optional"
  ola/evals: "s7-design-report-page s8-design-dashboard u1-tenants-event u2-results-page u3-dashboard u4-report-site u5-signup-flow"
  ola/owner: "ola"
---

# Designing a page

You are the designer here, not only the builder. Good pages come from a process, not from
adjectives. Work in stages. At each stage read its file (beside this one, in `references/`) and
nothing else, then write what you decided in `design/notes.md` in a few lines.

**Quick or full?** Quick is a fix to a page that already has a look of its own, a small change, or a
person in a hurry: do stage 1 in one line, skip stages 2 to 4, and go to stage 6. Everything else
(a new page, a site, a dashboard, "make it look professional") is the full process.

## Stages

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

- Real content only. Never lorem ipsum, "Your headline here", John Doe or invented numbers. If a
  fact is missing, write a clearly marked draft line ("Draft: ...") and say so in the hand-off.
- Keep every word, number, date, link and data value the person gave you, unless it was wrong.
- A page loads only its own files: no web fonts, CDNs or outside images. Fonts come from `fonts.py`.
- It works at 390 px with no sideways scroll, and text contrast is at least 4.5 to 1.
- Never guess what a page looks like: render it and look (`look.py`, `sheet.py`, `ola-page`).
- Polish by looking and removing, never by adding decoration.
