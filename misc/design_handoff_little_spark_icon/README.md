# Handoff: Learn AI — "Little Spark" App Icon

## Overview

This bundle contains the approved iOS app-icon concept for **Learn AI**, a native
iPhone app that helps users learn about how AI works via curated video lessons
with an always-available AI tutor. The icon is called **Little Spark**: a
friendly 4-point spark with tiny shy eyes, orbited by small "idea" nodes, on
a warm sunset gradient.

This is the **branding mark** for the app. It should be exported as the iOS
App Icon (all required sizes), a monochrome/tinted variant for iOS 18's
tinted/dark home-screens, and will also be reused as the product's logomark
throughout the app (splash screen, onboarding header, voice-mode orb, empty
states, etc.).

## About the Design Files

The file `Learn AI App Icons.html` in this bundle is a **design reference
created in HTML/React** — a prototype showing the intended look of the icon
at multiple sizes and in context (home screen, notification, settings row).
It is **not production code to copy directly**.

The task is to **recreate this icon as a production-ready iOS App Icon**
using the target codebase's environment:

- If this is a **SwiftUI/native iOS app**, produce the icon as a 1024×1024
  PNG (and the full `AppIcon.appiconset` size ladder), drop it into
  `Assets.xcassets`, and author a `SwiftUI Shape`/`Canvas` or vector PDF
  version for reuse elsewhere in the UI.
- If this is a **React Native / cross-platform app**, produce PNG exports
  for each platform's icon requirements AND an SVG asset for in-app reuse.
- If no codebase exists yet, target SwiftUI + Xcode asset catalogs as the
  default.

A reference SVG (`little-spark.svg`) and the React source (`SparkIcon.jsx`,
extracted from the prototype) are included — these are the authoritative
geometry. All other files in this bundle are context.

## Fidelity

**High-fidelity (hifi).** Exact hex values, geometry, gradients, and size
thresholds are specified below. The icon should be reproduced pixel-perfect.

## The Icon

### Visual composition

The icon is a square artwork drawn on a **180×180 viewBox** (scales to any
output resolution; export at 1024×1024 for App Store).

From back to front:

1. **Background fill** — a radial gradient from top-left to bottom-right
2. **Two thin orbit rings** — concentric ellipses, rotated, hairline white at
   low opacity
3. **Four small "idea" nodes** — white dots scattered along/near the orbits
4. **Soft central glow** — radial gradient behind the spark, cream fading to
   transparent
5. **The spark** — a 4-pointed star shape with a thin plum stroke and a
   light-cream radial fill
6. **The face** — two small dark eyes with white highlights, and a tiny smile
   (**only shown at ≥60 px rendered size**; below that the spark reads as a
   pure mark)

### Exact geometry (viewBox 0 0 180 180)

See `little-spark.svg` for the canonical paths. Key numbers:

| Element | Value |
|---|---|
| Canvas | 180 × 180 |
| Outer orbit ellipse | cx 90, cy 90, rx 68, ry 26, rotated −20° |
| Inner orbit ellipse | cx 90, cy 90, rx 58, ry 18, rotated +25° |
| Orbit stroke | 1.5 px, white, opacity 0.25 (outer) / 0.35 (inner) |
| Idea node 1 | cx 28, cy 72, r 4, opacity 1.0 |
| Idea node 2 | cx 152, cy 104, r 3, opacity 0.8 |
| Idea node 3 | cx 140, cy 58, r 2.5, opacity 0.6 |
| Idea node 4 | cx 48, cy 130, r 3, opacity 0.7 |
| Center glow | cx 90, cy 90, r 52, radial gradient |
| Spark path | `M90 58 C93 74, 97 80, 114 84 C97 88, 93 94, 90 110 C87 94, 83 88, 66 84 C83 80, 87 74, 90 58 Z` |
| Spark stroke | plum `#B5347B`, 1.2 px, linejoin round |
| Eyes | cx 85/95, cy 86, r ≈ `size * 0.025` |
| Smile | quadratic curve between the eyes, stroke `size * 0.008` |

### Color palette

| Token | Hex | Usage |
|---|---|---|
| `spark-bg-top` | `#FFD580` | background gradient start (top-left) |
| `spark-bg-mid` | `#FF9A5A` | background gradient mid (45%) |
| `spark-bg-bot` | `#B5347B` | background gradient end (bottom-right) |
| `spark-glow` | `#FFF2D6` | center glow, idea nodes |
| `spark-core-top` | `#FFFAF0` | spark core gradient top |
| `spark-core-bot` | `#FFD8A0` | spark core gradient bottom |
| `spark-ink` | `#3A1A2A` | face (eyes, smile) |
| `spark-stroke` | `#B5347B` | spark outline stroke |

### Gradients

- **Background**: `radialGradient` centered at (30%, 25%), radius 95%
  - 0% `#FFD580` → 45% `#FF9A5A` → 100% `#B5347B`
- **Center glow**: `radialGradient` centered at (50%, 50%), radius 50%
  - 0% `#FFF2D6` @ opacity 0.9 → 70% `#FFF2D6` @ opacity 0
- **Spark core**: `linearGradient` vertical (0,0 → 0,1)
  - 0% `#FFFAF0` → 100% `#FFD8A0`

### Size-responsive detail (important)

The face (eyes + smile) should **only render at rendered sizes ≥60 px**.
At 40 px (e.g. notification thumb) and below, render the spark as a pure mark
so it doesn't look muddy. In SwiftUI, gate this on a size parameter. In
raster exports, produce two PNG sets — with and without the face — and use
the face version for ≥60 px output sizes only.

### iOS corner radius

iOS clips every icon to a squircle; **do not apply a corner radius to the
artwork itself**. Export the icon as a full-bleed square. iOS will handle
masking. The displayed corner radius ≈ 22.37% of the icon's side length.

## Required exports

### 1. App Icon (iOS)

Produce the full `AppIcon.appiconset` size ladder from a 1024×1024 master
PNG. Required sizes (points × scale = pixels):

| Idiom | Points | Scale(s) | Pixel size(s) |
|---|---|---|---|
| iPhone Notification | 20pt | 2x, 3x | 40, 60 |
| iPhone Settings | 29pt | 2x, 3x | 58, 87 |
| iPhone Spotlight | 40pt | 2x, 3x | 80, 120 |
| iPhone App | 60pt | 2x, 3x | 120, 180 |
| App Store | 1024pt | 1x | 1024 |

**Rule: do NOT include the face (eyes + smile) on any export ≤58 pixels.**
For 58, 60, 80, 87 pixels, produce a faceless version. For 120, 180, 1024,
keep the face.

### 2. iOS 18 tinted / dark variants

iOS 18 introduced tinted and dark app-icon modes. Produce:

- **Dark variant**: same composition on a deeper gradient — background top
  `#8B4A2A`, mid `#5A2540`, bottom `#1A0E18`. Spark core stays bright.
- **Tinted (monochrome)**: grayscale values derived from luminance, no color.
  The spark renders as near-white, the background as near-black. The system
  will apply the user's tint.

### 3. In-app vector

Also export a vector SVG/PDF version of the icon (no rounded-rect mask) for
reuse inside the app: splash screen, header logotype, voice-mode orb animation,
empty states. See `little-spark.svg`.

## Interactions & Behavior

None — this is a static icon. The prototype animates idea nodes on the
home-screen preview; this is for the exploration view only and is not part
of the icon spec. **The shipped app icon must be static** (iOS doesn't
support animated icons anyway).

## Design Tokens

```
// Color
--spark-bg-top: #FFD580;
--spark-bg-mid: #FF9A5A;
--spark-bg-bot: #B5347B;
--spark-glow:   #FFF2D6;
--spark-core-top: #FFFAF0;
--spark-core-bot: #FFD8A0;
--spark-ink:    #3A1A2A;
--spark-stroke: #B5347B;

// Face threshold
--spark-face-min-px: 60;
```

## Files in this bundle

- `README.md` — this document
- `Learn AI App Icons.html` — the original 3-concept exploration (context)
- `little-spark.svg` — authoritative vector of the icon at 180×180
- `SparkIcon.jsx` — the React component from the prototype (reference only)

## Notes for the implementer

- Use a vector tool (Figma, Illustrator, or raw SVG → `rsvg-convert` /
  `librsvg` / `sharp`) to rasterize the SVG at each size. Do not scale a
  single PNG up/down.
- When producing the face-off variants, simply remove the eye/smile group
  from the SVG before rasterizing — no repositioning needed.
- The orbit rings are intentionally faint; verify they're still visible but
  not noisy after export (hinting/antialiasing at small sizes can make them
  disappear — if so, bump their opacity by ~0.1 on the 60/80/120 px outputs).
