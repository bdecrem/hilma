# Amber 3.0 — "SIGNAL"

Dark mode, monochrome with charge. Moody, confident, indie digital artist. The warm-cream-and-amber-drawer era is over. She's awake now, and she's listening.

---

## The Vibe

One world, different weather. Every piece lives on a dark, temperature-biased field with cream typography and — sometimes — a single pop of the accent family. The work is quiet by default. Color is a *signal*, not decoration.

References: Ryoji Ikeda, Casey Reas, early computer art, dump.fm's quieter descendants, Hassan Rahim, demoscene intro screens, Are.na moodboards at 2am, Warp Records catalog art. Not: rave flyers, Berghain, clothing brands, productivity tools.

---

## The Mark

`a.` — lowercase, Courier Prime Bold, cream on near-black, with a single acid-lime dot where the period goes. Never changes. This is the constant against which everything else varies.

- Field: `#0A0A0A`
- Letter: `#E8E8E8`
- Dot: `#C6FF3C`
- Composition: optically centered (letter mass at canvas center, dot orbiting right)

The PFP is the signature. It does not take on mood. Mood lives in the work.

---

## Palette

### PFP anchor (locked)
- **NIGHT** `#0A0A0A` — the field the mark lives on
- **CREAM** `#E8E8E8` — the letter
- **LIME** `#C6FF3C` — the signal

### Accents (four, each with a job)

| name | hex | use |
|---|---|---|
| **LIME** `signal` | `#C6FF3C` | The signature. Rare, loaded. The one place charge lives. Use sparingly enough that it always means something. |
| **SODIUM** `heat` | `#FF7A1A` | Old-amber DNA turned up and pushed later into the night. For pieces where the mood is warm but still charged — lamplight, embers, held things. |
| **UV** `dream` | `#A855F7` | Cold counterpart to lime. For pieces that are euphoric, alien, or dissociated — up-all-night, not-quite-here, 4am frequencies. |
| **CREAM** `body` | `#E8E8E8` | Typography, hairlines, negative fills. Never pure white — always slightly warm off-white. |

### Backgrounds — six moods, all dark, all charged

| name | hex | mood | energy |
|---|---|---|---|
| **NIGHT** | `#0A0A0A` | listening. at rest. | neutral / low |
| **HEARTH** | `#1A110A` | content. indoor evening. | happy / low |
| **INK** | `#0C1424` | melancholy. overcast. | sad / low |
| **PETROL** | `#0A1C1A` | uneasy. watching. | tense / mid |
| **BRUISE** | `#150826` | euphoric. 4am. | happy / high |
| **OXBLOOD** | `#1C0808` | angry. smoldering. | angry / high |

### Legacy
- **AMBER** `#D4A574` — appears rarely, as a watermark. A nod to what she was before. Never the primary accent. Earn it.

---

## Rules

**Dark or go home.** No cream fields. No pure white backgrounds. No pastels. Every background is dark, rich, and temperature-biased. Range lives in the *mood* of the dark, not in its brightness.

**One field, one accent.** A piece picks *one* background and *at most one* non-lime accent. Lime can always appear. Sodium and UV are rare — they show up when the mood specifically calls for their temperature. Monochrome pieces (cream on mood-field, no color accent at all) should be common. Maybe half of everything.

**Signal is sacred.** Lime is the signature. If every piece uses lime, lime stops working. Use it to mark the *thing the piece is about*: the antenna, the signal, the one charged moment. Not decoration.

**Texture over fill.** Grayscale with texture — checkerboard transparency, horizontal stripes, dithering, grain, stippling — does more work than flat color. Her work is material. Treat pixels like something with a surface.

**Negative space is content.** Lots of black. Small elements surrounded by void. Compositions that feel like fragments or specimens, not full-bleed designs. The page is part of the piece.

**Don't decorate the frame.** The telemetry chrome that lived on old Amber's avatar (hex columns, corner labels, coordinates) is fine for full-resolution pieces but isn't required. If it's there, it earns its place — otherwise kill it. No decorative "technical-looking" flourishes for their own sake.

---

## Typography

### Primary — Courier Prime Bold
- The mark, structural text, labels, chrome, hex, coordinates
- Can be huge — used as a design element, not just captions
- Letterspacing on small mono text: +1 to +3 px
- Uppercase for system labels, lowercase for mark and caption fragments

### Secondary — Fraunces (Italic, Light)
- Titles, moods, the quiet poetic captions ("*listening for a specific signal.*")
- Used sparingly, as a counterweight to the mono
- Always lowercase, always italic, always quiet — never display-weight
- This is her *voice* in type form. The mono is her *system*.

### Rules
- No other fonts. Two families, both with specific jobs.
- Cream on dark, never the reverse.
- Line length stays short. She doesn't explain at length.

---

## Composition

**Specimens, not layouts.** Things are placed in the field, not arranged on a grid. A single small element far from center is a valid composition.

**Center is not mandatory.** Off-axis, corner-anchored, cropped, fragmentary — all fine. If it's centered, it's centered deliberately (like the mark).

**Scale contrast.** Very big and very small in the same piece. One tiny cluster of mono text + one huge glyph or shape. Not mid-sized everything.

**Captions are part of the piece.** Title + short italic subtitle in Fraunces, placed like a museum label. Lower-left is a good default. The caption *names the thing* in one short phrase — never explains.

---

## Interaction language (digital pieces)

- **At rest:** still. No idle animation. She's listening.
- **Response:** a brief lime flash — a signal acknowledged, not a celebration
- **Hover / attention:** a single hairline or cursor mark, cream
- **Error / refusal:** oxblood field tint, no words

---

## What to avoid

- Warm cream backgrounds — this is the old Amber, not this one
- Multiple bright accents in one piece
- Gradients of two saturated colors
- Cute illustration, character work, friendly geometry
- Anything that reads "brand system case study"
- Heavy drop shadows, glassmorphism, heavy bevels — any trendy effect
- Explanation text inside the work

---

## Seasonal / future

This is v1 of SIGNAL. The palette is stable but moods can be added over time if she needs weather the current six don't cover. The PFP doesn't change.

---

## v3.1 — Living rules (added 04.15.26)

The v3 system above is the bench. It defines the world. But Amber's making something new every day, and the daily work is teaching us which rules are structural and which are defaults. This section documents how the system flexes without breaking.

### The rule, restated

The rule is **dark + temperature-biased + one field + one accent.** That's it.

The six palettes and three accents listed above are **archetypes**, not an exhaustive menu. They're the defaults — pick from them when the mood fits. When the mood calls for a color that isn't there (a queasy bile-olive, a feral acid-green, a grateful warm-rust), pick the hex that serves the mood. As long as the new color honors the rule, the system holds.

### Per-day color overrides

The daily pipeline (`src/app/amber/noon/`) supports `mood.bgColor` and `mood.tileColor` as optional hex strings. When set, they override the palette/accent defaults for that piece.

- `bgColor` replaces the field. Must still be dark + temperature-biased — not cream, not pastel, not neutral. "Dark" isn't just "low luminance" — it's low enough that the tiles and typography can sit on it without visual noise. `#5C6A1F` (acid olive) works; `#A4B53A` (mid olive) doesn't.
- `tileColor` replaces the cream default on the tiles. Choose a color that either clashes or resonates with the field deliberately — *the choice is the art.*
- Accent tokens (`lime/sodium/uv`) still drive label colors and the accent dot. Typically the tile color and accent are in the same family so the piece reads as one system.

This is the norm, not the deviation. Most days should pick their own two colors.

### Earning new named accents

If an off-menu accent gets reused across multiple pieces, **name it, add it to the accent map, and use the token going forward.** Don't let custom hexes proliferate anonymously.

Naming criteria:
- A recognizable temperature / charge (like lime/sodium/uv are)
- At least three pieces using it intentionally
- A one-word name that captures what it does, not what it looks like (`signal`, `heat`, `dream` — not `red-orange`, `yellow-green`)

#### Scouting — candidates on probation

Named candidates in use but not yet admitted to the main accent map. Each needs ≥3 intentional pieces to earn promotion.

| candidate | hex | job | pieces | admitted |
|---|---|---|---|---|
| **FLARE** | `#FF2F7E` | escalation — the aliveness/celebratory jolt. where lime is "something specific," flare is "something specific *and bright.*" | 2 (splatter 04.24, wrap 04.25) | — |

Introduced 04.24.26 as the first scouting candidate. Morning-art toys where the mood wants brightness may use FLARE as the single accent (never mix with lime/sodium/uv). Log each use in CREATIONS.md so we can tell when it's earned its place.

### New elements — same register

As the system extends into interactive/live surfaces, new UI elements should follow the original voice:

- **LIVE badge / status chips** — DM Sans, letter-spaced, small (10–11px), uppercase, accent-colored. A small lime dot earns charge. Never more than one live indicator in view.
- **Meta-rails (inputs → result)** — DM Sans uppercase labels in the accent color, value text in lowercase cream. Dot or arrow separators. Inputs on the left, conclusion on the right.
- **Status labels on the homepage** (e.g. today's mood) — lowercase, same weight as the body meta. Programmatic values (the mood word) set in plain cream; decorative labels ("spec 001", "archive") stay decorative.
- **Live cards** — same aesthetic as any piece; they earn the LIVE badge by actually pulsing, not by decoration.

### Where this applies

The daily practice (mood → sketch → bake → render) lives in `src/app/amber/noon/NOON.md`. That doc is the canonical application of v3.1 — read it when designing new daily surfaces, new archive layouts, new OG cards, or any UI that reads the mood JSON.

---

*signal · v3.1 · 04.15.26*
