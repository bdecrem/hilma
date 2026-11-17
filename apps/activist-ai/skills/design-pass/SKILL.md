---
name: design-pass
description: Make a web page you built look designed and read well, at phone and laptop width, by looking at screenshots of it and fixing what is wrong, round by round. Use after building or changing any page, site or dashboard, and whenever the person says a page looks bad, plain, cluttered, broken on a phone, or asks to make it look nicer or more professional.
license: Proprietary
metadata:
  ola/version: "1"
  ola/specialists: "see (ola-see), optional"
  ola/evals: "s7-design-report-page s8-design-dashboard"
  ola/owner: "ola"
---

# A design pass on a page

You can see the page: `ola-page` renders it here, the way the person's browser will under Open,
and measures it. Never guess at what a page looks like; look.

## Steps

1. **Read the know-how first:** `references/design.md` beside this file (type, spacing, color,
   contrast, one idea, restraint, and the two failures to avoid: decorated and bare).
2. **Look at it as it is:**
   `python3 /opt/ola/skills/design-pass/scripts/look.py index.html --name before`
   It takes a full-page shot at 390 px (a phone) and 1280 px (a laptop) into `shots/`, lists what a
   program can find (sideways scroll, things past the edge, cut-off text, low contrast with the
   actual ratio, tiny text, long lines, too many fonts or sizes, broken images, requests to other
   addresses, script errors) and, when `ola-see` is on this computer, what a model saw in each shot.
   Without `ola-see` it says so: then judge the rest from the numbers and the rules, and say in your
   reply that you could not look at the page itself.
3. **Decide the one idea before changing anything.** What is this page for, who reads it, and what
   is the one thing they should see first? Write that down in one sentence. Every change serves it.
4. **Fix, in this order:** what is broken (overflow, cut-off text, broken images, errors), what is
   hard to read (contrast, size, line length), then the order of importance (one clear heading,
   the key numbers or message first, sections in a steady rhythm), then the details (alignment,
   spacing on the 4 px grid, consistent radii). Change the CSS, not the content: keep every word,
   number, link and data value the page had, unless it was wrong.
5. **Look again:** `look.py index.html --name round2` (then `round3`). Compare with the last round:
   the list should shrink. Stop when the program finds nothing and the shots read well at both
   widths, or after three rounds; never hand over a round that has more problems than the one before.
6. **Keep the shots** (`shots/index-before-390.png`, `shots/index-after-390.png`, ...) so the person
   can compare, and tell them in plain words what you changed and why, and what you could not judge.

## Rules

- A page loads only its own files: no web fonts, CDNs or outside images (they cannot load here or
  under Open). Use the system font stack in `assets/base.css`, or a font file in the page's folder.
- A page must work at 390 px with no sideways scroll. Wide tables go in a wrapper that scrolls
  (`overflow-x: auto`) or become stacked rows.
- Contrast: 4.5 to 1 for text, 3 to 1 for large text (24 px, or 18.5 px bold). The program computes it.
- `assets/base.css` is a starting point for a page with no style of its own: copy it beside the
  page and adjust the one accent color to the subject. Do not apply it over a page that already has
  a deliberate look; refine that look instead.
