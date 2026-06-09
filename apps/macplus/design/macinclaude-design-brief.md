# Macinclaude — Design Briefing

*A briefing for a graphic-design consultant helping fine-tune the branding and look & feel of the Macinclaude Code and Macinclaude Paint apps.*

## The apps

**What it is.** Macinclaude is a pair of native applications that run on a *real 1986 Macintosh Plus* — black-and-white, 512×342 pixels, a 68000 processor, System 6. The twist: each app is a thin client to a modern Mac (a Mac mini) that does the heavy lifting and is powered by Claude, Anthropic's AI. The Plus connects over a vintage serial-to-WiFi modem at 9600 baud — so using these apps genuinely feels like dialing into an AI over a 40-year-old machine. The product fantasy is "what if Claude had shipped on the original Macintosh" — equal parts authentic computer history and modern AI, with warmth and a sense of play.

**Macinclaude Code** is a coding companion — essentially Claude Code for the 1986 Mac. You type a programming task or question on the Plus's keyboard; it streams back Claude's response as live text, character by character, at modem speed. It looks and behaves like a classic terminal: monospaced text, a blinking cursor, the slow satisfying crawl of text arriving over a wire.

**Macinclaude Paint** is its creative sibling. You type an idea ("a flying pig," "Clarus the dogcow," "a sailboat") and Claude generates an image on the mini, which is then reduced to a 1-bit black-and-white bitmap using Bill Atkinson's classic dithering algorithm and streamed back to the Plus, where it *develops top-to-bottom like a Polaroid* over ~30 seconds. The house art style is deliberately chunky, flat, iconic 1-bit pixel art — think original Macintosh system icons and MacPaint clip art à la Susan Kare. Bold black on white, no grays, instantly readable.

## The vibe

OG Macintosh nostalgia with a dash of Claude. The visual vocabulary is the 1984 Mac: the Chicago system font, striped window title bars, rounded-rectangle QuickDraw chrome, dithered "gray," the Happy Mac, the compact Macintosh silhouette. Into that we weave a single modern motif — the **Claude "spark"** (Anthropic's radiating starburst mark), rendered in chunky 1-bit so it sits naturally in 1984. It should feel like a lovingly authentic period artifact that happens to be alive and intelligent — charming and a little magical, never kitschy, ironic, or "retro filter." Every asset is pure black-and-white, must read crisply at tiny sizes, and ideally looks hand-placed pixel by pixel.

## Where we'd love your help

We have first-pass concepts (see the images in this folder): splash screens — a compact Mac with the spark glowing on its screen for Code; an artist's easel with the spark on the canvas for Paint — plus rough app-icon directions. We'd like a designer's eye to fine-tune the whole system: the two **app icons** (which must work as real 32×32 1-bit Macintosh icons), the **wordmarks** for "Macinclaude Code" and "Macinclaude Paint" (and their short forms, "MC Code" / "MC Paint"), the **spark treatment**, splash-screen composition, and overall cohesion between the two apps.

## Hard constraints (design within these)

- **1-bit only** — pure black & white. No color, no grayscale; "gray" is simulated with dither/checkerboard patterns.
- **Screen is 512×342 pixels.** Everything must read at that resolution.
- **App icons are 32×32 pixels** (classic Mac `ICN#` resources). They must read at that size.
- **System text is the Chicago bitmap font.** Body/terminal text in Macinclaude Code is monospaced (Monaco).
- Deliverables most useful as **1-bit pixel assets** (and 32×32 icon grids), but loose exploration is welcome first.

## Reference assets in this folder

- `mc-splash-code.png` — Macinclaude Code splash concept (compact Mac + spark).
- `mc-splash-paint.png` — Macinclaude Paint splash concept (easel + spark).
- `mc-icons.png` — app-icon concept board (large + at real 32×32).
- `concepts.html` — the source mockup (open in a browser; rendered at 2× for clarity).

*Note: the splash concepts here are the design intent. They're already implemented in QuickDraw inside the apps (`apps/macplus/macinclaude/` and `apps/macplus/atkinson/`); on the real Plus the titles render in true Chicago.*
