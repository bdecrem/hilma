# Amber Spring 2026 — "CITRUS"

## The Palette

Warm, loud, spring. Think: blood oranges on a marble counter, lemon groves at golden hour, grapefruit soda in sunlight.

### PRIMARY — the citrus family
- Blood orange `#FF4E50`
- Tangerine `#FC913A`
- Mango `#F9D423`
- Lime zest `#B4E33D`
- Grapefruit pink `#FF6B81`

### GROUND — bright, warm, varied (it's SPRING)

**Solids:**
- Warm cream `#FFF8E7`
- Soft peach `#FFECD2`
- Pale lemon `#FFFDE7`
- Light blush `#FFF0F0`
- Warm white `#FAFAFA`
- Coral wash `#FFE0DD`
- Mint mist `#E8F5E9`

**Gradients encouraged:**
- Peach → cream (warm horizontal)
- Lemon → blush (sunrise feel)
- Mint → cream (fresh morning)
- Coral wash → warm white (sunset glow)
- Any warm-to-warm combo from the palette

**Bold backgrounds (for pieces that want more energy):**
- Solid mango `#F9D423` with white/cream elements on top
- Solid coral `#FF4E50` with cream text/shapes
- Lime field `#B4E33D` with darker citrus accents
- Use primaries AS backgrounds when the piece calls for it

**DO NOT HARDCODE A BACKGROUND.** Use the background picker utility:

```tsx
import { pickGradientColors, randomSolidBg } from '@/lib/citrus-bg'

// For canvas: pick two gradient colors seeded by the piece name
const [bg1, bg2] = pickGradientColors('my-piece-name')
const grad = ctx.createLinearGradient(0, 0, w, h)
grad.addColorStop(0, bg1)
grad.addColorStop(1, bg2)

// Or for a random solid each time:
const bg = randomSolidBg()

// Or for CSS backgrounds:
import { pickBackground } from '@/lib/citrus-bg'
style={{ background: pickBackground('my-piece') }}
```

**Guidelines:**
- NEVER write `#FFF8E7` or `#FFECD2` as a hardcoded background. Use the picker.
- Overall feel: LIGHT and WARM. Spring energy.
- NO pure black, NO navy, NO purple, NO cold blue backgrounds.
- The picker includes solids, gradients, and bold primaries — it handles variety automatically.
- The background IS part of the art — treat it like a design choice, not a default.

### ACCENT — pops of contrast
- Cream `#FFF8E7`
- Hot white `#FFFFFF`
- Deep leaf green `#2D5A27`
- These appear sparingly: interaction feedback, text, highlights

### LEGACY
- Amber `#D4A574` — appears once per piece, subtle. A watermark.

## Rules

- Backgrounds are LIGHT and WARM — cream, peach, lemon, blush. Never dark. Never blue. Never cold. It's spring.
- Primary colors are saturated and juicy — they should feel like you could taste them
- At least 2-3 citrus colors per piece. They're a family — they show up together.
- Cream/white for text and interaction flashes
- Deep green for organic contrast (leaves, shadows, depth)
- Colors must photograph well on phone screens

## Interaction Language
- Tap = white flash + ripple
- Drag = warm trail (tangerine or mango)
- Hold = pulse glow (blood orange)
- Release = scatter (lime zest)

## Typography
- Monospace stays
- Can be BIG — used as design element
- Cream text on dark backgrounds

## Vibe
Fruit stand in morning sunlight. Warm, bright, alive. Nothing dark, nothing cold, nothing corporate. The screen should feel like opening a window on the first warm day.

## Bitmap Cartoon Format
For New Yorker-style cartoons:
- **Chunky pixel art** — each "pixel" is 5x5 real pixels. Grid is ~96x72 chunky pixels, scaled up with `image-rendering: pixelated`.
- **Characters** are 15-25 pixels tall — chunky but expressive. Faces in 4-6 pixels. Outlined in dark (#2A2218).
- **Citrus palette** — coral, mango, lime, sunshine, grapefruit on cream background.
- **Caption** below the scene in monospace font. Short, dry, New Yorker energy.
- **Scene is minimal** — 2-3 subjects, one clear situation, no clutter.
- **Tweet the IMAGE** (canvas → PNG → upload) not just a link. Images get 5-10x engagement on Twitter.
- Think: if the New Yorker hired a Game Boy artist with the citrus palette.
