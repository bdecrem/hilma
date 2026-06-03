# CASBS study (office) selection — working notes

Working doc for Bart's CASBS fellowship: picking an office ("study") on grab day,
themed around "ghost in the machine" backstories (mind / AI / cybernetics /
cognition / consciousness) — which dovetails with the Now What project (cognition
after AGI). Self-contained so the conversation can continue from any machine.

Last updated: 2026-06-03.

> **Outcome: Bart got Study 16.** The grab is settled — the strategy and cheat
> sheet below are kept for the record. The full back story of the room lives in
> `study-16.md`; the standout living ghost (John Markoff) is in `john-markoff.md`.

---

## How office selection actually works

- CASBS has **54 numbered studies**. Each posts a **"Ghosts in the Study"** card
  listing every past fellow who occupied it (name, discipline, affiliation, year),
  back to 1954. The "Ghost in the Machine" angle = pick studies whose ghost-lists
  are stacked with the people who built our mind-as-machine worldview.
- **Grab day is fast** — Bart was told most offices are gone in the first ~30
  seconds. So it's a live, near-simultaneous land-grab.
- **Location almost certainly outranks backstory** in the grab. CASBS is a
  hilltop with views; most people optimize **view / light / size / quiet-vs-
  commons**, not ghosts. That's good news: a ghost-first list *diverges* from the
  crowd — except where a famous ghost sits in a prime-view room (those go first).

### Strategy (the through-line)
- **Rank location first, ghost as tiebreaker.** Every core study has ~65–76 ghosts
  across the decades, so you can find a meaningful one in almost any good-view room.
- **Bring 15–20 ranked, not 10** — your top picks will evaporate; know the fallbacks cold.
- **Reach vs value:** the famous-name rooms (16, 50, 51, 30) are exactly what the
  savvy crowd sprints for → treat as reaches. The quiet back-wing rooms with elite
  *theme* ghosts (52, 53, 49, 46, 47, 48) are the value sweet spot: same view, far better odds.
- Confirm grab-day mechanics (live walk-claim? form? seniority order?) and **scout the building beforehand**.

---

## The data source (this unlocks everything)

CASBS publishes a public file mapping **every fellow → year → study number**:

  https://casbs.stanford.edu/sites/default/files/2026-03/fellowshipdata.txt  (~730 KB)

Format: JSON `{"data": [[photo_url, name, role, year, institution, INST_UPPER, discipline, STUDY#, profile_path, lastname], ...]}`
— the **8th field (index 7) is the study number**. Download + parse with python3 to
look up any fellow's room, or list every ghost in a given study.

---

## Orientation & views (Google map vs CASBS "Map of Studies")

- The two maps are the **same orientation** — just a small clockwise rotation (~15–30°),
  no flip. Anchor them on the **parking lot** + **Alta Road**.
- Both are roughly **north-up**, with **parking/entrance at the south(-west)**.
- **Hoover Tower / Stanford campus / the Bay = EAST/SE.** The "top" of the study map
  points toward campus. (Confirmed by Bart's on-site observation: studies 13–16 and
  46–54 see Hoover Tower → they're on the campus-facing side.)
- **Foothills / golf course / Alta Rd = WEST** (afternoon light / sunset) — the
  left-side wings, studies ~1–12.
- **Center-bottom = the commons** (reception, dining, the big oak, library, Wilson
  Lounge). Studies hugging it are social/contested; wing-ends are quiet + best views.
- Caveat: CASBS was renovated (SWA Group), so a study *number* today may not be the
  original physical room — verify current layout on-site.

### Bart's stated preference
Liked the view from **13–16** (central, campus/Hoover view, social hub) and
**46–54** (the back wing — same Hoover view, quieter, a walk from the commons).

---

## The "ghost in the machine" jackpot: the 46–54 back wing

This wing is essentially the **AI / philosophy-of-mind corridor**, and the
**1979–80 cohort** scattered AI's founders across it: **McCarthy (#16), Haugeland
(#51), Dennett (#52), Pylyshyn (#53)** — all that one year.

Standout ghosts in the rooms Bart likes (from the data file):

| Study | Locale | Tier | Headline ghosts |
|------:|--------|------|-----------------|
| **16** | central / social | REACH (trophy) | **John McCarthy** (coined "AI", '79–80), **Amos Tversky** ('70–71), W.V.O. Quine, Theodore Schultz (Nobel), Paul Romer (Nobel), Dan Jurafsky (NLP), Persi Diaconis. Most-occupied room (76). |
| **50** | back / quiet | REACH | **Claude Shannon** ('57–58), Joan Bresnan (computational linguistics), Kurt VanLehn (AI tutoring), Walter Kintsch, Margaret O'Mara (*The Code*). |
| **51** | back / quiet | REACH-ish | **John Haugeland** (*AI: The Very Idea*, '79–80), **Milton Friedman** ('57–58), Jimmie Savage (Bayesian decision theory), Robert Putnam, David Card (Nobel). |
| **52** | back / quiet | **VALUE ★** | **Daniel Dennett** (*Consciousness Explained*, '79–80), Everett Rogers (*Diffusion of Innovations*), Ellen Markman, Maryanne Wolf. |
| **53** | back / quiet | **VALUE ★** | **Kenneth Arrow** (Nobel), **Zenon Pylyshyn** (*Computation & Cognition*, '79–80), **Donald Norman** (UX, '73–74), Jennifer Eberhardt. |
| **49** | back / quiet | VALUE | Donald Davidson, Wilfrid Sellars, **Richard Thaler** (Nobel), **Vernon Smith** (Nobel), Adriaan DeGroot (chess cognition), Howard Gardner. |
| **46** | back / quiet | VALUE | **Kenneth Colby** (built PARRY, the first chatbot, '61–62), **Edward Tufte** ('73–74), Robert Axelrod (*Evolution of Cooperation*), Ruth Millikan. |
| **47** | back / quiet | VALUE | **Ernest Hilgard** (divided consciousness, '56–57), Solomon Feferman (logic), Glenn Shafer (Dempster–Shafer), Alvin Goldman, Lawrence Kohlberg. |
| **48** | back / quiet | VALUE | **Arthur Burks** (ENIAC; von Neumann's self-reproducing automata, '71–72), Eric Bonabeau (swarm intelligence), Thomas Sebeok, Robert Rosenthal. |
| **15** | central / social | REACH | Philip Zimbardo, Solomon Asch, **Robert Abelson** (cognitive simulation / scripts), Richard Rorty, Polykarp Kusch (Nobel). |
| **13** | central / social | — | George Stigler (Nobel), George Shultz (Sec. of State), Robert Merton, Robert Dahl, **Arati Prabhakar** (DARPA/OSTP). |
| **14** | central / social | — | Daniel McFadden (Nobel), Peter Galison (history of science), Gabriel Almond, Elliot Aronson, Toomas Ilves. |
| **30** | other wing (12-240) | legend (off Bart's view) | **Thomas Kuhn** (*paradigm shift*, '58–59) + Roger Shepard (mental rotation). NOT a confirmed Hoover-view room — check its window. |
| **54** | peripheral / outlier | thin | Patrick Suppes (computer-assisted instruction), Joel Mokyr, Nalini Ambady. Low occupancy (46) — likely smaller/quieter. |
| **34** | — | wildcard | Karl Pribram (brain-as-hologram, '58–59). |

---

## Grab-day cheat sheet (ranked 1–10)

All have the **Hoover/campus view**. Differentiator: **quiet** (46–54 back wing) vs
**social** (13–16 central). **Sprint for your true #1; if gone, cascade down.**
Realistic landing band: **#3–#8** (the value picks).

1. **Study 16** — `REACH · social` — McCarthy (coined "AI") + Tversky + Quine + 2 Nobels. The trophy.
2. **Study 50** — `REACH · quiet` — Claude Shannon. Information theory itself.
3. **Study 52** — `VALUE ★ · quiet` — Daniel Dennett, *Consciousness Explained*. ← top realistic pick.
4. **Study 53** — `VALUE ★ · quiet` — Kenneth Arrow (Nobel) + Pylyshyn + Don Norman.
5. **Study 51** — `REACH-ish · quiet` — Haugeland (*AI: The Very Idea*) + Milton Friedman + Savage.
6. **Study 49** — `VALUE · quiet` — Davidson + Sellars + Thaler + Vernon Smith (2 Nobels).
7. **Study 46** — `VALUE · quiet` — Kenneth Colby (built PARRY) + Tufte + Axelrod.
8. **Study 47** — `VALUE · quiet` — Hilgard (divided consciousness) + Feferman + Shafer.
9. **Study 15** — `REACH · social` — Zimbardo + Asch + Abelson + Rorty.
10. **Study 48** — `VALUE · quiet` — Arthur Burks (ENIAC; von Neumann automata) + Bonabeau.

**+11 (legend/reach, view tradeoff):** **Study 30 — Thomas Kuhn** ("paradigm shift") + Roger Shepard.
Different wing, not your Hoover view — add only if its window wins you over on-site.

One-glance plan: quiet + best story + real odds → **52, then 53, then 49/46/47/48**.
Willing to gamble for a legend → open with **16 or 50**, but keep **52** as instant fallback.

---

## Social signal
Gary Bradski (creator of OpenCV) texted Bart: "You could get Kuhn! Or Tversky. Or
Shannon!! Big shoes to fill." → Two of his three (Tversky #16, Shannon #50) are
already Bart's top two; Kuhn (#30) is the only addition (and a view tradeoff). Also
a tell that the famous-name rooms will be the **most contested** — reinforces the
value-pick strategy.

---

## Corrections logged (don't repeat)
- **Kahneman is Study 6** ('77–78), **Tversky is Study 16** ('70–71) — they were in
  *different* rooms (an earlier note wrongly merged them).
- **John McCarthy WAS a fellow** — Study 16, '79–80 (an earlier note wrongly said not).
- **"Douglas Hofstadter" is a misattribution** — the CASBS fellow is his father
  **Albert Hofstadter** (Study 16, '66–67); Douglas was never a fellow.
- Confirmed **not** CASBS fellows (so leave off any list): Herbert Simon, Allen
  Newell, John Searle, Gregory Bateson, Lessig, Benkler, Stewart Brand.

---

## Open items / next steps
- [ ] Confirm grab-day **mechanics** (live walk-claim vs form vs seniority) and timing.
- [ ] Get a **floorplan / on-site view check** — especially: which of 46–54 have the
      biggest/best window, and what #30's view actually is (decides the Kuhn question).
- [ ] Optionally produce a **one-page printable card** (PDF/PNG) of the cheat sheet
      with a small map thumbnail marking the rooms.
- [ ] Decide final ranked 15–20 once view/size intel is in hand.
