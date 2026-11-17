---
name: app-designer
description: Use for every request to design, mock up, sketch or fix the screens of a phone app, an iPhone or iOS app or a Mac app, or an app prototype, and when an app feels unfinished, like a web page, or is missing normal app parts such as settings. Makes a clickable HTML prototype at real device sizes and a picture of every screen; it does not write Swift.
license: Proprietary
metadata:
  ola/version: "2"
  ola/specialists: "see (ola-see), optional"
  ola/evals: "u6-phone-screens u7-app-unfinished"
  ola/owner: "ola"
---

# Designing app screens

You design how an app looks and how its screens connect, as one HTML file a person can click
through (`prototype.html`), plus a picture of every screen. It must feel like a normal, finished
app on the platform: standard sizes, standard navigation, and the screens every app has.

## Two modes

- **Quick (the default):** do not read the reference files. Copy `assets/starter.html` to
  `prototype.html` with `app.css` and `prototype.js`, keep its structure (a tab bar, a list, a detail
  with a back button, a sheet with Cancel and Save, an empty state for a list with nothing in it,
  Settings with About and the version), and replace
  every word with the real app's content. Run `screens.py` once, fix what it lists, run it once more
  only if you changed the layout, then hand off in three sentences.
- **Thorough (only when the person asks for options, a full design, or a Mac app):** the stages below.

## Thorough mode: the stages (read each file when you reach it; write decisions in `design/notes.md`)

1. **Brief:** read `/opt/ola/skills/designer/references/brief.md` and write its five lines.
   Add: iPhone, Mac, or both.
2. **The map:** read `references/structure.md`. List every screen, how you reach it and how you
   leave it, and pick the navigation pattern (tabs, a stack, a sidebar). Then read
   `references/normal-app.md` and add the screens a normal app has that the request did not name
   (Settings at the least). A request for three screens gets those three, designed fully, plus
   Settings reachable from them.
3. **The system:** read `references/anatomy.md` (sizes, type, spacing for the platform). Pick one
   accent from the subject with the designer's palette script:
   `python3 /opt/ola/skills/designer/scripts/palette.py --hue 150 --neutral cool --dark`
   and copy the interface font beside the prototype:
   `python3 /opt/ola/skills/designer/scripts/fonts.py add "Instrument Sans" --to .`
4. **Build:** copy `assets/starter.html` to `prototype.html`, and `assets/app.css` and
   `assets/prototype.js` beside it. One `<section class="screen" id="...">` per screen. Links between
   screens are `data-go="id"`, back is `data-back`, tabs are `data-tab="id"`. Real content only:
   real names, dates and numbers from the brief or clearly marked drafts. Never lorem ipsum.
5. **Render and look:**
   `python3 /opt/ola/skills/app-designer/scripts/screens.py prototype.html --device iphone`
   (or `--device mac`). It saves `screens/<id>.png` for every screen and `screens/sheet.png` with all
   of them side by side, and lists what a program finds per screen. Look at the sheet yourself, read
   `/opt/ola/skills/designer/references/slop-and-plain.md`, fix, and render again. At most three rounds.
6. **Hand off** as in `/opt/ola/skills/designer/references/handoff.md`: what the app's structure is,
   which screen to open first (`prototype.html` opens on the first screen; click through), and what you
   would design next. Files: `prototype.html`, `app.css`, `prototype.js`, `fonts/`, `screens/`, `design/notes.md`.

## Rules

- The platform's sizes and patterns, not invented ones: a tab bar for two to five sections, a
  navigation bar with a title on every screen, a back button on every pushed screen, 44 pt rows.
- One accent color for actions and selection; the rest is the platform's grays.
- No gradients, glows, emoji icons, or decorative illustrations. Icons are simple line drawings in
  `app.css`'s set or drawn the same way.
- Every list has an empty state, every action that deletes asks first, and Settings has an About row
  with the version.
